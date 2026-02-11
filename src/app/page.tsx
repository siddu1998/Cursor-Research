'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { getStoredSettings } from '@/lib/utils';
import { Canvas } from '@/components/canvas';
import { ChatBar } from '@/components/chat-bar';
import { WorkspaceTabs } from '@/components/workspace-tabs';
import { ImportDialog } from '@/components/import-dialog';
import { SettingsDialog } from '@/components/settings-dialog';
import { ThemeReview } from '@/components/theme-review';
import { ChunkReview } from '@/components/chunk-review';
import { ReportPanel } from '@/components/report-panel';
import { RightNav } from '@/components/right-nav';
import { LeftNav } from '@/components/left-nav';
import { FileSidebar } from '@/components/file-sidebar';
import { Moon, Sun, Settings, Loader2, CheckCircle2, AlertCircle, Database } from 'lucide-react';

export default function Home() {
  const {
    updateSettings,
    activeRightPanel,
    activeLeftPanel,
    theme,
    toggleTheme,
    setSettingsDialogOpen,
    isProcessing,
    tabs,
    activeTabId,
  } = useStore();

  useEffect(() => {
    const stored = getStoredSettings();
    if (stored) {
      updateSettings(stored);
    }
  }, [updateSettings]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const postIts = activeTab?.postIts || [];

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-surface border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-[15px] font-semibold text-text-primary tracking-[-0.02em]">
              Cursor Research
            </h1>
          </div>
        </div>

        {/* Right side: status + hints + settings + theme */}
        <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
          {/* Embedding status */}
          {(() => {
            const { embeddingStatus, embeddingProgress } = useStore.getState();
            const embeddedCount = postIts.filter((p) => p.embedding && p.embedding.length > 0).length;
            const totalCount = postIts.length;

            if (totalCount === 0) return null;

            if (embeddingStatus === 'embedding') {
              return (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-light text-accent text-[10px] font-medium" title={embeddingProgress}>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Indexing
                </div>
              );
            }

            if (embeddingStatus === 'ready' || embeddedCount === totalCount) {
              return (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-success font-medium" title={`All ${totalCount} notes indexed`}>
                  <CheckCircle2 className="w-3 h-3" />
                  Indexed
                </div>
              );
            }

            if (embeddingStatus === 'error') {
              return (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-warning font-medium" title="Embedding failed">
                  <AlertCircle className="w-3 h-3" />
                  Error
                </div>
              );
            }

            if (embeddedCount > 0 && embeddedCount < totalCount) {
              return (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-text-tertiary font-medium tabular-nums" title={`${embeddedCount} of ${totalCount} notes indexed`}>
                  <Database className="w-3 h-3" />
                  {embeddedCount}/{totalCount}
                </div>
              );
            }

            return null;
          })()}

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-light text-accent text-[10px] font-medium processing-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {useStore.getState().processingMessage || 'Processing...'}
            </div>
          )}

          {/* Shortcut hints */}
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-hover/60">
            <kbd className="font-mono text-[10px] text-text-secondary font-medium">Scroll</kbd>
            <span>zoom</span>
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-hover/60">
            <kbd className="font-mono text-[10px] text-text-secondary font-medium">Drag</kbd>
            <span>pan</span>
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-hover/60">
            <kbd className="font-mono text-[10px] text-text-secondary font-medium">Dbl-click</kbd>
            <span>edit</span>
          </span>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? (
              <Moon className="w-3.5 h-3.5" />
            ) : (
              <Sun className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Settings */}
          <button
            onClick={() => setSettingsDialogOpen(true)}
            className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <LeftNav />
        {activeLeftPanel === 'files' && <FileSidebar />}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <WorkspaceTabs />
          <div className="flex-1 relative overflow-hidden">
            <Canvas />
          </div>
        </div>

        {activeRightPanel === 'report' && <ReportPanel />}
        {activeRightPanel === 'chat' && <ChatBar />}
        <RightNav />
      </div>

      <ImportDialog />
      <SettingsDialog />
      <ThemeReview />
      <ChunkReview />
    </div>
  );
}
