'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { parseFile, extractCSVPostIts, getAcceptedFileTypes } from '@/lib/file-parsers';
import {
  callAI,
  buildChunkingPrompt,
  buildClassifyNewNotesPrompt,
  parseJSONResponse,
} from '@/lib/ai-service';
import { createPostIt, generateId, arrangeInClusters } from '@/lib/utils';
import type { ImportedFile, ImportedFileEntry, PostIt, ProposedChunk } from '@/lib/types';
import { HIGHLIGHT_COLORS, POST_IT_COLORS } from '@/lib/types';
import { embedPostItsBatch } from '@/lib/embeddings';
import {
  X,
  Upload,
  FileText,
  Table,
  Check,
  Loader2,
  AlertCircle,
  FileUp,
  Clipboard,
  Layers,
  FolderPlus,
  Sparkles,
} from 'lucide-react';

type ImportStep = 'upload' | 'configure' | 'distribute' | 'processing';

interface DistributeOption {
  tabId: string;
  tabName: string;
  clusterCount: number;
  classify: boolean;
}

export function ImportDialog() {
  const {
    importDialogOpen,
    setImportDialogOpen,
    addPostIts,
    addPostItsToTab,
    settings,
    getActiveTab,
    openChunkReview,
    setPostItEmbeddings,
    setEmbeddingStatus,
    tabs,
    activeTabId,
    setIsProcessing,
    setImportDistribution,
    addImportedFileEntries,
  } = useStore();

  const [step, setStep] = useState<ImportStep>('upload');
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({});
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Distribution options
  const [addToAllNotes, setAddToAllNotes] = useState(true);
  const [distributeOptions, setDistributeOptions] = useState<DistributeOption[]>([]);

  // Listen for classify-imported events from chunk review approval
  useEffect(() => {
    const handler = async (e: Event) => {
      const { postIts: newPostIts, tabIds } = (e as CustomEvent).detail as {
        postIts: PostIt[];
        tabIds: string[];
      };

      if (tabIds.length === 0 || newPostIts.length === 0) return;

      setIsProcessing(true, 'Classifying new notes into clusters...');

      const currentActiveTabId = useStore.getState().activeTabId;

      for (let i = 0; i < tabIds.length; i++) {
        const tabId = tabIds[i];
        const { tabs: freshTabs } = useStore.getState();
        const tab = freshTabs.find((t) => t.id === tabId);
        if (!tab || tab.clusters.length === 0) continue;

        setIsProcessing(
          true,
          `Classifying into "${tab.name}" (${i + 1}/${tabIds.length})...`
        );

        const isCurrent = tabId === currentActiveTabId;

        // For current tab, the notes already exist (added by approveAllChunkReviewDocuments)
        // For other tabs, create fresh copies with unique IDs
        const notesForClassify = isCurrent
          ? newPostIts
          : newPostIts.map((p) => createPostIt(p.content, p.source, 0, p.participantId));

        const classified = await classifyForTab(notesForClassify, tabId);

        // Read fresh state again after async classify
        const { tabs: latestTabs } = useStore.getState();
        const targetTab = latestTabs.find((t) => t.id === tabId);
        if (!targetTab) continue;

        if (isCurrent) {
          // Replace the unclassified new notes with classified ones
          const existingPostIts = targetTab.postIts.filter(
            (p) => !newPostIts.some((np) => np.id === p.id)
          );
          const merged = [...existingPostIts, ...classified];
          const rearranged = arrangeInClusters(merged, targetTab.clusters.map((c) => c.id));
          useStore.setState((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === tabId ? { ...t, postIts: rearranged } : t
            ),
          }));
        } else {
          // Add classified notes to other tab
          const merged = [...targetTab.postIts, ...classified];
          const rearranged = arrangeInClusters(merged, targetTab.clusters.map((c) => c.id));
          useStore.setState((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === tabId ? { ...t, postIts: rearranged } : t
            ),
          }));
        }
      }

      setIsProcessing(false);
    };

    window.addEventListener('insightboard:classify-imported', handler);
    return () => window.removeEventListener('insightboard:classify-imported', handler);
  }, [tabs, settings, setIsProcessing]);

  const handleClose = useCallback(() => {
    setImportDialogOpen(false);
    setStep('upload');
    setFiles([]);
    setSelectedColumns({});
    setPasteText('');
    setError('');
    setProcessing(false);
    setDistributeOptions([]);
    setAddToAllNotes(true);
  }, [setImportDialogOpen]);

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      setError('');
      const parsed: ImportedFile[] = [];

      for (let i = 0; i < fileList.length; i++) {
        try {
          const result = await parseFile(fileList[i]);
          parsed.push(result);
        } catch (err) {
          setError(`Failed to parse ${fileList[i].name}: ${err}`);
        }
      }

      if (parsed.length > 0) {
        setFiles((prev) => [...prev, ...parsed]);

        // Auto-select all columns for CSVs
        setSelectedColumns((prev) => {
          const newSelections = { ...prev };
          parsed.forEach((f) => {
            if (f.type === 'csv' && f.columns) {
              newSelections[f.name] = f.columns.slice(0, 3);
            }
          });
          return newSelections;
        });

        const hasCSV = parsed.some((f) => f.type === 'csv');
        if (hasCSV) {
          setStep('configure');
        }
      }
    },
    []
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        await handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const toggleColumn = useCallback((fileName: string, column: string) => {
    setSelectedColumns((prev) => {
      const current = prev[fileName] || [];
      if (current.includes(column)) {
        return { ...prev, [fileName]: current.filter((c) => c !== column) };
      }
      return { ...prev, [fileName]: [...current, column] };
    });
  }, []);

  // Helper: find chunk offsets in source text
  const computeOffsets = (sourceText: string, chunks: ProposedChunk[]): ProposedChunk[] => {
    const updated = chunks.map((c) => ({ ...c }));
    const used: { start: number; end: number }[] = [];
    for (const chunk of updated) {
      let searchFrom = 0;
      let found = false;
      while (!found) {
        const idx = sourceText.indexOf(chunk.content, searchFrom);
        if (idx === -1) break;
        const end = idx + chunk.content.length;
        const overlaps = used.some((r) => idx < r.end && end > r.start);
        if (!overlaps) {
          chunk.startOffset = idx;
          chunk.endOffset = end;
          used.push({ start: idx, end });
          found = true;
        } else {
          searchFrom = idx + 1;
        }
      }
      if (!found && chunk.content.length > 40) {
        const snippet = chunk.content.slice(0, 40);
        const idx = sourceText.indexOf(snippet);
        if (idx !== -1) {
          const tail = chunk.content.slice(-20);
          const tailIdx = sourceText.indexOf(tail, idx);
          if (tailIdx !== -1) {
            chunk.startOffset = idx;
            chunk.endOffset = tailIdx + tail.length;
            used.push({ start: idx, end: chunk.endOffset });
          }
        }
      }
    }
    return updated;
  };

  // Check if distribution options should be shown
  const getClusteredTabs = useCallback(() => {
    return tabs.filter((t) => t.clusters.length > 0);
  }, [tabs]);

  // Prepare distribution step
  const prepareDistribution = useCallback(() => {
    const clusteredTabs = getClusteredTabs();
    const activeTab = getActiveTab();
    const isOnAllNotes = activeTabId === 'default';

    if (clusteredTabs.length === 0) {
      // No clustered tabs — skip distribution, go straight to import
      return false;
    }

    // Build options for each clustered tab
    const options: DistributeOption[] = clusteredTabs.map((t) => ({
      tabId: t.id,
      tabName: t.name,
      clusterCount: t.clusters.length,
      classify: true, // default to classify
    }));

    setDistributeOptions(options);
    setAddToAllNotes(!isOnAllNotes); // if already on All Notes, it's implied
    setStep('distribute');
    return true;
  }, [getClusteredTabs, getActiveTab, activeTabId]);

  // Classify post-its into a tab's existing clusters via AI
  const classifyForTab = async (
    notesToClassify: PostIt[],
    tabId: string
  ): Promise<PostIt[]> => {
    // Always read fresh tab data from the store
    const { tabs: freshTabs } = useStore.getState();
    const tab = freshTabs.find((t) => t.id === tabId);
    if (!tab || tab.clusters.length === 0) return notesToClassify;

    try {
      const clusterDescriptions = tab.clusters.map((c) => ({
        name: c.name,
        description: c.reasoning,
      }));

      const messages = buildClassifyNewNotesPrompt(notesToClassify, clusterDescriptions);
      const response = await callAI(settings, messages);
      const parsed = parseJSONResponse(response) as {
        classified: { id: string; cluster: string; reasoning: string }[];
        unclustered?: { id: string; reasoning: string }[];
      };

      const clusterNameToId = new Map(tab.clusters.map((c) => [c.name, c.id]));
      const clusterIdToIndex = new Map(tab.clusters.map((c, i) => [c.id, i]));

      return notesToClassify.map((p) => {
        const classification = (parsed.classified || []).find((c) => c.id === p.id);
        if (classification) {
          const clusterId = clusterNameToId.get(classification.cluster);
          if (clusterId) {
            const idx = clusterIdToIndex.get(clusterId) || 0;
            return {
              ...p,
              clusterId,
              reasoning: classification.reasoning,
              color: POST_IT_COLORS[idx % POST_IT_COLORS.length],
            };
          }
        }
        const uc = (parsed.unclustered || []).find((u) => u.id === p.id);
        return { ...p, reasoning: uc?.reasoning };
      });
    } catch (err) {
      console.warn(`Classification into tab "${tab?.name}" failed:`, err);
      return notesToClassify;
    }
  };

  // Execute import with distribution — clean single-pass approach
  const executeDistributedImport = useCallback(
    async (newPostIts: PostIt[]) => {
      const isOnAllNotes = activeTabId === 'default';
      const tabsToClassify = distributeOptions.filter((o) => o.classify);
      const classifyCurrentTab = tabsToClassify.some((o) => o.tabId === activeTabId);

      // 1. Add to All Notes (if opted in and not already on it)
      if (addToAllNotes && !isOnAllNotes) {
        const allNotesPostIts = newPostIts.map((p) =>
          createPostIt(p.content, p.source, 0, p.participantId)
        );
        addPostItsToTab('default', allNotesPostIts);
      }

      // 2. Add to current tab — classify if selected
      if (classifyCurrentTab) {
        setIsProcessing(true, 'Classifying new notes into clusters...');
        const classified = await classifyForTab(newPostIts, activeTabId);

        // Read fresh tab, merge existing + classified, rearrange
        const { tabs: freshTabs } = useStore.getState();
        const currentTab = freshTabs.find((t) => t.id === activeTabId);
        if (currentTab) {
          const merged = [...currentTab.postIts, ...classified];
          const rearranged = arrangeInClusters(merged, currentTab.clusters.map((c) => c.id));
          useStore.setState((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === activeTabId ? { ...t, postIts: rearranged } : t
            ),
          }));
        }
      } else {
        // Just add without classifying
        addPostIts(newPostIts);
      }

      // 3. Classify into OTHER clustered tabs
      const otherTabs = tabsToClassify.filter((o) => o.tabId !== activeTabId);
      for (let i = 0; i < otherTabs.length; i++) {
        const opt = otherTabs[i];
        setIsProcessing(
          true,
          `Classifying into "${opt.tabName}" (${i + 1}/${otherTabs.length})...`
        );

        // Create fresh copies with unique IDs for this tab
        const tabPostIts = newPostIts.map((p) =>
          createPostIt(p.content, p.source, 0, p.participantId)
        );

        const classified = await classifyForTab(tabPostIts, opt.tabId);

        // Read fresh tab, merge, rearrange
        const { tabs: freshTabs } = useStore.getState();
        const targetTab = freshTabs.find((t) => t.id === opt.tabId);
        if (targetTab) {
          const merged = [...targetTab.postIts, ...classified];
          const rearranged = arrangeInClusters(merged, targetTab.clusters.map((c) => c.id));
          useStore.setState((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === opt.tabId ? { ...t, postIts: rearranged } : t
            ),
          }));
        }
      }

      setIsProcessing(false);

      // 4. Embed in background
      setEmbeddingStatus('embedding', `Embedding ${newPostIts.length} notes...`);
      embedPostItsBatch(settings, newPostIts)
        .then((embeddings) => {
          if (embeddings.size > 0) {
            setPostItEmbeddings(embeddings);
            setEmbeddingStatus('ready');
          } else {
            setEmbeddingStatus('idle');
          }
        })
        .catch((err) => {
          console.warn('Background embedding failed:', err);
          setEmbeddingStatus('error', 'Embedding failed');
        });
    },
    [
      activeTabId,
      addToAllNotes,
      distributeOptions,
      addPostIts,
      addPostItsToTab,
      settings,
      setIsProcessing,
      setEmbeddingStatus,
      setPostItEmbeddings,
    ]
  );

  const processImport = useCallback(async () => {
    // Show distribution step before processing if clustered tabs exist
    if (step !== 'distribute') {
      const needsDistribution = prepareDistribution();
      if (needsDistribution) return;
    }

    // Save distribution preferences to store (for chunk review to use)
    const classifyTabIds = distributeOptions
      .filter((o) => o.classify)
      .map((o) => o.tabId);
    setImportDistribution({ addToAllNotes, classifyTabIds });

    setProcessing(true);
    setStep('processing');
    setError('');

    try {
      const currentTab = getActiveTab();
      const existingCount = currentTab?.postIts.length || 0;

      // 1. Handle CSV files directly (no AI needed)
      const csvPostIts: { content: string; source: string }[] = [];
      for (const file of files.filter((f) => f.type === 'csv')) {
        if (file.rows && file.columns) {
          const cols = selectedColumns[file.name] || file.columns;
          csvPostIts.push(...extractCSVPostIts(file.rows, cols, file.name));
        }
      }

      if (csvPostIts.length > 0) {
        const postIts = csvPostIts.map((item, i) =>
          createPostIt(item.content, item.source, existingCount + i)
        );

        // Track imported CSV files
        const csvEntries: ImportedFileEntry[] = files
          .filter((f) => f.type === 'csv')
          .map((f) => ({
            id: generateId(),
            name: f.name,
            type: f.type,
            importedAt: Date.now(),
          }));
        addImportedFileEntries(csvEntries);

        // Always use distributed import (handles All Notes + classification)
        await executeDistributedImport(postIts);
      }

      // 2. Collect text files + pasted text for chunk review
      const textFiles: ImportedFile[] = files
        .filter((f) => f.type !== 'csv')
        .map((f) => ({ ...f }));

      if (pasteText.trim()) {
        textFiles.push({
          name: 'Pasted Text',
          type: 'text',
          content: pasteText.trim(),
        });
      }

      if (textFiles.length > 0) {
        const [firstFile, ...restFiles] = textFiles;
        setProgress(`Analyzing ${firstFile.name}...`);

        try {
          const messages = buildChunkingPrompt(firstFile.content, firstFile.name);
          const response = await callAI(settings, messages);
          const parsed = parseJSONResponse(response) as {
            chunks: { content: string; participantId?: string }[];
          };

          const chunks: ProposedChunk[] = (parsed.chunks || []).map((c, i) => ({
            id: generateId(),
            content: c.content,
            participantId: c.participantId,
            startOffset: -1,
            endOffset: -1,
            color: HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length].bg,
          }));

          const withOffsets = computeOffsets(firstFile.content, chunks);

          // Track imported text files
          const textEntries: ImportedFileEntry[] = textFiles.map((f) => ({
            id: generateId(),
            name: f.name,
            type: f.type,
            importedAt: Date.now(),
          }));
          addImportedFileEntries(textEntries);

          setImportDialogOpen(false);
          setStep('upload');
          setFiles([]);
          setSelectedColumns({});
          setPasteText('');
          setProcessing(false);

          openChunkReview(withOffsets, firstFile.content, firstFile.name, restFiles);
        } catch (err) {
          console.error(`Error processing ${firstFile.name}:`, err);
          setError(
            `AI analysis failed for ${firstFile.name}: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`
          );
          setProcessing(false);
          setStep('upload');
        }
      } else {
        // Only CSVs, close dialog
        setProgress(
          csvPostIts.length > 0
            ? `Added ${csvPostIts.length} notes`
            : 'Done'
        );
        setTimeout(() => {
          handleClose();
        }, 600);
      }
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setProcessing(false);
      setStep('upload');
    }
  }, [
    files,
    selectedColumns,
    pasteText,
    settings,
    step,
    getActiveTab,
    addPostIts,
    setImportDialogOpen,
    openChunkReview,
    setPostItEmbeddings,
    setEmbeddingStatus,
    prepareDistribution,
    executeDistributedImport,
    getClusteredTabs,
    handleClose,
  ]);

  // --- All hooks are above this line ---

  if (!importDialogOpen) return null;

  const hasTextFiles = files.some((f) => f.type !== 'csv');
  const hasPasteText = pasteText.trim().length > 0;
  const needsAI = hasTextFiles || hasPasteText;
  const hasApiKey =
    (settings.selectedProvider === 'openai' && settings.openaiKey) ||
    (settings.selectedProvider === 'gemini' && settings.geminiKey) ||
    (settings.selectedProvider === 'claude' && settings.claudeKey);

  const canProcess = files.length > 0 || hasPasteText;
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isClusteredTab = activeTab && activeTab.clusters.length > 0;

  return (
    <>
      <div
        className="dialog-overlay fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
        onClick={handleClose}
      />
      <div className="dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-surface rounded-2xl shadow-xl w-full max-w-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileUp className="w-5 h-5 text-accent" />
            <h2 className="text-[16px] font-semibold text-text-primary tracking-[-0.02em]">Import Data</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {step === 'processing' ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-sm text-text-secondary">{progress || 'Processing...'}</p>
            </div>
          ) : step === 'distribute' ? (
            /* ---- Distribution Step ---- */
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">
                  You have clustered tabs
                </h3>
                <p className="text-xs text-text-tertiary leading-relaxed">
                  New notes will be added to <strong className="text-text-secondary">{activeTab?.name || 'the current tab'}</strong>. Choose additional options below.
                </p>
              </div>

              {/* Add to All Notes */}
              {activeTabId !== 'default' && (
                <label className="flex items-start gap-3 px-3.5 py-3 rounded-xl border border-border hover:bg-surface-hover cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={addToAllNotes}
                    onChange={(e) => setAddToAllNotes(e.target.checked)}
                    className="mt-0.5 rounded border-border accent-accent"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <FolderPlus className="w-3.5 h-3.5 text-text-secondary" />
                      <span className="text-xs font-medium text-text-primary">
                        Also add to &quot;All Notes&quot;
                      </span>
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      Keep a copy in the main tab so future analyses include them
                    </p>
                  </div>
                </label>
              )}

              {/* Auto-classify options — show ALL clustered tabs including current */}
              {distributeOptions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span className="text-xs font-semibold text-text-primary">
                      Sort new notes into existing clusters
                    </span>
                  </div>
                  <p className="text-[11px] text-text-tertiary">
                    AI will read each new note and place it into the best-matching cluster. Notes that don&apos;t fit stay unclustered.
                  </p>

                  {distributeOptions.map((opt) => {
                    const isCurrent = opt.tabId === activeTabId;
                    return (
                      <label
                        key={opt.tabId}
                        className="flex items-start gap-3 px-3.5 py-3 rounded-xl border border-border hover:bg-surface-hover cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={opt.classify}
                          onChange={(e) => {
                            setDistributeOptions((prev) =>
                              prev.map((o) =>
                                o.tabId === opt.tabId
                                  ? { ...o, classify: e.target.checked }
                                  : o
                              )
                            );
                          }}
                          className="mt-0.5 rounded border-border accent-accent"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Layers className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
                            <span className="text-xs font-medium text-text-primary truncate">
                              {opt.tabName}
                            </span>
                            <span className="text-[10px] text-text-tertiary px-1.5 py-0.5 rounded-full bg-surface-hover flex-shrink-0">
                              {opt.clusterCount} clusters
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] text-accent font-medium flex-shrink-0">
                                current tab
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                  ${
                    dragOver
                      ? 'border-accent bg-accent-light'
                      : 'border-border hover:border-text-tertiary hover:bg-surface-hover'
                  }
                `}
              >
                <Upload className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
                <p className="text-sm font-medium text-text-primary">
                  Drop files here or click to browse
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                  CSV, DOCX, TXT, MD files supported
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={getAcceptedFileTypes()}
                  className="hidden"
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
              </div>

              {/* Uploaded Files */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">
                    Uploaded Files
                  </label>
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-hover border border-border"
                    >
                      {f.type === 'csv' ? (
                        <Table className="w-4 h-4 text-success flex-shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-accent flex-shrink-0" />
                      )}
                      <span className="text-sm text-text-primary flex-1 truncate">
                        {f.name}
                      </span>
                      {f.type === 'csv' && f.rows && (
                        <span className="text-xs text-text-tertiary">
                          {f.rows.length} rows
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles((prev) => prev.filter((_, j) => j !== i));
                        }}
                        className="text-text-tertiary hover:text-danger transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* CSV Column Picker */}
              {step === 'configure' &&
                files
                  .filter((f) => f.type === 'csv' && f.columns)
                  .map((file) => (
                    <div key={file.name} className="space-y-2">
                      <label className="text-sm font-medium text-text-primary">
                        Select columns from {file.name}
                      </label>
                      <p className="text-xs text-text-tertiary">
                        Choose which columns to import as post-it content
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {file.columns!.map((col) => {
                          const isSelected = (selectedColumns[file.name] || []).includes(
                            col
                          );
                          return (
                            <button
                              key={col}
                              onClick={() => toggleColumn(file.name, col)}
                              className={`
                                px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                                ${
                                  isSelected
                                    ? 'border-accent bg-accent-light text-accent'
                                    : 'border-border text-text-secondary hover:border-text-tertiary'
                                }
                              `}
                            >
                              {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                              {col}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

              {/* Paste Text */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                  <Clipboard className="w-3.5 h-3.5" />
                  Or paste text directly
                </label>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste interview transcript, research notes, or any text data..."
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none"
                />
              </div>

              {/* AI Notice */}
              {needsAI && !hasApiKey && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-warning/10 border border-warning/20">
                  <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-text-secondary">
                    Text files and pasted text require AI to chunk into post-its. Please
                    add an API key in Settings first.
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-danger/10 border border-danger/20">
                  <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-danger">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step !== 'processing' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-hover/50">
            <p className="text-xs text-text-tertiary">
              {step === 'distribute'
                ? `${files.length} file(s) ready to import`
                : files.length > 0
                  ? `${files.length} file(s) ready`
                  : 'No files selected'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={step === 'distribute' ? () => setStep('upload') : handleClose}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                {step === 'distribute' ? 'Back' : 'Cancel'}
              </button>
              {step === 'configure' && (
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={processImport}
                disabled={!canProcess || (needsAI && !hasApiKey)}
                className="px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
              >
                {step === 'distribute'
                  ? 'Import & Classify'
                  : `Import ${files.length > 0 ? `${files.length} file(s)` : 'Text'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
