// Embedding service — generates vectors for post-its and queries
// Supports OpenAI and Gemini embedding APIs
// Falls back gracefully when no embedding API is available

import type { Settings, PostIt } from './types';

// ---- Embedding API calls ----

async function embedOpenAI(apiKey: string, texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI Embedding error: ${res.status}`);
  }

  const data = await res.json();
  // OpenAI returns data sorted by index
  return data.data
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);
}

async function embedGemini(apiKey: string, texts: string[]): Promise<number[][]> {
  // Gemini batch embedding
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] },
        })),
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini Embedding error: ${res.status}`);
  }

  const data = await res.json();
  return data.embeddings.map((e: { values: number[] }) => e.values);
}

// ---- Provider selection ----

export type EmbeddingProvider = 'openai' | 'gemini' | null;

export function getAvailableEmbeddingProvider(settings: Settings): EmbeddingProvider {
  // Prefer OpenAI (faster, well-tested), fall back to Gemini
  if (settings.openaiKey) return 'openai';
  if (settings.geminiKey) return 'gemini';
  return null;
}

// ---- Main embedding function ----

export async function embedTexts(
  settings: Settings,
  texts: string[]
): Promise<number[][]> {
  const provider = getAvailableEmbeddingProvider(settings);

  if (!provider) {
    throw new Error('No embedding API available. Add an OpenAI or Gemini API key.');
  }

  // Batch in chunks of 96 to avoid API limits
  const BATCH_SIZE = 96;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    if (provider === 'openai') {
      const embeddings = await embedOpenAI(settings.openaiKey, batch);
      allEmbeddings.push(...embeddings);
    } else {
      const embeddings = await embedGemini(settings.geminiKey, batch);
      allEmbeddings.push(...embeddings);
    }
  }

  return allEmbeddings;
}

export async function embedSingleText(
  settings: Settings,
  text: string
): Promise<number[]> {
  const results = await embedTexts(settings, [text]);
  return results[0];
}

// ---- Vector search (cosine similarity) ----

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function magnitude(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = dotProduct(a, b);
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

export interface SearchResult {
  postIt: PostIt;
  score: number;
}

/**
 * Search post-its by semantic similarity to a query embedding.
 * Returns top-K results sorted by similarity score (highest first).
 */
export function semanticSearch(
  postIts: PostIt[],
  queryEmbedding: number[],
  topK: number = 30,
  threshold: number = 0.25
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const postIt of postIts) {
    if (!postIt.embedding || postIt.embedding.length === 0) continue;

    // Only compare if dimensions match
    if (postIt.embedding.length !== queryEmbedding.length) continue;

    const score = cosineSimilarity(postIt.embedding, queryEmbedding);
    if (score >= threshold) {
      results.push({ postIt, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Embed all post-its that don't have embeddings yet.
 * Returns a map of postIt.id → embedding vector.
 */
export async function embedPostItsBatch(
  settings: Settings,
  postIts: PostIt[]
): Promise<Map<string, number[]>> {
  const needsEmbedding = postIts.filter((p) => !p.embedding || p.embedding.length === 0);

  if (needsEmbedding.length === 0) return new Map();

  const provider = getAvailableEmbeddingProvider(settings);
  if (!provider) return new Map();

  try {
    const texts = needsEmbedding.map((p) => p.content);
    const embeddings = await embedTexts(settings, texts);

    const result = new Map<string, number[]>();
    needsEmbedding.forEach((p, i) => {
      result.set(p.id, embeddings[i]);
    });

    return result;
  } catch (err) {
    console.error('Embedding batch failed:', err);
    return new Map();
  }
}
