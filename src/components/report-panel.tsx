'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
  callAI,
  buildReportDraftPrompt,
  buildReportExpandPrompt,
  buildReportImprovePrompt,
  buildReportContinuePrompt,
} from '@/lib/ai-service';
import ReactMarkdown from 'react-markdown';
import { generateId } from '@/lib/utils';
import type { ReportBlock } from '@/lib/types';
import {
  FileText,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Type,
  Heading1,
  Quote,
  Minus,
  Sparkles,
  Wand2,
  Expand,
  CheckCheck,
  ArrowRight,
  Loader2,
  GripVertical,
  User,
  ImageIcon,
  Download,
} from 'lucide-react';

// ---- Export helpers ----

function blocksToMarkdown(blocks: ReportBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'title':
          return `# ${b.content}\n`;
        case 'heading':
          return `## ${b.content}\n`;
        case 'paragraph':
          return `${b.content}\n`;
        case 'quote':
          return `> ${b.content}${b.participantId ? `\n> — *${b.participantId}*` : ''}\n`;
        case 'divider':
          return `---\n`;
        case 'image':
          return `![${b.caption || 'Image'}](${b.imageUrl || ''})\n${b.caption ? `*${b.caption}*\n` : ''}`;
        default:
          return '';
      }
    })
    .join('\n');
}

function blocksToHTML(blocks: ReportBlock[]): string {
  const bodyContent = blocks
    .map((b) => {
      switch (b.type) {
        case 'title':
          return `<h1>${escapeHTML(b.content)}</h1>`;
        case 'heading':
          return `<h2>${escapeHTML(b.content)}</h2>`;
        case 'paragraph':
          // Use full markdown parser to handle headings, lists, etc. within paragraphs
          return markdownToHTML(b.content);
        case 'quote':
          return `<blockquote><p>${markdownInlineToHTML(b.content)}</p>${b.participantId ? `<cite>— ${escapeHTML(b.participantId)}</cite>` : ''}</blockquote>`;
        case 'divider':
          return `<hr />`;
        case 'image':
          return `<figure>${b.imageUrl ? `<img src="${b.imageUrl}" alt="${escapeHTML(b.caption || '')}" />` : ''}${b.caption ? `<figcaption>${escapeHTML(b.caption)}</figcaption>` : ''}</figure>`;
        default:
          return '';
      }
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Research Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', -apple-system, sans-serif; max-width: 720px; margin: 0 auto; padding: 60px 40px; color: #1A1A1A; line-height: 1.8; font-size: 15px; letter-spacing: -0.011em; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; line-height: 1.3; letter-spacing: -0.02em; }
  h2 { font-size: 20px; font-weight: 600; margin-top: 32px; margin-bottom: 12px; line-height: 1.4; }
  h3 { font-size: 18px; font-weight: 600; margin-top: 24px; margin-bottom: 10px; line-height: 1.4; }
  h4 { font-size: 16px; font-weight: 600; margin-top: 20px; margin-bottom: 8px; line-height: 1.4; }
  h5 { font-size: 15px; font-weight: 600; margin-top: 18px; margin-bottom: 8px; line-height: 1.4; }
  h6 { font-size: 14px; font-weight: 600; margin-top: 16px; margin-bottom: 8px; line-height: 1.4; }
  p { margin-bottom: 16px; }
  blockquote { border-left: 3px solid #0066FF; padding: 12px 20px; margin: 20px 0; background: #F7F7F5; border-radius: 0 8px 8px 0; }
  blockquote p { margin: 0; font-style: italic; color: #4B5563; }
  blockquote cite { display: block; margin-top: 8px; font-size: 13px; color: #9CA3AF; font-style: normal; }
  hr { border: none; border-top: 1px solid #E5E7EB; margin: 28px 0; }
  figure { margin: 24px 0; text-align: center; }
  figure img { max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  figcaption { font-size: 13px; color: #6B7280; margin-top: 8px; font-style: italic; }
  strong { font-weight: 600; }
  em { font-style: italic; }
  code { background: #F3F4F6; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'Monaco', 'Menlo', monospace; }
  ul, ol { margin: 8px 0 16px 24px; }
  li { margin-bottom: 4px; }
  @media print { body { padding: 40px 20px; } }
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownToHTML(str: string): string {
  if (!str.trim()) return '';
  
  // Split by lines to handle block-level elements
  const lines = str.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Headings
    if (trimmed.match(/^#{1,6}\s+/)) {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
        listType = null;
      }
      const match = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        result.push(`<h${Math.min(level, 6)}>${escapeHTML(text)}</h${Math.min(level, 6)}>`);
      }
      continue;
    }
    
    // Blockquote
    if (trimmed.startsWith('> ')) {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
        listType = null;
      }
      const text = trimmed.slice(2);
      result.push(`<blockquote><p>${markdownInlineToHTML(text)}</p></blockquote>`);
      continue;
    }
    
    // Horizontal rule
    if (trimmed.match(/^[-*_]{3,}$/)) {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
        listType = null;
      }
      result.push('<hr />');
      continue;
    }
    
    // Unordered list
    if (trimmed.match(/^[-*+]\s+/)) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(`</${listType}>`);
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      const text = trimmed.replace(/^[-*+]\s+/, '');
      result.push(`<li>${markdownInlineToHTML(text)}</li>`);
      continue;
    }
    
    // Ordered list
    if (trimmed.match(/^\d+\.\s+/)) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(`</${listType}>`);
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      const text = trimmed.replace(/^\d+\.\s+/, '');
      result.push(`<li>${markdownInlineToHTML(text)}</li>`);
      continue;
    }
    
    // Empty line - close list if open
    if (!trimmed) {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
        listType = null;
      }
      continue;
    }
    
    // Regular paragraph
    if (inList) {
      result.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
    result.push(`<p>${markdownInlineToHTML(trimmed)}</p>`);
  }
  
  // Close any open list
  if (inList && listType) {
    result.push(`</${listType}>`);
  }
  
  return result.join('\n');
}

function markdownInlineToHTML(str: string): string {
  return escapeHTML(str)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Block Component ----

function ReportBlockItem({
  block,
  isActive,
  onActivate,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddAfter,
  isFirst,
  isLast,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  block: ReportBlock;
  isActive: boolean;
  onActivate: () => void;
  onUpdate: (updates: Partial<ReportBlock>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddAfter: (type: ReportBlock['type']) => void;
  isFirst: boolean;
  isLast: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (isActive && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isActive]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [block.content, isActive]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onAddAfter('paragraph');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUpdate({ imageUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const blockDragProps = {
    draggable: true,
    onDragStart,
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
      onDragOver(e);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      setDragOver(false);
      onDrop(e);
    },
  };

  const dragIndicator = dragOver && (
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
  );

  const controlButtons = isActive && (
    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {!isFirst && (
        <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary transition-colors">
          <ChevronUp className="w-3 h-3" />
        </button>
      )}
      {!isLast && (
        <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary transition-colors">
          <ChevronDown className="w-3 h-3" />
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-danger transition-colors">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );

  // ---- Divider ----
  if (block.type === 'divider') {
    return (
      <div
        className={`report-block group relative py-3 ${isActive ? 'report-block-active' : ''}`}
        onClick={onActivate}
        {...blockDragProps}
      >
        {dragIndicator}
        <div className="flex items-center gap-2">
          <div className="report-block-handle opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity">
            <GripVertical className="w-3.5 h-3.5 text-text-tertiary" />
          </div>
          <div className="flex-1 h-px bg-border" />
          {isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-danger transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- Image ----
  if (block.type === 'image') {
    return (
      <div
        className={`report-block group relative ${isActive ? 'report-block-active' : ''}`}
        onClick={onActivate}
        {...blockDragProps}
      >
        {dragIndicator}
        <div className="flex gap-2">
          <div className="report-block-handle opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity mt-3">
            <GripVertical className="w-3.5 h-3.5 text-text-tertiary" />
          </div>
          <div className="flex-1 min-w-0">
            {block.imageUrl ? (
              <div className="space-y-2">
                <div className="relative rounded-lg overflow-hidden bg-surface-hover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={block.imageUrl}
                    alt={block.caption || 'Report image'}
                    className="w-full rounded-lg"
                  />
                  {isActive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        imageInputRef.current?.click();
                      }}
                      className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/50 text-white text-[10px] font-medium hover:bg-black/70 transition-colors"
                    >
                      Replace
                    </button>
                  )}
                </div>
                {isActive ? (
                  <input
                    ref={captionRef}
                    type="text"
                    value={block.caption || ''}
                    onChange={(e) => onUpdate({ caption: e.target.value })}
                    placeholder="Add a caption..."
                    className="w-full text-[12px] text-text-secondary italic text-center bg-transparent border-none outline-none placeholder:text-text-tertiary"
                  />
                ) : block.caption ? (
                  <p className="text-[12px] text-text-secondary italic text-center">
                    {block.caption}
                  </p>
                ) : null}
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  imageInputRef.current?.click();
                }}
                className="w-full py-8 rounded-xl border-2 border-dashed border-border hover:border-text-tertiary bg-surface-hover/50 flex flex-col items-center gap-2 transition-colors"
              >
                <ImageIcon className="w-6 h-6 text-text-tertiary" />
                <span className="text-xs text-text-tertiary font-medium">
                  Click to upload image
                </span>
                <span className="text-[10px] text-text-tertiary">
                  PNG, JPG, GIF, WebP
                </span>
              </button>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>
          {controlButtons}
        </div>
      </div>
    );
  }

  // ---- Quote ----
  if (block.type === 'quote') {
    return (
      <div
        className={`report-block group relative ${isActive ? 'report-block-active' : ''}`}
        onClick={onActivate}
        {...blockDragProps}
      >
        {dragIndicator}
        <div className="flex gap-2">
          <div className="report-block-handle opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity mt-3">
            <GripVertical className="w-3.5 h-3.5 text-text-tertiary" />
          </div>
          <div className="flex-1 border-l-[3px] border-accent/40 pl-4 py-2">
            {isActive ? (
              <textarea
                ref={textareaRef}
                value={block.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                className="report-textarea text-[14.5px] leading-[1.75] text-text-secondary italic font-serif"
                placeholder="Quote text..."
                rows={1}
              />
            ) : block.content ? (
              <div className="text-[14.5px] leading-[1.75] text-text-secondary italic font-serif report-markdown">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-0 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em>{children}</em>,
                  }}
                >
                  {block.content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-[14.5px] leading-[1.75] text-text-tertiary font-serif">
                Empty quote
              </p>
            )}
            {block.participantId && (
              <div className="flex items-center gap-1 mt-1.5 text-[11px] text-text-tertiary">
                <User className="w-3 h-3" />
                <span>{block.participantId}</span>
              </div>
            )}
          </div>
          {controlButtons}
        </div>
      </div>
    );
  }

  // ---- Heading, paragraph, title ----
  const textStyles: Record<string, string> = {
    title: 'text-[26px] leading-[1.3] font-bold text-text-primary tracking-tight',
    heading: 'text-[18px] leading-[1.4] font-semibold text-text-primary',
    paragraph: 'text-[14.5px] leading-[1.8] text-text-primary',
  };

  const placeholders: Record<string, string> = {
    title: 'Report title...',
    heading: 'Section heading...',
    paragraph: 'Start writing...',
  };

  return (
    <div
      className={`report-block group relative ${isActive ? 'report-block-active' : ''}`}
      onClick={onActivate}
      {...blockDragProps}
    >
      {dragIndicator}
      <div className="flex gap-2">
        <div className="report-block-handle opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity mt-1.5">
          <GripVertical className="w-3.5 h-3.5 text-text-tertiary" />
        </div>
        <div className="flex-1 min-w-0">
          {isActive ? (
            <textarea
              ref={textareaRef}
              value={block.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              onKeyDown={block.type === 'paragraph' ? handleKeyDown : undefined}
              className={`report-textarea ${textStyles[block.type]}`}
              placeholder={placeholders[block.type]}
              rows={1}
            />
          ) : block.content ? (
            <div className={`${textStyles[block.type]} report-markdown`}>
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  ul: ({ children }) => <ul className="list-disc list-outside ml-4 my-1.5 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-outside ml-4 my-1.5 space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  h1: ({ children }) => <p className="text-[18px] font-semibold mt-3 mb-1">{children}</p>,
                  h2: ({ children }) => <p className="text-[16px] font-semibold mt-2.5 mb-1">{children}</p>,
                  h3: ({ children }) => <p className="text-[15px] font-semibold mt-2 mb-0.5">{children}</p>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-[3px] border-accent/30 pl-3 my-2 italic text-text-secondary">{children}</blockquote>
                  ),
                  code: ({ children }) => (
                    <code className="px-1 py-0.5 rounded bg-surface-hover text-[13px] font-mono">{children}</code>
                  ),
                }}
              >
                {block.content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className={`${textStyles[block.type]}`}>
              <span className="text-text-tertiary font-normal">
                {placeholders[block.type]}
              </span>
            </p>
          )}
        </div>
        {controlButtons}
      </div>
    </div>
  );
}

// ---- Add Block Menu ----

function AddBlockMenu({ onAdd, show }: { onAdd: (type: ReportBlock['type']) => void; show: boolean }) {
  if (!show) return null;

  const blockTypes: { type: ReportBlock['type']; icon: typeof Type; label: string }[] = [
    { type: 'paragraph', icon: Type, label: 'Text' },
    { type: 'heading', icon: Heading1, label: 'Heading' },
    { type: 'quote', icon: Quote, label: 'Quote' },
    { type: 'image', icon: ImageIcon, label: 'Image' },
    { type: 'divider', icon: Minus, label: 'Divider' },
  ];

  return (
    <div className="flex items-center gap-1 py-1.5 add-block-menu">
      {blockTypes.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          onClick={() => onAdd(type)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
          title={label}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ---- AI Writing Toolbar ----

function AIWritingToolbar({
  activeBlock,
  onAction,
  isLoading,
}: {
  activeBlock: ReportBlock | null;
  onAction: (action: 'draft' | 'expand' | 'improve' | 'continue') => void;
  isLoading: boolean;
}) {
  const actions = [
    { id: 'draft' as const, icon: Sparkles, label: 'Draft', description: 'AI writes a draft' },
    { id: 'expand' as const, icon: Expand, label: 'Expand', description: 'Add more detail' },
    { id: 'improve' as const, icon: CheckCheck, label: 'Improve', description: 'Fix & polish' },
    { id: 'continue' as const, icon: ArrowRight, label: 'Continue', description: 'Keep writing' },
  ];

  return (
    <div className="flex items-center gap-1 px-1">
      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-accent">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Writing...</span>
        </div>
      ) : (
        actions.map(({ id, icon: Icon, label, description }) => {
          const disabled =
            (id === 'expand' || id === 'improve') &&
            (!activeBlock || !activeBlock.content.trim());

          return (
            <button
              key={id}
              onClick={() => onAction(id)}
              disabled={disabled}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-text-secondary hover:text-accent hover:bg-accent-light disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title={description}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })
      )}
    </div>
  );
}

// ---- Download Menu ----

function DownloadMenu({
  show,
  onClose,
  onDownload,
}: {
  show: boolean;
  onClose: () => void;
  onDownload: (format: 'markdown' | 'html') => void;
}) {
  if (!show) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-50 bg-surface rounded-xl border border-border shadow-lg py-1 min-w-[160px] download-menu">
        <button
          onClick={() => { onDownload('markdown'); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors"
        >
          <FileText className="w-3.5 h-3.5 text-text-tertiary" />
          Markdown (.md)
        </button>
        <button
          onClick={() => { onDownload('html'); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors"
        >
          <FileText className="w-3.5 h-3.5 text-text-tertiary" />
          HTML (print to PDF)
        </button>
      </div>
    </>
  );
}

// ---- Main Report Panel ----

export function ReportPanel() {
  const {
    reportBlocks,
    reportTitle,
    addReportBlock,
    updateReportBlock,
    removeReportBlock,
    moveReportBlock,
    reorderReportBlock,
    insertQuoteBlock,
    tabs,
    activeTabId,
    settings,
  } = useStore();

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [showDraftInput, setShowDraftInput] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const postIts = activeTab?.postIts || [];
  const clusters = activeTab?.clusters || [];

  const activeBlock = activeBlockId
    ? reportBlocks.find((b) => b.id === activeBlockId) || null
    : null;

  const hasApiKey =
    (settings.selectedProvider === 'openai' && settings.openaiKey) ||
    (settings.selectedProvider === 'gemini' && settings.geminiKey) ||
    (settings.selectedProvider === 'claude' && settings.claudeKey);

  // Handle download
  const handleDownload = useCallback(
    (format: 'markdown' | 'html') => {
      const title = reportBlocks.find((b) => b.type === 'title')?.content || reportTitle || 'report';
      const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'report';

      if (format === 'markdown') {
        const md = blocksToMarkdown(reportBlocks);
        downloadFile(md, `${safeTitle}.md`, 'text/markdown');
      } else {
        const html = blocksToHTML(reportBlocks);
        // Open in new tab for print-to-PDF
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
      }
    },
    [reportBlocks, reportTitle]
  );

  // Handle drop from canvas
  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('application/insightboard-note');
      if (!data) return;

      try {
        const note = JSON.parse(data) as {
          id: string;
          content: string;
          participantId?: string;
        };
        insertQuoteBlock(note.content, note.id, note.participantId);
      } catch {
        // Not valid note data
      }
    },
    [insertQuoteBlock]
  );

  // Add a new block
  const handleAddBlock = useCallback(
    (type: ReportBlock['type'], afterId?: string) => {
      const block: ReportBlock = {
        id: generateId(),
        type,
        content: '',
      };
      addReportBlock(block, afterId);
      setActiveBlockId(block.id);
      setShowAddMenu(null);
    },
    [addReportBlock]
  );

  // Block reorder via drag
  const handleBlockDragStart = useCallback(
    (blockId: string, e: React.DragEvent) => {
      setDraggedBlockId(blockId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', blockId);
    },
    []
  );

  const handleBlockDrop = useCallback(
    (targetBlockId: string, e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedBlockId || draggedBlockId === targetBlockId) return;

      const targetIdx = reportBlocks.findIndex((b) => b.id === targetBlockId);
      if (targetIdx !== -1) {
        reorderReportBlock(draggedBlockId, targetIdx);
      }
      setDraggedBlockId(null);
    },
    [draggedBlockId, reportBlocks, reorderReportBlock]
  );

  // AI actions
  const handleAIAction = useCallback(
    async (action: 'draft' | 'expand' | 'improve' | 'continue') => {
      if (!hasApiKey) return;

      setAiLoading(true);
      try {
        const noteContents = postIts.map((p) => p.content);

        let messages;

        if (action === 'draft') {
          setShowDraftInput(true);
          setAiLoading(false);
          return;
        }

        if (action === 'expand' && activeBlock) {
          const contextText = reportBlocks.map((b) => b.content).join('\n\n');
          messages = buildReportExpandPrompt(activeBlock.content, contextText);
        } else if (action === 'improve' && activeBlock) {
          messages = buildReportImprovePrompt(activeBlock.content);
        } else if (action === 'continue') {
          const reportText = reportBlocks.map((b) => b.content).join('\n\n');
          messages = buildReportContinuePrompt(reportText, noteContents);
        } else {
          setAiLoading(false);
          return;
        }

        const response = await callAI(settings, messages);

        if (action === 'expand' || action === 'improve') {
          if (activeBlock) {
            updateReportBlock(activeBlock.id, { content: response.trim() });
          }
        } else if (action === 'continue') {
          const newBlock: ReportBlock = {
            id: generateId(),
            type: 'paragraph',
            content: response.trim(),
          };
          addReportBlock(newBlock);
          setActiveBlockId(newBlock.id);
        }
      } catch (err) {
        console.error('AI writing error:', err);
      } finally {
        setAiLoading(false);
      }
    },
    [hasApiKey, postIts, activeBlock, reportBlocks, settings, updateReportBlock, addReportBlock]
  );

  // Draft with custom prompt
  const handleDraftSubmit = useCallback(
    async () => {
      if (!draftPrompt.trim() || !hasApiKey) return;

      setAiLoading(true);
      setShowDraftInput(false);
      try {
        const noteContents = postIts.map((p) => p.content);
        const themeNames = clusters.map((c) => c.name);

        const messages = buildReportDraftPrompt(
          { notes: noteContents, themes: themeNames, title: reportTitle },
          draftPrompt
        );

        const response = await callAI(settings, messages);

        // Parse response into blocks: split by double newlines, detect headings
        const lines = response.trim().split('\n\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let type: ReportBlock['type'] = 'paragraph';
          let content = trimmed;

          // Detect headings (# or ##)
          if (trimmed.startsWith('# ')) {
            type = 'heading';
            content = trimmed.replace(/^#+\s+/, '');
          } else if (trimmed.startsWith('## ')) {
            type = 'heading';
            content = trimmed.replace(/^#+\s+/, '');
          }

          const newBlock: ReportBlock = {
            id: generateId(),
            type,
            content,
          };
          addReportBlock(newBlock);
        }

        setDraftPrompt('');
      } catch (err) {
        console.error('AI draft error:', err);
      } finally {
        setAiLoading(false);
      }
    },
    [draftPrompt, hasApiKey, postIts, clusters, reportTitle, settings, addReportBlock]
  );

  const wordCount = reportBlocks
    .reduce((acc, b) => acc + b.content.trim().split(/\s+/).filter(Boolean).length, 0);

  return (
    <div
      className="w-[440px] flex-shrink-0 bg-surface border-l border-border flex flex-col right-panel-animate"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleCanvasDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-text-primary">Report</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-tertiary font-mono">
            {wordCount} words
          </span>

          {/* Download button */}
          {reportBlocks.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-secondary transition-colors"
                title="Download report"
              >
                <Download className="w-4 h-4" />
              </button>
              <DownloadMenu
                show={showDownloadMenu}
                onClose={() => setShowDownloadMenu(false)}
                onDownload={handleDownload}
              />
            </div>
          )}
        </div>
      </div>

      {/* AI Toolbar */}
      {hasApiKey && (
        <div className="px-3 py-2 border-b border-border bg-surface-hover/30">
          <div className="flex items-center gap-1 mb-0.5">
            <Wand2 className="w-3 h-3 text-accent" />
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
              AI Assist
            </span>
          </div>
          <AIWritingToolbar
            activeBlock={activeBlock}
            onAction={handleAIAction}
            isLoading={aiLoading}
          />
        </div>
      )}

      {/* Draft prompt input */}
      {showDraftInput && (
        <div className="px-4 py-3 border-b border-border bg-accent-light/30">
          <p className="text-[11px] font-medium text-text-secondary mb-2">
            What should AI draft?
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDraftSubmit();
                if (e.key === 'Escape') { setShowDraftInput(false); setDraftPrompt(''); }
              }}
              placeholder='e.g. "Write an executive summary" or "Draft findings about onboarding"'
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
              autoFocus
            />
            <button
              onClick={handleDraftSubmit}
              disabled={!draftPrompt.trim()}
              className="px-3 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              Draft
            </button>
          </div>
          <button
            onClick={() => { setShowDraftInput(false); setDraftPrompt(''); }}
            className="text-[10px] text-text-tertiary hover:text-text-secondary mt-1.5 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Content area */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto"
        onClick={(e) => {
          if (e.target === contentRef.current) {
            setActiveBlockId(null);
            setShowAddMenu(null);
          }
        }}
      >
        <div className="px-6 py-6 space-y-0.5 min-h-full">
          {reportBlocks.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center mb-4">
                <FileText className="w-7 h-7 text-accent" />
              </div>
              <h3 className="text-base font-semibold text-text-primary mb-1.5">
                Start your report
              </h3>
              <p className="text-sm text-text-secondary mb-5 max-w-[260px] leading-relaxed">
                Write your findings, or drag quotes from the canvas. Use AI to help you draft.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-[220px]">
                <button
                  onClick={() => {
                    const titleBlock: ReportBlock = { id: generateId(), type: 'title', content: reportTitle || '' };
                    const headingBlock: ReportBlock = { id: generateId(), type: 'heading', content: '' };
                    const paraBlock: ReportBlock = { id: generateId(), type: 'paragraph', content: '' };
                    addReportBlock(titleBlock);
                    addReportBlock(headingBlock);
                    addReportBlock(paraBlock);
                    setActiveBlockId(titleBlock.id);
                  }}
                  className="px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-hover transition-colors shadow-sm"
                >
                  Start Writing
                </button>
                {hasApiKey && (
                  <button
                    onClick={() => {
                      setShowDraftInput(true);
                    }}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-surface-hover text-text-secondary text-sm font-medium rounded-xl hover:bg-border/50 border border-border transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Draft
                  </button>
                )}
              </div>

              {/* Drop hint */}
              <div className="mt-8 flex items-center gap-2 text-[11px] text-text-tertiary">
                <Quote className="w-3.5 h-3.5" />
                <span>Drag notes from canvas to add quotes</span>
              </div>
            </div>
          ) : (
            <>
              {reportBlocks.map((block, idx) => (
                <div key={block.id}>
                  <ReportBlockItem
                    block={block}
                    isActive={activeBlockId === block.id}
                    onActivate={() => {
                      setActiveBlockId(block.id);
                      setShowAddMenu(null);
                    }}
                    onUpdate={(updates) => updateReportBlock(block.id, updates)}
                    onRemove={() => {
                      removeReportBlock(block.id);
                      setActiveBlockId(null);
                    }}
                    onMoveUp={() => moveReportBlock(block.id, 'up')}
                    onMoveDown={() => moveReportBlock(block.id, 'down')}
                    onAddAfter={(type) => handleAddBlock(type, block.id)}
                    isFirst={idx === 0}
                    isLast={idx === reportBlocks.length - 1}
                    onDragStart={(e) => handleBlockDragStart(block.id, e)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleBlockDrop(block.id, e)}
                  />

                  {/* Add block button between blocks */}
                  <div className="relative h-0 group/add">
                    <button
                      onClick={() =>
                        setShowAddMenu(showAddMenu === block.id ? null : block.id)
                      }
                      className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-surface border border-border shadow-sm flex items-center justify-center opacity-0 group-hover/add:opacity-100 hover:!opacity-100 hover:border-accent hover:text-accent text-text-tertiary transition-all"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <AddBlockMenu
                      show={showAddMenu === block.id}
                      onAdd={(type) => handleAddBlock(type, block.id)}
                    />
                  </div>
                </div>
              ))}

              {/* Bottom add block */}
              <div className="pt-4 pb-20">
                <button
                  onClick={() =>
                    setShowAddMenu(showAddMenu === 'bottom' ? null : 'bottom')
                  }
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add block
                </button>
                <AddBlockMenu
                  show={showAddMenu === 'bottom'}
                  onAdd={(type) => handleAddBlock(type)}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
