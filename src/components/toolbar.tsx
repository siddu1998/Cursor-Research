'use client';

import { useStore } from '@/lib/store';
import {
  Search,
  RotateCcw,
  Trash2,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { generateId } from '@/lib/utils';
import { useState } from 'react';
import {
  callAI,
  buildRAGFindPrompt,
  parseJSONResponse,
} from '@/lib/ai-service';
import { embedSingleText, semanticSearch, getAvailableEmbeddingProvider } from '@/lib/embeddings';

export function Toolbar() {
  const {
    setPostItsForActiveTab,
    deleteSelectedPostIts,
    settings,
    isProcessing,
    setIsProcessing,
    addMessage,
    tabs,
    activeTabId,
  } = useStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const postIts = activeTab?.postIts || [];
  const hasSelected = postIts.some((p) => p.selected);

  const hasApiKey =
    (settings.selectedProvider === 'openai' && settings.openaiKey) ||
    (settings.selectedProvider === 'gemini' && settings.geminiKey) ||
    (settings.selectedProvider === 'claude' && settings.claudeKey);

  const handleSearch = async () => {
    if (!searchQuery.trim() || postIts.length === 0 || !hasApiKey) return;

    setIsProcessing(true, 'Searching...');

    try {
      let candidates = postIts;
      const hasEmbeddings = postIts.some((p) => p.embedding && p.embedding.length > 0);
      const embProvider = getAvailableEmbeddingProvider(settings);

      if (hasEmbeddings && embProvider) {
        try {
          const queryEmb = await embedSingleText(settings, searchQuery);
          const results = semanticSearch(postIts, queryEmb, 40, 0.2);
          if (results.length > 0) candidates = results.map((r) => r.postIt);
        } catch { /* fall back to all */ }
      }

      const messages = buildRAGFindPrompt(candidates, searchQuery, postIts.length);
      const response = await callAI(settings, messages);
      const parsed = parseJSONResponse(response) as {
        matches: { id: string; reasoning: string }[];
      };

      const matchIds = new Set(parsed.matches.map((m) => m.id));
      const updatedPostIts = postIts.map((p) => ({
        ...p,
        highlighted: matchIds.has(p.id),
        reasoning: matchIds.has(p.id)
          ? parsed.matches.find((m) => m.id === p.id)?.reasoning
          : undefined,
      }));

      setPostItsForActiveTab(updatedPostIts);
      setSearchOpen(false);
      setSearchQuery('');

      addMessage({
        id: generateId(),
        role: 'assistant',
        content: `Highlighted ${parsed.matches.length} of ${postIts.length} notes matching "${searchQuery}".`,
        timestamp: Date.now(),
      });
    } catch (err) {
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: `Search failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearHighlights = () => {
    const updatedPostIts = postIts.map((p) => ({ ...p, highlighted: false, reasoning: undefined }));
    setPostItsForActiveTab(updatedPostIts);
  };

  const hasHighlights = postIts.some((p) => p.highlighted);

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 bg-surface border-b border-border">
      {/* Find */}
      {searchOpen ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setSearchQuery('');
              }
            }}
            placeholder="What to find..."
            className="px-2.5 py-1.5 rounded-lg border border-border text-[12px] bg-surface text-text-primary focus:outline-none focus:border-accent w-48 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || isProcessing}
            className="p-1.5 rounded-lg text-accent hover:bg-accent-light disabled:opacity-25 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSearchOpen(true)}
          disabled={postIts.length === 0 || !hasApiKey}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-25 disabled:pointer-events-none"
        >
          <Search className="w-3.5 h-3.5" />
          Find
        </button>
      )}

      {/* Clear highlights */}
      {hasHighlights && (
        <button
          onClick={handleClearHighlights}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-warning hover:bg-warning/10 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Clear
        </button>
      )}

      {/* Delete selected */}
      {hasSelected && (
        <button
          onClick={deleteSelectedPostIts}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-danger hover:bg-danger/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      )}

      <div className="flex-1" />

      {/* Embedding status */}
      {(() => {
        const { embeddingStatus, embeddingProgress } = useStore.getState();
        const embeddedCount = postIts.filter((p) => p.embedding && p.embedding.length > 0).length;
        const totalCount = postIts.length;

        if (totalCount === 0) return null;

        if (embeddingStatus === 'embedding') {
          return (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-light text-accent text-[10px] font-medium" title={embeddingProgress}>
              <Loader2 className="w-3 h-3 animate-spin" />
              Indexing
            </div>
          );
        }

        if (embeddingStatus === 'ready' || embeddedCount === totalCount) {
          return (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-success font-medium" title={`All ${totalCount} notes indexed`}>
              <CheckCircle2 className="w-3 h-3" />
              Indexed
            </div>
          );
        }

        if (embeddingStatus === 'error') {
          return (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-warning font-medium" title="Embedding failed">
              <AlertCircle className="w-3 h-3" />
              Error
            </div>
          );
        }

        if (embeddedCount > 0 && embeddedCount < totalCount) {
          return (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-text-tertiary font-medium tabular-nums" title={`${embeddedCount} of ${totalCount} notes indexed`}>
              <Database className="w-3 h-3" />
              {embeddedCount}/{totalCount}
            </div>
          );
        }

        return null;
      })()}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-light text-accent text-[11px] font-medium processing-pulse">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          {useStore.getState().processingMessage || 'Processing...'}
        </div>
      )}
    </div>
  );
}
