'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { PostItCard } from './post-it-card';
import { CARD_WIDTH, CARD_HEIGHT, CLUSTER_COLORS, POST_IT_COLORS } from '@/lib/types';
import type { Cluster } from '@/lib/types';
import { Plus, ZoomIn, ZoomOut, Maximize2, FolderPlus } from 'lucide-react';
import { createPostIt, generateId } from '@/lib/utils';

export function Canvas() {
  const {
    tabs,
    activeTabId,
    canvasOffset,
    canvasScale,
    setCanvasOffset,
    setCanvasScale,
    updatePostIt,
    addPostIt,
    deselectAll,
    getActiveTab,
    addCluster,
    renameCluster,
    removeCluster,
    moveCluster,
    updateClusterBounds,
    activeFileFilter,
  } = useStore();

  const canvasRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingPostIt, setDraggingPostIt] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingClusterId, setEditingClusterId] = useState<string | null>(null);
  const [editClusterName, setEditClusterName] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [draggingSelected, setDraggingSelected] = useState(false);
  const [selectedDragOffset, setSelectedDragOffset] = useState<{ x: number; y: number }[]>([]);
  // Cluster drag state
  const [draggingCluster, setDraggingCluster] = useState<string | null>(null);
  const [clusterDragDelta, setClusterDragDelta] = useState({ x: 0, y: 0 });
  const clusterDragMouseStart = useRef({ x: 0, y: 0 });

  // Cluster resize state
  const [resizingCluster, setResizingCluster] = useState<string | null>(null);
  const [resizeVisual, setResizeVisual] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const resizeMouseStart = useRef({ x: 0, y: 0 });
  const resizeInitialBounds = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const resizeHandleRef = useRef<'nw' | 'ne' | 'sw' | 'se' | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const postIts = activeTab?.postIts || [];
  const clusters = activeTab?.clusters || [];

  // Get cluster boundaries for rendering (including empty clusters)
  const clusterBounds = useMemo(() => {
    const bounds: {
      cluster: typeof clusters[0];
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      isEmpty: boolean;
    }[] = [];

    // Track rightmost edge to position empty clusters
    let maxRight = 60;

    for (let ci = 0; ci < clusters.length; ci++) {
      const cluster = clusters[ci];
      const items = postIts.filter((p) => p.clusterId === cluster.id);
      const color = CLUSTER_COLORS[ci % CLUSTER_COLORS.length];

      if (items.length > 0) {
        // Use manual position/size if set, otherwise compute from post-its
        let x: number, y: number, width: number, height: number;
        
        if (cluster.x !== undefined && cluster.y !== undefined && cluster.width !== undefined && cluster.height !== undefined) {
          x = cluster.x;
          y = cluster.y;
          width = cluster.width;
          height = cluster.height;
        } else {
          const minX = Math.min(...items.map((p) => p.x)) - 20;
          const minY = Math.min(...items.map((p) => p.y)) - 40;
          const maxX = Math.max(...items.map((p) => p.x + CARD_WIDTH)) + 20;
          const maxY = Math.max(...items.map((p) => p.y)) + CARD_HEIGHT + 120;
          x = minX;
          y = minY;
          width = maxX - minX;
          height = maxY - minY;
        }

        bounds.push({
          cluster,
          x,
          y,
          width,
          height,
          color,
          isEmpty: false,
        });

        maxRight = Math.max(maxRight, x + width + 40);
      } else {
        // Empty cluster — render a placeholder drop zone
        bounds.push({
          cluster,
          x: maxRight,
          y: 60,
          width: CARD_WIDTH + 60,
          height: CARD_HEIGHT + 80,
          color,
          isEmpty: true,
        });
        maxRight += CARD_WIDTH + 100;
      }
    }

    return bounds;
  }, [clusters, postIts]);

  // Pan handlers
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current || (e.target as HTMLElement).dataset.canvasBg) {
        // Shift+drag = selection box
        if (e.shiftKey) {
          setIsSelecting(true);
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            const startX = e.clientX - rect.left;
            const startY = e.clientY - rect.top;
            setSelectionBox({ startX, startY, currentX: startX, currentY: startY });
          }
          // Don't deselect if shift is held (allows adding to selection)
        } else {
          setIsPanning(true);
          setPanStart({
            x: e.clientX - canvasOffset.x,
            y: e.clientY - canvasOffset.y,
          });
          deselectAll();
        }
      }
    },
    [canvasOffset, deselectAll]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isSelecting && selectionBox) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const currentX = e.clientX - rect.left;
          const currentY = e.clientY - rect.top;
          setSelectionBox({ ...selectionBox, currentX, currentY });

          // Select post-its that intersect with selection box
          const boxLeft = Math.min(selectionBox.startX, currentX);
          const boxRight = Math.max(selectionBox.startX, currentX);
          const boxTop = Math.min(selectionBox.startY, currentY);
          const boxBottom = Math.max(selectionBox.startY, currentY);

          // Convert selection box to canvas coordinates
          const canvasBoxLeft = (boxLeft - canvasOffset.x) / canvasScale;
          const canvasBoxRight = (boxRight - canvasOffset.x) / canvasScale;
          const canvasBoxTop = (boxTop - canvasOffset.y) / canvasScale;
          const canvasBoxBottom = (boxBottom - canvasOffset.y) / canvasScale;

          // Check each post-it for intersection
          postIts.forEach((postIt) => {
            const postItRight = postIt.x + CARD_WIDTH;
            const postItBottom = postIt.y + CARD_HEIGHT;

            const intersects =
              postIt.x < canvasBoxRight &&
              postItRight > canvasBoxLeft &&
              postIt.y < canvasBoxBottom &&
              postItBottom > canvasBoxTop;

            if (intersects && !postIt.selected) {
              useStore.getState().selectPostIt(postIt.id, true);
            } else if (!intersects && postIt.selected && e.shiftKey) {
              // Only deselect if shift is still held (allows fine-tuning)
              // Actually, let's not auto-deselect - user can click to deselect
            }
          });
        }
      } else if (isPanning) {
        setCanvasOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      } else if (draggingSelected) {
        // Move all selected post-its together
        const selectedPostIts = postIts.filter((p) => p.selected);
        selectedPostIts.forEach((postIt, idx) => {
          if (selectedDragOffset[idx]) {
            updatePostIt(postIt.id, {
              x: (e.clientX - selectedDragOffset[idx].x - canvasOffset.x) / canvasScale,
              y: (e.clientY - selectedDragOffset[idx].y - canvasOffset.y) / canvasScale,
            });
          }
        });
      } else if (draggingPostIt) {
        updatePostIt(draggingPostIt, {
          x: (e.clientX - dragOffset.x - canvasOffset.x) / canvasScale,
          y: (e.clientY - dragOffset.y - canvasOffset.y) / canvasScale,
        });
      } else if (draggingCluster) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const mouseX = (e.clientX - rect.left - canvasOffset.x) / canvasScale;
          const mouseY = (e.clientY - rect.top - canvasOffset.y) / canvasScale;
          setClusterDragDelta({
            x: mouseX - clusterDragMouseStart.current.x,
            y: mouseY - clusterDragMouseStart.current.y,
          });
        }
      } else if (resizingCluster) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const mouseX = (e.clientX - rect.left - canvasOffset.x) / canvasScale;
          const mouseY = (e.clientY - rect.top - canvasOffset.y) / canvasScale;
          const deltaX = mouseX - resizeMouseStart.current.x;
          const deltaY = mouseY - resizeMouseStart.current.y;
          const handle = resizeHandleRef.current;
          const ib = resizeInitialBounds.current;

          let newWidth = ib.width;
          let newHeight = ib.height;
          let newX = ib.x;
          let newY = ib.y;

          if (handle === 'se') {
            newWidth = ib.width + deltaX;
            newHeight = ib.height + deltaY;
          } else if (handle === 'sw') {
            newWidth = ib.width - deltaX;
            newHeight = ib.height + deltaY;
            newX = ib.x + deltaX;
          } else if (handle === 'ne') {
            newWidth = ib.width + deltaX;
            newHeight = ib.height - deltaY;
            newY = ib.y + deltaY;
          } else if (handle === 'nw') {
            newWidth = ib.width - deltaX;
            newHeight = ib.height - deltaY;
            newX = ib.x + deltaX;
            newY = ib.y + deltaY;
          }

          // Enforce minimum size
          const minSize = 200;
          if (newWidth < minSize) {
            if (handle === 'nw' || handle === 'sw') newX = ib.x + ib.width - minSize;
            newWidth = minSize;
          }
          if (newHeight < minSize) {
            if (handle === 'nw' || handle === 'ne') newY = ib.y + ib.height - minSize;
            newHeight = minSize;
          }

          setResizeVisual({ x: newX, y: newY, width: newWidth, height: newHeight });
        }
      }
    },
    [isSelecting, selectionBox, isPanning, panStart, draggingSelected, draggingPostIt, dragOffset, canvasOffset, canvasScale, postIts, setCanvasOffset, updatePostIt, draggingCluster, resizingCluster]
  );

  // Compute cluster boundaries for hit testing (reused by rendering + drag logic)
  const getClusterBoundary = useCallback(
    (clusterId: string, excludePostItId?: string) => {
      const items = postIts.filter(
        (p) => p.clusterId === clusterId && p.id !== excludePostItId
      );
      if (items.length === 0) return null;
      return {
        minX: Math.min(...items.map((p) => p.x)) - 40,
        minY: Math.min(...items.map((p) => p.y)) - 50,
        maxX: Math.max(...items.map((p) => p.x + CARD_WIDTH)) + 40,
        maxY: Math.max(...items.map((p) => p.y)) + CARD_HEIGHT + 140,
      };
    },
    [postIts]
  );

  const handleMouseUp = useCallback(() => {
    if (isSelecting) {
      setIsSelecting(false);
      setSelectionBox(null);
    } else if (draggingSelected) {
      // Handle cluster assignment for all selected post-its if needed
      setDraggingSelected(false);
      setSelectedDragOffset([]);
    } else if (draggingPostIt) {
      const draggedPostIt = postIts.find((p) => p.id === draggingPostIt);
      if (draggedPostIt && clusters.length > 0) {
        const px = draggedPostIt.x + CARD_WIDTH / 2;
        const py = draggedPostIt.y + CARD_HEIGHT / 2;
        const currentClusterId = draggedPostIt.clusterId || null;

        // Check if dropped inside a DIFFERENT cluster (including empty ones)
        let landedInCluster: string | null = null;
        for (const cluster of clusters) {
          if (cluster.id === currentClusterId) continue; // skip own cluster
          const bounds = getClusterBoundary(cluster.id);
          if (bounds) {
            if (px >= bounds.minX && px <= bounds.maxX && py >= bounds.minY && py <= bounds.maxY) {
              landedInCluster = cluster.id;
              break;
            }
          } else {
            // Check against rendered empty cluster bounds (compute inline)
            // Empty clusters are positioned at maxRight, starting at 60
            let maxRight = 60;
            for (const c of clusters) {
              const items = postIts.filter((p) => p.clusterId === c.id);
              if (items.length > 0) {
                const maxX = Math.max(...items.map((p) => p.x + CARD_WIDTH)) + 20;
                maxRight = Math.max(maxRight, maxX + 40);
              }
            }
            // Find position of this empty cluster
            let emptyX = 60;
            for (const c of clusters) {
              const items = postIts.filter((p) => p.clusterId === c.id);
              if (items.length === 0) {
                if (c.id === cluster.id) {
                  // This is the empty cluster we're checking
                  if (px >= emptyX && px <= emptyX + CARD_WIDTH + 60 && py >= 60 && py <= 60 + CARD_HEIGHT + 80) {
                    landedInCluster = cluster.id;
                    break;
                  }
                }
                emptyX += CARD_WIDTH + 100;
              } else {
                const maxX = Math.max(...items.map((p) => p.x + CARD_WIDTH)) + 20;
                emptyX = Math.max(emptyX, maxX + 40);
              }
            }
            if (landedInCluster) break;
          }
        }

        // Only reassign if landing in a different cluster
        if (landedInCluster) {
          const targetCluster = clusters.find((c) => c.id === landedInCluster);
          const clusterIdx = clusters.findIndex((c) => c.id === landedInCluster);
          updatePostIt(draggingPostIt, {
            clusterId: landedInCluster,
            color: POST_IT_COLORS[clusterIdx % POST_IT_COLORS.length],
            reasoning: `Manually moved to "${targetCluster?.name}" by researcher`,
          });
        }
        // If not in any cluster and was dragged far from its own cluster, uncluster
        else if (currentClusterId) {
          const ownBounds = getClusterBoundary(currentClusterId, draggingPostIt);
          if (ownBounds) {
            const isOutside =
              px < ownBounds.minX - 100 ||
              px > ownBounds.maxX + 100 ||
              py < ownBounds.minY - 100 ||
              py > ownBounds.maxY + 100;
            if (isOutside) {
              updatePostIt(draggingPostIt, {
                clusterId: undefined,
                reasoning: undefined,
              });
            }
          }
        }
      }
    } else if (draggingCluster) {
      // Finalize cluster drag — move all post-its by the delta
      if (clusterDragDelta.x !== 0 || clusterDragDelta.y !== 0) {
        moveCluster(draggingCluster, clusterDragDelta.x, clusterDragDelta.y);
      }
      setDraggingCluster(null);
      setClusterDragDelta({ x: 0, y: 0 });
    } else if (resizingCluster) {
      // Finalize cluster resize — save new bounds
      if (resizeVisual.width > 0 && resizeVisual.height > 0) {
        updateClusterBounds(resizingCluster, resizeVisual.x, resizeVisual.y, resizeVisual.width, resizeVisual.height);
      }
      setResizingCluster(null);
      resizeHandleRef.current = null;
      setResizeVisual({ x: 0, y: 0, width: 0, height: 0 });
    }

    setIsPanning(false);
    setDraggingPostIt(null);
  }, [isSelecting, draggingSelected, draggingPostIt, postIts, clusters, updatePostIt, getClusterBoundary, draggingCluster, clusterDragDelta, moveCluster, resizingCluster, resizeVisual, updateClusterBounds]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Zoom handler (native event for passive: false)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      setCanvasScale((prev: number) => Math.min(Math.max(prev * delta, 0.2), 3));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [setCanvasScale]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only delete if not in an input/textarea
        if (
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA'
        ) {
          useStore.getState().deleteSelectedPostIts();
        }
      }
      if (e.key === 'Escape') {
        deselectAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deselectAll]);

  // Auto-fit when post-its change from 0 to some
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (prevCountRef.current === 0 && postIts.length > 0) {
      // Delay to ensure DOM has rendered
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas || postIts.length === 0) return;

        const minX = Math.min(...postIts.map((p) => p.x));
        const minY = Math.min(...postIts.map((p) => p.y));
        const maxX = Math.max(...postIts.map((p) => p.x + CARD_WIDTH));
        const maxY = Math.max(...postIts.map((p) => p.y + CARD_HEIGHT));

        const canvasW = canvas.clientWidth;
        const canvasH = canvas.clientHeight;
        const contentW = maxX - minX + 120;
        const contentH = maxY - minY + 120;

        const scale = Math.min(canvasW / contentW, canvasH / contentH, 1.2);
        const offsetX = (canvasW - contentW * scale) / 2 - minX * scale + 60;
        const offsetY = (canvasH - contentH * scale) / 2 - minY * scale + 60;

        setCanvasScale(scale);
        setCanvasOffset({ x: offsetX, y: offsetY });
      }, 100);
    }
    prevCountRef.current = postIts.length;
  }, [postIts.length, postIts, setCanvasScale, setCanvasOffset]);

  // Post-it drag
  const handlePostItDragStart = useCallback(
    (id: string, e: React.MouseEvent) => {
      const postIt = postIts.find((p) => p.id === id);
      if (!postIt) return;

      // Check if this post-it is selected and we should drag all selected
      const selectedPostIts = postIts.filter((p) => p.selected);
      if (selectedPostIts.length > 1 && postIt.selected) {
        // Drag all selected post-its
        setDraggingSelected(true);
        setSelectedDragOffset(
          selectedPostIts.map((p) => ({
            x: e.clientX - p.x * canvasScale - canvasOffset.x,
            y: e.clientY - p.y * canvasScale - canvasOffset.y,
          }))
        );
      } else {
        // Drag single post-it
        setDraggingPostIt(id);
        setDragOffset({
          x: e.clientX - postIt.x * canvasScale - canvasOffset.x,
          y: e.clientY - postIt.y * canvasScale - canvasOffset.y,
        });
      }
    },
    [postIts, canvasScale, canvasOffset]
  );

  // Add new post-it
  const handleAddPostIt = () => {
    const tab = getActiveTab();
    const idx = tab?.postIts.length || 0;
    const newPostIt = createPostIt('New note — double-click to edit', 'Manual', idx);
    // Position relative to current view
    newPostIt.x = (-canvasOffset.x + 200) / canvasScale;
    newPostIt.y = (-canvasOffset.y + 200) / canvasScale;
    addPostIt(newPostIt);
  };

  // Fit to screen
  const handleFitToScreen = () => {
    if (postIts.length === 0) {
      setCanvasOffset({ x: 0, y: 0 });
      setCanvasScale(1);
      return;
    }

    const minX = Math.min(...postIts.map((p) => p.x));
    const minY = Math.min(...postIts.map((p) => p.y));
    const maxX = Math.max(...postIts.map((p) => p.x + CARD_WIDTH));
    const maxY = Math.max(...postIts.map((p) => p.y + CARD_HEIGHT));

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasW = canvas.clientWidth;
    const canvasH = canvas.clientHeight;
    const contentW = maxX - minX + 120;
    const contentH = maxY - minY + 120;

    const scale = Math.min(canvasW / contentW, canvasH / contentH, 1.5);
    const offsetX = (canvasW - contentW * scale) / 2 - minX * scale + 60;
    const offsetY = (canvasH - contentH * scale) / 2 - minY * scale + 60;

    setCanvasScale(scale);
    setCanvasOffset({ x: offsetX, y: offsetY });
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      {/* Canvas */}
      <div
        ref={canvasRef}
        className={`w-full h-full ${draggingPostIt ? 'dragging-postit' : 'canvas-container'}`}
        onMouseDown={handleCanvasMouseDown}
        data-canvas-bg="true"
      >
        {/* Grid dots — subtle, like graph paper */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, var(--dot-color) 0.6px, transparent 0.6px)`,
            backgroundSize: `${24 * canvasScale}px ${24 * canvasScale}px`,
            backgroundPosition: `${canvasOffset.x % (24 * canvasScale)}px ${canvasOffset.y % (24 * canvasScale)}px`,
            opacity: 0.3,
          }}
        />

        {/* Selection box */}
        {isSelecting && selectionBox && (
          <div
            className="absolute pointer-events-none border-2 border-accent bg-accent/10 z-50"
            style={{
              left: Math.min(selectionBox.startX, selectionBox.currentX),
              top: Math.min(selectionBox.startY, selectionBox.currentY),
              width: Math.abs(selectionBox.currentX - selectionBox.startX),
              height: Math.abs(selectionBox.currentY - selectionBox.startY),
            }}
          />
        )}

        {/* Transformed layer */}
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
          }}
          data-canvas-bg="true"
        >
          {/* Cluster boundaries */}
          {clusterBounds.map((cb) => {
            const isDragging = draggingCluster === cb.cluster.id;
            const isResizing = resizingCluster === cb.cluster.id;

            // Compute visual position/size
            const visualX = isResizing ? resizeVisual.x : (cb.x + (isDragging ? clusterDragDelta.x : 0));
            const visualY = isResizing ? resizeVisual.y : (cb.y + (isDragging ? clusterDragDelta.y : 0));
            const visualW = isResizing ? resizeVisual.width : cb.width;
            const visualH = isResizing ? resizeVisual.height : cb.height;

            return (
              <div
                key={cb.cluster.id}
                className={`absolute rounded-2xl group/cluster ${cb.isEmpty ? '' : 'pointer-events-auto'}`}
                style={{
                  left: visualX,
                  top: visualY,
                  width: visualW,
                  height: visualH,
                  border: `2px dashed ${cb.color}${cb.isEmpty ? '60' : '40'}`,
                  backgroundColor: `${cb.color}${cb.isEmpty ? '08' : '06'}`,
                  cursor: isDragging ? 'grabbing' : 'grab',
                  transition: isDragging || isResizing ? 'none' : 'left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease',
                }}
                onMouseDown={(e) => {
                  // Only start drag if clicking on the cluster boundary itself (not children like labels/handles)
                  if (cb.isEmpty) return;
                  if (e.target !== e.currentTarget) return;
                  e.stopPropagation();
                  e.preventDefault();
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  // Store the initial mouse position in canvas coords
                  clusterDragMouseStart.current = {
                    x: (e.clientX - rect.left - canvasOffset.x) / canvasScale,
                    y: (e.clientY - rect.top - canvasOffset.y) / canvasScale,
                  };
                  setClusterDragDelta({ x: 0, y: 0 });
                  setDraggingCluster(cb.cluster.id);
                }}
              >
                {/* Cluster label — double-click to rename */}
                {editingClusterId === cb.cluster.id ? (
                  <div className="absolute -top-6 left-3 flex items-center gap-1 z-10 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editClusterName}
                      onChange={(e) => setEditClusterName(e.target.value)}
                      onBlur={() => {
                        if (editClusterName.trim()) renameCluster(cb.cluster.id, editClusterName.trim());
                        setEditingClusterId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editClusterName.trim()) renameCluster(cb.cluster.id, editClusterName.trim());
                          setEditingClusterId(null);
                        }
                        if (e.key === 'Escape') setEditingClusterId(null);
                      }}
                      className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white border-none outline-none w-40"
                      style={{ backgroundColor: cb.color }}
                    />
                  </div>
                ) : (
                  <div
                    className="absolute -top-6 left-3 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white whitespace-nowrap cursor-pointer hover:opacity-90 pointer-events-auto z-10"
                    style={{ backgroundColor: cb.color }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingClusterId(cb.cluster.id);
                      setEditClusterName(cb.cluster.name);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Double-click to rename"
                  >
                    {cb.cluster.name}
                    <span className="ml-1.5 text-[10px] opacity-70">
                      {postIts.filter((p) => p.clusterId === cb.cluster.id).length}
                    </span>
                  </div>
                )}

                {/* Resize handles — visible on hover, corners only */}
                {!cb.isEmpty && (
                  <>
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <div
                        key={corner}
                        className="absolute w-3.5 h-3.5 rounded-full border-2 border-white bg-accent opacity-0 group-hover/cluster:opacity-100 transition-opacity pointer-events-auto z-20"
                        style={{
                          left: corner === 'nw' || corner === 'sw' ? -7 : 'auto',
                          right: corner === 'ne' || corner === 'se' ? -7 : 'auto',
                          top: corner === 'nw' || corner === 'ne' ? -7 : 'auto',
                          bottom: corner === 'sw' || corner === 'se' ? -7 : 'auto',
                          cursor: `${corner}-resize`,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          // Store initial mouse position in canvas coords
                          resizeMouseStart.current = {
                            x: (e.clientX - rect.left - canvasOffset.x) / canvasScale,
                            y: (e.clientY - rect.top - canvasOffset.y) / canvasScale,
                          };
                          // Store initial cluster bounds
                          resizeInitialBounds.current = { x: cb.x, y: cb.y, width: cb.width, height: cb.height };
                          // Store visual starting point
                          setResizeVisual({ x: cb.x, y: cb.y, width: cb.width, height: cb.height });
                          resizeHandleRef.current = corner;
                          setResizingCluster(cb.cluster.id);
                        }}
                      />
                    ))}
                  </>
                )}

                {/* Empty cluster placeholder */}
                {cb.isEmpty && (
                  <div className="flex items-center justify-center h-full text-[11px] text-text-tertiary pointer-events-none">
                    Drag notes here
                  </div>
                )}
              </div>
            );
          })}

          {/* Post-its */}
          {(() => {
            const hasActiveHighlight = postIts.some((p) => p.highlighted);
            const hasFileFilter = !!activeFileFilter;
            const anyDragging = !!draggingPostIt || draggingSelected;
            return postIts.map((postIt) => {
              const dimmedByHighlight = hasActiveHighlight && !postIt.highlighted && !postIt.selected;
              const dimmedByFileFilter = hasFileFilter && postIt.source !== activeFileFilter && !postIt.selected;
              return (
                <PostItCard
                  key={postIt.id}
                  postIt={postIt}
                  cluster={clusters.find((c) => c.id === postIt.clusterId)}
                  scale={canvasScale}
                  dimmed={dimmedByHighlight || dimmedByFileFilter}
                  onDragStart={handlePostItDragStart}
                  isDragging={anyDragging && (postIt.id === draggingPostIt || (draggingSelected && postIt.selected))}
                />
              );
            });
          })()}
        </div>
      </div>

      {/* Empty state — inviting, Swiss clarity */}
      {postIts.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto max-w-sm">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 rounded-2xl bg-accent/[0.06] rotate-6" />
              <div className="absolute inset-0 rounded-2xl bg-accent/[0.10] -rotate-3" />
              <div className="absolute inset-0 rounded-2xl bg-surface border border-border/80 flex items-center justify-center shadow-sm">
                <Plus className="w-7 h-7 text-accent/50" strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2 tracking-[-0.02em]">
              Start your research board
            </h3>
            <p className="text-[13px] text-text-secondary mb-6 leading-relaxed">
              Import transcripts, CSV files, or paste text.<br />
              AI will help you find patterns and themes.
            </p>
            <button
              onClick={() => useStore.getState().setImportDialogOpen(true)}
              className="px-6 py-2.5 bg-accent text-white text-[13px] font-medium rounded-xl hover:bg-accent-hover transition-all shadow-sm hover:shadow-md"
            >
              Import Data
            </button>
          </div>
        </div>
      )}

      {/* Canvas controls */}
      <div className="absolute bottom-20 right-4 flex flex-col bg-surface rounded-xl border border-border shadow-md overflow-hidden">
        <button
          onClick={() => setCanvasScale(Math.min(canvasScale * 1.2, 3))}
          className="p-2 hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={() => setCanvasScale(Math.max(canvasScale * 0.8, 0.2))}
          className="p-2 hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={handleFitToScreen}
          className="p-2 hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
          title="Fit to screen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-20 left-4 text-[10px] text-text-tertiary font-mono bg-surface/80 backdrop-blur-sm px-2 py-1 rounded-lg border border-border/60">
        {Math.round(canvasScale * 100)}%
      </div>

      {/* Top-right actions */}
      {postIts.length > 0 && (
        <div className="absolute top-4 right-4 flex gap-2">
          {clusters.length > 0 && (
            <button
              onClick={() => {
                const name = window.prompt('New cluster name:');
                if (name?.trim()) {
                  const newCluster: Cluster = {
                    id: generateId(),
                    name: name.trim(),
                    color: CLUSTER_COLORS[clusters.length % CLUSTER_COLORS.length],
                    reasoning: 'Created manually by researcher',
                  };
                  addCluster(newCluster);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface rounded-xl border border-border shadow-sm hover:shadow-md text-text-secondary hover:text-accent text-xs font-medium transition-all"
              title="Create new cluster"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              New Cluster
            </button>
          )}
          <button
            onClick={handleAddPostIt}
            className="p-2.5 bg-surface rounded-xl border border-border shadow-sm hover:shadow-md text-text-secondary hover:text-accent transition-all"
            title="Add note"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
