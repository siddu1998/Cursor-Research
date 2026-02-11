'use client';

import { useStore } from '@/lib/store';
import { FolderOpen } from 'lucide-react';

export function LeftNav() {
  const { activeLeftPanel, toggleLeftPanel, importedFileEntries, tabs } = useStore();

  const allSources = new Set<string>();
  for (const tab of tabs) {
    for (const p of tab.postIts) {
      if (p.source) allSources.add(p.source);
    }
  }
  const totalFiles = Math.max(importedFileEntries.length, allSources.size);

  const items = [
    {
      id: 'files' as const,
      icon: FolderOpen,
      label: 'Files',
      badge: totalFiles > 0 ? totalFiles : null,
    },
  ];

  return (
    <div className="w-10 flex-shrink-0 bg-surface border-r border-border flex flex-col items-center pt-2.5 gap-1">
      {items.map(({ id, icon: Icon, label, badge }) => {
        const isActive = activeLeftPanel === id;
        return (
          <button
            key={id}
            onClick={() => toggleLeftPanel(id)}
            className={`
              relative w-8 h-8 rounded-lg flex items-center justify-center transition-all
              ${isActive
                ? 'bg-accent-light text-accent dark:text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-hover'
              }
            `}
            title={label}
          >
            <Icon className="w-4 h-4" strokeWidth={isActive ? 2 : 1.5} />
            {badge !== null && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-[13px] rounded-full bg-accent text-white text-[8px] font-bold flex items-center justify-center px-0.5">
                {badge}
              </span>
            )}
            {isActive && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-3.5 bg-accent rounded-l-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
