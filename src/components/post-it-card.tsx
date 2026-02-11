'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import type { PostIt, Cluster } from '@/lib/types';
import { CARD_WIDTH } from '@/lib/types';
import { truncateText } from '@/lib/utils';
import {
  Trash2,
  X,
  Check,
  Tag,
  User,
  Brain,
  GripVertical,
} from 'lucide-react';

interface PostItCardProps {
  postIt: PostIt;
  cluster?: Cluster;
  scale: number;
  dimmed: boolean;
  onDragStart: (id: string, e: React.MouseEvent) => void;
  isDragging?: boolean;
}

export function PostItCard({ postIt, cluster, scale, dimmed, onDragStart, isDragging }: PostItCardProps) {
  const { updatePostIt, deletePostIt, selectPostIt } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(postIt.content);
  const [showFull, setShowFull] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    updatePostIt(postIt.id, { content: editContent });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(postIt.content);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!isEditing) {
      selectPostIt(postIt.id, e.shiftKey || e.metaKey);
    }
  };

  return (
    <div
      className={`
        absolute select-none group
        ${isDragging ? 'dragging' : 'post-it-transition'}
        ${postIt.selected ? 'z-30' : 'z-10'}
        ${postIt.highlighted ? 'z-20' : ''}
        ${dimmed ? 'opacity-[0.18] scale-[0.97] pointer-events-none' : ''}
      `}
      style={{
        left: postIt.x,
        top: postIt.y,
        width: CARD_WIDTH,
        cursor: isEditing ? 'auto' : 'grab',
      }}
      onClick={handleClick}
      onDoubleClick={() => setIsEditing(true)}
      onMouseDown={(e) => {
        if (
          !isEditing &&
          !(e.target as HTMLElement).closest('button') &&
          !(e.target as HTMLElement).closest('textarea') &&
          !(e.target as HTMLElement).closest('[data-report-drag]')
        ) {
          e.stopPropagation();
          onDragStart(postIt.id, e);
        }
      }}
    >
      <div
        className={`
          relative rounded-xl overflow-hidden transition-shadow
          ${postIt.selected
            ? 'ring-2 ring-accent shadow-lg'
            : postIt.highlighted
              ? 'ring-2 ring-accent shadow-lg scale-[1.02]'
              : 'shadow-sm hover:shadow-md'
          }
        `}
        style={{
          backgroundColor: postIt.color,
          border: `1px solid rgba(0,0,0,0.04)`,
        }}
      >
        {/* Top Actions Bar */}
        <div
          className="absolute top-0 left-0 right-0 h-7 flex items-center justify-between px-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          {/* Drag to report handle */}
          <div
            data-report-drag
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData(
                'application/insightboard-note',
                JSON.stringify({
                  id: postIt.id,
                  content: postIt.content,
                  participantId: postIt.participantId,
                  source: postIt.source,
                })
              );
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-grab active:cursor-grabbing transition-colors"
            title="Drag to report"
          >
            <GripVertical className="w-3 h-3 text-black/30 dark:text-white/30" />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deletePostIt(postIt.id);
            }}
            className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <Trash2 className="w-3 h-3 text-black/40 dark:text-white/40 hover:text-danger" />
          </button>
        </div>

        {/* Content */}
        <div className="px-3 pt-7 pb-2">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full text-xs leading-relaxed text-text-primary bg-transparent resize-none focus:outline-none min-h-[60px]"
                rows={4}
              />
              <div className="flex gap-1 justify-end">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
                  className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5 text-black/40 dark:text-white/40" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                  }}
                  className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <Check className="w-3.5 h-3.5 text-success" />
                </button>
              </div>
            </div>
          ) : (
            <p
              className="text-[12px] leading-[1.6] text-black/75 cursor-pointer"
              onClick={(e) => {
                if (postIt.content.length > 120) {
                  e.stopPropagation();
                  setShowFull(!showFull);
                }
              }}
            >
              {showFull ? postIt.content : truncateText(postIt.content)}
            </p>
          )}
        </div>

        {/* Metadata row */}
        <div className="px-3 pb-1.5 flex items-center gap-1 flex-wrap">
          {postIt.participantId && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/[0.08] dark:bg-white/[0.08] text-[10px] text-black/60 dark:text-white/60 font-medium">
              <User className="w-2.5 h-2.5" />
              {postIt.participantId}
            </span>
          )}
          {cluster && (
            <span
              className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold text-white leading-none"
              style={{ backgroundColor: cluster.color }}
            >
              {cluster.name}
            </span>
          )}
          {postIt.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/[0.08] dark:bg-white/[0.08] text-[10px] text-black/60 dark:text-white/60"
            >
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
          <span className="text-[10px] text-black/40 dark:text-white/40 ml-auto truncate max-w-[60px] font-medium" title={postIt.source}>
            {postIt.source}
          </span>
        </div>

        {/* Reasoning — inline, always visible when present */}
        {postIt.reasoning && (
          <div className="mx-2 mb-2 px-2.5 py-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.12]">
            <div className="flex items-center gap-1 mb-0.5">
              <Brain className="w-2.5 h-2.5 text-black/40 dark:text-black/60" />
              <span className="text-[9px] font-semibold text-black/50 dark:text-black/70 uppercase tracking-wider">
                Why here
              </span>
            </div>
            <p className="text-[10px] text-black/70 dark:text-black/80 leading-relaxed">
              {truncateText(postIt.reasoning, 100)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
