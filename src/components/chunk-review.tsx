'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { createPostIt, generateId } from '@/lib/utils';
import { HIGHLIGHT_COLORS } from '@/lib/types';
import type { ProposedChunk } from '@/lib/types';
import { embedPostItsBatch } from '@/lib/embeddings';
import {
  X,
  Trash2,
  Pencil,
  Merge,
  Plus,
  FileText,
  StickyNote,
  ChevronRight,
  ChevronLeft,
  User,
  AlertCircle,
  Scissors,
  Check,
  Loader2,
} from 'lucide-react';

// Find each chunk's location in the source text
function computeOffsets(
  sourceText: string,
  chunks: ProposedChunk[]
): ProposedChunk[] {
  const updated = chunks.map((c) => ({ ...c }));
  const used: { start: number; end: number }[] = [];

  for (const chunk of updated) {
    if (chunk.startOffset >= 0 && chunk.endOffset > chunk.startOffset) continue;

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

    if (!found) {
      chunk.startOffset = -1;
      chunk.endOffset = -1;
    }
  }

  return updated;
}

interface TextSegment {
  text: string;
  chunkId?: string;
  chunkIndex?: number;
  isHighlight: boolean;
}

function buildSegments(
  sourceText: string,
  chunks: ProposedChunk[]
): TextSegment[] {
  const positioned = chunks
    .filter((c) => c.startOffset >= 0)
    .sort((a, b) => a.startOffset - b.startOffset);

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (let i = 0; i < positioned.length; i++) {
    const chunk = positioned[i];
    if (chunk.startOffset > cursor) {
      segments.push({
        text: sourceText.slice(cursor, chunk.startOffset),
        isHighlight: false,
      });
    }
    const end = Math.min(chunk.endOffset, sourceText.length);
    segments.push({
      text: sourceText.slice(chunk.startOffset, end),
      chunkId: chunk.id,
      chunkIndex: chunks.findIndex((c) => c.id === chunk.id),
      isHighlight: true,
    });
    cursor = end;
  }

  if (cursor < sourceText.length) {
    segments.push({
      text: sourceText.slice(cursor),
      isHighlight: false,
    });
  }

  return segments;
}

// ---- Context Menu ----
interface ContextMenuState {
  x: number;
  y: number;
  selectionText: string;
  selectionStart: number;
  selectionEnd: number;
  overlappingChunkIds: string[];
  clickedChunkId: string | null;
}

export function ChunkReview() {
  const {
    chunkReviewOpen,
    proposedChunks,
    chunkReviewSourceText,
    chunkReviewFileName,
    chunkReviewPendingFiles,
    chunkReviewSelectedId,
    chunkReviewDocuments,
    chunkReviewCurrentIndex,
    closeChunkReview,
    updateProposedChunk,
    removeProposedChunk,
    addProposedChunk,
    mergeProposedChunks,
    setChunkReviewSelectedId,
    goToChunkReviewDocument,
    nextChunkReviewDocument,
    previousChunkReviewDocument,
    saveCurrentDocumentChunks,
    approveAllChunkReviewDocuments,
    openChunkReview,
    settings,
    setIsProcessing,
  } = useStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editParticipant, setEditParticipant] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingFileName, setAnalyzingFileName] = useState('');
  const docRef = useRef<HTMLDivElement>(null);
  const chunkRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const highlightRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  const chunksWithOffsets = useMemo(
    () => computeOffsets(chunkReviewSourceText, proposedChunks),
    [chunkReviewSourceText, proposedChunks]
  );

  const segments = useMemo(
    () => buildSegments(chunkReviewSourceText, chunksWithOffsets),
    [chunkReviewSourceText, chunksWithOffsets]
  );

  useEffect(() => {
    if (!chunkReviewSelectedId) return;
    const chunkEl = chunkRefs.current.get(chunkReviewSelectedId);
    if (chunkEl) chunkEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const highlightEl = highlightRefs.current.get(chunkReviewSelectedId);
    if (highlightEl) highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [chunkReviewSelectedId]);

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // Find which existing chunks overlap a given range
  const findOverlappingChunks = useCallback(
    (start: number, end: number): string[] => {
      return chunksWithOffsets
        .filter((c) => c.startOffset >= 0 && c.startOffset < end && c.endOffset > start)
        .map((c) => c.id);
    },
    [chunksWithOffsets]
  );

  // Smart add: removes overlapping chunks, creates a new one covering the selection
  const addChunkFromRange = useCallback(
    (text: string, start: number, end: number) => {
      const overlaps = findOverlappingChunks(start, end);

      // Remove all overlapping chunks
      overlaps.forEach((id) => removeProposedChunk(id));

      const newChunk: ProposedChunk = {
        id: generateId(),
        content: text,
        startOffset: start,
        endOffset: end,
        color: HIGHLIGHT_COLORS[proposedChunks.length % HIGHLIGHT_COLORS.length].bg,
      };
      addProposedChunk(newChunk);
      setChunkReviewSelectedId(newChunk.id);
    },
    [findOverlappingChunks, removeProposedChunk, addProposedChunk, proposedChunks.length, setChunkReviewSelectedId]
  );

  // Right-click handler for the document panel
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      const selection = window.getSelection();
      const selText = selection?.toString().trim() || '';

      // Figure out if we clicked on an existing chunk highlight
      let clickedChunkId: string | null = null;
      let el = e.target as HTMLElement | null;
      while (el && el !== docRef.current) {
        if (el.dataset?.chunkId) {
          clickedChunkId = el.dataset.chunkId;
          break;
        }
        el = el.parentElement;
      }

      // Find selection range in the source text
      let selStart = -1;
      let selEnd = -1;
      if (selText) {
        const idx = chunkReviewSourceText.indexOf(selText);
        if (idx >= 0) {
          selStart = idx;
          selEnd = idx + selText.length;
        }
      }

      const overlaps = selStart >= 0 ? findOverlappingChunks(selStart, selEnd) : [];

      // Only show menu if there's something to act on
      if (!selText && !clickedChunkId) return;

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        selectionText: selText,
        selectionStart: selStart,
        selectionEnd: selEnd,
        overlappingChunkIds: overlaps,
        clickedChunkId,
      });
    },
    [chunkReviewSourceText, findOverlappingChunks]
  );

  if (!chunkReviewOpen) return null;

  const startEdit = (chunk: ProposedChunk) => {
    setEditingId(chunk.id);
    setEditContent(chunk.content);
    setEditParticipant(chunk.participantId || '');
  };

  const saveEdit = () => {
    if (editingId) {
      updateProposedChunk(editingId, {
        content: editContent,
        participantId: editParticipant || undefined,
      });
      setEditingId(null);
    }
  };

  const handleApprove = async () => {
    // Save current document chunks
    saveCurrentDocumentChunks();

    // Check if there are pending files to process
    const state = useStore.getState();
    if (state.chunkReviewPendingFiles.length > 0) {
      const [nextFile, ...rest] = state.chunkReviewPendingFiles;
      const { callAI, buildChunkingPrompt, parseJSONResponse } = await import('@/lib/ai-service');

      setAnalyzing(true);
      setAnalyzingFileName(nextFile.name);

      try {
        const messages = buildChunkingPrompt(nextFile.content, nextFile.name);
        const response = await callAI(settings, messages);
        const parsed = parseJSONResponse(response) as {
          chunks: { content: string; participantId?: string }[];
        };

        const newChunks: ProposedChunk[] = (parsed.chunks || []).map((c, i) => ({
          id: generateId(),
          content: c.content,
          participantId: c.participantId,
          startOffset: -1,
          endOffset: -1,
          color: HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length].bg,
        }));

        const withOffsets = computeOffsets(nextFile.content, newChunks);
        
        // Add new document to documents array and navigate to it
        const currentState = useStore.getState();
        const updatedDocuments = [...currentState.chunkReviewDocuments, {
          fileName: nextFile.name,
          sourceText: nextFile.content,
          chunks: withOffsets,
        }];
        
        useStore.setState({
          chunkReviewDocuments: updatedDocuments,
          chunkReviewPendingFiles: rest,
          chunkReviewCurrentIndex: updatedDocuments.length - 1,
          proposedChunks: withOffsets,
          chunkReviewSourceText: nextFile.content,
          chunkReviewFileName: nextFile.name,
          chunkReviewSelectedId: null,
        });
      } catch (err) {
        console.error('Error processing next file:', err);
      } finally {
        setAnalyzing(false);
        setAnalyzingFileName('');
      }
    } else {
      // No more files to process, approve all documents
      approveAllChunkReviewDocuments();
    }
  };

  const unpositionedChunks = chunksWithOffsets.filter((c) => c.startOffset < 0);

  return (
    <>
      <div className="dialog-overlay fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
      <div className="fixed inset-4 z-50 bg-surface rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-accent" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Review Chunks — {chunkReviewFileName}
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {chunkReviewDocuments.length > 1
                  ? `Review and edit chunks for all documents. Use navigation buttons to move between documents.`
                  : `Review how the AI split your document. Right-click text to add or delete chunks, or drag to select and create new ones.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-tertiary">
              {proposedChunks.length} chunk{proposedChunks.length !== 1 ? 's' : ''}
              {chunkReviewDocuments.length > 1 && (
                ` · Document ${chunkReviewCurrentIndex + 1} of ${chunkReviewDocuments.length}`
              )}
              {chunkReviewPendingFiles.length > 0 &&
                ` · ${chunkReviewPendingFiles.length} more file${chunkReviewPendingFiles.length !== 1 ? 's' : ''} pending`}
            </span>
            <button
              onClick={closeChunkReview}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Loading overlay while analyzing next document */}
          {analyzing && (
            <div className="absolute inset-0 z-20 bg-surface/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-3 p-8 rounded-2xl bg-surface border border-border shadow-lg">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-medium text-text-primary">
                    Analyzing next document
                  </p>
                  <p className="text-xs text-text-secondary mt-1">
                    {analyzingFileName}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-[11px] text-text-tertiary">
                    AI is splitting the document into chunks…
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Left: Document */}
          <div className="flex-1 flex flex-col border-r border-border min-w-0">
            <div className="px-4 py-2 border-b border-border bg-surface-hover/50 flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                Source Document
              </span>
              <span className="text-[10px] text-text-tertiary">
                Right-click for options
              </span>
            </div>
            <div
              ref={docRef}
              className="flex-1 overflow-y-auto px-6 py-4 text-sm text-text-primary leading-relaxed whitespace-pre-wrap select-text"
              onContextMenu={handleContextMenu}
            >
              {segments.map((seg, i) =>
                seg.isHighlight ? (
                  <span
                    key={i}
                    ref={(el) => {
                      if (el && seg.chunkId) highlightRefs.current.set(seg.chunkId, el);
                    }}
                    data-chunk-id={seg.chunkId}
                    onClick={() => setChunkReviewSelectedId(seg.chunkId || null)}
                    className={`
                      cursor-pointer rounded px-0.5 -mx-0.5 transition-all inline
                      ${chunkReviewSelectedId === seg.chunkId
                        ? 'ring-2 ring-accent shadow-sm'
                        : 'hover:ring-1 hover:ring-black/10 dark:hover:ring-white/10'
                      }
                    `}
                    style={{
                      backgroundColor:
                        HIGHLIGHT_COLORS[(seg.chunkIndex ?? 0) % HIGHLIGHT_COLORS.length].bg,
                      borderBottom: `2px solid ${
                        HIGHLIGHT_COLORS[(seg.chunkIndex ?? 0) % HIGHLIGHT_COLORS.length].border
                      }`,
                      color: '#1A1A1A', // Explicit dark text - highlights are always light backgrounds
                    }}
                    title={`Chunk ${(seg.chunkIndex ?? 0) + 1} — click to select, right-click for options`}
                  >
                    {seg.text}
                  </span>
                ) : (
                  <span key={i} className="text-text-secondary">
                    {seg.text}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Right: Chunk list */}
          <div className="w-[380px] flex-shrink-0 flex flex-col">
            <div className="px-4 py-2 border-b border-border bg-surface-hover/50 flex-shrink-0">
              <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <StickyNote className="w-3 h-3" />
                Proposed Post-its ({proposedChunks.length})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {proposedChunks.map((chunk, index) => {
                const isSelected = chunkReviewSelectedId === chunk.id;
                const colorSet = HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length];
                const nextChunk = proposedChunks[index + 1];

                return (
                  <div key={chunk.id}>
                    <div
                      ref={(el) => {
                        if (el) chunkRefs.current.set(chunk.id, el);
                      }}
                      onClick={() => setChunkReviewSelectedId(chunk.id)}
                      className={`
                        group rounded-xl border p-3 cursor-pointer transition-all
                        ${isSelected
                          ? 'border-accent bg-accent-light/30 shadow-sm'
                          : 'border-border hover:border-text-tertiary bg-surface-hover/30'
                        }
                      `}
                    >
                      {editingId === chunk.id ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg border border-border bg-surface text-xs text-text-primary focus:outline-none focus:border-accent resize-none leading-relaxed"
                            rows={4}
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 flex-1">
                              <User className="w-3 h-3 text-text-tertiary" />
                              <input
                                value={editParticipant}
                                onChange={(e) => setEditParticipant(e.target.value)}
                                placeholder="Participant"
                                className="px-2 py-1 rounded border border-border bg-surface text-[11px] text-text-primary focus:outline-none focus:border-accent w-24"
                              />
                            </div>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 text-[11px] text-text-secondary hover:text-text-primary"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEdit}
                              className="px-2.5 py-1 text-[11px] font-medium text-white bg-accent rounded-lg hover:bg-accent-hover"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start gap-2">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                              style={{ backgroundColor: colorSet.border }}
                            />
                            <p className="text-xs text-text-primary leading-relaxed flex-1">
                              {chunk.content}
                            </p>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2">
                              {chunk.participantId && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[10px] text-text-secondary font-medium">
                                  <User className="w-2.5 h-2.5" />
                                  {chunk.participantId}
                                </span>
                              )}
                              {chunk.startOffset < 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warning/10 text-[10px] text-warning font-medium">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  Not found in text
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); startEdit(chunk); }}
                                className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-text-tertiary hover:text-text-secondary transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeProposedChunk(chunk.id); }}
                                className="p-1 rounded hover:bg-black/5 text-text-tertiary hover:text-danger transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {nextChunk && (
                      <div className="flex justify-center py-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); mergeProposedChunks(chunk.id, nextChunk.id); }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-text-tertiary hover:text-accent hover:bg-accent-light transition-colors"
                          title="Merge with next"
                        >
                          <Merge className="w-2.5 h-2.5" />
                          Merge
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {proposedChunks.length === 0 && (
                <div className="text-center py-8 text-xs text-text-tertiary">
                  No chunks yet. Select text in the document and right-click to create chunks.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-hover/50 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <div className="flex -space-x-1">
                {HIGHLIGHT_COLORS.slice(0, Math.min(proposedChunks.length, 5)).map((c, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-full border-2 border-surface"
                    style={{ backgroundColor: c.border }}
                  />
                ))}
              </div>
              {proposedChunks.length} chunk{proposedChunks.length !== 1 ? 's' : ''} ready
            </div>
            {unpositionedChunks.length > 0 && (
              <span className="text-[11px] text-warning">
                {unpositionedChunks.length} chunk{unpositionedChunks.length !== 1 ? 's' : ''} couldn&apos;t be located in text
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Navigation buttons */}
            {chunkReviewDocuments.length > 1 && (
              <div className="flex items-center gap-1 border-r border-border pr-3">
                <button
                  onClick={() => {
                    saveCurrentDocumentChunks();
                    previousChunkReviewDocument();
                  }}
                  disabled={chunkReviewCurrentIndex === 0 || analyzing}
                  className="p-1.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous document"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-text-tertiary px-2">
                  {chunkReviewCurrentIndex + 1} / {chunkReviewDocuments.length}
                </span>
                <button
                  onClick={() => {
                    saveCurrentDocumentChunks();
                    nextChunkReviewDocument();
                  }}
                  disabled={chunkReviewCurrentIndex === chunkReviewDocuments.length - 1 || analyzing}
                  className="p-1.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next document"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              onClick={closeChunkReview}
              disabled={analyzing}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            {chunkReviewPendingFiles.length === 0 && chunkReviewDocuments.length > 0 ? (
              <button
                onClick={() => {
                  saveCurrentDocumentChunks();
                  approveAllChunkReviewDocuments();
                }}
                disabled={proposedChunks.length === 0 || analyzing}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-xl transition-colors"
              >
                <Check className="w-4 h-4" />
                Approve All ({chunkReviewDocuments.reduce((sum, doc) => sum + doc.chunks.length, 0)} chunks)
              </button>
            ) : (
              <button
                onClick={handleApprove}
                disabled={proposedChunks.length === 0 || analyzing}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-xl transition-colors"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing…
                  </>
                ) : chunkReviewPendingFiles.length > 0 ? (
                  <>
                    Next Document
                    <ChevronRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Approve {proposedChunks.length} Chunk{proposedChunks.length !== 1 ? 's' : ''}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Context Menu ---- */}
      {contextMenu && (
        <div
          className="fixed z-[60] bg-surface rounded-xl border border-border shadow-xl py-1 min-w-[200px]"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 220),
            top: Math.min(contextMenu.y, window.innerHeight - 200),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Selection-based actions */}
          {contextMenu.selectionText && (
            <>
              {contextMenu.overlappingChunkIds.length > 0 ? (
                /* Selection overlaps existing chunks — replace them */
                <button
                  onClick={() => {
                    addChunkFromRange(
                      contextMenu.selectionText,
                      contextMenu.selectionStart,
                      contextMenu.selectionEnd
                    );
                    window.getSelection()?.removeAllRanges();
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors text-left"
                >
                  <Scissors className="w-3.5 h-3.5 text-accent" />
                  <div>
                    <div className="font-medium">Replace & create chunk</div>
                    <div className="text-[10px] text-text-tertiary mt-0.5">
                      Replaces {contextMenu.overlappingChunkIds.length} overlapping chunk{contextMenu.overlappingChunkIds.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </button>
              ) : (
                /* New selection, no overlaps */
                <button
                  onClick={() => {
                    addChunkFromRange(
                      contextMenu.selectionText,
                      contextMenu.selectionStart,
                      contextMenu.selectionEnd
                    );
                    window.getSelection()?.removeAllRanges();
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors text-left"
                >
                  <Plus className="w-3.5 h-3.5 text-accent" />
                  <div>
                    <div className="font-medium">Create chunk from selection</div>
                    <div className="text-[10px] text-text-tertiary mt-0.5 max-w-[160px] truncate">
                      &ldquo;{contextMenu.selectionText.slice(0, 50)}{contextMenu.selectionText.length > 50 ? '…' : ''}&rdquo;
                    </div>
                  </div>
                </button>
              )}
            </>
          )}

          {/* Clicked on an existing chunk — show delete */}
          {contextMenu.clickedChunkId && (
            <>
              {contextMenu.selectionText && <div className="h-px bg-border my-1" />}
              <button
                onClick={() => {
                  removeProposedChunk(contextMenu.clickedChunkId!);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-danger hover:bg-danger/5 transition-colors text-left"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <div className="font-medium">Delete this chunk</div>
              </button>
              <button
                onClick={() => {
                  const chunk = proposedChunks.find((c) => c.id === contextMenu.clickedChunkId);
                  if (chunk) startEdit(chunk);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors text-left"
              >
                <Pencil className="w-3.5 h-3.5 text-text-tertiary" />
                <div className="font-medium">Edit this chunk</div>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
