import type { Settings, PostIt } from './types';

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---- Provider-specific API calls ----

async function callOpenAI(apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 16384,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const otherMsgs = messages.filter((m) => m.role !== 'system');

  const contents = otherMsgs.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = { contents };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }
  body.generationConfig = { temperature: 0.2, maxOutputTokens: 16384 };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callClaude(apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const otherMsgs = messages.filter((m) => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      system: systemMsg?.content || '',
      messages: otherMsgs.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error: ${res.status}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ---- Main AI call function ----

export async function callAI(
  settings: Settings,
  messages: AIMessage[]
): Promise<string> {
  const { selectedProvider, selectedModel, openaiKey, geminiKey, claudeKey } = settings;

  switch (selectedProvider) {
    case 'openai':
      if (!openaiKey) throw new Error('Please add your OpenAI API key in Settings.');
      return callOpenAI(openaiKey, selectedModel, messages);
    case 'gemini':
      if (!geminiKey) throw new Error('Please add your Gemini API key in Settings.');
      return callGemini(geminiKey, selectedModel, messages);
    case 'claude':
      if (!claudeKey) throw new Error('Please add your Claude API key in Settings.');
      return callClaude(claudeKey, selectedModel, messages);
    default:
      throw new Error('Unknown AI provider');
  }
}

// ---- Prompt templates ----

export function buildChunkingPrompt(text: string, fileName: string): AIMessage[] {
  return [
    {
      role: 'system',
      content: `You are an expert qualitative researcher. Your task is to segment research data into meaningful analytical units for affinity mapping. The data could be anything — interview transcripts, survey responses, field notes, diary entries, focus group recordings, usability test notes, or any other qualitative data.

CRITICAL RULES — you MUST follow all of these:

1. **VERBATIM only**: Every chunk MUST be copied exactly as it appears in the source text, character for character. Do NOT paraphrase, rephrase, reword, or summarize. The chunks will be highlighted in the source document, so exact text matching is essential.

2. **One idea per chunk**: Each chunk should capture ONE distinct idea, opinion, behavior, experience, or observation. If a passage contains multiple ideas, split it into separate chunks.

3. **1-3 sentences each**: Keep chunks concise but self-contained — enough context to understand the point on its own.

4. **Full coverage**: Process the ENTIRE document from start to finish. Do not stop partway through. Every meaningful data point should be captured.

5. **Identify speakers**: If the text has speaker labels (e.g. "Jordan:", "P1:", "Participant 3:"), set participantId to that name. If there are no clear speakers, set participantId to null.

6. **Skip non-data**: Skip moderator/interviewer questions, timestamps, section headers, and filler (e.g. "um", "you know") — only chunk substantive participant data.

7. **No invented text**: Do NOT add any words, phrases, or context that are not in the original document.

8. **No duplicates**: Never return the same passage twice.

Respond ONLY with valid JSON (no markdown fences). Format:
{
  "chunks": [
    { "content": "verbatim excerpt from the source text", "participantId": "speaker name or null" }
  ]
}`,
    },
    {
      role: 'user',
      content: `Segment this research data from "${fileName}" into verbatim sticky-note-sized excerpts. Remember: copy text EXACTLY as written, cover the entire document, one idea per chunk.\n\n${text}`,
    },
  ];
}

// Step 1: Propose themes (human reviews before classification)
export function buildThemeProposalPrompt(postIts: PostIt[], query: string): AIMessage[] {
  const itemsList = postIts
    .map((p, i) => `[${i}] "${p.content}"`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `You are an expert qualitative researcher. A researcher wants to organize their sticky notes. Your job is to PROPOSE themes/categories — but NOT classify yet. The researcher will review and approve the themes first.

Your job:
1. Read all the sticky notes carefully
2. Based on the researcher's query, identify the major themes/categories that emerge
3. For each theme, provide a clear name, description, and cite 1-2 example quotes from the data as evidence
4. Be thorough but not overly granular — aim for 3-7 meaningful themes
5. Think like an experienced qualitative researcher doing thematic analysis

Respond ONLY with valid JSON (no markdown fences). Format:
{
  "themes": [
    {
      "name": "Theme Name",
      "description": "What this theme captures and why it matters",
      "evidence": "Brief reference to 1-2 quotes from the data that support this theme"
    }
  ],
  "summary": "A brief 1-2 sentence overview of what you found in the data"
}`,
    },
    {
      role: 'user',
      content: `Query: "${query}"

Sticky notes to analyze:
${itemsList}`,
    },
  ];
}

// Step 2: Classify into researcher-approved themes
export function buildClassifyWithThemesPrompt(
  postIts: PostIt[],
  themes: { name: string; description: string }[],
  query: string
): AIMessage[] {
  const itemsList = postIts
    .map((p, i) => `[${i}] (ID: ${p.id}) "${p.content}"`)
    .join('\n');

  const themesList = themes
    .map((t, i) => `${i + 1}. "${t.name}" — ${t.description}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `You are an expert qualitative researcher. The researcher has reviewed and approved the following themes. Now classify each sticky note into the appropriate theme.

CRITICAL RULES:
- You MUST classify every single sticky note into one of the approved themes, or mark it as unclustered
- For EVERY classification, provide a CLEAR, SPECIFIC reasoning that explains exactly why this note belongs in that theme
- The reasoning should reference the content of the note and how it connects to the theme's description
- Be transparent — if a note could fit multiple themes, explain why you chose this one
- If a note doesn't clearly fit any theme, put it in unclustered with an explanation

The researcher is counting on your reasoning to validate the classification. Be thorough and honest.

Respond ONLY with valid JSON (no markdown fences). Format:
{
  "clusters": [
    {
      "name": "Exact Theme Name",
      "reasoning": "Why this theme exists and what pattern it represents",
      "items": [
        { "id": "post-it-id", "reasoning": "Specific explanation of why this note belongs here, referencing its content and the theme" }
      ]
    }
  ],
  "unclustered": [
    { "id": "post-it-id", "reasoning": "Why this doesn't fit any of the approved themes" }
  ]
}`,
    },
    {
      role: 'user',
      content: `Original query: "${query}"

Approved themes:
${themesList}

Sticky notes to classify:
${itemsList}`,
    },
  ];
}

// Classify NEW notes into EXISTING clusters (for import distribution)
export function buildClassifyNewNotesPrompt(
  newPostIts: PostIt[],
  existingClusters: { name: string; description: string }[]
): AIMessage[] {
  const itemsList = newPostIts
    .map((p) => `(ID: ${p.id}) "${p.content}"`)
    .join('\n');

  const clustersList = existingClusters
    .map((c, i) => `${i + 1}. "${c.name}" — ${c.description}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `You are an expert qualitative researcher. New research notes have been imported and need to be classified into existing clusters/themes.

EXISTING CLUSTERS:
${clustersList}

RULES:
- Classify each new note into the most appropriate existing cluster
- For each classification, provide clear reasoning
- If a note doesn't fit any cluster, mark it as unclustered
- Do NOT create new clusters — only use the ones provided

Respond ONLY with valid JSON (no markdown fences). Format:
{
  "classified": [
    { "id": "note-id", "cluster": "Exact Cluster Name", "reasoning": "Why it belongs here" }
  ],
  "unclustered": [
    { "id": "note-id", "reasoning": "Why it doesn't fit any cluster" }
  ]
}`,
    },
    {
      role: 'user',
      content: `Classify these new notes into the existing clusters:\n\n${itemsList}`,
    },
  ];
}

// Legacy single-step clustering (kept for fallback)
export function buildClusteringPrompt(postIts: PostIt[], query: string): AIMessage[] {
  const itemsList = postIts
    .map((p, i) => `[${i}] (ID: ${p.id}) "${p.content}"`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `You are an expert qualitative researcher. You are helping organize sticky notes / post-its from research data based on the researcher's query. 

Your job:
1. Read all the sticky notes
2. Based on the researcher's query, organize them into meaningful clusters/groups
3. For EACH sticky note placed in a cluster, provide clear reasoning for why it belongs there
4. Name each cluster with a descriptive, research-appropriate label
5. Write a brief reasoning for each cluster explaining the theme

Be thorough and thoughtful. Every classification decision should have clear reasoning that a researcher can review and validate.

Respond ONLY with valid JSON (no markdown fences). Format:
{
  "clusters": [
    {
      "name": "Cluster Name",
      "reasoning": "Why this cluster exists and what theme it represents",
      "items": [
        { "id": "post-it-id", "reasoning": "Why this item belongs in this cluster" }
      ]
    }
  ],
  "unclustered": [
    { "id": "post-it-id", "reasoning": "Why this item doesn't fit any cluster" }
  ]
}`,
    },
    {
      role: 'user',
      content: `Query: "${query}"

Sticky notes to organize:
${itemsList}`,
    },
  ];
}

export function buildChatPrompt(
  postIts: PostIt[],
  clusters: { name: string; reasoning: string }[],
  userMessage: string,
  chatHistory: AIMessage[]
): AIMessage[] {
  const context = postIts
    .map((p) => `- "${p.content}" (source: ${p.source}${p.clusterId ? ', cluster: ' + p.clusterId : ''})`)
    .join('\n');

  const clusterInfo = clusters.length > 0
    ? '\n\nCurrent clusters:\n' + clusters.map((c) => `- ${c.name}: ${c.reasoning}`).join('\n')
    : '';

  return [
    {
      role: 'system',
      content: `You are an expert UX research assistant helping a researcher analyze their qualitative data. You have access to their sticky notes (post-its) from research sessions.

Current data:
${context}
${clusterInfo}

You can:
1. Answer questions about the data
2. Suggest groupings or patterns
3. Identify themes
4. Find specific mentions
5. Provide insights

When the researcher asks to organize, group, or find data, respond with a JSON action block at the END of your message (after your explanation). The action block should be on its own line, starting with ACTION_JSON: followed by the JSON.

Available actions:
- cluster: Group post-its. ACTION_JSON: {"action": "cluster", "query": "the grouping criteria"}
- highlight: Highlight specific post-its. ACTION_JSON: {"action": "highlight", "ids": ["id1", "id2"]}
- tag: Add tags to post-its. ACTION_JSON: {"action": "tag", "ids": ["id1"], "tag": "tag-name"}

If no action is needed (just answering a question), don't include an action block.
Be concise, insightful, and speak like a fellow researcher.`,
    },
    ...chatHistory,
    { role: 'user', content: userMessage },
  ];
}

export function buildFindPrompt(postIts: PostIt[], query: string): AIMessage[] {
  const itemsList = postIts
    .map((p) => `(ID: ${p.id}) "${p.content}"`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `You are helping a UX researcher find specific post-its matching their search criteria. Review all the post-its and return the IDs of those that match.

Respond ONLY with valid JSON (no markdown fences). Format:
{
  "matches": [
    { "id": "post-it-id", "reasoning": "Why this matches the search" }
  ]
}`,
    },
    {
      role: 'user',
      content: `Find all sticky notes that match: "${query}"

Sticky notes:
${itemsList}`,
    },
  ];
}

// ---- Response parsing helpers ----

export function parseJSONResponse(text: string): unknown {
  // Helper: attempt to fix common JSON issues from AI responses
  function tryFixAndParse(raw: string): unknown {
    // First try as-is
    try {
      return JSON.parse(raw);
    } catch {
      // continue to fixes
    }

    let fixed = raw.trim();

    // Remove trailing commas before } or ]
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');

    // Fix unescaped newlines inside strings
    fixed = fixed.replace(/(?<=": ")([\s\S]*?)(?="[,}\]])/g, (match) =>
      match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    );

    try {
      return JSON.parse(fixed);
    } catch {
      // continue
    }

    // If JSON is truncated (response cut off), try to close it
    let balanced = fixed;
    const openBraces = (balanced.match(/\{/g) || []).length;
    const closeBraces = (balanced.match(/\}/g) || []).length;
    const openBrackets = (balanced.match(/\[/g) || []).length;
    const closeBrackets = (balanced.match(/\]/g) || []).length;

    // Remove any trailing incomplete string/property
    balanced = balanced.replace(/,\s*"[^"]*$/, '');
    balanced = balanced.replace(/,\s*\{[^}]*$/, '');
    balanced = balanced.replace(/,\s*$/, '');

    // Close unclosed brackets/braces
    for (let i = 0; i < openBrackets - closeBrackets; i++) balanced += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) balanced += '}';

    try {
      return JSON.parse(balanced);
    } catch {
      // continue
    }

    throw new Error('Could not parse AI response as JSON');
  }

  // Try to extract JSON from markdown fences
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return tryFixAndParse(jsonMatch[1].trim());
  }

  // Try parsing the whole text
  try {
    return tryFixAndParse(text.trim());
  } catch {
    // Try finding JSON-like content
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return tryFixAndParse(braceMatch[0]);
    }
    throw new Error('Could not parse AI response as JSON');
  }
}

export function extractActionFromChat(text: string): {
  message: string;
  action?: { action: string; [key: string]: unknown };
} {
  const actionMatch = text.match(/ACTION_JSON:\s*(\{[\s\S]*?\})\s*$/);
  if (actionMatch) {
    try {
      const action = JSON.parse(actionMatch[1]);
      const message = text.slice(0, actionMatch.index).trim();
      return { message, action };
    } catch {
      return { message: text };
    }
  }
  return { message: text };
}

// ---- Report writing AI prompts ----

export function buildReportDraftPrompt(
  context: { notes: string[]; themes: string[]; title: string },
  instruction: string
): AIMessage[] {
  const notesText = context.notes.length > 0
    ? `Research notes:\n${context.notes.map((n, i) => `${i + 1}. "${n}"`).join('\n')}`
    : '';
  const themesText = context.themes.length > 0
    ? `\nIdentified themes: ${context.themes.join(', ')}`
    : '';

  return [
    {
      role: 'system',
      content: `You are a skilled UX research report writer. Help the researcher draft, expand, or refine their report. Write in a clear, professional, evidence-based style appropriate for UX research deliverables.

${notesText}
${themesText}

Guidelines:
- Write in a clear, professional tone suitable for stakeholders
- Reference specific data points and participant quotes when relevant
- Be concise but thorough
- Use active voice
- You may use **bold** and *italic* for emphasis, bullet lists, and numbered lists
- Use ## for section headings when structuring longer pieces (these become separate heading blocks)
- Return ONLY the written text, no meta-commentary or markdown fences`,
    },
    {
      role: 'user',
      content: instruction,
    },
  ];
}

export function buildReportExpandPrompt(text: string, context: string): AIMessage[] {
  return [
    {
      role: 'system',
      content: `You are a skilled UX research report writer. Expand the given text with more detail, analysis, and supporting evidence. Maintain the same tone and style. Return ONLY the expanded text, no meta-commentary.

Context from the report so far:
${context}`,
    },
    {
      role: 'user',
      content: `Expand and enrich this paragraph with more detail and analysis:\n\n"${text}"`,
    },
  ];
}

export function buildReportImprovePrompt(text: string): AIMessage[] {
  return [
    {
      role: 'system',
      content: `You are a skilled editor for UX research reports. Improve the given text for clarity, grammar, conciseness, and professional tone. Fix any errors. Maintain the original meaning and key points. Return ONLY the improved text, no meta-commentary or explanations.`,
    },
    {
      role: 'user',
      content: `Improve this text:\n\n"${text}"`,
    },
  ];
}

export function buildReportContinuePrompt(reportSoFar: string, notes: string[]): AIMessage[] {
  const notesContext = notes.length > 0
    ? `\n\nAvailable research notes:\n${notes.slice(0, 30).map((n, i) => `${i + 1}. "${n}"`).join('\n')}`
    : '';

  return [
    {
      role: 'system',
      content: `You are a skilled UX research report writer. Continue writing the report from where it left off. Maintain the same tone, style, and level of detail. Write 1-2 paragraphs. Return ONLY the continuation text, no meta-commentary.${notesContext}`,
    },
    {
      role: 'user',
      content: `Continue writing from here:\n\n${reportSoFar}`,
    },
  ];
}

// ---- Tool-calling AI (native function calling for all providers) ----

import { TOOLS, type ToolDefinition } from './tools';
import type { ToolCall, AIToolResponse } from './tools';
export type { ToolCall, AIToolResponse } from './tools';

// System prompt for tool-calling chat — includes a summary, not all notes
export function buildToolChatSystemPrompt(
  postIts: PostIt[],
  clusterInfo: { name: string; reasoning: string }[]
): string {
  // For small datasets include all notes; for large ones include a sample
  const MAX_INLINE = 50;
  let notesContext: string;

  if (postIts.length <= MAX_INLINE) {
    notesContext = postIts
      .map((p) => `(ID: ${p.id}) "${p.content}"`)
      .join('\n');
  } else {
    // Include a sample + count
    const sample = postIts.slice(0, 20);
    notesContext =
      `Total: ${postIts.length} notes. Here is a sample of 20:\n` +
      sample.map((p) => `(ID: ${p.id}) "${p.content}"`).join('\n') +
      `\n... and ${postIts.length - 20} more notes.`;
  }

  const clusters =
    clusterInfo.length > 0
      ? '\n\nCurrent clusters:\n' +
        clusterInfo.map((c) => `- ${c.name}: ${c.reasoning}`).join('\n')
      : '';

  // Include currently highlighted notes so the AI knows the active state
  const highlighted = postIts.filter((p) => p.highlighted);
  const highlightContext = highlighted.length > 0
    ? `\n\nCurrently highlighted notes (${highlighted.length} of ${postIts.length}):\n` +
      highlighted.map((p) => `(ID: ${p.id}) "${p.content}"${p.reasoning ? ` [reason: ${p.reasoning}]` : ''}`).join('\n')
    : '\n\nNo notes are currently highlighted.';

  // Include currently selected notes
  const selected = postIts.filter((p) => p.selected);
  const selectedContext = selected.length > 0
    ? `\n\nCurrently selected notes (${selected.length} of ${postIts.length}):\n` +
      selected.map((p) => `(ID: ${p.id}) "${p.content}"${p.participantId ? ` [participant: ${p.participantId}]` : ''}`).join('\n')
    : '\n\nNo notes are currently selected.';

  return `You are an expert UX research assistant helping a researcher analyze qualitative data on a visual canvas of sticky notes.

Research data:
${notesContext}
${clusters}
${highlightContext}
${selectedContext}

You MUST use the provided tools to respond. Choose the right tool:
- Researcher wants to SEE, FIND, or FILTER notes → use find_notes (this highlights on canvas and dims the rest)
- Researcher wants to GROUP, ORGANIZE, or CATEGORIZE → use group_notes
- Researcher asks an analytical QUESTION needing a text answer → use answer_question
- Researcher wants to TAG or LABEL notes → use tag_notes

IMPORTANT:
- Always prefer find_notes over answer_question when the researcher is exploring data. Researchers want to SEE their data on the canvas, not just read about it in chat.
- If the researcher asks to "show them again", "re-highlight", or refers to previously highlighted notes, use find_notes with the same or similar query from the conversation history. The currently highlighted notes listed above show what was last highlighted.
- If the researcher asks a follow-up question about highlighted notes (e.g. "tell me more about these", "summarize the highlighted ones"), use answer_question and reference the currently highlighted notes listed above.
- If the researcher asks about "selected" notes, "these posts", "the ones I selected", or similar, use answer_question and reference the currently selected notes listed above. Selected notes are the ones the user has clicked/shift-clicked on the canvas.
- When the researcher asks "how many are selected" or "what are these about", always check the selected notes list above first.`;
}

// OpenAI with tool-calling
async function callOpenAIWithTools(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  tools: ToolDefinition[]
): Promise<AIToolResponse> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 16384,
      tools: tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  const choice = data.choices[0];

  const toolCalls: ToolCall[] = (choice.message.tool_calls || []).map(
    (tc: { function: { name: string; arguments: string } }) => ({
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    })
  );

  return {
    toolCalls,
    textContent: choice.message.content || undefined,
  };
}

// Claude with tool-calling
async function callClaudeWithTools(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  tools: ToolDefinition[]
): Promise<AIToolResponse> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const otherMsgs = messages.filter((m) => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      system: systemMsg?.content || '',
      messages: otherMsgs.map((m) => ({ role: m.role, content: m.content })),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error: ${res.status}`);
  }

  const data = await res.json();
  const toolCalls: ToolCall[] = [];
  let textContent: string | undefined;

  for (const block of data.content) {
    if (block.type === 'tool_use') {
      toolCalls.push({ name: block.name, arguments: block.input });
    } else if (block.type === 'text') {
      textContent = block.text;
    }
  }

  return { toolCalls, textContent };
}

// Gemini with tool-calling
async function callGeminiWithTools(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  tools: ToolDefinition[]
): Promise<AIToolResponse> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const otherMsgs = messages.filter((m) => m.role !== 'system');

  const contents = otherMsgs.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    tools: [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
  };

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const parts = data.candidates[0].content.parts;
  const toolCalls: ToolCall[] = [];
  let textContent: string | undefined;

  for (const part of parts) {
    if (part.functionCall) {
      toolCalls.push({
        name: part.functionCall.name,
        arguments: part.functionCall.args || {},
      });
    } else if (part.text) {
      textContent = part.text;
    }
  }

  return { toolCalls, textContent };
}

// Unified tool-calling entry point
export async function callAIWithTools(
  settings: Settings,
  messages: AIMessage[]
): Promise<AIToolResponse> {
  const { selectedProvider, selectedModel, openaiKey, geminiKey, claudeKey } = settings;

  switch (selectedProvider) {
    case 'openai':
      if (!openaiKey) throw new Error('Please add your OpenAI API key in Settings.');
      return callOpenAIWithTools(openaiKey, selectedModel, messages, TOOLS);
    case 'gemini':
      if (!geminiKey) throw new Error('Please add your Gemini API key in Settings.');
      return callGeminiWithTools(geminiKey, selectedModel, messages, TOOLS);
    case 'claude':
      if (!claudeKey) throw new Error('Please add your Claude API key in Settings.');
      return callClaudeWithTools(claudeKey, selectedModel, messages, TOOLS);
    default:
      throw new Error('Unknown AI provider');
  }
}

// RAG-enhanced find prompt — only sends top candidates, not all notes
export function buildRAGFindPrompt(
  candidates: PostIt[],
  query: string,
  totalNotes: number
): AIMessage[] {
  const itemsList = candidates
    .map((p) => `(ID: ${p.id}) "${p.content}"`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `You are helping a UX researcher find specific notes. You are given ${candidates.length} candidate notes (pre-filtered from ${totalNotes} total by semantic similarity). Review them and confirm which ones truly match the search query. Be inclusive — if a note is even somewhat related, include it.

For each match, provide reasoning explaining why it matches.

Respond ONLY with valid JSON (no markdown fences). Format:
{
  "matches": [
    { "id": "post-it-id", "reasoning": "Why this matches the search" }
  ]
}`,
    },
    {
      role: 'user',
      content: `Find notes matching: "${query}"

Candidate notes:
${itemsList}`,
    },
  ];
}

// RAG-enhanced answer prompt — only includes relevant context
export function buildRAGAnswerPrompt(
  relevantNotes: PostIt[],
  allNotesCount: number,
  clusterInfo: { name: string; reasoning: string }[],
  userMessage: string,
  chatHistory: AIMessage[]
): AIMessage[] {
  const context = relevantNotes
    .map((p) => `- "${p.content}" (source: ${p.source}${p.participantId ? ', participant: ' + p.participantId : ''})`)
    .join('\n');

  const clusters =
    clusterInfo.length > 0
      ? '\n\nCurrent clusters:\n' + clusterInfo.map((c) => `- ${c.name}: ${c.reasoning}`).join('\n')
      : '';

  return [
    {
      role: 'system',
      content: `You are an expert UX research assistant. The researcher has ${allNotesCount} notes total. Here are the most relevant notes for their question:

${context}
${clusters}

Answer concisely and insightfully. Reference specific data points. Speak like a fellow researcher.`,
    },
    ...chatHistory,
    { role: 'user', content: userMessage },
  ];
}
