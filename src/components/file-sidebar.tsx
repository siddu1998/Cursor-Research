'use client';

import { useMemo, useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { createPostIt, generateId } from '@/lib/utils';
import { embedPostItsBatch } from '@/lib/embeddings';
import type { ImportedFileEntry, PostIt } from '@/lib/types';
import {
  FileText,
  Table,
  File,
  FileType,
  Upload,
  ChevronDown,
  ChevronRight,
  X,
  Search,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Database,
} from 'lucide-react';

// --- X (Twitter) icon ---
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// --- Reddit icon ---
function RedditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  );
}

type AppSource = 'twitter' | 'reddit';

interface AppQueryItem {
  id: string;
  query: string;
  maxResults: number;
  status: 'idle' | 'loading' | 'done' | 'error';
  error?: string;
  resultCount?: number;
}

const APP_SOURCES: {
  id: AppSource;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  placeholder: string;
  comingSoon?: boolean;
}[] = [
  {
    id: 'twitter',
    name: 'X (Twitter)',
    icon: XIcon,
    color: '#000000',
    placeholder: 'e.g. "game pass subscription"',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    icon: RedditIcon,
    color: '#FF4500',
    placeholder: 'e.g. "UX design feedback"',
  },
];

function getFileIcon(type: string) {
  switch (type) {
    case 'csv':
      return Table;
    case 'docx':
      return FileType;
    case 'txt':
    case 'text':
      return FileText;
    default:
      return File;
  }
}

function getFileExtension(name: string, type: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext && ext !== name.toLowerCase()) return `.${ext}`;
  switch (type) {
    case 'csv': return '.csv';
    case 'docx': return '.docx';
    case 'txt': return '.txt';
    case 'text': return '.txt';
    default: return '';
  }
}

export function FileSidebar() {
  const {
    importedFileEntries,
    tabs,
    activeTabId,
    activeFileFilter,
    setActiveFileFilter,
    setImportDialogOpen,
    removeImportedFileEntry,
    addPostIts,
    addImportedFileEntries,
    settings,
    setEmbeddingStatus,
    setPostItEmbeddings,
    setSettingsDialogOpen,
  } = useStore();

  // App Data state
  const [appDataExpanded, setAppDataExpanded] = useState(true);
  const [selectedApp, setSelectedApp] = useState<AppSource | null>(null);
  const [appQueries, setAppQueries] = useState<Record<AppSource, AppQueryItem[]>>({
    twitter: [],
    reddit: [],
  });

  // Compute note counts per source file for the active tab
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const postIts = activeTab?.postIts || [];

  const noteCountsBySource = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of postIts) {
      if (p.source) {
        counts[p.source] = (counts[p.source] || 0) + 1;
      }
    }
    return counts;
  }, [postIts]);

  // Also gather sources from all tabs for a comprehensive list
  const allSourcesFromPostIts = useMemo(() => {
    const sources = new Set<string>();
    for (const tab of tabs) {
      for (const p of tab.postIts) {
        if (p.source) sources.add(p.source);
      }
    }
    return sources;
  }, [tabs]);

  // Merge tracked files with sources found in post-its
  const fileList = useMemo(() => {
    const tracked = new Map(importedFileEntries.map((f) => [f.name, f]));
    const merged: Array<{
      id: string;
      name: string;
      type: string;
      importedAt: number;
      noteCount: number;
      totalNoteCount: number;
    }> = [];

    // Add tracked entries first
    for (const entry of importedFileEntries) {
      merged.push({
        ...entry,
        noteCount: noteCountsBySource[entry.name] || 0,
        totalNoteCount: 0,
      });
    }

    // Add any sources from post-its that weren't tracked
    for (const source of allSourcesFromPostIts) {
      if (!tracked.has(source)) {
        const ext = source.split('.').pop()?.toLowerCase();
        let type: string = 'text';
        if (ext === 'csv') type = 'csv';
        else if (ext === 'docx') type = 'docx';
        else if (ext === 'txt') type = 'txt';

        merged.push({
          id: source,
          name: source,
          type,
          importedAt: 0,
          noteCount: noteCountsBySource[source] || 0,
          totalNoteCount: 0,
        });
      }
    }

    // Calculate total note count across all tabs
    for (const item of merged) {
      let total = 0;
      for (const tab of tabs) {
        total += tab.postIts.filter((p) => p.source === item.name).length;
      }
      item.totalNoteCount = total;
    }

    // Sort by most recent import first, then alphabetically
    merged.sort((a, b) => {
      if (a.importedAt && b.importedAt) return b.importedAt - a.importedAt;
      if (a.importedAt) return -1;
      if (b.importedAt) return 1;
      return a.name.localeCompare(b.name);
    });

    return merged;
  }, [importedFileEntries, noteCountsBySource, allSourcesFromPostIts, tabs]);

  const handleFileClick = (fileName: string) => {
    if (activeFileFilter === fileName) {
      setActiveFileFilter(null);
    } else {
      setActiveFileFilter(fileName);
    }
  };

  // --- App Data handlers ---

  const addQuery = useCallback((app: AppSource) => {
    setAppQueries((prev) => ({
      ...prev,
      [app]: [
        ...prev[app],
        { id: generateId(), query: '', maxResults: 20, status: 'idle' as const },
      ],
    }));
  }, []);

  const updateQuery = useCallback((app: AppSource, id: string, query: string) => {
    setAppQueries((prev) => ({
      ...prev,
      [app]: prev[app].map((q) => (q.id === id ? { ...q, query } : q)),
    }));
  }, []);

  const updateMaxResults = useCallback((app: AppSource, id: string, maxResults: number) => {
    // Clamp between 10 and 100
    const clamped = Math.min(Math.max(maxResults, 10), 100);
    setAppQueries((prev) => ({
      ...prev,
      [app]: prev[app].map((q) => (q.id === id ? { ...q, maxResults: clamped } : q)),
    }));
  }, []);

  const removeQuery = useCallback((app: AppSource, id: string) => {
    setAppQueries((prev) => ({
      ...prev,
      [app]: prev[app].filter((q) => q.id !== id),
    }));
  }, []);

  const executeSearch = useCallback(
    async (app: AppSource, queryItem: AppQueryItem) => {
      if (!queryItem.query.trim()) return;

      // Update status to loading
      setAppQueries((prev) => ({
        ...prev,
        [app]: prev[app].map((q) =>
          q.id === queryItem.id ? { ...q, status: 'loading' as const, error: undefined } : q
        ),
      }));

      try {
        let response: Response;
        let sourceName: string;

        if (app === 'twitter') {
          if (!settings.twitterBearerToken) {
            throw new Error('Twitter Bearer Token not set. Go to Settings to add it.');
          }
          response = await fetch('/api/appdata/twitter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: queryItem.query,
              maxResults: queryItem.maxResults,
              bearerToken: settings.twitterBearerToken,
            }),
          });
          sourceName = `X: "${queryItem.query}"`;
        } else {
          // reddit
          if (!settings.redditClientId || !settings.redditClientSecret) {
            throw new Error('Reddit credentials not set. Go to Settings to add them.');
          }
          response = await fetch('/api/appdata/reddit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: queryItem.query,
              maxResults: queryItem.maxResults,
              clientId: settings.redditClientId,
              clientSecret: settings.redditClientSecret,
            }),
          });
          sourceName = `Reddit: "${queryItem.query}"`;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Request failed (${response.status})`);
        }

        // Convert results to post-its
        const items: { text: string; author: string }[] =
          app === 'twitter'
            ? (data.tweets || []).map((t: { text: string; authorUsername: string }) => ({
                text: t.text,
                author: `@${t.authorUsername}`,
              }))
            : (data.posts || []).map((p: { text: string; authorName: string; subreddit: string }) => ({
                text: p.text,
                author: `u/${p.authorName} · r/${p.subreddit}`,
              }));

        if (items.length === 0) {
          throw new Error('No results found for this query.');
        }

        const existingCount = activeTab?.postIts.length || 0;
        const newPostIts: PostIt[] = items.map((item, i) =>
          createPostIt(item.text, sourceName, existingCount + i, item.author)
        );

        // Add post-its
        addPostIts(newPostIts);

        // Track as imported file entry
        const entry: ImportedFileEntry = {
          id: generateId(),
          name: sourceName,
          type: 'text',
          importedAt: Date.now(),
        };
        addImportedFileEntries([entry]);

        // Embed in background
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

        // Update query status
        setAppQueries((prev) => ({
          ...prev,
          [app]: prev[app].map((q) =>
            q.id === queryItem.id
              ? { ...q, status: 'done' as const, resultCount: items.length }
              : q
          ),
        }));
      } catch (err) {
        setAppQueries((prev) => ({
          ...prev,
          [app]: prev[app].map((q) =>
            q.id === queryItem.id
              ? {
                  ...q,
                  status: 'error' as const,
                  error: err instanceof Error ? err.message : 'Unknown error',
                }
              : q
          ),
        }));
      }
    },
    [settings, activeTab, addPostIts, addImportedFileEntries, setEmbeddingStatus, setPostItEmbeddings]
  );

  const hasApiKey = (app: AppSource): boolean => {
    if (app === 'twitter') return !!settings.twitterBearerToken;
    if (app === 'reddit') return !!(settings.redditClientId && settings.redditClientSecret);
    return false;
  };

  return (
    <div className="w-[240px] flex-shrink-0 bg-surface border-r border-border flex flex-col left-panel-animate overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
          Files
        </span>
        <button
          onClick={() => setImportDialogOpen(true)}
          className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-secondary transition-colors"
          title="Import files"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* App Data Section */}
        <div className="border-b border-border">
          <button
            onClick={() => setAppDataExpanded(!appDataExpanded)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
          >
            {appDataExpanded ? (
              <ChevronDown className="w-3 h-3 text-text-tertiary" />
            ) : (
              <ChevronRight className="w-3 h-3 text-text-tertiary" />
            )}
            <Database className="w-3 h-3 text-text-tertiary" />
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
              App Data
            </span>
          </button>

          {appDataExpanded && (
            <div className="px-2 pb-2 space-y-1">
              {APP_SOURCES.map((appSrc) => {
                const Icon = appSrc.icon;
                const isSelected = selectedApp === appSrc.id;
                const queries = appQueries[appSrc.id];
                const hasKey = hasApiKey(appSrc.id);

                return (
                  <div key={appSrc.id}>
                    {/* App header button */}
                    <button
                      onClick={() =>
                        setSelectedApp(isSelected ? null : appSrc.id)
                      }
                      className={`
                        w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors
                        ${isSelected
                          ? 'bg-accent-light text-accent dark:text-text-primary'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                        }
                      `}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-[12px] font-medium flex-1">
                        {appSrc.name}
                      </span>
                      {isSelected ? (
                        <ChevronDown className="w-3 h-3 text-text-tertiary" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-text-tertiary" />
                      )}
                    </button>

                    {/* Expanded query panel */}
                    {isSelected && (
                      <div className="ml-2 mt-1 space-y-1.5">
                        {!hasKey && (
                          <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-warning/10 border border-warning/20">
                            <AlertCircle className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] text-text-secondary leading-tight">
                                API key required.
                              </p>
                              <button
                                onClick={() => setSettingsDialogOpen(true)}
                                className="text-[10px] text-accent font-medium hover:underline"
                              >
                                Open Settings
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Query list */}
                        {queries.map((q) => (
                          <div key={q.id} className="space-y-1">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={q.query}
                                onChange={(e) =>
                                  updateQuery(appSrc.id, q.id, e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && q.query.trim()) {
                                    executeSearch(appSrc.id, q);
                                  }
                                }}
                                placeholder={appSrc.placeholder}
                                className="flex-1 min-w-0 px-2 py-1 rounded-md border border-border bg-surface text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
                                disabled={q.status === 'loading'}
                              />
                              <input
                                type="number"
                                min="10"
                                max="100"
                                value={q.maxResults}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val)) {
                                    updateMaxResults(appSrc.id, q.id, val);
                                  }
                                }}
                                className="w-12 px-1.5 py-1 rounded-md border border-border bg-surface text-[10px] text-text-primary text-center focus:outline-none focus:border-accent transition-colors tabular-nums"
                                disabled={q.status === 'loading'}
                                title="Max results (10-100)"
                              />
                              <button
                                onClick={() => executeSearch(appSrc.id, q)}
                                disabled={
                                  !q.query.trim() ||
                                  q.status === 'loading' ||
                                  !hasKey
                                }
                                className="p-1 rounded-md hover:bg-surface-hover text-accent disabled:text-text-tertiary disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                title="Search"
                              >
                                {q.status === 'loading' ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Search className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                onClick={() => removeQuery(appSrc.id, q.id)}
                                className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-danger transition-colors flex-shrink-0"
                                title="Remove query"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Status messages */}
                            {q.status === 'done' && q.resultCount !== undefined && (
                              <p className="text-[10px] text-success pl-2">
                                ✓ Imported {q.resultCount} items
                              </p>
                            )}
                            {q.status === 'error' && q.error && (
                              <p className="text-[10px] text-danger pl-2 leading-tight">
                                {q.error}
                              </p>
                            )}
                          </div>
                        ))}

                        {/* Add query button */}
                        <button
                          onClick={() => addQuery(appSrc.id)}
                          className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md border border-dashed border-border text-[10px] text-text-tertiary hover:text-text-secondary hover:border-text-tertiary transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add search query
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* File list */}
        <div className="py-1">
          {fileList.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center mb-3">
                <FileText className="w-5 h-5 text-text-tertiary" />
              </div>
              <p className="text-xs font-medium text-text-secondary mb-1">No files yet</p>
              <p className="text-[11px] text-text-tertiary leading-relaxed mb-3">
                Import research data to get started
              </p>
              <button
                onClick={() => setImportDialogOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-accent dark:text-text-primary bg-accent-light hover:bg-accent/10 dark:hover:bg-surface-hover transition-colors"
              >
                <Upload className="w-3 h-3" />
                Import Data
              </button>
            </div>
          ) : (
            <div className="space-y-px">
              {fileList.map((file) => {
                const Icon = getFileIcon(file.type);
                const isActive = activeFileFilter === file.name;
                const extension = getFileExtension(file.name, file.type);
                const baseName = file.name.replace(/\.[^/.]+$/, '');

                return (
                  <button
                    key={file.id}
                    onClick={() => handleFileClick(file.name)}
                    className={`
                      w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors group
                      ${isActive
                        ? 'bg-accent-light text-accent dark:text-text-primary'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      }
                    `}
                    title={`${file.name} — ${file.noteCount} note${file.noteCount !== 1 ? 's' : ''} in this tab`}
                  >
                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${
                      isActive ? 'text-accent dark:text-text-primary' :
                      file.type === 'csv' ? 'text-success' : 'text-text-tertiary'
                    }`} />
                    <span className="flex-1 min-w-0 truncate text-[12px]">
                      <span className={isActive ? 'font-medium' : ''}>{baseName}</span>
                      <span className="text-text-tertiary">{extension}</span>
                    </span>
                    <span className={`text-[10px] tabular-nums flex-shrink-0 ${
                      isActive ? 'text-accent/70 dark:text-text-secondary' : 'text-text-tertiary'
                    }`}>
                      {file.noteCount > 0 ? file.noteCount : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Active filter indicator */}
      {activeFileFilter && (
        <div className="px-3 py-2 border-t border-border bg-accent-light/50 dark:bg-surface-hover">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-accent dark:text-text-primary truncate flex-1">
              Filtering: {activeFileFilter}
            </span>
            <button
              onClick={() => setActiveFileFilter(null)}
              className="p-0.5 rounded hover:bg-accent/10 dark:hover:bg-surface-hover text-accent dark:text-text-secondary transition-colors flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Summary footer */}
      {fileList.length > 0 && (
        <div className="px-3 py-2 border-t border-border">
          <p className="text-[10px] text-text-tertiary">
            {fileList.length} file{fileList.length !== 1 ? 's' : ''} · {postIts.length} note{postIts.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
