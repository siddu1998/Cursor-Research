# Cursor Research

**AI-powered qualitative research analysis tool for researchers and PMs.**

Cursor Research transforms raw qualitative data — interview transcripts, survey responses, field notes — into organized, actionable insights. It combines a visual canvas of sticky notes with AI-powered analysis, semantic search (RAG), and a full report editor.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8)

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [System Implementation](#system-implementation)
  - [Data Ingestion Pipeline](#1-data-ingestion-pipeline)
  - [AI-Powered Document Chunking](#2-ai-powered-document-chunking)
  - [Embedding & Indexing (RAG Foundation)](#3-embedding--indexing-rag-foundation)
  - [RAG-Powered Semantic Search](#4-rag-powered-semantic-search)
  - [AI Tool-Calling Router](#5-ai-tool-calling-router)
  - [Human-in-the-Loop Thematic Analysis](#6-human-in-the-loop-thematic-analysis)
  - [Report Generation](#7-report-generation)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [AI Provider Support](#ai-provider-support)
- [License](#license)

---

## Features

- **Visual Canvas** — Infinite pan/zoom canvas with sticky notes, drag-and-drop, and cluster boundaries
- **Multi-format Import** — DOCX transcripts, CSV survey data, TXT files, pasted text, Twitter/X, Reddit
- **AI Document Chunking** — LLM splits documents into one-idea-per-note excerpts with human review
- **RAG Semantic Search** — Vector embeddings + cosine similarity to find relevant notes fast
- **Thematic Analysis** — AI proposes themes → researcher reviews/edits → AI classifies (human-in-the-loop)
- **Research Assistant** — Conversational AI with tool-calling to search, group, tag, and analyze
- **Report Editor** — Block-based editor with AI drafting, drag-from-canvas, export to Markdown/HTML/DOCX
- **Multi-provider AI** — OpenAI, Google Gemini, and Anthropic Claude with native tool-calling
- **Workspaces** — Tabbed sessions with independent note sets and clusters
- **Dark Mode** — Full light/dark theme with Swiss-inspired design language

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│                                                              │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Canvas  │  │ Chat Bar │  │ Report   │  │ Import      │  │
│  │ (notes, │  │ (AI      │  │ Panel    │  │ Dialog      │  │
│  │ clusters│  │  assist) │  │ (editor) │  │ (files,CSV) │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘  │
│       │            │             │                │          │
│       └────────────┴─────────────┴────────────────┘          │
│                          │                                   │
│                    ┌─────┴──────┐                             │
│                    │  Zustand   │                             │
│                    │  Store     │                             │
│                    └─────┬──────┘                             │
│                          │                                   │
│       ┌──────────────────┼──────────────────┐                │
│       │                  │                  │                │
│  ┌────┴────┐  ┌──────────┴─────┐  ┌────────┴──────┐        │
│  │Embedding│  │  AI Service    │  │ File Parsers  │        │
│  │Service  │  │  (prompts,     │  │ (CSV, DOCX,   │        │
│  │(vectors)│  │   tool-calling)│  │  TXT)         │        │
│  └────┬────┘  └──────┬─────────┘  └───────────────┘        │
│       │              │                                      │
└───────┼──────────────┼──────────────────────────────────────┘
        │              │
        ▼              ▼
  ┌──────────┐  ┌─────────────┐  ┌──────────────────┐
  │ OpenAI   │  │ OpenAI      │  │ Twitter/Reddit   │
  │ Embeddings│ │ Gemini      │  │ API (server-side) │
  │ Gemini   │  │ Claude      │  └──────────────────┘
  │ Embeddings│ │ (chat/tools)│
  └──────────┘  └─────────────┘
```

---

## System Implementation

### 1. Data Ingestion Pipeline

The system accepts qualitative data from multiple sources:

| Source | Format | Parser | Notes |
|--------|--------|--------|-------|
| Interview transcripts | `.docx` | `mammoth` | Extracts raw text, preserves speaker labels |
| Survey responses | `.csv` | `papaparse` | User selects which columns to import |
| Field notes | `.txt`, `.md` | Native `File.text()` | Plain text import |
| Pasted text | Raw text | Direct input | For quick data entry |
| Twitter/X | API v2 | Server-side route | Search recent tweets by keyword |
| Reddit | OAuth API | Server-side route | Search posts with auth flow |

**CSV Handling**: When a CSV is imported, the user is presented with column headers and selects which columns contain qualitative data. Selected columns are concatenated per-row into individual sticky notes.

**Document Flow**: For DOCX/TXT files, the raw text is passed to the AI chunking pipeline (see below). Social media data is imported directly as individual notes.

```
File Upload → Parse (mammoth/papaparse) → AI Chunking → Human Review → Canvas
```

### 2. AI-Powered Document Chunking

Long-form documents (transcripts, field notes) need to be split into atomic, one-idea-per-note excerpts. This is done by the LLM with a carefully engineered prompt:

**Key constraints enforced in the prompt:**
- **Verbatim extraction** — chunks must be copied character-for-character from the source (enabling source-text highlighting)
- **One idea per chunk** — each excerpt captures a single observation, opinion, or behavior
- **Speaker identification** — automatically detects participant labels (e.g., "P1:", "Jordan:")
- **Full coverage** — the LLM processes the entire document, skipping only moderator questions and filler

**Human-in-the-loop review** (`ChunkReview` component):
After AI proposes chunks, the researcher sees a split view:
- **Left panel**: Source document with chunks highlighted in-place (color-coded, with click-to-select)
- **Right panel**: List of proposed post-its with edit/delete/merge controls

The researcher can edit chunk text, adjust participant attribution, merge adjacent chunks, delete irrelevant ones, or add manual chunks via right-click on the source text — before committing to the canvas.

### 3. Embedding & Indexing (RAG Foundation)

Every note is automatically embedded as a vector for semantic search. This happens in the background immediately after import.

**Embedding providers:**
| Provider | Model | Dimensions |
|----------|-------|------------|
| OpenAI | `text-embedding-3-small` | 1536 |
| Google Gemini | `text-embedding-004` | 768 |

**Indexing flow:**
```
Import Notes → Background Embedding → Store vectors on PostIt objects → Ready for search
         ↓
   Batched (96 per request) to avoid API limits
         ↓
   Progress shown in header ("Indexing... → Indexed ✓")
```

The embedding provider is selected automatically based on available API keys (OpenAI preferred, Gemini fallback). Vectors are stored directly on each `PostIt` object in the Zustand store, enabling instant in-memory cosine similarity search with no external vector database.

**Vector search implementation** (`embeddings.ts`):
```
cosineSimilarity(a, b) = dotProduct(a, b) / (magnitude(a) × magnitude(b))
```
- Returns top-K results above a similarity threshold (default: 0.25)
- Runs entirely client-side — no server roundtrip for search

### 4. RAG-Powered Semantic Search

The system uses a two-stage **Retrieval-Augmented Generation** pipeline:

```
User Query
    │
    ▼
┌──────────────────┐
│ Stage 1: Retrieve│     Embed query → cosine similarity → top-40 candidates
│ (Vector Search)  │     Runs client-side, ~10ms for 1000 notes
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Stage 2: Rerank  │     LLM reviews candidates, confirms true matches,
│ (AI Confirmation)│     adds per-note reasoning ("why this matches")
└────────┬─────────┘
         │
         ▼
    Highlighted on Canvas
    (non-matches dimmed)
```

**Why two stages?**
- **Stage 1 (retrieval)** is fast and cheap — filters 1000 notes down to ~40 candidates using vector similarity
- **Stage 2 (reranking)** is precise — the LLM only sees the top candidates, dramatically reducing token cost and improving accuracy vs. sending all notes

**Fallback behavior:**
- If embeddings aren't available (no API key), all notes are sent directly to the LLM
- If semantic search returns no results above threshold, falls back to full-set LLM analysis
- If the embedding API fails, the system logs a warning and continues with LLM-only search

**RAG for answers** (`buildRAGAnswerPrompt`):
When the user asks analytical questions (e.g., "What are the main frustrations?"), the same retrieval stage pre-filters to relevant notes before sending to the LLM. For datasets under 50 notes, all notes are included directly (no retrieval needed).

### 5. AI Tool-Calling Router

The chat system uses **native function calling** (not prompt-based action extraction) to route user intent:

```
User Message
    │
    ▼
┌─────────────────────┐
│ Tool-Calling LLM    │     System prompt includes data context + tool definitions
│ (OpenAI/Claude/     │     Model returns structured tool_call, not free text
│  Gemini)            │
└────────┬────────────┘
         │
    ┌────┴────────────────────────┐
    │         Tool Calls          │
    ├─────────────────────────────┤
    │ find_notes(query)           │ → RAG search → highlight on canvas
    │ group_notes(criteria)       │ → Theme proposal → human review → classify
    │ answer_question(response)   │ → Direct text response in chat
    │ tag_notes(ids, tag)         │ → Apply tags to specific notes
    └─────────────────────────────┘
```

**Tool definitions** are provider-agnostic JSON Schema objects (`tools.ts`), translated to:
- OpenAI: `tools[].function` format
- Claude: `tools[].input_schema` format
- Gemini: `tools[].functionDeclarations` format

**Fallback chain:**
1. Try native tool-calling
2. If the model doesn't support tools or fails → fall back to RAG-powered answer
3. If the answer flow fails → surface error to user

### 6. Human-in-the-Loop Thematic Analysis

Clustering is a **two-step process** with researcher oversight:

```
Step 1: Theme Proposal
    │
    │  LLM analyzes all notes, proposes 3-7 themes
    │  Each theme has: name, description, evidence (cited quotes)
    │
    ▼
┌──────────────────────────────┐
│  Theme Review Dialog         │
│  ┌────────────────────────┐  │
│  │ ✏️ Edit theme names     │  │
│  │ ➕ Add custom themes    │  │
│  │ 🗑️ Remove bad themes    │  │
│  │ 📝 Edit descriptions   │  │
│  └────────────────────────┘  │
│  [Cancel]  [Confirm & Classify] │
└──────────────┬───────────────┘
               │
               ▼
Step 2: Classification
    │
    │  LLM classifies EVERY note into researcher-approved themes
    │  Each classification includes specific reasoning
    │  Multi-pass for large datasets (batched to avoid token limits)
    │
    ▼
Canvas: Notes arranged in clusters with AI reasoning visible on each card
```

**Why human-in-the-loop?**
- Researchers need to validate and refine themes before classification
- Domain expertise should guide the analysis, not just the AI
- Every classification decision includes transparent reasoning for auditability

**Multi-pass classification:**
For large datasets (>50 notes), classification is batched across multiple LLM calls. Unclustered notes from pass 1 are retried in pass 2 with additional context. The UI shows progress: "Pass 1: 60/93 classified → Pass 2: 85/93 classified".

### 7. Report Generation

The report panel is a block-based document editor with AI assistance:

**Block types:**
| Type | Description |
|------|-------------|
| Title | Main report title (`h1`) |
| Heading | Section heading (`h2`) |
| Paragraph | Body text with Markdown support |
| Quote | Participant quote with optional citation |
| Divider | Horizontal rule separator |
| Image | Image block with caption |

**AI-powered writing tools:**
- **Draft** — Generate report sections from research data and themes
- **Expand** — Elaborate on a paragraph with more detail and evidence
- **Improve** — Polish grammar, clarity, and tone
- **Continue** — Auto-continue writing from where the report left off

**Drag-from-canvas:**
Notes can be dragged directly from the canvas into the report panel. The dragged note is automatically converted into a quote block with participant attribution.

**Export formats:**
- **Markdown** (`.md`) — Clean Markdown with headers, quotes, and formatting
- **HTML** (`.html`) — Styled standalone HTML with DM Sans typography and print CSS
- **DOCX** (`.docx`) — Word document via HTML-to-DOCX conversion

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4 |
| State | Zustand 5 (single global store) |
| Fonts | DM Sans, JetBrains Mono (Google Fonts) |
| Icons | Lucide React |
| File Parsing | `mammoth` (DOCX), `papaparse` (CSV) |
| Markdown | `react-markdown` |
| AI | OpenAI, Google Gemini, Anthropic Claude APIs |
| Embeddings | OpenAI `text-embedding-3-small`, Gemini `text-embedding-004` |

---

## Getting Started

### Prerequisites

- Node.js 18+
- An API key from at least one AI provider (OpenAI, Google Gemini, or Anthropic Claude)

### Installation

```bash
git clone https://github.com/your-username/cursor-research.git
cd cursor-research
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

### Configuration

1. Click the **⚙ Settings** icon in the header
2. Add your API key(s):
   - **OpenAI** — Enables GPT-4o, embeddings, and semantic search
   - **Gemini** — Enables Gemini 2.0 Flash/1.5 Pro, Gemini embeddings
   - **Claude** — Enables Claude Sonnet 4 / 3.5 Sonnet / 3.5 Haiku
3. Select your preferred model
4. (Optional) Add Twitter Bearer Token or Reddit credentials for social media import

> **Note:** API keys are stored in `localStorage` and never sent to any server other than the respective AI provider.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── appdata/
│   │       ├── reddit/route.ts      # Reddit search API proxy
│   │       └── twitter/route.ts     # Twitter search API proxy
│   ├── globals.css                  # Theme variables, animations, scrollbar
│   ├── layout.tsx                   # Root layout (fonts, ThemeProvider)
│   └── page.tsx                     # Main app page (header, layout)
├── components/
│   ├── canvas.tsx                   # Infinite canvas (pan, zoom, clusters, drag)
│   ├── chat-bar.tsx                 # Research assistant (RAG, tool-calling)
│   ├── chunk-review.tsx             # Document chunking review (HITL)
│   ├── file-sidebar.tsx             # File browser sidebar
│   ├── import-dialog.tsx            # Data import (files, CSV, paste, social)
│   ├── left-nav.tsx                 # Left navigation rail
│   ├── post-it-card.tsx             # Individual sticky note component
│   ├── report-panel.tsx             # Block-based report editor
│   ├── right-nav.tsx                # Right navigation rail
│   ├── settings-dialog.tsx          # API key and model configuration
│   ├── theme-provider.tsx           # Light/dark theme management
│   ├── theme-review.tsx             # Theme proposal review (HITL)
│   └── workspace-tabs.tsx           # Tab bar with session management
└── lib/
    ├── ai-service.ts                # AI provider abstraction, all prompts
    ├── embeddings.ts                # Vector embeddings, cosine similarity search
    ├── file-parsers.ts              # CSV, DOCX, TXT file parsing
    ├── store.ts                     # Zustand global state (tabs, notes, clusters)
    ├── tools.ts                     # MCP-ready tool definitions (JSON Schema)
    ├── types.ts                     # TypeScript interfaces and constants
    └── utils.ts                     # Grid layout, ID generation, theme persistence
```

---

## AI Provider Support

| Feature | OpenAI | Gemini | Claude |
|---------|--------|--------|--------|
| Chat & Analysis | ✅ GPT-4o, GPT-4o Mini | ✅ Gemini 2.0 Flash, 1.5 Pro | ✅ Claude Sonnet 4, 3.5 Sonnet |
| Tool Calling | ✅ Native functions | ✅ Native functionDeclarations | ✅ Native tools |
| Embeddings | ✅ text-embedding-3-small | ✅ text-embedding-004 | ❌ (uses OpenAI/Gemini) |
| Document Chunking | ✅ | ✅ | ✅ |
| Theme Analysis | ✅ | ✅ | ✅ |
| Report Writing | ✅ | ✅ | ✅ |

All providers use the same prompt templates. Tool definitions are automatically translated to each provider's native format.

---

## License

MIT
