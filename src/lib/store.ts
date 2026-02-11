'use client';

import { create } from 'zustand';
import type { PostIt, Cluster, WorkspaceTab, ChatMessage, Settings, ProposedTheme, ProposedChunk, ImportedFile, ImportedFileEntry, ReportBlock } from './types';
import { CARD_WIDTH, CARD_HEIGHT, CARD_GAP } from './types';
import { generateId, arrangeInGrid, createPostIt, saveTheme } from './utils';
import { embedPostItsBatch } from './embeddings';

interface AppState {
  // Workspace tabs
  tabs: WorkspaceTab[];
  activeTabId: string;

  // Chat
  messages: ChatMessage[];

  // Settings
  settings: Settings;

  // UI state
  importDialogOpen: boolean;
  settingsDialogOpen: boolean;
  isProcessing: boolean;
  processingMessage: string;

  // Canvas
  canvasOffset: { x: number; y: number };
  canvasScale: number;

  // Embedding status
  embeddingStatus: 'idle' | 'embedding' | 'ready' | 'error';
  embeddingProgress: string;

  // Theme review (human-in-the-loop)
  themeReviewOpen: boolean;
  proposedThemes: ProposedTheme[];
  themeReviewQuery: string;
  themeReviewSummary: string;

  // Chunk review (human-in-the-loop for document chunking)
  chunkReviewOpen: boolean;
  proposedChunks: ProposedChunk[];
  chunkReviewSourceText: string;
  chunkReviewFileName: string;
  chunkReviewPendingFiles: ImportedFile[];
  chunkReviewSelectedId: string | null;
  // Multi-document review
  chunkReviewDocuments: Array<{
    fileName: string;
    sourceText: string;
    chunks: ProposedChunk[];
  }>;
  chunkReviewCurrentIndex: number;

  // Import distribution preferences (persisted for chunk review)
  importDistribution: {
    addToAllNotes: boolean;
    classifyTabIds: string[]; // tab IDs to classify into
  };
  setImportDistribution: (prefs: { addToAllNotes: boolean; classifyTabIds: string[] }) => void;
  clearImportDistribution: () => void;

  // Actions - Tabs
  addTab: (name: string, query?: string) => string;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;

  // Actions - Post-its (operate on active tab)
  getActiveTab: () => WorkspaceTab | undefined;
  addPostIt: (postIt: PostIt) => void;
  addPostIts: (postIts: PostIt[]) => void;
  addPostItsToTab: (tabId: string, postIts: PostIt[]) => void;
  updatePostIt: (id: string, updates: Partial<PostIt>) => void;
  deletePostIt: (id: string) => void;
  deleteSelectedPostIts: () => void;
  selectPostIt: (id: string, multi?: boolean) => void;
  deselectAll: () => void;
  setPostItsForActiveTab: (postIts: PostIt[]) => void;

  // Actions - Embeddings
  setPostItEmbeddings: (embeddings: Map<string, number[]>) => void;
  setEmbeddingStatus: (status: 'idle' | 'embedding' | 'ready' | 'error', progress?: string) => void;

  // Actions - Clusters
  setClusters: (clusters: Cluster[]) => void;
  clearClusters: () => void;
  addCluster: (cluster: Cluster) => void;
  removeCluster: (id: string) => void;
  renameCluster: (id: string, name: string) => void;
  moveCluster: (id: string, deltaX: number, deltaY: number) => void;
  updateClusterBounds: (id: string, x: number, y: number, width: number, height: number) => void;

  // Actions - Chat
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;

  // Actions - Settings
  updateSettings: (updates: Partial<Settings>) => void;

  // Actions - UI
  setImportDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  setIsProcessing: (processing: boolean, message?: string) => void;
  setCanvasOffset: (offset: { x: number; y: number }) => void;
  setCanvasScale: (scale: number | ((prev: number) => number)) => void;

  // Actions - Theme review
  openThemeReview: (themes: ProposedTheme[], query: string, summary: string) => void;
  closeThemeReview: () => void;
  updateProposedTheme: (id: string, updates: Partial<ProposedTheme>) => void;
  removeProposedTheme: (id: string) => void;
  addProposedTheme: (theme: ProposedTheme) => void;

  // Actions - Chunk review
  openChunkReview: (chunks: ProposedChunk[], sourceText: string, fileName: string, pendingFiles: ImportedFile[]) => void;
  closeChunkReview: () => void;
  updateProposedChunk: (id: string, updates: Partial<ProposedChunk>) => void;
  removeProposedChunk: (id: string) => void;
  addProposedChunk: (chunk: ProposedChunk) => void;
  mergeProposedChunks: (id1: string, id2: string) => void;
  setChunkReviewSelectedId: (id: string | null) => void;
  // Multi-document navigation
  goToChunkReviewDocument: (index: number) => void;
  nextChunkReviewDocument: () => void;
  previousChunkReviewDocument: () => void;
  saveCurrentDocumentChunks: () => void;
  approveAllChunkReviewDocuments: () => void;

  // Actions - Clone tab with modifications
  createAnalysisTab: (name: string, query: string, postIts: PostIt[], clusters: Cluster[]) => void;
  updatePostItPositions: (updates: { id: string; x: number; y: number }[]) => void;

  // Left panel + imported files
  activeLeftPanel: 'none' | 'files';
  setActiveLeftPanel: (panel: 'none' | 'files') => void;
  toggleLeftPanel: (panel: 'files') => void;
  importedFileEntries: ImportedFileEntry[];
  addImportedFileEntries: (entries: ImportedFileEntry[]) => void;
  removeImportedFileEntry: (id: string) => void;
  activeFileFilter: string | null; // source name to filter/highlight
  setActiveFileFilter: (source: string | null) => void;

  // Right panel
  activeRightPanel: 'none' | 'chat' | 'report';
  setActiveRightPanel: (panel: 'none' | 'chat' | 'report') => void;
  toggleRightPanel: (panel: 'chat' | 'report') => void;

  // Theme
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;

  // Report
  reportOpen: boolean;
  reportBlocks: ReportBlock[];
  reportTitle: string;

  // Actions - Report
  setReportOpen: (open: boolean) => void;
  toggleReport: () => void;
  setReportTitle: (title: string) => void;
  addReportBlock: (block: ReportBlock, afterId?: string) => void;
  updateReportBlock: (id: string, updates: Partial<ReportBlock>) => void;
  removeReportBlock: (id: string) => void;
  moveReportBlock: (id: string, direction: 'up' | 'down') => void;
  reorderReportBlock: (id: string, targetIndex: number) => void;
  insertQuoteBlock: (noteContent: string, noteId: string, participantId?: string, afterId?: string) => void;
}

const defaultTab: WorkspaceTab = {
  id: 'default',
  name: 'All Notes',
  postIts: [],
  clusters: [],
};

const defaultSettings: Settings = {
  openaiKey: '',
  geminiKey: '',
  claudeKey: '',
  selectedProvider: 'openai',
  selectedModel: 'gpt-4o',
  twitterBearerToken: '',
  redditClientId: '',
  redditClientSecret: '',
};

export const useStore = create<AppState>((set, get) => ({
  tabs: [defaultTab],
  activeTabId: 'default',
  messages: [],
  settings: defaultSettings,
  importDistribution: { addToAllNotes: true, classifyTabIds: [] },
  importDialogOpen: false,
  settingsDialogOpen: false,
  isProcessing: false,
  processingMessage: '',
  canvasOffset: { x: 0, y: 0 },
  canvasScale: 1,
  embeddingStatus: 'idle',
  embeddingProgress: '',
  themeReviewOpen: false,
  proposedThemes: [],
  themeReviewQuery: '',
  themeReviewSummary: '',
  chunkReviewOpen: false,
  proposedChunks: [],
  chunkReviewSourceText: '',
  chunkReviewFileName: '',
  chunkReviewPendingFiles: [],
  chunkReviewSelectedId: null,
  chunkReviewDocuments: [],
  chunkReviewCurrentIndex: 0,

  // Tab actions
  addTab: (name, query) => {
    const id = generateId();
    set((state) => ({
      tabs: [...state.tabs, { id, name, query, postIts: [], clusters: [] }],
      activeTabId: id,
    }));
    return id;
  },

  removeTab: (id) => {
    set((state) => {
      if (state.tabs.length <= 1) return state;
      const newTabs = state.tabs.filter((t) => t.id !== id);
      return {
        tabs: newTabs,
        activeTabId: state.activeTabId === id ? newTabs[0].id : state.activeTabId,
      };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id, canvasOffset: { x: 0, y: 0 }, canvasScale: 1 }),

  renameTab: (id, name) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, name } : t)),
    }));
  },

  // Post-it actions
  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId);
  },

  addPostIt: (postIt) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? { ...t, postIts: [...t.postIts, postIt] }
          : t
      ),
    }));
  },

  addPostIts: (postIts) => {
    set((state) => {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      const hasClusters = activeTab && activeTab.clusters.length > 0;

      return {
        tabs: state.tabs.map((t) => {
          if (t.id !== state.activeTabId) return t;

          if (hasClusters) {
            // Preserve existing positions, place new notes to the right
            const existingMaxX = t.postIts.length > 0
              ? Math.max(...t.postIts.map((p) => p.x + CARD_WIDTH)) + 80
              : 60;
            const newPostIts = postIts.map((p, i) => ({
              ...p,
              x: existingMaxX + (i % 3) * (CARD_WIDTH + CARD_GAP),
              y: 100 + Math.floor(i / 3) * (CARD_HEIGHT + CARD_GAP + 60),
            }));
            return { ...t, postIts: [...t.postIts, ...newPostIts] };
          }

          return { ...t, postIts: arrangeInGrid([...t.postIts, ...postIts]) };
        }),
      };
    });
  },

  addPostItsToTab: (tabId, postIts) => {
    set((state) => {
      const targetTab = state.tabs.find((t) => t.id === tabId);
      if (!targetTab) return state;
      const hasClusters = targetTab.clusters.length > 0;

      return {
        tabs: state.tabs.map((t) => {
          if (t.id !== tabId) return t;

          if (hasClusters) {
            const existingMaxX = t.postIts.length > 0
              ? Math.max(...t.postIts.map((p) => p.x + CARD_WIDTH)) + 80
              : 60;
            const newPostIts = postIts.map((p, i) => ({
              ...p,
              x: existingMaxX + (i % 3) * (CARD_WIDTH + CARD_GAP),
              y: 100 + Math.floor(i / 3) * (CARD_HEIGHT + CARD_GAP + 60),
            }));
            return { ...t, postIts: [...t.postIts, ...newPostIts] };
          }

          return { ...t, postIts: arrangeInGrid([...t.postIts, ...postIts]) };
        }),
      };
    });
  },

  updatePostIt: (id, updates) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? {
              ...t,
              postIts: t.postIts.map((p) =>
                p.id === id ? { ...p, ...updates } : p
              ),
            }
          : t
      ),
    }));
  },

  deletePostIt: (id) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? { ...t, postIts: t.postIts.filter((p) => p.id !== id) }
          : t
      ),
    }));
  },

  deleteSelectedPostIts: () => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? { ...t, postIts: t.postIts.filter((p) => !p.selected) }
          : t
      ),
    }));
  },

  selectPostIt: (id, multi = false) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? {
              ...t,
              postIts: t.postIts.map((p) => ({
                ...p,
                selected: p.id === id ? !p.selected : multi ? p.selected : false,
              })),
            }
          : t
      ),
    }));
  },

  deselectAll: () => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? { ...t, postIts: t.postIts.map((p) => ({ ...p, selected: false })) }
          : t
      ),
    }));
  },

  setPostItsForActiveTab: (postIts) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId ? { ...t, postIts } : t
      ),
    }));
  },

  // Embedding actions
  setEmbeddingStatus: (status, progress) =>
    set({ embeddingStatus: status, embeddingProgress: progress || '' }),
  setPostItEmbeddings: (embeddings) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? {
              ...t,
              postIts: t.postIts.map((p) => {
                const emb = embeddings.get(p.id);
                return emb ? { ...p, embedding: emb } : p;
              }),
            }
          : t
      ),
    }));
  },

  // Cluster actions
  setClusters: (clusters) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId ? { ...t, clusters } : t
      ),
    }));
  },

  clearClusters: () => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? {
              ...t,
              clusters: [],
              postIts: t.postIts.map((p) => ({
                ...p,
                clusterId: undefined,
                reasoning: undefined,
              })),
            }
          : t
      ),
    }));
  },

  addCluster: (cluster) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? { ...t, clusters: [...t.clusters, cluster] }
          : t
      ),
    }));
  },

  removeCluster: (id) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? {
              ...t,
              clusters: t.clusters.filter((c) => c.id !== id),
              postIts: t.postIts.map((p) =>
                p.clusterId === id ? { ...p, clusterId: undefined, reasoning: undefined } : p
              ),
            }
          : t
      ),
    }));
  },

  renameCluster: (id, name) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? { ...t, clusters: t.clusters.map((c) => (c.id === id ? { ...c, name } : c)) }
          : t
      ),
    }));
  },
  moveCluster: (id, deltaX, deltaY) => {
    set((state) => {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!activeTab) return state;

      // Move all post-its in this cluster by delta
      const updatedPostIts = activeTab.postIts.map((p) =>
        p.clusterId === id ? { ...p, x: p.x + deltaX, y: p.y + deltaY } : p
      );

      // Clear manual cluster bounds so it re-computes from the new post-it positions
      const updatedClusters = activeTab.clusters.map((c) =>
        c.id === id ? { ...c, x: undefined, y: undefined, width: undefined, height: undefined } : c
      );

      return {
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, clusters: updatedClusters, postIts: updatedPostIts }
            : t
        ),
      };
    });
  },
  updateClusterBounds: (id, x, y, width, height) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? {
              ...t,
              clusters: t.clusters.map((c) => (c.id === id ? { ...c, x, y, width, height } : c)),
            }
          : t
      ),
    }));
  },

  // Chat actions
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),

  // Settings actions
  updateSettings: (updates) => {
    set((state) => ({
      settings: { ...state.settings, ...updates },
    }));
  },

  // Import distribution actions
  setImportDistribution: (prefs) => set({ importDistribution: prefs }),
  clearImportDistribution: () =>
    set({ importDistribution: { addToAllNotes: true, classifyTabIds: [] } }),

  // UI actions
  setImportDialogOpen: (open) => set({ importDialogOpen: open }),
  setSettingsDialogOpen: (open) => set({ settingsDialogOpen: open }),
  setIsProcessing: (processing, message) =>
    set({ isProcessing: processing, processingMessage: message || '' }),
  setCanvasOffset: (offset) => set({ canvasOffset: offset }),
  setCanvasScale: (scale) =>
    set((state) => ({
      canvasScale: typeof scale === 'function' ? scale(state.canvasScale) : scale,
    })),

  // Theme review actions
  openThemeReview: (themes, query, summary) =>
    set({ themeReviewOpen: true, proposedThemes: themes, themeReviewQuery: query, themeReviewSummary: summary }),
  closeThemeReview: () =>
    set({ themeReviewOpen: false, proposedThemes: [], themeReviewQuery: '', themeReviewSummary: '' }),
  updateProposedTheme: (id, updates) =>
    set((state) => ({
      proposedThemes: state.proposedThemes.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeProposedTheme: (id) =>
    set((state) => ({
      proposedThemes: state.proposedThemes.filter((t) => t.id !== id),
    })),
  addProposedTheme: (theme) =>
    set((state) => ({
      proposedThemes: [...state.proposedThemes, theme],
    })),

  // Chunk review actions
  openChunkReview: (chunks, sourceText, fileName, pendingFiles) => {
    // Initialize documents array with first document
    const documents = [{ fileName, sourceText, chunks }];
    set({
      chunkReviewOpen: true,
      proposedChunks: chunks,
      chunkReviewSourceText: sourceText,
      chunkReviewFileName: fileName,
      chunkReviewPendingFiles: pendingFiles,
      chunkReviewSelectedId: null,
      chunkReviewDocuments: documents,
      chunkReviewCurrentIndex: 0,
    });
  },
  closeChunkReview: () =>
    set({
      chunkReviewOpen: false,
      proposedChunks: [],
      chunkReviewSourceText: '',
      chunkReviewFileName: '',
      chunkReviewPendingFiles: [],
      chunkReviewSelectedId: null,
      chunkReviewDocuments: [],
      chunkReviewCurrentIndex: 0,
    }),
  updateProposedChunk: (id, updates) =>
    set((state) => {
      const updated = state.proposedChunks.map((c) => (c.id === id ? { ...c, ...updates } : c));
      // Also update in documents array
      const updatedDocuments = [...state.chunkReviewDocuments];
      if (state.chunkReviewCurrentIndex >= 0 && state.chunkReviewCurrentIndex < updatedDocuments.length) {
        updatedDocuments[state.chunkReviewCurrentIndex] = {
          ...updatedDocuments[state.chunkReviewCurrentIndex],
          chunks: updated,
        };
      }
      return {
        proposedChunks: updated,
        chunkReviewDocuments: updatedDocuments,
      };
    }),
  removeProposedChunk: (id) =>
    set((state) => {
      const updated = state.proposedChunks.filter((c) => c.id !== id);
      // Also update in documents array
      const updatedDocuments = [...state.chunkReviewDocuments];
      if (state.chunkReviewCurrentIndex >= 0 && state.chunkReviewCurrentIndex < updatedDocuments.length) {
        updatedDocuments[state.chunkReviewCurrentIndex] = {
          ...updatedDocuments[state.chunkReviewCurrentIndex],
          chunks: updated,
        };
      }
      return {
        proposedChunks: updated,
        chunkReviewSelectedId: state.chunkReviewSelectedId === id ? null : state.chunkReviewSelectedId,
        chunkReviewDocuments: updatedDocuments,
      };
    }),
  addProposedChunk: (chunk) =>
    set((state) => {
      const updated = [...state.proposedChunks, chunk].sort((a, b) => a.startOffset - b.startOffset);
      // Also update in documents array
      const updatedDocuments = [...state.chunkReviewDocuments];
      if (state.chunkReviewCurrentIndex >= 0 && state.chunkReviewCurrentIndex < updatedDocuments.length) {
        updatedDocuments[state.chunkReviewCurrentIndex] = {
          ...updatedDocuments[state.chunkReviewCurrentIndex],
          chunks: updated,
        };
      }
      return {
        proposedChunks: updated,
        chunkReviewDocuments: updatedDocuments,
      };
    }),
  mergeProposedChunks: (id1, id2) =>
    set((state) => {
      const c1 = state.proposedChunks.find((c) => c.id === id1);
      const c2 = state.proposedChunks.find((c) => c.id === id2);
      if (!c1 || !c2) return state;
      const merged = {
        ...c1,
        content: c1.content + '\n\n' + c2.content,
        startOffset: Math.min(c1.startOffset, c2.startOffset),
        endOffset: Math.max(c1.endOffset, c2.endOffset),
        participantId: c1.participantId || c2.participantId,
      };
      const updated = state.proposedChunks
        .filter((c) => c.id !== id2)
        .map((c) => (c.id === id1 ? merged : c));
      // Also update in documents array
      const updatedDocuments = [...state.chunkReviewDocuments];
      if (state.chunkReviewCurrentIndex >= 0 && state.chunkReviewCurrentIndex < updatedDocuments.length) {
        updatedDocuments[state.chunkReviewCurrentIndex] = {
          ...updatedDocuments[state.chunkReviewCurrentIndex],
          chunks: updated,
        };
      }
      return {
        proposedChunks: updated,
        chunkReviewDocuments: updatedDocuments,
      };
    }),
  setChunkReviewSelectedId: (id) => set({ chunkReviewSelectedId: id }),

  // Multi-document navigation
  goToChunkReviewDocument: (index) => {
    const state = get();
    if (index < 0 || index >= state.chunkReviewDocuments.length) return;
    // Save current document before navigating
    if (state.chunkReviewCurrentIndex >= 0 && state.chunkReviewCurrentIndex < state.chunkReviewDocuments.length) {
      const updated = [...state.chunkReviewDocuments];
      updated[state.chunkReviewCurrentIndex] = {
        ...updated[state.chunkReviewCurrentIndex],
        chunks: state.proposedChunks,
      };
      state.chunkReviewDocuments = updated;
    }
    const doc = state.chunkReviewDocuments[index];
    set({
      chunkReviewDocuments: state.chunkReviewDocuments,
      chunkReviewCurrentIndex: index,
      proposedChunks: doc.chunks,
      chunkReviewSourceText: doc.sourceText,
      chunkReviewFileName: doc.fileName,
      chunkReviewSelectedId: null,
    });
  },
  nextChunkReviewDocument: () => {
    const state = get();
    if (state.chunkReviewCurrentIndex < state.chunkReviewDocuments.length - 1) {
      // Save current document before navigating
      const updated = [...state.chunkReviewDocuments];
      updated[state.chunkReviewCurrentIndex] = {
        ...updated[state.chunkReviewCurrentIndex],
        chunks: state.proposedChunks,
      };
      const nextIndex = state.chunkReviewCurrentIndex + 1;
      const doc = updated[nextIndex];
      set({
        chunkReviewDocuments: updated,
        chunkReviewCurrentIndex: nextIndex,
        proposedChunks: doc.chunks,
        chunkReviewSourceText: doc.sourceText,
        chunkReviewFileName: doc.fileName,
        chunkReviewSelectedId: null,
      });
    }
  },
  previousChunkReviewDocument: () => {
    const state = get();
    if (state.chunkReviewCurrentIndex > 0) {
      // Save current document before navigating
      const updated = [...state.chunkReviewDocuments];
      updated[state.chunkReviewCurrentIndex] = {
        ...updated[state.chunkReviewCurrentIndex],
        chunks: state.proposedChunks,
      };
      const prevIndex = state.chunkReviewCurrentIndex - 1;
      const doc = updated[prevIndex];
      set({
        chunkReviewDocuments: updated,
        chunkReviewCurrentIndex: prevIndex,
        proposedChunks: doc.chunks,
        chunkReviewSourceText: doc.sourceText,
        chunkReviewFileName: doc.fileName,
        chunkReviewSelectedId: null,
      });
    }
  },
  saveCurrentDocumentChunks: () => {
    const state = get();
    if (state.chunkReviewCurrentIndex >= 0 && state.chunkReviewCurrentIndex < state.chunkReviewDocuments.length) {
      const updated = [...state.chunkReviewDocuments];
      updated[state.chunkReviewCurrentIndex] = {
        ...updated[state.chunkReviewCurrentIndex],
        chunks: state.proposedChunks,
      };
      set({ chunkReviewDocuments: updated });
    }
  },
  approveAllChunkReviewDocuments: () => {
    const state = get();
    const tab = state.getActiveTab();
    const existingCount = tab?.postIts.length || 0;
    let postItIndex = existingCount;

    // Collect all post-its from all documents
    const allPostIts: PostIt[] = [];
    state.chunkReviewDocuments.forEach((doc) => {
      doc.chunks.forEach((chunk) => {
        allPostIts.push(createPostIt(chunk.content, doc.fileName, postItIndex, chunk.participantId));
        postItIndex++;
      });
    });

    // Add all post-its to active tab
    state.addPostIts(allPostIts);

    // Distribution: also add to All Notes if preference is set and we're not on All Notes
    const { importDistribution } = state;
    if (importDistribution.addToAllNotes && state.activeTabId !== 'default') {
      const allNotesPostIts = allPostIts.map((p, i) =>
        createPostIt(p.content, p.source, i, p.participantId)
      );
      state.addPostItsToTab('default', allNotesPostIts);
    }

    // Embed in background
    state.setEmbeddingStatus('embedding', `Embedding ${allPostIts.length} notes...`);
    embedPostItsBatch(state.settings, allPostIts).then((embeddings) => {
      if (embeddings.size > 0) {
        state.setPostItEmbeddings(embeddings);
        state.setEmbeddingStatus('ready');
      } else {
        state.setEmbeddingStatus('idle');
      }
    }).catch((err) => {
      console.warn('Background embedding failed:', err);
      state.setEmbeddingStatus('error', 'Embedding failed');
    });

    // Distribution: classify into clustered tabs (including current if selected)
    // This happens asynchronously after the dialog closes
    if (importDistribution.classifyTabIds.length > 0) {
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('insightboard:classify-imported', {
            detail: {
              postIts: allPostIts,
              tabIds: importDistribution.classifyTabIds,
            },
          })
        );
      }, 200);
    }

    // Clear distribution prefs
    state.clearImportDistribution();

    // Close chunk review
    state.closeChunkReview();
  },

  // Analysis tab
  createAnalysisTab: (name, query, postIts, clusters) => {
    const id = generateId();
    set((state) => ({
      tabs: [...state.tabs, { id, name, query, postIts, clusters }],
      activeTabId: id,
    }));
  },

  updatePostItPositions: (updates) => {
    set((state) => {
      const posMap = new Map(updates.map((u) => [u.id, u]));
      return {
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? {
                ...t,
                postIts: t.postIts.map((p) => {
                  const pos = posMap.get(p.id);
                  return pos ? { ...p, x: pos.x, y: pos.y } : p;
                }),
              }
            : t
        ),
      };
    });
  },

  // Left panel state
  activeLeftPanel: 'files' as const,
  setActiveLeftPanel: (panel) => set({ activeLeftPanel: panel }),
  toggleLeftPanel: (panel) =>
    set((state) => ({
      activeLeftPanel: state.activeLeftPanel === panel ? 'none' : panel,
    })),
  importedFileEntries: [],
  addImportedFileEntries: (entries) =>
    set((state) => ({
      importedFileEntries: [...state.importedFileEntries, ...entries],
    })),
  removeImportedFileEntry: (id) =>
    set((state) => ({
      importedFileEntries: state.importedFileEntries.filter((f) => f.id !== id),
    })),
  activeFileFilter: null,
  setActiveFileFilter: (source) => set({ activeFileFilter: source }),

  // Right panel state
  activeRightPanel: 'chat' as const,
  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
  toggleRightPanel: (panel) =>
    set((state) => ({
      activeRightPanel: state.activeRightPanel === panel ? 'none' : panel,
    })),

  // Theme state
  theme: 'light' as const,
  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== 'undefined') {
      saveTheme(theme);
    }
  },
  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      if (typeof window !== 'undefined') {
        saveTheme(newTheme);
      }
      return { theme: newTheme };
    });
  },

  // Report state
  reportOpen: false,
  reportBlocks: [],
  reportTitle: 'Untitled Report',

  // Report actions
  setReportOpen: (open) => set({ reportOpen: open }),
  toggleReport: () => set((state) => ({ reportOpen: !state.reportOpen })),
  setReportTitle: (title) => set({ reportTitle: title }),

  addReportBlock: (block, afterId) => {
    set((state) => {
      if (afterId) {
        const idx = state.reportBlocks.findIndex((b) => b.id === afterId);
        if (idx !== -1) {
          const updated = [...state.reportBlocks];
          updated.splice(idx + 1, 0, block);
          return { reportBlocks: updated };
        }
      }
      return { reportBlocks: [...state.reportBlocks, block] };
    });
  },

  updateReportBlock: (id, updates) => {
    set((state) => ({
      reportBlocks: state.reportBlocks.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      ),
    }));
  },

  removeReportBlock: (id) => {
    set((state) => ({
      reportBlocks: state.reportBlocks.filter((b) => b.id !== id),
    }));
  },

  moveReportBlock: (id, direction) => {
    set((state) => {
      const idx = state.reportBlocks.findIndex((b) => b.id === id);
      if (idx === -1) return state;
      if (direction === 'up' && idx === 0) return state;
      if (direction === 'down' && idx === state.reportBlocks.length - 1) return state;
      const updated = [...state.reportBlocks];
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      [updated[idx], updated[swap]] = [updated[swap], updated[idx]];
      return { reportBlocks: updated };
    });
  },

  reorderReportBlock: (id, targetIndex) => {
    set((state) => {
      const currentIdx = state.reportBlocks.findIndex((b) => b.id === id);
      if (currentIdx === -1 || currentIdx === targetIndex) return state;
      const updated = [...state.reportBlocks];
      const [removed] = updated.splice(currentIdx, 1);
      updated.splice(targetIndex, 0, removed);
      return { reportBlocks: updated };
    });
  },

  insertQuoteBlock: (noteContent, noteId, participantId, afterId) => {
    const block: ReportBlock = {
      id: generateId(),
      type: 'quote',
      content: noteContent,
      sourceNoteId: noteId,
      sourceText: noteContent,
      participantId,
    };
    get().addReportBlock(block, afterId);
  },
}));
