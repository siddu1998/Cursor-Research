export interface PostIt {
  id: string;
  content: string;
  source: string;
  participantId?: string;
  x: number;
  y: number;
  color: string;
  clusterId?: string;
  tags: string[];
  reasoning?: string;
  selected: boolean;
  highlighted: boolean;
  embedding?: number[];
}

export interface Cluster {
  id: string;
  name: string;
  color: string;
  reasoning: string;
  // Manual position/size (optional - if not set, computed from post-its)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ProposedTheme {
  id: string;
  name: string;
  description: string;
  evidence: string;
}

export interface ProposedChunk {
  id: string;
  content: string;
  participantId?: string;
  startOffset: number;  // position in source text, -1 if not found
  endOffset: number;
  color: string;
}

export const HIGHLIGHT_COLORS = [
  { bg: '#FDE68A', border: '#F59E0B' }, // amber
  { bg: '#BFDBFE', border: '#3B82F6' }, // blue
  { bg: '#A7F3D0', border: '#10B981' }, // emerald
  { bg: '#FBCFE8', border: '#EC4899' }, // pink
  { bg: '#DDD6FE', border: '#8B5CF6' }, // violet
  { bg: '#FED7AA', border: '#F97316' }, // orange
  { bg: '#BAE6FD', border: '#0EA5E9' }, // sky
  { bg: '#E9D5FF', border: '#A855F7' }, // purple
];

export interface WorkspaceTab {
  id: string;
  name: string;
  query?: string;
  postIts: PostIt[];
  clusters: Cluster[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export type AIProvider = 'openai' | 'gemini' | 'claude';

export interface ModelOption {
  id: string;
  name: string;
  provider: AIProvider;
}

export interface Settings {
  openaiKey: string;
  geminiKey: string;
  claudeKey: string;
  selectedProvider: AIProvider;
  selectedModel: string;
  twitterBearerToken: string;
  redditClientId: string;
  redditClientSecret: string;
}

export type AppDataSource = 'twitter' | 'reddit';

export interface AppDataQuery {
  id: string;
  source: AppDataSource;
  query: string;
  maxResults: number;
  status: 'idle' | 'loading' | 'done' | 'error';
  error?: string;
  resultCount?: number;
}

export interface ImportedFile {
  name: string;
  type: 'csv' | 'docx' | 'txt' | 'text';
  content: string;
  columns?: string[];
  rows?: Record<string, string>[];
}

export interface ImportedFileEntry {
  id: string;
  name: string;
  type: 'csv' | 'docx' | 'txt' | 'text';
  importedAt: number;
}

export const POST_IT_COLORS = [
  '#FBF3E0', // warm cream
  '#E2EAF8', // soft sky
  '#E2F1E6', // pale sage
  '#F8E2E6', // blush
  '#F8EBE2', // warm peach
  '#E0EFF4', // powder blue
  '#F0EBE2', // sand
  '#E4F0EA', // mint
];

export const CLUSTER_COLORS = [
  '#C4A24E', // warm gold
  '#0066FF', // Swiss blue
  '#30A46C', // emerald
  '#E5484D', // coral red
  '#E5A000', // amber
  '#0D9AE0', // sky
  '#D4622A', // burnt orange
  '#2E8B8B', // teal
];

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'claude' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'claude' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'claude' },
];

// ---- Report types ----

export interface ReportBlock {
  id: string;
  type: 'title' | 'heading' | 'paragraph' | 'quote' | 'divider' | 'image';
  content: string;
  sourceNoteId?: string;
  sourceText?: string;
  participantId?: string;
  imageUrl?: string;  // data URL or blob URL for image blocks
  caption?: string;   // caption for image blocks
}

export interface Report {
  title: string;
  blocks: ReportBlock[];
  updatedAt: number;
}

export const CARD_WIDTH = 220;
export const CARD_HEIGHT = 160;
export const CARD_GAP = 24;
export const GRID_COLS = 5;
