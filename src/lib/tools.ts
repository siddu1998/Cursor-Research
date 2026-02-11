// MCP-ready tool registry
// Each tool has a name, description, and JSON Schema parameters
// These definitions are used by OpenAI (functions), Claude (tools), and Gemini (functionDeclarations)

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIToolResponse {
  toolCalls: ToolCall[];
  textContent?: string;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'find_notes',
    description:
      'Search and visually highlight notes on the canvas that match a query. Use this when the researcher wants to SEE, FIND, FILTER, LOCATE, or IDENTIFY specific notes — or asks "what about", "anything related to", "which ones mention", etc. The matching notes will be highlighted and non-matching notes will be dimmed on the canvas. Always prefer this over answer_question when the user is exploring their data.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A rich, expanded search query. Broaden the user\'s intent — e.g. if they say "frustration" expand to "frustration, dissatisfaction, annoyance, pain points, negative experiences". If they say "pricing" expand to "pricing, cost, value, money, expensive, subscription, payment".',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'group_notes',
    description:
      'Organize all notes into thematic groups/clusters. Use when the researcher wants to GROUP, CLUSTER, CATEGORIZE, ORGANIZE, SORT, ARRANGE, or find THEMES across all notes. This triggers a human-in-the-loop review where the researcher approves themes before classification.',
    parameters: {
      type: 'object',
      properties: {
        criteria: {
          type: 'string',
          description:
            'The grouping criteria — what dimension to organize by. E.g. "key themes and topics", "user sentiment", "feature mentions and requests", "pain points vs positive experiences".',
        },
      },
      required: ['criteria'],
    },
  },
  {
    name: 'answer_question',
    description:
      'Provide a text answer to an analytical question. Use ONLY when the researcher asks for summaries, counts, comparisons, interpretations, or meta-questions that need a written response rather than a visual canvas action. Do NOT use this when the researcher wants to see or find specific notes — use find_notes instead.',
    parameters: {
      type: 'object',
      properties: {
        response: {
          type: 'string',
          description:
            'Your analytical response. Be concise, insightful, and reference specific data points from the notes. Speak like a fellow researcher.',
        },
      },
      required: ['response'],
    },
  },
  {
    name: 'tag_notes',
    description:
      'Add a tag/label to specific notes. Use when the researcher wants to TAG, LABEL, or MARK certain notes with a category.',
    parameters: {
      type: 'object',
      properties: {
        note_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of note IDs to tag.',
        },
        tag: {
          type: 'string',
          description: 'The tag/label to apply.',
        },
      },
      required: ['note_ids', 'tag'],
    },
  },
];
