import Papa from 'papaparse';
import mammoth from 'mammoth';
import type { ImportedFile } from './types';

export async function parseCSV(file: File): Promise<ImportedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const columns = results.meta.fields || [];
        const rows = results.data as Record<string, string>[];
        resolve({
          name: file.name,
          type: 'csv',
          content: '',
          columns,
          rows,
        });
      },
      error: (error: Error) => reject(error),
    });
  });
}

export async function parseDOCX(file: File): Promise<ImportedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return {
    name: file.name,
    type: 'docx',
    content: result.value,
  };
}

export async function parseTXT(file: File): Promise<ImportedFile> {
  const content = await file.text();
  return {
    name: file.name,
    type: 'txt',
    content,
  };
}

export async function parseFile(file: File): Promise<ImportedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'csv':
      return parseCSV(file);
    case 'docx':
      return parseDOCX(file);
    case 'txt':
    case 'md':
      return parseTXT(file);
    default:
      // Try as text
      return parseTXT(file);
  }
}

export function getAcceptedFileTypes(): string {
  return '.csv,.docx,.txt,.md';
}

export function extractCSVPostIts(
  rows: Record<string, string>[],
  selectedColumns: string[],
  fileName: string
): { content: string; source: string }[] {
  const results: { content: string; source: string }[] = [];

  for (const row of rows) {
    const parts = selectedColumns
      .map((col) => row[col]?.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      results.push({
        content: parts.join('\n'),
        source: fileName,
      });
    }
  }

  return results;
}
