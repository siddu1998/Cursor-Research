'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { callAI, buildClassifyWithThemesPrompt, parseJSONResponse } from '@/lib/ai-service';
import { generateId, arrangeInClusters } from '@/lib/utils';
import { CARD_WIDTH, CARD_HEIGHT, CARD_GAP } from '@/lib/types';
import { CLUSTER_COLORS, POST_IT_COLORS } from '@/lib/types';
import type { Cluster } from '@/lib/types';
import {
  X,
  Plus,
  Trash2,
  Pencil,
  Check,
  Loader2,
  Sparkles,
  ArrowRight,
  AlertCircle,
  GripVertical,
  Quote,
} from 'lucide-react';

export function ThemeReview() {
  const {
    themeReviewOpen,
    proposedThemes,
    themeReviewQuery,
    themeReviewSummary,
    closeThemeReview,
    updateProposedTheme,
    removeProposedTheme,
    addProposedTheme,
    settings,
    tabs,
    activeTabId,
    createAnalysisTab,
    addMessage,
    setIsProcessing,
  } = useStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState('');

  if (!themeReviewOpen) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const postIts = activeTab?.postIts || [];

  const startEdit = (id: string) => {
    const theme = proposedThemes.find((t) => t.id === id);
    if (theme) {
      setEditingId(id);
      setEditName(theme.name);
      setEditDescription(theme.description);
    }
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      updateProposedTheme(editingId, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      setEditingId(null);
    }
  };

  const handleAddTheme = () => {
    if (newName.trim()) {
      addProposedTheme({
        id: generateId(),
        name: newName.trim(),
        description: newDescription.trim(),
        evidence: 'Added by researcher',
      });
      setNewName('');
      setNewDescription('');
      setAddingNew(false);
    }
  };

  const handleConfirmAndClassify = async () => {
    if (proposedThemes.length === 0) return;

    setClassifying(true);
    setError('');
    setIsProcessing(true, 'Classifying notes into your approved themes...');

    try {
      const themes = proposedThemes.map((t) => ({
        name: t.name,
        description: t.description,
      }));

      // Classify with auto-continuation for truncated responses
      type ClassifyResult = {
        clusters: {
          name: string;
          reasoning: string;
          items: { id: string; reasoning: string }[];
        }[];
        unclustered?: { id: string; reasoning: string }[];
      };

      // Accumulate results across multiple passes
      const allClassifiedIds = new Set<string>();
      const accumulatedClusters: Map<string, {
        name: string;
        reasoning: string;
        items: { id: string; reasoning: string }[];
      }> = new Map();
      let accumulatedUnclustered: { id: string; reasoning: string }[] = [];

      let remainingPostIts = [...postIts];
      let pass = 0;
      const MAX_PASSES = 5;

      while (remainingPostIts.length > 0 && pass < MAX_PASSES) {
        pass++;
        if (pass > 1) {
          setIsProcessing(true, `Classifying remaining ${remainingPostIts.length} notes (pass ${pass})...`);
        }

        const messages = buildClassifyWithThemesPrompt(remainingPostIts, themes, themeReviewQuery);

        // Try up to 2 attempts per pass (retry on JSON parse failure)
        let parsed: ClassifyResult | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await callAI(settings, messages);
            parsed = parseJSONResponse(response) as ClassifyResult;
            break;
          } catch (parseErr) {
            if (attempt === 0) {
              setIsProcessing(true, 'Retrying classification...');
              continue;
            }
            throw parseErr;
          }
        }

        if (!parsed) continue;

        // Merge results
        for (const cluster of (parsed.clusters || [])) {
          const existing = accumulatedClusters.get(cluster.name);
          if (existing) {
            existing.items.push(...(cluster.items || []));
          } else {
            accumulatedClusters.set(cluster.name, {
              name: cluster.name,
              reasoning: cluster.reasoning,
              items: [...(cluster.items || [])],
            });
          }
          for (const item of (cluster.items || [])) {
            allClassifiedIds.add(item.id);
          }
        }

        if (parsed.unclustered) {
          accumulatedUnclustered.push(...parsed.unclustered);
          for (const item of parsed.unclustered) {
            allClassifiedIds.add(item.id);
          }
        }

        // Find unclassified notes
        remainingPostIts = postIts.filter((p) => !allClassifiedIds.has(p.id));

        // If we classified everything, or this pass classified nothing new, stop
        if (remainingPostIts.length === 0) break;
        const prevSize = allClassifiedIds.size;
        if (prevSize === allClassifiedIds.size && pass > 1) break;
      }

      // Build final result
      const finalClusters = Array.from(accumulatedClusters.values());

      // Create cluster objects
      const newClusters: Cluster[] = finalClusters.map((c, i) => ({
        id: generateId(),
        name: c.name,
        color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
        reasoning: c.reasoning,
      }));

      // Assign post-its to clusters
      let updatedPostIts = postIts.map((p) => ({ ...p }));

      finalClusters.forEach((clusterData, i) => {
        clusterData.items.forEach((item) => {
          const idx = updatedPostIts.findIndex((p) => p.id === item.id);
          if (idx !== -1) {
            updatedPostIts[idx] = {
              ...updatedPostIts[idx],
              clusterId: newClusters[i].id,
              reasoning: item.reasoning,
              color: POST_IT_COLORS[i % POST_IT_COLORS.length],
            };
          }
        });
      });

      accumulatedUnclustered.forEach((item) => {
        const idx = updatedPostIts.findIndex((p) => p.id === item.id);
        if (idx !== -1) {
          updatedPostIts[idx] = {
            ...updatedPostIts[idx],
            clusterId: undefined,
            reasoning: item.reasoning,
          };
        }
      });

      // Calculate final arranged positions
      const arrangedPostIts = arrangeInClusters(
        updatedPostIts,
        newClusters.map((c) => c.id)
      );

      // Build a map of final positions
      const finalPositions = new Map(
        arrangedPostIts.map((p) => [p.id, { x: p.x, y: p.y }])
      );

      // Step 1: Create tab with post-its at ORIGINAL positions (but with cluster assignments)
      // This lets the canvas render them where they currently are
      const tabName = themeReviewQuery.length > 30
        ? themeReviewQuery.slice(0, 30) + '...'
        : themeReviewQuery;
      createAnalysisTab(tabName, themeReviewQuery, updatedPostIts, newClusters);

      const unclassifiedCount = postIts.filter((p) => !allClassifiedIds.has(p.id)).length;
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: `Classified ${postIts.length} notes into ${newClusters.length} researcher-approved themes:\n${newClusters
          .map((c, i) => `• ${c.name} — ${finalClusters[i].items.length} notes`)
          .join('\n')}${accumulatedUnclustered.length > 0 ? `\n• Unclustered — ${accumulatedUnclustered.length} notes` : ''}${unclassifiedCount > 0 ? `\n• Not reached — ${unclassifiedCount} notes` : ''}${pass > 1 ? `\n\n(Completed in ${pass} passes)` : ''}\n\nEvery note includes reasoning for its classification. Review the notes to validate.`,
        timestamp: Date.now(),
      });

      closeThemeReview();

      // Step 2: Stagger-animate post-its into cluster positions
      const { updatePostItPositions, setCanvasOffset, setCanvasScale } = useStore.getState();

      // Small delay to let the new tab render with original positions
      setTimeout(() => {
        // Animate each cluster with a stagger
        newClusters.forEach((cluster, clusterIdx) => {
          const clusterPostIts = updatedPostIts.filter((p) => p.clusterId === cluster.id);

          setTimeout(() => {
            const positionUpdates = clusterPostIts.map((p) => {
              const pos = finalPositions.get(p.id);
              return { id: p.id, x: pos?.x ?? p.x, y: pos?.y ?? p.y };
            });
            updatePostItPositions(positionUpdates);
          }, clusterIdx * 300); // 300ms between each cluster
        });

        // Move unclustered post-its last
        const unclusteredPostIts = updatedPostIts.filter((p) => !p.clusterId);
        if (unclusteredPostIts.length > 0) {
          setTimeout(() => {
            const positionUpdates = unclusteredPostIts.map((p) => {
              const pos = finalPositions.get(p.id);
              return { id: p.id, x: pos?.x ?? p.x, y: pos?.y ?? p.y };
            });
            updatePostItPositions(positionUpdates);
          }, newClusters.length * 300);
        }

        // Auto-fit canvas after all animations complete
        const totalAnimationTime = (newClusters.length + 1) * 300 + 700;
        setTimeout(() => {
          // Recalculate bounds and fit
          const state = useStore.getState();
          const tab = state.tabs.find((t) => t.id === state.activeTabId);
          if (!tab || tab.postIts.length === 0) return;

          const allX = tab.postIts.map((p) => p.x);
          const allY = tab.postIts.map((p) => p.y);
          const minX = Math.min(...allX);
          const minY = Math.min(...allY);
          const maxX = Math.max(...allX) + CARD_WIDTH;
          const maxY = Math.max(...allY) + CARD_HEIGHT;

          // Estimate canvas size (fallback to window)
          const canvasW = window.innerWidth - 60; // minus nav rail
          const canvasH = window.innerHeight - 160; // minus header/toolbar
          const contentW = maxX - minX + 120;
          const contentH = maxY - minY + 120;

          const scale = Math.min(canvasW / contentW, canvasH / contentH, 1.2);
          const offsetX = (canvasW - contentW * scale) / 2 - minX * scale + 60;
          const offsetY = (canvasH - contentH * scale) / 2 - minY * scale + 60;

          setCanvasScale(scale);
          setCanvasOffset({ x: offsetX, y: offsetY });
        }, totalAnimationTime);
      }, 150);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Classification failed';
      setError(
        errMsg.includes('parse')
          ? 'AI returned a malformed response. Try again — or reduce the number of themes.'
          : errMsg
      );
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: `Classification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    } finally {
      setClassifying(false);
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div
        className="dialog-overlay fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
        onClick={() => !classifying && closeThemeReview()}
      />
      <div className="dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-surface rounded-2xl shadow-xl w-full max-w-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              <h2 className="text-[16px] font-semibold text-text-primary tracking-[-0.02em]">Review Proposed Themes</h2>
            </div>
            <button
              onClick={() => !classifying && closeThemeReview()}
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
            The AI has analyzed your data and proposed these themes. Review, edit, add, or remove themes before classifying your notes.
          </p>
        </div>

        {/* AI Summary */}
        {themeReviewSummary && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-accent-light border border-accent/10">
            <p className="text-xs font-medium text-accent mb-1">AI Analysis Summary</p>
            <p className="text-sm text-text-primary leading-relaxed">{themeReviewSummary}</p>
          </div>
        )}

        {/* Themes list */}
        <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
          {proposedThemes.map((theme, index) => (
            <div
              key={theme.id}
              className="group rounded-xl border border-border bg-surface-hover/50 overflow-hidden transition-all hover:border-text-tertiary"
            >
              {editingId === theme.id ? (
                /* Edit mode */
                <div className="p-4 space-y-3">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium text-text-primary focus:outline-none focus:border-accent"
                    placeholder="Theme name"
                    autoFocus
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
                    placeholder="Description of this theme"
                    rows={2}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: CLUSTER_COLORS[index % CLUSTER_COLORS.length] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-text-primary">{theme.name}</h3>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(theme.id)}
                            className="p-1 rounded-md hover:bg-black/5 text-text-tertiary hover:text-text-secondary transition-colors"
                            title="Edit theme"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => removeProposedTheme(theme.id)}
                            className="p-1 rounded-md hover:bg-black/5 text-text-tertiary hover:text-danger transition-colors"
                            title="Remove theme"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                        {theme.description}
                      </p>
                      {theme.evidence && theme.evidence !== 'Added by researcher' && (
                        <div className="flex items-start gap-1.5 mt-2 text-[11px] text-text-tertiary">
                          <Quote className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          <span className="italic">{theme.evidence}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add new theme */}
          {addingNew ? (
            <div className="rounded-xl border-2 border-dashed border-accent/30 bg-accent-light/30 p-4 space-y-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm font-medium text-text-primary focus:outline-none focus:border-accent"
                placeholder="New theme name"
                autoFocus
              />
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
                placeholder="Describe what this theme should capture"
                rows={2}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setAddingNew(false);
                    setNewName('');
                    setNewDescription('');
                  }}
                  className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTheme}
                  disabled={!newName.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors"
                >
                  Add Theme
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingNew(true)}
              className="w-full rounded-xl border-2 border-dashed border-border hover:border-text-tertiary p-3 text-xs font-medium text-text-tertiary hover:text-text-secondary transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add your own theme
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-danger/10 border border-danger/20">
            <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-hover/50">
          <p className="text-xs text-text-tertiary">
            {proposedThemes.length} theme{proposedThemes.length !== 1 ? 's' : ''} · {postIts.length} notes to classify
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => !classifying && closeThemeReview()}
              disabled={classifying}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAndClassify}
              disabled={proposedThemes.length === 0 || classifying}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-xl transition-colors"
            >
              {classifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Classifying...
                </>
              ) : (
                <>
                  Confirm & Classify
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
