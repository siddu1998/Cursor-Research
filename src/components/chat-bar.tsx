'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useStore } from '@/lib/store';
import {
  callAI,
  callAIWithTools,
  buildThemeProposalPrompt,
  buildRAGFindPrompt,
  buildRAGAnswerPrompt,
  buildToolChatSystemPrompt,
  parseJSONResponse,
} from '@/lib/ai-service';
import { embedSingleText, semanticSearch, getAvailableEmbeddingProvider } from '@/lib/embeddings';
import { generateId } from '@/lib/utils';
import type { ProposedTheme } from '@/lib/types';
import {
  Send,
  Loader2,
  Layers,
  Search,
  BarChart3,
  Lightbulb,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

const quickActions = [
  {
    icon: Layers,
    label: 'Group by themes',
    prompt: 'Group these notes by key themes. Identify the major themes and cluster the notes accordingly.',
  },
  {
    icon: Search,
    label: 'Find pain points',
    prompt: 'Find all notes that express pain points, frustrations, or negative experiences from participants.',
  },
  {
    icon: Lightbulb,
    label: 'Feature requests',
    prompt: 'Find all notes where participants mention feature requests, wishes, or suggestions for improvement.',
  },
  {
    icon: BarChart3,
    label: 'Sentiment analysis',
    prompt: 'Group these notes by sentiment — positive, negative, neutral, and mixed.',
  },
  {
    icon: Sparkles,
    label: 'Key insights',
    prompt: 'Identify the most important insights and patterns across all the notes. What are the key takeaways?',
  },
];

export function ChatBar() {
  const {
    messages,
    addMessage,
    settings,
    setPostItsForActiveTab,
    setIsProcessing,
    openThemeReview,
    tabs,
    activeTabId,
    updatePostIt,
  } = useStore();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const postIts = activeTab?.postIts || [];
  const clusters = activeTab?.clusters || [];

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const hasApiKey =
    (settings.selectedProvider === 'openai' && settings.openaiKey) ||
    (settings.selectedProvider === 'gemini' && settings.geminiKey) ||
    (settings.selectedProvider === 'claude' && settings.claudeKey);

  // ---- Theme proposal (human-in-the-loop clustering) ----
  const performThemeProposal = useCallback(
    async (query: string) => {
      if (postIts.length === 0) return;

      setSending(true);
      setIsProcessing(true, 'Analyzing data and proposing themes...');

      try {
        const msgs = buildThemeProposalPrompt(postIts, query);
        const response = await callAI(settings, msgs);
        const parsed = parseJSONResponse(response) as {
          themes: { name: string; description: string; evidence: string }[];
          summary: string;
        };

        const proposedThemes: ProposedTheme[] = parsed.themes.map((t) => ({
          id: generateId(),
          name: t.name,
          description: t.description,
          evidence: t.evidence,
        }));

        addMessage({
          id: generateId(),
          role: 'assistant',
          content: `I found ${proposedThemes.length} themes. Review, edit, or add themes — then confirm to classify.`,
          timestamp: Date.now(),
        });

        openThemeReview(proposedThemes, query, parsed.summary || '');
      } catch (err) {
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
          timestamp: Date.now(),
        });
      } finally {
        setSending(false);
        setIsProcessing(false);
      }
    },
    [postIts, settings, addMessage, openThemeReview, setIsProcessing]
  );

  // ---- RAG-powered find ----
  const performFind = useCallback(
    async (query: string) => {
      if (postIts.length === 0) return;

      setSending(true);
      setIsProcessing(true, 'Searching notes...');

      try {
        let candidates = postIts;
        const hasEmbeddings = postIts.some((p) => p.embedding && p.embedding.length > 0);
        const embeddingProvider = getAvailableEmbeddingProvider(settings);

        // RAG: if embeddings exist, pre-filter with semantic search
        if (hasEmbeddings && embeddingProvider) {
          setIsProcessing(true, 'Semantic search...');
          try {
            const queryEmbedding = await embedSingleText(settings, query);
            const results = semanticSearch(postIts, queryEmbedding, 40, 0.2);
            if (results.length > 0) {
              candidates = results.map((r) => r.postIt);
            }
            // If semantic search returns nothing, fall back to all notes
          } catch (embErr) {
            console.warn('Embedding search failed, falling back to full search:', embErr);
          }
        }

        // AI confirmation + reasoning on candidates
        setIsProcessing(true, 'AI confirming matches...');
        const findMessages = buildRAGFindPrompt(candidates, query, postIts.length);
        const response = await callAI(settings, findMessages);
        const parsed = parseJSONResponse(response) as {
          matches: { id: string; reasoning: string }[];
        };

        const matchIds = new Set(parsed.matches.map((m) => m.id));
        const updatedPostIts = postIts.map((p) => ({
          ...p,
          highlighted: matchIds.has(p.id),
          // Only set reasoning for matches; clear it for non-matches
          reasoning: matchIds.has(p.id)
            ? parsed.matches.find((m) => m.id === p.id)?.reasoning
            : undefined,
        }));

        setPostItsForActiveTab(updatedPostIts);

        const matchCount = parsed.matches.length;
        addMessage({
          id: generateId(),
          role: 'assistant',
          content:
            matchCount > 0
              ? `Highlighted ${matchCount} of ${postIts.length} notes on the canvas. The rest are dimmed. Click "Clear highlights" to reset.`
              : 'No matching notes found for that query.',
          timestamp: Date.now(),
        });
      } catch (err) {
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
          timestamp: Date.now(),
        });
      } finally {
        setSending(false);
        setIsProcessing(false);
      }
    },
    [postIts, settings, addMessage, setPostItsForActiveTab, setIsProcessing]
  );

  // ---- RAG-powered answer ----
  const performAnswer = useCallback(
    async (messageText: string) => {
      setSending(true);
      setIsProcessing(true, 'Analyzing...');

      try {
        let relevantNotes = postIts;
        const hasEmbeddings = postIts.some((p) => p.embedding && p.embedding.length > 0);
        const embeddingProvider = getAvailableEmbeddingProvider(settings);

        // RAG: pre-filter to relevant notes
        if (hasEmbeddings && embeddingProvider && postIts.length > 50) {
          try {
            const queryEmbedding = await embedSingleText(settings, messageText);
            const results = semanticSearch(postIts, queryEmbedding, 30, 0.2);
            if (results.length > 0) {
              relevantNotes = results.map((r) => r.postIt);
            }
          } catch {
            // Fall back to all notes
          }
        }

        const recentHistory = messages.slice(-6).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const answerMessages = buildRAGAnswerPrompt(
          relevantNotes,
          postIts.length,
          clusters.map((c) => ({ name: c.name, reasoning: c.reasoning })),
          messageText,
          recentHistory
        );

        const response = await callAI(settings, answerMessages);

        addMessage({
          id: generateId(),
          role: 'assistant',
          content: response,
          timestamp: Date.now(),
        });
      } catch (err) {
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
          timestamp: Date.now(),
        });
      } finally {
        setSending(false);
        setIsProcessing(false);
      }
    },
    [postIts, clusters, messages, settings, addMessage, setIsProcessing]
  );

  // ---- Main send handler: AI tool-calling routes the intent ----
  const handleSend = useCallback(
    async (text?: string) => {
      const messageText = text || input.trim();
      if (!messageText || sending) return;

      setInput('');

      addMessage({
        id: generateId(),
        role: 'user',
        content: messageText,
        timestamp: Date.now(),
      });

      if (postIts.length === 0) {
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: 'No notes on the canvas yet. Import some data first to get started!',
          timestamp: Date.now(),
        });
        return;
      }

      if (!hasApiKey) {
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: 'Please add an API key in Settings to use AI features.',
          timestamp: Date.now(),
        });
        return;
      }

      setSending(true);
      setIsProcessing(true, 'Understanding your request...');

      try {
        // Step 1: AI tool-calling — model decides what action to take
        const systemPrompt = buildToolChatSystemPrompt(
          postIts,
          clusters.map((c) => ({ name: c.name, reasoning: c.reasoning }))
        );

        const recentHistory = messages.slice(-10).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const aiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: systemPrompt },
          ...recentHistory,
          { role: 'user', content: messageText },
        ];

        const response = await callAIWithTools(settings, aiMessages);

        // Step 2: Execute the tool call(s)
        setSending(false);
        setIsProcessing(false);

        if (response.toolCalls.length > 0) {
          for (const toolCall of response.toolCalls) {
            switch (toolCall.name) {
              case 'find_notes':
                await performFind(toolCall.arguments.query as string);
                break;

              case 'group_notes':
                await performThemeProposal(toolCall.arguments.criteria as string);
                break;

              case 'answer_question':
                addMessage({
                  id: generateId(),
                  role: 'assistant',
                  content: toolCall.arguments.response as string,
                  timestamp: Date.now(),
                });
                break;

              case 'tag_notes': {
                const ids = toolCall.arguments.note_ids as string[];
                const tag = toolCall.arguments.tag as string;
                ids.forEach((id) => {
                  const postIt = postIts.find((p) => p.id === id);
                  if (postIt && !postIt.tags.includes(tag)) {
                    updatePostIt(id, { tags: [...postIt.tags, tag] });
                  }
                });
                addMessage({
                  id: generateId(),
                  role: 'assistant',
                  content: `Tagged ${ids.length} notes with "${tag}".`,
                  timestamp: Date.now(),
                });
                break;
              }
            }
          }
        } else if (response.textContent) {
          // Model returned text without tool calls (fallback)
          addMessage({
            id: generateId(),
            role: 'assistant',
            content: response.textContent,
            timestamp: Date.now(),
          });
        } else {
          // No tool call and no text — use RAG answer as fallback
          await performAnswer(messageText);
        }
      } catch (err) {
        // If tool-calling fails (e.g. model doesn't support it), fall back to RAG answer
        console.warn('Tool-calling failed, falling back to direct answer:', err);
        setSending(false);
        setIsProcessing(false);
        await performAnswer(messageText);
      }
    },
    [
      input,
      sending,
      messages,
      postIts,
      clusters,
      settings,
      hasApiKey,
      addMessage,
      setIsProcessing,
      performFind,
      performThemeProposal,
      performAnswer,
      updatePostIt,
    ]
  );

  // ---- Quick actions: always use the direct tool ----
  const handleQuickAction = (prompt: string) => {
    addMessage({
      id: generateId(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    });

    // Quick actions have known intents — skip tool-calling, go direct
    const lower = prompt.toLowerCase();
    if (lower.includes('group') || lower.includes('cluster') || lower.includes('sentiment')) {
      performThemeProposal(prompt);
    } else if (lower.includes('find') || lower.includes('identify')) {
      performFind(prompt);
    } else {
      // Key insights etc — use answer flow
      performAnswer(prompt);
    }
  };

  return (
    <div className="w-[340px] flex-shrink-0 bg-surface border-l border-border flex flex-col right-panel-animate">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-semibold text-text-primary flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent" />
          Research Assistant
        </span>
      </div>

      {/* Quick actions */}
      {postIts.length > 0 && (
        <div className="px-3 py-2.5 border-b border-border">
          <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-2">
            Quick Actions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.prompt)}
                disabled={sending || !hasApiKey}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-surface-hover rounded-lg text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-border/50 transition-all disabled:opacity-40"
              >
                <action.icon className="w-3 h-3" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <p className="text-sm font-medium text-text-primary mb-1">Ask anything</p>
            <p className="text-xs text-text-tertiary leading-relaxed">
              {postIts.length === 0
                ? 'Import data first, then ask questions about your research.'
                : 'Ask questions about your research data or use the quick actions above.'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-[90%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-accent text-white rounded-br-md'
                  : 'bg-surface-hover text-text-primary rounded-bl-md border border-border'
                }
              `}
            >
              {msg.role === 'assistant' ? (
                <div>
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-0 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      ul: ({ children }) => <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li className="text-[13px]">{children}</li>,
                      code: ({ children }) => (
                        <code className="px-1 py-0.5 rounded bg-black/20 text-[12px] font-mono">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-surface-hover text-text-secondary rounded-2xl rounded-bl-md px-3 py-2.5 border border-border">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs">Analyzing...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 bg-surface-hover rounded-xl px-3 py-2.5 border border-border focus-within:border-accent transition-colors">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              postIts.length === 0
                ? 'Import data to get started...'
                : hasApiKey
                  ? 'Ask about your data...'
                  : 'Add API key in Settings...'
            }
            disabled={sending}
            className="flex-1 text-sm text-text-primary placeholder:text-text-tertiary bg-transparent focus:outline-none disabled:opacity-50"
          />

          {sending ? (
            <Loader2 className="w-4 h-4 text-accent animate-spin flex-shrink-0" />
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || sending}
              className="p-1 rounded-lg text-accent hover:bg-accent-light disabled:opacity-30 transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
