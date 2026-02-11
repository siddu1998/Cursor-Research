import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { v4 as uuidv4 } from 'uuid';
import { CARD_WIDTH, CARD_HEIGHT, CARD_GAP, GRID_COLS, POST_IT_COLORS } from './types';
import type { PostIt } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return uuidv4();
}

export function gridPosition(index: number): { x: number; y: number } {
  return {
    x: (index % GRID_COLS) * (CARD_WIDTH + CARD_GAP) + 60,
    y: Math.floor(index / GRID_COLS) * (CARD_HEIGHT + CARD_GAP) + 60,
  };
}

export function getPostItColor(index: number): string {
  return POST_IT_COLORS[index % POST_IT_COLORS.length];
}

export function truncateText(text: string, maxLength: number = 120): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}

export function createPostIt(
  content: string,
  source: string,
  index: number,
  participantId?: string
): PostIt {
  const pos = gridPosition(index);
  return {
    id: generateId(),
    content,
    source,
    participantId,
    x: pos.x,
    y: pos.y,
    color: getPostItColor(index),
    tags: [],
    selected: false,
    highlighted: false,
  };
}

export function arrangeInGrid(postIts: PostIt[]): PostIt[] {
  return postIts.map((p, i) => {
    const pos = gridPosition(i);
    return { ...p, x: pos.x, y: pos.y };
  });
}

export function arrangeInClusters(
  postIts: PostIt[],
  clusterOrder: string[]
): PostIt[] {
  const updated = [...postIts];
  let clusterOffsetX = 60;
  // Extra vertical space for clustered layouts (cards have metadata + inline reasoning)
  const CLUSTER_ROW_HEIGHT = CARD_HEIGHT + 100;

  for (const clusterId of clusterOrder) {
    const items = updated.filter((p) => p.clusterId === clusterId);
    const cols = Math.max(Math.ceil(Math.sqrt(items.length)), 2);

    items.forEach((item, i) => {
      const idx = updated.findIndex((p) => p.id === item.id);
      if (idx !== -1) {
        updated[idx] = {
          ...updated[idx],
          x: clusterOffsetX + (i % cols) * (CARD_WIDTH + CARD_GAP),
          y: 100 + Math.floor(i / cols) * (CLUSTER_ROW_HEIGHT + CARD_GAP),
        };
      }
    });

    clusterOffsetX += cols * (CARD_WIDTH + CARD_GAP) + 80;
  }

  // Unclustered items go at the end
  const unclustered = updated.filter((p) => !p.clusterId);
  unclustered.forEach((item, i) => {
    const idx = updated.findIndex((p) => p.id === item.id);
    if (idx !== -1) {
      updated[idx] = {
        ...updated[idx],
        x: clusterOffsetX + (i % 3) * (CARD_WIDTH + CARD_GAP),
        y: 100 + Math.floor(i / 3) * (CLUSTER_ROW_HEIGHT + CARD_GAP),
      };
    }
  });

  return updated;
}

export function getStoredSettings() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('uxai-settings');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSettings(settings: object) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('uxai-settings', JSON.stringify(settings));
}

export function getStoredTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  try {
    const theme = localStorage.getItem('uxai-theme');
    return theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveTheme(theme: 'light' | 'dark') {
  if (typeof window === 'undefined') return;
  localStorage.setItem('uxai-theme', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
