'use client';

import { useStore } from '@/lib/store';
import { MessageSquare, FileText } from 'lucide-react';

export function RightNav() {
  const { activeRightPanel, toggleRightPanel, reportBlocks } = useStore();

  const items = [
    {
      id: 'chat' as const,
      icon: MessageSquare,
      label: 'Research Assistant',
      badge: null,
    },
    {
      id: 'report' as const,
      icon: FileText,
      label: 'Report',
      badge: reportBlocks.length > 0 ? reportBlocks.length : null,
    },
  ];

  return (
    <div className="w-10 flex-shrink-0 bg-surface border-l border-border flex flex-col items-center pt-2.5 gap-1">
      {items.map(({ id, icon: Icon, label, badge }) => {
        const isActive = activeRightPanel === id;
        return (
          <button
            key={id}
            onClick={() => toggleRightPanel(id)}
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
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3.5 bg-accent rounded-r-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
