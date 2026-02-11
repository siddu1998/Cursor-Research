'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { X, Plus, MessageSquareText, Trash2, RotateCcw } from 'lucide-react';

export function WorkspaceTabs() {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    removeTab,
    addTab,
    renameTab,
    deleteSelectedPostIts,
    setPostItsForActiveTab,
  } = useStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const postIts = activeTab?.postIts || [];
  const hasSelected = postIts.some((p) => p.selected);
  const hasHighlights = postIts.some((p) => p.highlighted);

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleFinishRename = () => {
    if (editingId && editName.trim()) {
      renameTab(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleClearHighlights = () => {
    const updated = postIts.map((p) => ({ ...p, highlighted: false, reasoning: undefined }));
    setPostItsForActiveTab(updated);
  };

  return (
    <div className="flex items-center gap-0.5 px-3 py-1 bg-surface border-b border-border overflow-x-auto scrollbar-none">
      {/* Tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`
            group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-all min-w-0
            ${
              tab.id === activeTabId
                ? 'bg-accent-light text-accent dark:text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-hover'
            }
          `}
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={() => handleStartRename(tab.id, tab.name)}
        >
          {tab.query && (
            <MessageSquareText className="w-3 h-3 flex-shrink-0 opacity-40" />
          )}
          {editingId === tab.id ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename();
                if (e.key === 'Escape') setEditingId(null);
              }}
              autoFocus
              className="bg-transparent text-[12px] focus:outline-none w-20"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate max-w-[120px]">{tab.name}</span>
          )}
          {tab.postIts.length > 0 && (
            <span className="text-[10px] opacity-40 flex-shrink-0 tabular-nums">
              {tab.postIts.length}
            </span>
          )}
          {tabs.length > 1 && tab.id === activeTabId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTab(tab.id);
              }}
              className="p-0.5 rounded hover:bg-accent/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}

      <button
        onClick={() => addTab('New Session')}
        className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-secondary transition-colors flex-shrink-0"
        title="New session"
      >
        <Plus className="w-3 h-3" />
      </button>

      <div className="flex-1" />

      {/* Contextual edit actions — right side */}
      {hasHighlights && (
        <button
          onClick={handleClearHighlights}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-warning hover:bg-warning/10 transition-colors flex-shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
          Clear
        </button>
      )}
      {hasSelected && (
        <button
          onClick={deleteSelectedPostIts}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-danger hover:bg-danger/10 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      )}
    </div>
  );
}
