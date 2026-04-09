# Job Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension + MCP server that automatically logs Greenhouse job applications to a Notion database, with 7 MCP tools accessible via Claude Desktop (stdio) and the extension (HTTP/SSE).

**Architecture:** The MCP server is the single source of truth — all Notion operations flow through it. It runs two transports simultaneously: stdio for Claude Desktop, HTTP/SSE for the Chrome extension. `log_application` writes to Notion immediately and enriches asynchronously via Gemini Flash.

**Tech Stack:** Node.js 20+, TypeScript (ES modules), `@modelcontextprotocol/sdk`, Hono (HTTP transport), `@notionhq/client`, Gemini Flash via `@google/generative-ai`, React 18, Vite + CRXJS (Chrome extension), Vitest (tests)

---

## File Map

### MCP Server (`/mcp-server`)

| File | Responsibility |
|---|---|
| `src/index.ts` | Entry point — starts both transports, loads env |
| `src/server.ts` | Creates MCP `Server` instance, registers all 7 tools |
| `src/notion/schema.ts` | DB field name constants, status/type enums |
| `src/notion/client.ts` | Thin wrapper around `@notionhq/client` — CRUD ops |
| `src/gemini/client.ts` | Gemini Flash API wrapper |
| `src/gemini/prompts.ts` | Prompt templates for enrichment + prep page |
| `src/tools/log-application.ts` | `log_application` tool handler |
| `src/tools/update-status.ts` | `update_status` tool handler |
| `src/tools/get-applications.ts` | `get_applications` tool handler |
| `src/tools/create-prep-page.ts` | `create_prep_page` tool handler |
| `src/tools/append-notes.ts` | `append_notes` tool handler |
| `src/tools/search-jobs.ts` | `search_jobs` tool handler |
| `src/tools/delete-application.ts` | `delete_application` tool handler |
| `src/transports/stdio.ts` | Stdio transport setup |
| `src/transports/http.ts` | Hono HTTP/SSE transport + auth middleware |
| `tests/notion/client.test.ts` | Notion client unit tests (mocked) |
| `tests/tools/*.test.ts` | Tool handler unit tests (mocked Notion + Gemini) |

### Chrome Extension (`/extension`)

| File | Responsibility |
|---|---|
| `src/manifest.json` | MV3 manifest — permissions, content scripts, service worker |
| `src/content/greenhouse.ts` | Detects submission, scrapes JD, stores to `chrome.storage.session` |
| `src/background/service-worker.ts` | Receives JOB_APPLIED message, calls MCP HTTP endpoint |
| `src/shared/types.ts` | Shared TypeScript types (Job, Status, JobType, etc.) |
| `src/shared/mcp-client.ts` | Typed fetch wrapper for MCP HTTP calls |
| `src/popup/App.tsx` | Popup root — recent apps list + settings |
| `src/popup/main.tsx` | React entry point |

---

## Task 1: MCP Server — Project Scaffold

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/.env.example`
- Create: `mcp-server/src/index.ts` (stub)

- [ ] **Step 1: Create the mcp-server directory and package.json**

```bash
mkdir -p mcp-server/src/tools mcp-server/src/notion mcp-server/src/gemini mcp-server/src/transports mcp-server/tests/tools mcp-server/tests/notion
cd mcp-server
```

```json
// package.json
{
  "name": "job-tracker-mcp",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@notionhq/client": "^2.2.15",
    "@google/generative-ai": "^0.21.0",
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "zod": "^3.23.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .env.example**

```bash
# .env.example
NOTION_TOKEN=              # Notion integration secret
NOTION_DATABASE_ID=        # Target jobs database ID (set after running setup script)
NOTION_PREP_DB_ID=         # Prep Pages database ID (set after running setup script)
NOTION_PARENT_PAGE_ID=     # Notion page ID to create the databases under (needed for setup script only)
GEMINI_API_KEY=            # Free tier Gemini key
PORT=3000
MCP_SECRET=                # Shared secret for HTTP endpoint auth
```

- [ ] **Step 4: Create stub src/index.ts**

```typescript
// src/index.ts
import 'dotenv/config'

const requiredEnv = ['NOTION_TOKEN', 'NOTION_DATABASE_ID', 'GEMINI_API_KEY', 'MCP_SECRET']
for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`)
}

console.log('Job Tracker MCP Server starting...')
```

- [ ] **Step 5: Install dependencies and verify**

```bash
cd mcp-server && npm install
npx tsx src/index.ts
```

Expected: `Job Tracker MCP Server starting...`

- [ ] **Step 6: Commit**

```bash
git add mcp-server/
git commit -m "chore: scaffold mcp-server project"
```

### ✅ Manual Verification

```bash
# Verify directory structure
ls mcp-server/src/
# Expected: index.ts  gemini/  notion/  tools/  transports/

# Verify deps installed + startup
cd mcp-server && npx tsx src/index.ts
# Expected: Error: Missing required env var: NOTION_TOKEN
# (Correct — .env not set yet. Confirms tsx, dotenv, and env-check all work.)
```

---

## Task 2: Notion Schema Constants + DB Setup

**Files:**
- Create: `mcp-server/src/notion/schema.ts`
- Create: `mcp-server/scripts/setup-notion-db.ts`

- [ ] **Step 1: Write schema.ts with all field name constants**

```typescript
// src/notion/schema.ts
export const DB_FIELDS = {
  COMPANY: 'Company',
  ROLE: 'Role',
  STATUS: 'Status',
  APPLIED_DATE: 'Applied Date',
  JOB_URL: 'Job URL',
  LOCATION: 'Location',
  SALARY_RANGE: 'Salary Range',
  SOURCE_PLATFORM: 'Source Platform',
  JOB_TYPE: 'Job Type',
  SENIORITY: 'Seniority',
  ENRICHED: 'Enriched',
  RECRUITER_CONTACT: 'Recruiter Contact',
  INTERVIEW_DATES: 'Interview Dates',
  GMAIL_THREAD_ID: 'Gmail Thread ID',
  NOTES: 'Notes',
  PREP_PAGE: 'Prep Page',
} as const

export const STATUS_OPTIONS = ['Applied', 'OA', 'Interview', 'Offer', 'Rejected'] as const
export type Status = typeof STATUS_OPTIONS[number]

export const JOB_TYPE_OPTIONS = ['Backend', 'Frontend', 'Fullstack', 'Infra', 'ML', 'Other'] as const
export type JobType = typeof JOB_TYPE_OPTIONS[number]

export const SENIORITY_OPTIONS = ['Intern', 'Junior', 'Mid', 'Senior', 'Staff'] as const
export type Seniority = typeof SENIORITY_OPTIONS[number]

export const SOURCE_OPTIONS = ['greenhouse', 'linkedin', 'lever', 'workday'] as const
export type Source = typeof SOURCE_OPTIONS[number]
```

- [ ] **Step 2: Write setup-notion-db.ts script**

This script creates both the Jobs database and the Prep Pages database in Notion. Run it once before starting development.

```typescript
// scripts/setup-notion-db.ts
import 'dotenv/config'
import { Client } from '@notionhq/client'
import { DB_FIELDS, STATUS_OPTIONS, JOB_TYPE_OPTIONS, SENIORITY_OPTIONS, SOURCE_OPTIONS } from '../src/notion/schema.js'

const notion = new Client({ auth: process.env.NOTION_TOKEN! })
const parentPageId = process.env.NOTION_PARENT_PAGE_ID!

async function main() {
  // 1. Create Prep Pages DB first (needed for relation)
  const prepDb = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: 'Job Prep Pages' } }],
    properties: {
      'Name': { title: {} },
      'Job': { rich_text: {} },
    }
  })
  console.log('Prep Pages DB created:', prepDb.id)

  // 2. Create Jobs DB with relation to Prep Pages DB
  const jobsDb = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: 'Job Applications' } }],
    properties: {
      [DB_FIELDS.COMPANY]: { title: {} },
      [DB_FIELDS.ROLE]: { rich_text: {} },
      [DB_FIELDS.STATUS]: { select: { options: STATUS_OPTIONS.map(n => ({ name: n })) } },
      [DB_FIELDS.APPLIED_DATE]: { date: {} },
      [DB_FIELDS.JOB_URL]: { url: {} },
      [DB_FIELDS.LOCATION]: { rich_text: {} },
      [DB_FIELDS.SALARY_RANGE]: { rich_text: {} },
      [DB_FIELDS.SOURCE_PLATFORM]: { select: { options: SOURCE_OPTIONS.map(n => ({ name: n })) } },
      [DB_FIELDS.JOB_TYPE]: { select: { options: JOB_TYPE_OPTIONS.map(n => ({ name: n })) } },
      [DB_FIELDS.SENIORITY]: { select: { options: SENIORITY_OPTIONS.map(n => ({ name: n })) } },
      [DB_FIELDS.ENRICHED]: { checkbox: {} },
      [DB_FIELDS.RECRUITER_CONTACT]: { rich_text: {} },
      [DB_FIELDS.INTERVIEW_DATES]: { date: {} },
      [DB_FIELDS.GMAIL_THREAD_ID]: { rich_text: {} },
      [DB_FIELDS.NOTES]: { rich_text: {} },
      [DB_FIELDS.PREP_PAGE]: { relation: { database_id: prepDb.id, single_property: {} } },
    }
  })
  console.log('Jobs DB created:', jobsDb.id)
  console.log('\nAdd to .env:')
  console.log(`NOTION_DATABASE_ID=${jobsDb.id}`)
  console.log(`NOTION_PREP_DB_ID=${prepDb.id}`)
}

main().catch(console.error)
```

- [ ] **Step 3: Run setup script (requires NOTION_PARENT_PAGE_ID in .env)**

```bash
NOTION_PARENT_PAGE_ID=<your-notion-page-id> npx tsx scripts/setup-notion-db.ts
```

Expected output:
```
Prep Pages DB created: <uuid>
Jobs DB created: <uuid>

Add to .env:
NOTION_DATABASE_ID=<uuid>
NOTION_PREP_DB_ID=<uuid>
```

Copy the IDs into `.env`.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/notion/schema.ts mcp-server/scripts/
git commit -m "feat: notion schema constants and db setup script"
```

### ✅ Manual Verification

```bash
# Verify schema compiles with no type errors
cd mcp-server && npx tsc --noEmit
# Expected: no output (clean)

# Verify setup script is runnable (will error on missing env — that's fine)
cd mcp-server && npx tsx scripts/setup-notion-db.ts 2>&1 | head -3
# Expected: error about missing NOTION_PARENT_PAGE_ID or NOTION_TOKEN
```

After running the setup script with real creds (`NOTION_PARENT_PAGE_ID=<id> npx tsx scripts/setup-notion-db.ts`):
- Open Notion → confirm "Job Applications" and "Job Prep Pages" databases appear under your parent page
- Check "Job Applications" columns: Company (title), Role, Status (select with Applied/OA/Interview/Offer/Rejected), Applied Date, Job URL, Source Platform, Enriched (checkbox)
- Copy the two printed DB IDs into your `.env` file

---

## Task 3: Notion Client Wrapper

**Files:**
- Create: `mcp-server/src/notion/client.ts`
- Create: `mcp-server/tests/notion/client.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/notion/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotionClient } from '../../src/notion/client.js'

const mockCreate = vi.fn()
const mockQuery = vi.fn()
const mockUpdate = vi.fn()
const mockRetrieve = vi.fn()
const mockAppend = vi.fn()

vi.mock('@notionhq/client', () => ({
  Client: vi.fn(() => ({
    pages: { create: mockCreate, update: mockUpdate, retrieve: mockRetrieve },
    databases: { query: mockQuery },
    blocks: { children: { append: mockAppend } },
  }))
}))

describe('NotionClient', () => {
  let client: NotionClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new NotionClient('fake-token', 'db-id', 'prep-db-id')
  })

  it('findByUrl returns null when no results', async () => {
    mockQuery.mockResolvedValue({ results: [] })
    const result = await client.findByUrl('https://example.com/job')
    expect(result).toBeNull()
  })

  it('findByUrl returns page id when found', async () => {
    mockQuery.mockResolvedValue({ results: [{ id: 'page-123' }] })
    const result = await client.findByUrl('https://example.com/job')
    expect(result).toBe('page-123')
  })

  it('createJob returns new page id', async () => {
    mockCreate.mockResolvedValue({ id: 'new-page-id', url: 'https://notion.so/new-page-id' })
    const id = await client.createJob({
      company: 'Stripe', role: 'SWE', url: 'https://job.url',
      jdText: 'Some JD', sourcePlatform: 'greenhouse',
    })
    expect(id).toEqual({ jobId: 'new-page-id', notionUrl: 'https://notion.so/new-page-id' })
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('updateStatus calls pages.update with correct args', async () => {
    mockUpdate.mockResolvedValue({})
    await client.updateStatus('page-id', 'Interview')
    expect(mockUpdate).toHaveBeenCalledWith({
      page_id: 'page-id',
      properties: { Status: { select: { name: 'Interview' } } }
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mcp-server && npx vitest run tests/notion/client.test.ts
```

Expected: FAIL — `Cannot find module '../../src/notion/client.js'`

- [ ] **Step 3: Implement NotionClient**

```typescript
// src/notion/client.ts
import { Client } from '@notionhq/client'
import { DB_FIELDS, type Status, type JobType, type Seniority, type Source } from './schema.js'

export interface CreateJobInput {
  company: string
  role: string
  url: string
  jdText: string
  sourcePlatform: Source
  location?: string
  salaryRange?: string
}

export interface JobRow {
  jobId: string
  notionUrl: string
  company: string
  role: string
  status: Status
  appliedDate: string
  jobUrl: string
  location: string
  salaryRange: string
  sourcePlatform: string
  jobType: string
  seniority: string
  enriched: boolean
  notes: string
}

export class NotionClient {
  private client: Client
  private dbId: string
  private prepDbId: string

  constructor(token: string, dbId: string, prepDbId: string) {
    this.client = new Client({ auth: token })
    this.dbId = dbId
    this.prepDbId = prepDbId
  }

  async findByUrl(url: string): Promise<string | null> {
    const res = await this.client.databases.query({
      database_id: this.dbId,
      filter: { property: DB_FIELDS.JOB_URL, url: { equals: url } }
    })
    return res.results[0]?.id ?? null
  }

  async createJob(input: CreateJobInput): Promise<{ jobId: string; notionUrl: string }> {
    const page = await this.client.pages.create({
      parent: { database_id: this.dbId },
      properties: {
        [DB_FIELDS.COMPANY]: { title: [{ text: { content: input.company } }] },
        [DB_FIELDS.ROLE]: { rich_text: [{ text: { content: input.role } }] },
        [DB_FIELDS.STATUS]: { select: { name: 'Applied' } },
        [DB_FIELDS.APPLIED_DATE]: { date: { start: new Date().toISOString().split('T')[0] } },
        [DB_FIELDS.JOB_URL]: { url: input.url },
        [DB_FIELDS.SOURCE_PLATFORM]: { select: { name: input.sourcePlatform } },
        [DB_FIELDS.ENRICHED]: { checkbox: false },
        ...(input.location ? { [DB_FIELDS.LOCATION]: { rich_text: [{ text: { content: input.location } }] } } : {}),
        ...(input.salaryRange ? { [DB_FIELDS.SALARY_RANGE]: { rich_text: [{ text: { content: input.salaryRange } }] } } : {}),
      }
    }) as { id: string; url: string }
    return { jobId: page.id, notionUrl: page.url }
  }

  async updateStatus(jobId: string, status: Status): Promise<void> {
    await this.client.pages.update({
      page_id: jobId,
      properties: { [DB_FIELDS.STATUS]: { select: { name: status } } }
    })
  }

  async enrichJob(jobId: string, enrichment: { jobType: JobType; seniority: Seniority; summary: string[] }): Promise<void> {
    await this.client.pages.update({
      page_id: jobId,
      properties: {
        [DB_FIELDS.JOB_TYPE]: { select: { name: enrichment.jobType } },
        [DB_FIELDS.SENIORITY]: { select: { name: enrichment.seniority } },
        [DB_FIELDS.ENRICHED]: { checkbox: true },
      }
    })
    // Append summary bullets to page body in chunks of 100
    const bullets = enrichment.summary.map(line => ({
      type: 'bulleted_list_item' as const,
      bulleted_list_item: { rich_text: [{ text: { content: line } }] }
    }))
    for (let i = 0; i < bullets.length; i += 100) {
      await this.client.blocks.children.append({
        block_id: jobId,
        children: bullets.slice(i, i + 100)
      })
    }
  }

  async appendJdText(jobId: string, jdText: string): Promise<void> {
    const chunks = jdText.match(/.{1,2000}/gs) ?? []
    const blocks = chunks.map(chunk => ({
      type: 'paragraph' as const,
      paragraph: { rich_text: [{ text: { content: chunk } }] }
    }))
    for (let i = 0; i < blocks.length; i += 100) {
      await this.client.blocks.children.append({ block_id: jobId, children: blocks.slice(i, i + 100) })
    }
  }

  async queryJobs(filters: { status?: Status; jobType?: JobType; company?: string; limit?: number }): Promise<JobRow[]> {
    const andFilters: unknown[] = []
    if (filters.status) andFilters.push({ property: DB_FIELDS.STATUS, select: { equals: filters.status } })
    if (filters.jobType) andFilters.push({ property: DB_FIELDS.JOB_TYPE, select: { equals: filters.jobType } })
    if (filters.company) andFilters.push({ property: DB_FIELDS.COMPANY, title: { contains: filters.company } })

    const res = await this.client.databases.query({
      database_id: this.dbId,
      filter: andFilters.length > 0 ? (andFilters.length === 1 ? andFilters[0] as never : { and: andFilters }) : undefined,
      page_size: filters.limit ?? 20,
    })
    return res.results.map(page => this.pageToJobRow(page as never))
  }

  async searchJobs(query: string): Promise<JobRow[]> {
    const [byCompany, byRole, byNotes] = await Promise.all([
      this.client.databases.query({ database_id: this.dbId, filter: { property: DB_FIELDS.COMPANY, title: { contains: query } }, page_size: 20 }),
      this.client.databases.query({ database_id: this.dbId, filter: { property: DB_FIELDS.ROLE, rich_text: { contains: query } }, page_size: 20 }),
      this.client.databases.query({ database_id: this.dbId, filter: { property: DB_FIELDS.NOTES, rich_text: { contains: query } }, page_size: 20 }),
    ])
    const seen = new Set<string>()
    const results: JobRow[] = []
    for (const page of [...byCompany.results, ...byRole.results, ...byNotes.results]) {
      if (!seen.has(page.id)) {
        seen.add(page.id)
        results.push(this.pageToJobRow(page as never))
      }
    }
    return results.slice(0, 20)
  }

  async appendNote(jobId: string, note: string): Promise<void> {
    const timestamp = new Date().toISOString()
    // Fetch existing notes first to avoid overwriting them
    const page = await this.client.pages.retrieve({ page_id: jobId }) as Record<string, unknown>
    const props = page.properties as Record<string, { rich_text?: Array<{ plain_text: string }> }>
    const existing = props[DB_FIELDS.NOTES]?.rich_text?.[0]?.plain_text ?? ''
    const updated = existing ? `${existing}\n[${timestamp}] ${note}` : `[${timestamp}] ${note}`
    await this.client.pages.update({
      page_id: jobId,
      properties: {
        [DB_FIELDS.NOTES]: { rich_text: [{ text: { content: updated.slice(0, 2000) } }] }
      }
    })
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.client.pages.update({ page_id: jobId, archived: true })
  }

  async getJobPage(jobId: string): Promise<{ row: JobRow; jdText: string }> {
    const [page, blocks] = await Promise.all([
      this.client.pages.retrieve({ page_id: jobId }),
      this.client.blocks.children.list({ block_id: jobId, page_size: 100 })
    ])
    const row = this.pageToJobRow(page as never)
    // Extract text from paragraph blocks (JD is stored as paragraphs in appendJdText)
    const jdText = (blocks.results as Array<{ type: string; paragraph?: { rich_text: Array<{ plain_text: string }> } }>)
      .filter(b => b.type === 'paragraph')
      .map(b => b.paragraph?.rich_text.map(t => t.plain_text).join('') ?? '')
      .join('\n')
    return { row, jdText }
  }

  async createPrepPage(jobId: string, jobTitle: string, content: string): Promise<string> {
    const page = await this.client.pages.create({
      parent: { database_id: this.prepDbId },
      properties: {
        Name: { title: [{ text: { content: `Interview Prep — ${jobTitle}` } }] },
        Job: { rich_text: [{ text: { content: jobId } }] },
      }
    }) as { id: string }
    // Link relation on job row
    await this.client.pages.update({
      page_id: jobId,
      properties: { [DB_FIELDS.PREP_PAGE]: { relation: [{ id: page.id }] } }
    })
    return page.id
  }

  private pageToJobRow(page: Record<string, unknown>): JobRow {
    const props = page.properties as Record<string, { type: string; [key: string]: unknown }>
    const getText = (p: unknown) => {
      const prop = p as { rich_text?: Array<{ plain_text: string }>; title?: Array<{ plain_text: string }> }
      return (prop?.rich_text?.[0]?.plain_text ?? prop?.title?.[0]?.plain_text ?? '') as string
    }
    const getSelect = (p: unknown) => ((p as { select?: { name: string } })?.select?.name ?? '') as string
    return {
      jobId: page.id as string,
      notionUrl: (page as { url: string }).url,
      company: getText(props[DB_FIELDS.COMPANY]),
      role: getText(props[DB_FIELDS.ROLE]),
      status: getSelect(props[DB_FIELDS.STATUS]) as Status,
      appliedDate: (props[DB_FIELDS.APPLIED_DATE] as { date?: { start: string } })?.date?.start ?? '',
      jobUrl: (props[DB_FIELDS.JOB_URL] as { url?: string })?.url ?? '',
      location: getText(props[DB_FIELDS.LOCATION]),
      salaryRange: getText(props[DB_FIELDS.SALARY_RANGE]),
      sourcePlatform: getSelect(props[DB_FIELDS.SOURCE_PLATFORM]),
      jobType: getSelect(props[DB_FIELDS.JOB_TYPE]),
      seniority: getSelect(props[DB_FIELDS.SENIORITY]),
      enriched: (props[DB_FIELDS.ENRICHED] as { checkbox?: boolean })?.checkbox ?? false,
      notes: getText(props[DB_FIELDS.NOTES]),
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp-server && npx vitest run tests/notion/client.test.ts
```

Expected: `PASS tests/notion/client.test.ts (4 tests)`

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/notion/ mcp-server/tests/notion/
git commit -m "feat: notion client wrapper with CRUD operations"
```

### ✅ Manual Verification

```bash
# Run unit tests (mocked — no real Notion calls)
cd mcp-server && npx vitest run tests/notion/client.test.ts
# Expected: PASS (4 tests)

# Optional live smoke test against real Notion (requires .env populated from Task 2)
cd mcp-server && npx tsx --input-type=module << 'EOF'
import 'dotenv/config'
import { NotionClient } from './src/notion/client.js'
const c = new NotionClient(process.env.NOTION_TOKEN, process.env.NOTION_DATABASE_ID, process.env.NOTION_PREP_DB_ID)
const result = await c.findByUrl('https://nonexistent.example.com/job')
console.log('findByUrl (no match):', result)  // Expected: null
EOF
```

---

## Task 4: `log_application` Tool (stdio, synchronous write)

**Files:**
- Create: `mcp-server/src/tools/log-application.ts`
- Create: `mcp-server/tests/tools/log-application.test.ts`
- Create: `mcp-server/src/server.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/log-application.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleLogApplication } from '../../src/tools/log-application.js'
import type { NotionClient } from '../../src/notion/client.js'

const mockNotion = {
  findByUrl: vi.fn(),
  createJob: vi.fn(),
  appendJdText: vi.fn(),
} as unknown as NotionClient

describe('handleLogApplication', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a job and returns logged status', async () => {
    mockNotion.findByUrl = vi.fn().mockResolvedValue(null)
    mockNotion.createJob = vi.fn().mockResolvedValue({ jobId: 'page-123', notionUrl: 'https://notion.so/page-123' })
    mockNotion.appendJdText = vi.fn().mockResolvedValue(undefined)

    const result = await handleLogApplication(mockNotion, {
      company: 'Stripe', role: 'SWE', url: 'https://job.url',
      jd_text: 'Job description here', source_platform: 'greenhouse'
    })

    expect(result.status).toBe('logged')
    expect(result.job_id).toBe('page-123')
    expect(mockNotion.createJob).toHaveBeenCalledOnce()
    expect(mockNotion.appendJdText).toHaveBeenCalledWith('page-123', 'Job description here')
  })

  it('returns duplicate status when URL already exists', async () => {
    mockNotion.findByUrl = vi.fn().mockResolvedValue('existing-page-id')

    const result = await handleLogApplication(mockNotion, {
      company: 'Stripe', role: 'SWE', url: 'https://job.url',
      jd_text: 'JD', source_platform: 'greenhouse'
    })

    expect(result.status).toBe('duplicate')
    expect(result.job_id).toBe('existing-page-id')
    expect(mockNotion.createJob).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mcp-server && npx vitest run tests/tools/log-application.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement the tool handler**

```typescript
// src/tools/log-application.ts
import type { NotionClient } from '../notion/client.js'
import type { Source } from '../notion/schema.js'

export interface LogApplicationArgs {
  company: string
  role: string
  url: string
  jd_text: string
  source_platform: Source
  location?: string
  salary_range?: string
}

export interface LogApplicationResult {
  job_id: string
  notion_url?: string
  status: 'logged' | 'duplicate'
}

export async function handleLogApplication(
  notion: NotionClient,
  args: LogApplicationArgs
): Promise<LogApplicationResult> {
  const existing = await notion.findByUrl(args.url)
  if (existing) {
    return { job_id: existing, status: 'duplicate' }
  }

  const { jobId, notionUrl } = await notion.createJob({
    company: args.company,
    role: args.role,
    url: args.url,
    jdText: args.jd_text,
    sourcePlatform: args.source_platform,
    location: args.location,
    salaryRange: args.salary_range,
  })

  // Append raw JD to page body (non-blocking)
  await notion.appendJdText(jobId, args.jd_text)

  return { job_id: jobId, notion_url: notionUrl, status: 'logged' }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp-server && npx vitest run tests/tools/log-application.test.ts
```

Expected: `PASS tests/tools/log-application.test.ts (2 tests)`

- [ ] **Step 5: Create server.ts with MCP Server and first tool registered**

```typescript
// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { NotionClient } from './notion/client.js'
import { handleLogApplication } from './tools/log-application.js'
import { STATUS_OPTIONS, SOURCE_OPTIONS } from './notion/schema.js'

export function createMcpServer(notion: NotionClient) {
  const server = new McpServer({ name: 'job-tracker', version: '0.1.0' })

  server.tool('log_application',
    'Log a new job application to Notion. Use when a user has applied to a job.',
    {
      company: z.string().describe('Company name'),
      role: z.string().describe('Job title / role'),
      url: z.string().url().describe('URL of the job posting'),
      jd_text: z.string().describe('Full job description text'),
      source_platform: z.enum(SOURCE_OPTIONS).describe('Platform where the job was found'),
      location: z.string().optional().describe('Job location'),
      salary_range: z.string().optional().describe('Salary range if listed'),
    },
    async ({ company, role, url, jd_text, source_platform, location, salary_range }) => {
      const result = await handleLogApplication(notion, { company, role, url, jd_text, source_platform, location, salary_range })
      return {
        content: [{
          type: 'text',
          text: result.status === 'logged'
            ? `✓ Logged: ${company} — ${role}\nNotion: ${result.notion_url}\nID: ${result.job_id}`
            : `Already logged: ${company} — ${role} (ID: ${result.job_id})`
        }]
      }
    }
  )

  return server
}
```

- [ ] **Step 6: Update src/index.ts to wire stdio transport**

```typescript
// src/index.ts
import 'dotenv/config'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { NotionClient } from './notion/client.js'
import { createMcpServer } from './server.js'

const requiredEnv = ['NOTION_TOKEN', 'NOTION_DATABASE_ID', 'NOTION_PREP_DB_ID', 'GEMINI_API_KEY', 'MCP_SECRET']
for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`)
}

const notion = new NotionClient(
  process.env.NOTION_TOKEN!,
  process.env.NOTION_DATABASE_ID!,
  process.env.NOTION_PREP_DB_ID!
)

const server = createMcpServer(notion)
const transport = new StdioServerTransport()
await server.connect(transport)
```

- [ ] **Step 7: Configure Claude Desktop**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "job-tracker": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-server/src/index.ts"],
      "env": {
        "NOTION_TOKEN": "...",
        "NOTION_DATABASE_ID": "...",
        "NOTION_PREP_DB_ID": "...",
        "GEMINI_API_KEY": "...",
        "MCP_SECRET": "...",
        "PORT": "3000"
      }
    }
  }
}
```

Restart Claude Desktop. Ask it: *"Log a test job: company Stripe, role SWE Backend, url https://example.com/job, source greenhouse, jd_text 'We are looking for a backend engineer...'"*

Expected: Row appears in Notion Jobs database.

- [ ] **Step 8: Commit**

```bash
git add mcp-server/src/ mcp-server/tests/
git commit -m "feat: log_application tool with stdio transport"
```

### ✅ Manual Verification

```bash
# Run unit tests
cd mcp-server && npx vitest run tests/tools/log-application.test.ts
# Expected: PASS (2 tests)

# TypeScript check
cd mcp-server && npx tsc --noEmit
# Expected: no errors
```

**Via Claude Desktop** (requires `.env` populated and server registered in `claude_desktop_config.json`):
1. Restart Claude Desktop after updating the config
2. Ask: *"Log a test job: company=Stripe, role=Backend SWE, url=https://stripe.com/jobs/test-123, source=greenhouse, jd_text='We are looking for a backend engineer with Python experience.'"*
   - Expected: `✓ Logged: Stripe — Backend SWE`
3. Open Notion Jobs database → verify the row exists with Company=Stripe, Role=Backend SWE, Status=Applied, Source=greenhouse
4. Ask the same question again (same URL) → Expected: `Already logged: Stripe — Backend SWE (ID: ...)` (duplicate detection works)

---

## Task 5: HTTP/SSE Transport + Shared Secret Auth

**Files:**
- Create: `mcp-server/src/transports/http.ts`
- Modify: `mcp-server/src/index.ts`

- [ ] **Step 1: Implement HTTP transport with Hono**

```typescript
// src/transports/http.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function startHttpTransport(server: McpServer, port: number, secret: string) {
  const app = new Hono()

  // Auth middleware
  app.use('/mcp', async (c, next) => {
    const auth = c.req.header('Authorization')
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

  app.post('/mcp', async (c) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    const body = await c.req.json()
    const res = await transport.handleRequest(body, Object.fromEntries(c.req.raw.headers))
    return c.json(res)
  })

  serve({ fetch: app.fetch, port }, () => {
    console.error(`HTTP transport listening on port ${port}`)
  })
}
```

- [ ] **Step 2: Update index.ts to start both transports**

```typescript
// src/index.ts
import 'dotenv/config'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { NotionClient } from './notion/client.js'
import { createMcpServer } from './server.js'
import { startHttpTransport } from './transports/http.js'

const requiredEnv = ['NOTION_TOKEN', 'NOTION_DATABASE_ID', 'NOTION_PREP_DB_ID', 'GEMINI_API_KEY', 'MCP_SECRET']
for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`)
}

const notion = new NotionClient(
  process.env.NOTION_TOKEN!,
  process.env.NOTION_DATABASE_ID!,
  process.env.NOTION_PREP_DB_ID!
)

const server = createMcpServer(notion)

// Start HTTP transport (non-blocking)
startHttpTransport(server, Number(process.env.PORT ?? 3000), process.env.MCP_SECRET!)

// Start stdio transport (connects to Claude Desktop)
const transport = new StdioServerTransport()
await server.connect(transport)
```

- [ ] **Step 3: Test HTTP transport with curl**

```bash
cd mcp-server && npm run dev
```

In another terminal:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"log_application","arguments":{"company":"TestCo","role":"Engineer","url":"https://test.com/job/123","jd_text":"Build things","source_platform":"greenhouse"}}}'
```

Expected: JSON response with `job_id` and `status: "logged"`. Row appears in Notion.

- [ ] **Step 4: Verify 401 on missing/wrong secret**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: `{"error":"Unauthorized"}` with HTTP 401.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/transports/ mcp-server/src/index.ts
git commit -m "feat: HTTP/SSE transport with Bearer token auth"
```

### ✅ Manual Verification

```bash
# Start server (keep running in this terminal)
cd mcp-server && npm run dev
# Expected: "HTTP transport listening on port 3000"

# Test successful log via HTTP (replace YOUR_SECRET with value from .env)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"log_application","arguments":{"company":"TestCo","role":"Engineer","url":"https://testco.com/jobs/456","jd_text":"Build great things","source_platform":"greenhouse"}}}'
# Expected: JSON response with content[0].text containing "✓ Logged: TestCo — Engineer"

# Verify 401 on missing Authorization header
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# Expected: 401

# Verify 401 on wrong secret
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong-secret" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# Expected: 401
```

Open Notion → confirm the TestCo row was created.

---

## Task 6: Async Gemini Enrichment

**Files:**
- Create: `mcp-server/src/gemini/client.ts`
- Create: `mcp-server/src/gemini/prompts.ts`
- Create: `mcp-server/tests/tools/log-application-enrichment.test.ts`
- Modify: `mcp-server/src/tools/log-application.ts`

- [ ] **Step 1: Write Gemini client**

```typescript
// src/gemini/client.ts
import { GoogleGenerativeAI } from '@google/generative-ai'

export class GeminiClient {
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey)
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
  }

  async generate(prompt: string): Promise<string> {
    const result = await this.model.generateContent(prompt)
    return result.response.text()
  }
}
```

- [ ] **Step 2: Write enrichment prompt templates**

```typescript
// src/gemini/prompts.ts
export function enrichmentPrompt(jdText: string): string {
  return `Analyze this job description and respond with ONLY valid JSON (no markdown, no explanation):

{
  "jobType": "<Backend|Frontend|Fullstack|Infra|ML|Other>",
  "seniority": "<Intern|Junior|Mid|Senior|Staff>",
  "summary": ["<bullet 1>", "<bullet 2>", "<bullet 3>"]
}

Rules:
- summary: exactly 3-5 bullets, each under 100 chars, covering key requirements
- jobType/seniority: pick the single best match

Job description:
${jdText.slice(0, 4000)}`
}

export function prepPagePrompt(company: string, role: string, jobType: string, jdText: string): string {
  return `Create interview prep for this job. Respond with ONLY valid JSON (no markdown):

{
  "behavioral": ["<question 1>", "<question 2>", "<question 3>"],
  "technical": ["<question 1>", "<question 2>", "<question 3>"],
  "systemDesign": ["<question 1>", "<question 2>"],
  "studyTopics": ["<topic 1>", "<topic 2>", "<topic 3>", "<topic 4>"],
  "companyResearch": ["<thing to research 1>", "<thing to research 2>"]
}

Company: ${company}
Role: ${role}
Type: ${jobType}

Job description (excerpt):
${jdText.slice(0, 3000)}`
}
```

- [ ] **Step 3: Write failing test for enrichment**

```typescript
// tests/tools/log-application-enrichment.test.ts
import { describe, it, expect, vi } from 'vitest'
import { enrichAsync } from '../../src/tools/log-application.js'
import type { NotionClient } from '../../src/notion/client.js'
import type { GeminiClient } from '../../src/gemini/client.js'

describe('enrichAsync', () => {
  it('calls gemini and patches notion row', async () => {
    const mockGemini = {
      generate: vi.fn().mockResolvedValue(JSON.stringify({
        jobType: 'Backend',
        seniority: 'Senior',
        summary: ['Build APIs', 'Work with Postgres', 'Lead small team']
      }))
    } as unknown as GeminiClient

    const mockNotion = {
      enrichJob: vi.fn().mockResolvedValue(undefined)
    } as unknown as NotionClient

    await enrichAsync(mockNotion, mockGemini, 'page-123', 'We need a backend engineer...')

    expect(mockGemini.generate).toHaveBeenCalledOnce()
    expect(mockNotion.enrichJob).toHaveBeenCalledWith('page-123', {
      jobType: 'Backend',
      seniority: 'Senior',
      summary: ['Build APIs', 'Work with Postgres', 'Lead small team']
    })
  })

  it('does not throw when gemini fails', async () => {
    const mockGemini = { generate: vi.fn().mockRejectedValue(new Error('API error')) } as unknown as GeminiClient
    const mockNotion = { enrichJob: vi.fn() } as unknown as NotionClient
    // Should not throw
    await expect(enrichAsync(mockNotion, mockGemini, 'page-id', 'JD text')).resolves.toBeUndefined()
    expect(mockNotion.enrichJob).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd mcp-server && npx vitest run tests/tools/log-application-enrichment.test.ts
```

Expected: FAIL

- [ ] **Step 5: Add enrichAsync to log-application.ts and update handleLogApplication**

```typescript
// Add to src/tools/log-application.ts
import type { GeminiClient } from '../gemini/client.js'
import { enrichmentPrompt } from '../gemini/prompts.js'
import type { JobType, Seniority } from '../notion/schema.js'

export async function enrichAsync(
  notion: NotionClient,
  gemini: GeminiClient,
  jobId: string,
  jdText: string
): Promise<void> {
  try {
    const raw = await gemini.generate(enrichmentPrompt(jdText))
    const parsed = JSON.parse(raw) as { jobType: JobType; seniority: Seniority; summary: string[] }
    await notion.enrichJob(jobId, parsed)
  } catch (err) {
    console.error(`[enrichAsync] failed for ${jobId}:`, err)
    // Silent failure — Enriched stays false
  }
}

// Update handleLogApplication to accept gemini and fire async enrichment
export async function handleLogApplication(
  notion: NotionClient,
  args: LogApplicationArgs,
  gemini?: GeminiClient
): Promise<LogApplicationResult> {
  const existing = await notion.findByUrl(args.url)
  if (existing) return { job_id: existing, status: 'duplicate' }

  const { jobId, notionUrl } = await notion.createJob({
    company: args.company, role: args.role, url: args.url,
    jdText: args.jd_text, sourcePlatform: args.source_platform,
    location: args.location, salaryRange: args.salary_range,
  })

  await notion.appendJdText(jobId, args.jd_text)

  // Fire-and-forget enrichment (does not block response)
  if (gemini) {
    void enrichAsync(notion, gemini, jobId, args.jd_text)
  }

  return { job_id: jobId, notion_url: notionUrl, status: 'logged' }
}
```

- [ ] **Step 6: Run all tests**

```bash
cd mcp-server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Update server.ts to pass GeminiClient to log_application tool**

In `src/server.ts`, import `GeminiClient` and thread it through `createMcpServer`:

```typescript
export function createMcpServer(notion: NotionClient, gemini: GeminiClient) {
  // ...
  // In the log_application handler, pass gemini:
  const result = await handleLogApplication(notion, { ... }, gemini)
}
```

Update `src/index.ts` to construct `GeminiClient` and pass it:

```typescript
import { GeminiClient } from './gemini/client.js'
const gemini = new GeminiClient(process.env.GEMINI_API_KEY!)
const server = createMcpServer(notion, gemini)
```

- [ ] **Step 8: Test end-to-end enrichment**

Start server, log a job via curl. Wait 2-3 seconds. Check Notion row — Job Type, Seniority, and Enriched checkbox should be filled in.

- [ ] **Step 9: Commit**

```bash
git add mcp-server/src/gemini/ mcp-server/src/tools/log-application.ts mcp-server/src/server.ts mcp-server/src/index.ts mcp-server/tests/
git commit -m "feat: async gemini enrichment on log_application"
```

### ✅ Manual Verification

```bash
# Run all tests
cd mcp-server && npx vitest run
# Expected: all tests pass (including enrichment tests)

# Start server
cd mcp-server && npm run dev
```

```bash
# In another terminal: log a job with a detailed JD
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"log_application","arguments":{"company":"Figma","role":"Senior Backend Engineer","url":"https://figma.com/jobs/sbe-001","jd_text":"We are looking for a Senior Backend Engineer to build scalable APIs. You will work with Postgres, Redis, and Node.js. 5+ years of experience with distributed systems required.","source_platform":"greenhouse"}}}'
# Response should be instant (enrichment is async)
```

- Wait 3–5 seconds, then open the Figma row in Notion
- Verify `Job Type` is filled (e.g., "Backend")
- Verify `Seniority` is filled (e.g., "Senior")
- Verify `Enriched` checkbox is ✓ checked
- Verify page body contains 3–5 bullet points summarizing the JD

---

## Task 7: Remaining MCP Tools (`update_status`, `append_notes`, `delete_application`, `get_applications`)

**Files:**
- Create: `mcp-server/src/tools/update-status.ts`
- Create: `mcp-server/src/tools/append-notes.ts`
- Create: `mcp-server/src/tools/delete-application.ts`
- Create: `mcp-server/src/tools/get-applications.ts`
- Modify: `mcp-server/src/server.ts`

- [ ] **Step 1: Implement all 4 tool handlers**

```typescript
// src/tools/update-status.ts
import type { NotionClient } from '../notion/client.js'
import type { Status } from '../notion/schema.js'

export async function handleUpdateStatus(notion: NotionClient, args: { job_id: string; status: Status }) {
  await notion.updateStatus(args.job_id, args.status)
  return { success: true, job_id: args.job_id, new_status: args.status }
}
```

```typescript
// src/tools/append-notes.ts
import type { NotionClient } from '../notion/client.js'

export async function handleAppendNotes(notion: NotionClient, args: { job_id: string; note: string }) {
  await notion.appendNote(args.job_id, args.note)
  return { success: true }
}
```

```typescript
// src/tools/delete-application.ts
import type { NotionClient } from '../notion/client.js'

export async function handleDeleteApplication(notion: NotionClient, args: { job_id: string }) {
  await notion.deleteJob(args.job_id)
  return { success: true, job_id: args.job_id }
}
```

```typescript
// src/tools/get-applications.ts
import type { NotionClient } from '../notion/client.js'
import type { Status, JobType } from '../notion/schema.js'

export async function handleGetApplications(
  notion: NotionClient,
  args: { status?: Status; job_type?: JobType; company?: string; limit?: number }
) {
  const jobs = await notion.queryJobs({ status: args.status, jobType: args.job_type, company: args.company, limit: args.limit })
  return { jobs, count: jobs.length }
}
```

- [ ] **Step 2: Write tests for all 4 handlers**

```typescript
// tests/tools/crud-tools.test.ts
import { describe, it, expect, vi } from 'vitest'
import { handleUpdateStatus } from '../../src/tools/update-status.js'
import { handleAppendNotes } from '../../src/tools/append-notes.js'
import { handleDeleteApplication } from '../../src/tools/delete-application.js'
import { handleGetApplications } from '../../src/tools/get-applications.js'
import type { NotionClient } from '../../src/notion/client.js'

const mockNotion = {
  updateStatus: vi.fn().mockResolvedValue(undefined),
  appendNote: vi.fn().mockResolvedValue(undefined),
  deleteJob: vi.fn().mockResolvedValue(undefined),
  queryJobs: vi.fn().mockResolvedValue([{ jobId: 'id-1', company: 'Stripe', role: 'SWE' }]),
} as unknown as NotionClient

describe('crud tools', () => {
  it('update_status returns success', async () => {
    const r = await handleUpdateStatus(mockNotion, { job_id: 'id-1', status: 'Interview' })
    expect(r.success).toBe(true)
    expect(mockNotion.updateStatus).toHaveBeenCalledWith('id-1', 'Interview')
  })

  it('append_notes calls appendNote', async () => {
    await handleAppendNotes(mockNotion, { job_id: 'id-1', note: 'Had first round' })
    expect(mockNotion.appendNote).toHaveBeenCalledWith('id-1', 'Had first round')
  })

  it('delete_application calls deleteJob', async () => {
    await handleDeleteApplication(mockNotion, { job_id: 'id-1' })
    expect(mockNotion.deleteJob).toHaveBeenCalledWith('id-1')
  })

  it('get_applications returns job list', async () => {
    const r = await handleGetApplications(mockNotion, { status: 'Applied' })
    expect(r.count).toBe(1)
    expect(r.jobs[0].company).toBe('Stripe')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd mcp-server && npx vitest run tests/tools/crud-tools.test.ts
```

Expected: `PASS (4 tests)`

- [ ] **Step 4: Register all 4 tools in server.ts**

Add to `createMcpServer` in `src/server.ts`:

```typescript
import { handleUpdateStatus } from './tools/update-status.js'
import { handleAppendNotes } from './tools/append-notes.js'
import { handleDeleteApplication } from './tools/delete-application.js'
import { handleGetApplications } from './tools/get-applications.js'
import { STATUS_OPTIONS, JOB_TYPE_OPTIONS } from './notion/schema.js'

server.tool('update_status',
  'Update the status of a job application. Use after receiving a response (OA, interview invite, rejection, offer).',
  { job_id: z.string().describe('Notion page ID from log_application or get_applications'), status: z.enum(STATUS_OPTIONS) },
  async ({ job_id, status }) => {
    const r = await handleUpdateStatus(notion, { job_id, status })
    return { content: [{ type: 'text', text: `✓ Status updated to ${r.new_status}` }] }
  }
)

server.tool('append_notes',
  'Add a note to a job application. Use to record interview feedback, recruiter conversations, or reminders.',
  { job_id: z.string(), note: z.string().describe('Note text to append (timestamped automatically)') },
  async ({ job_id, note }) => {
    await handleAppendNotes(notion, { job_id, note })
    return { content: [{ type: 'text', text: '✓ Note appended' }] }
  }
)

server.tool('delete_application',
  'Archive/delete a job application. Use to remove test entries or jobs no longer relevant.',
  { job_id: z.string() },
  async ({ job_id }) => {
    await handleDeleteApplication(notion, { job_id })
    return { content: [{ type: 'text', text: '✓ Application archived' }] }
  }
)

server.tool('get_applications',
  'List job applications with optional filters. Use for structured queries: "show me all Backend roles", "what has Applied status". For keyword search, use search_jobs instead.',
  {
    status: z.enum(STATUS_OPTIONS).optional(),
    job_type: z.enum(JOB_TYPE_OPTIONS).optional(),
    company: z.string().optional().describe('Partial company name match'),
    limit: z.number().optional().default(20),
  },
  async (args) => {
    const r = await handleGetApplications(notion, args)
    const text = r.jobs.map(j => `• ${j.company} — ${j.role} [${j.status}] (${j.jobId})`).join('\n')
    return { content: [{ type: 'text', text: `${r.count} application(s):\n${text}` }] }
  }
)
```

- [ ] **Step 5: Test via Claude Desktop**

Ask Claude Desktop:
- *"Show me all my job applications"*
- *"Update status of [job_id] to Interview"*
- *"Add note to [job_id]: Had a great screening call"*

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/ mcp-server/src/server.ts mcp-server/tests/tools/
git commit -m "feat: update_status, append_notes, delete_application, get_applications tools"
```

### ✅ Manual Verification

```bash
# Run tests
cd mcp-server && npx vitest run tests/tools/crud-tools.test.ts
# Expected: PASS (4 tests)
```

**Via Claude Desktop** (use a real `job_id` from a previously logged application):
- *"Show me all my job applications"* → should return a list of rows from Notion
- *"Show me all jobs with status Applied"* → should filter correctly
- *"Update the status of [job_id] to Interview"* → open Notion and confirm the Status column changed
- *"Add a note to [job_id]: First round went well, next step is technical screen"* → open Notion and confirm Notes field updated with timestamp
- *"Delete [job_id]"* → row should disappear from default Notion view (archived, not permanently deleted)

---

## Task 8: `search_jobs` Tool

**Files:**
- Create: `mcp-server/src/tools/search-jobs.ts`
- Create: `mcp-server/tests/tools/search-jobs.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/tools/search-jobs.test.ts
import { describe, it, expect, vi } from 'vitest'
import { handleSearchJobs } from '../../src/tools/search-jobs.js'
import type { NotionClient } from '../../src/notion/client.js'

describe('handleSearchJobs', () => {
  it('returns deduped results from notion search', async () => {
    const mockNotion = {
      searchJobs: vi.fn().mockResolvedValue([
        { jobId: 'a', company: 'Stripe', role: 'Backend SWE' },
        { jobId: 'b', company: 'Linear', role: 'SWE' },
      ])
    } as unknown as NotionClient

    const r = await handleSearchJobs(mockNotion, { query: 'Backend' })
    expect(r.jobs.length).toBe(2)
    expect(mockNotion.searchJobs).toHaveBeenCalledWith('Backend')
  })
})
```

- [ ] **Step 2: Implement**

```typescript
// src/tools/search-jobs.ts
import type { NotionClient } from '../notion/client.js'

export async function handleSearchJobs(notion: NotionClient, args: { query: string }) {
  const jobs = await notion.searchJobs(args.query)
  return { jobs, count: jobs.length }
}
```

- [ ] **Step 3: Register in server.ts**

```typescript
server.tool('search_jobs',
  'Free-text search across job applications. Use for open-ended queries like "jobs where I mentioned React" or "anything at a fintech". For filtering by status/type, use get_applications instead.',
  { query: z.string().describe('Search term — matches against company, role, and notes fields') },
  async ({ query }) => {
    const r = await handleSearchJobs(notion, { query })
    const text = r.jobs.map(j => `• ${j.company} — ${j.role} [${j.status}] (${j.jobId})`).join('\n')
    return { content: [{ type: 'text', text: r.count > 0 ? `${r.count} result(s):\n${text}` : 'No results found.' }] }
  }
)
```

- [ ] **Step 4: Run all tests**

```bash
cd mcp-server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/search-jobs.ts mcp-server/tests/tools/search-jobs.test.ts mcp-server/src/server.ts
git commit -m "feat: search_jobs tool with multi-field OR search"
```

### ✅ Manual Verification

```bash
# Run tests
cd mcp-server && npx vitest run tests/tools/search-jobs.test.ts
# Expected: PASS (1 test)
```

**Via Claude Desktop** (requires at least 2–3 logged applications):
- *"Search for jobs at Stripe"* → should return rows where Company contains "Stripe"
- *"Search for backend"* → should return rows where Role or Notes contain "backend"
- *"Search for 'xyznonexistent'"* → should return "No results found."

---

## Task 9: `create_prep_page` Tool

**Files:**
- Create: `mcp-server/src/tools/create-prep-page.ts`
- Create: `mcp-server/tests/tools/create-prep-page.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/tools/create-prep-page.test.ts
import { describe, it, expect, vi } from 'vitest'
import { handleCreatePrepPage } from '../../src/tools/create-prep-page.js'
import type { NotionClient } from '../../src/notion/client.js'
import type { GeminiClient } from '../../src/gemini/client.js'

describe('handleCreatePrepPage', () => {
  it('generates prep content and creates linked notion page', async () => {
    const mockNotion = {
      getJobPage: vi.fn().mockResolvedValue({
        row: { company: 'Stripe', role: 'SWE', jobType: 'Backend', jobId: 'job-123' },
        jdText: 'Build payment APIs...'
      }),
      createPrepPage: vi.fn().mockResolvedValue('prep-page-id'),
    } as unknown as NotionClient

    const mockGemini = {
      generate: vi.fn().mockResolvedValue(JSON.stringify({
        behavioral: ['Tell me about a time...'],
        technical: ['How does TCP work?'],
        systemDesign: ['Design a payment system'],
        studyTopics: ['Distributed systems', 'Postgres'],
        companyResearch: ['Read Stripe engineering blog'],
      }))
    } as unknown as GeminiClient

    const result = await handleCreatePrepPage(mockNotion, mockGemini, { job_id: 'job-123' })
    expect(result.prep_page_id).toBe('prep-page-id')
    expect(mockNotion.createPrepPage).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Implement**

```typescript
// src/tools/create-prep-page.ts
import type { NotionClient } from '../notion/client.js'
import type { GeminiClient } from '../gemini/client.js'
import { prepPagePrompt } from '../gemini/prompts.js'

interface PrepContent {
  behavioral: string[]
  technical: string[]
  systemDesign: string[]
  studyTopics: string[]
  companyResearch: string[]
}

export async function handleCreatePrepPage(
  notion: NotionClient,
  gemini: GeminiClient,
  args: { job_id: string }
) {
  const { row, jdText } = await notion.getJobPage(args.job_id)
  const raw = await gemini.generate(prepPagePrompt(row.company, row.role, row.jobType, jdText))
  const prep = JSON.parse(raw) as PrepContent

  const content = formatPrepContent(prep)
  const prepPageId = await notion.createPrepPage(args.job_id, `${row.company} — ${row.role}`, content)

  return { prep_page_id: prepPageId, company: row.company, role: row.role }
}

function formatPrepContent(prep: PrepContent): string {
  return [
    '## Behavioral Questions', ...prep.behavioral.map(q => `- ${q}`),
    '', '## Technical Questions', ...prep.technical.map(q => `- ${q}`),
    '', '## System Design', ...prep.systemDesign.map(q => `- ${q}`),
    '', '## Study Topics', ...prep.studyTopics.map(t => `- ${t}`),
    '', '## Company Research', ...prep.companyResearch.map(r => `- ${r}`),
  ].join('\n')
}
```

- [ ] **Step 3: Register in server.ts**

```typescript
server.tool('create_prep_page',
  'Generate an AI-powered interview prep page in Notion for a job application. Creates behavioral/technical/system design questions, study topics, and company research. Links the page to the job.',
  { job_id: z.string().describe('Notion page ID of the job application') },
  async ({ job_id }) => {
    const r = await handleCreatePrepPage(notion, gemini, { job_id })
    return { content: [{ type: 'text', text: `✓ Prep page created for ${r.company} — ${r.role}\nPrep page ID: ${r.prep_page_id}` }] }
  }
)
```

- [ ] **Step 4: Run all tests**

```bash
cd mcp-server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Test via Claude Desktop**

*"Create a prep page for [job_id]"*

Expected: New page appears in Prep Pages DB in Notion, linked to job row.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/create-prep-page.ts mcp-server/tests/tools/create-prep-page.test.ts mcp-server/src/server.ts
git commit -m "feat: create_prep_page tool with gemini interview prep generation"
```

### ✅ Manual Verification

```bash
# Run all tests
cd mcp-server && npx vitest run
# Expected: all tests pass
```

**Via Claude Desktop** (use a real `job_id` with a detailed JD already appended):
1. Ask: *"Create a prep page for [job_id]"*
2. Expected response: `✓ Prep page created for [Company] — [Role]`
3. Open Notion "Job Prep Pages" database → verify new page exists
4. Open the prep page → confirm it contains sections: Behavioral Questions, Technical Questions, System Design, Study Topics, Company Research
5. Open the original job row → confirm the "Prep Page" relation column links to the new page

---

## Task 10: Chrome Extension — Scaffold

**Files:**
- Create: `extension/package.json`
- Create: `extension/vite.config.ts`
- Create: `extension/src/manifest.json`
- Create: `extension/src/shared/types.ts`
- Create: `extension/src/popup/main.tsx`
- Create: `extension/src/popup/App.tsx` (stub)

- [ ] **Step 1: Create extension package.json**

```json
{
  "name": "job-tracker-extension",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta",
    "@types/chrome": "^0.0.270",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Job Tracker",
  "version": "0.1.0",
  "description": "Auto-log job applications to Notion",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://*.greenhouse.io/*", "http://localhost/*"],
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["https://*.greenhouse.io/*"],
    "js": ["src/content/greenhouse.ts"]
  }],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_title": "Job Tracker"
  }
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
})
```

- [ ] **Step 4: Create shared types**

```typescript
// src/shared/types.ts
export type Status = 'Applied' | 'OA' | 'Interview' | 'Offer' | 'Rejected'
export type JobType = 'Backend' | 'Frontend' | 'Fullstack' | 'Infra' | 'ML' | 'Other'

export interface JobApplication {
  jobId: string
  company: string
  role: string
  status: Status
  appliedDate: string
  jobUrl: string
  jobType: string
  enriched: boolean
}

export interface DetectedJob {
  company: string
  role: string
  url: string
  jdText: string
  sourcePlatform: 'greenhouse'
}

export interface ExtensionSettings {
  mcpUrl: string
  mcpSecret: string
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  mcpUrl: 'http://localhost:3000',
  mcpSecret: '',
}
```

- [ ] **Step 5: Install dependencies and verify build**

```bash
cd extension && npm install && npm run build
```

Expected: `dist/` folder created with no errors.

- [ ] **Step 6: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" → select `extension/dist/`

Expected: Extension appears in the list without errors.

- [ ] **Step 7: Commit**

```bash
git add extension/
git commit -m "chore: scaffold chrome extension with CRXJS and MV3"
```

### ✅ Manual Verification

```bash
# Verify build succeeds
cd extension && npm run build
# Expected: dist/ folder created, no TypeScript or Vite errors
```

1. Open `chrome://extensions` → enable Developer mode (top-right toggle)
2. Click "Load unpacked" → select `extension/dist/`
3. Verify extension appears in the list **without any red error badges**
4. Click the extension icon in the Chrome toolbar → popup opens (stub content is fine at this stage)
5. On the Extensions page, click the "Service Worker" link → verify the console shows no startup errors

---

## Task 11: Greenhouse Detection + Content Script

**Files:**
- Create: `extension/src/content/greenhouse.ts`

- [ ] **Step 1: Implement content script**

```typescript
// src/content/greenhouse.ts
import type { DetectedJob } from '../shared/types.js'

const SOURCE = 'greenhouse' as const

function scrapeJobData(): Omit<DetectedJob, 'sourcePlatform'> | null {
  const titleEl = document.querySelector('h1.app-title, h1[class*="job-title"], h1')
  const role = titleEl?.textContent?.trim() ?? document.title.split(' at ')[0]?.trim() ?? ''

  // Try to get company from og:site_name or title
  const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')
  const company = ogSite ?? document.title.split(' at ')[1]?.trim() ?? window.location.hostname

  const jdEl = document.querySelector('#content, .job-post-wrapper, [class*="job-description"], main')
  const jdText = jdEl?.textContent?.trim() ?? ''

  if (!role || !jdText) return null
  return { company, role, url: window.location.href, jdText }
}

function isConfirmationPage(): boolean {
  const url = window.location.href
  if (url.includes('confirmation') || url.includes('application_confirmation')) return true

  // DOM fallback
  const bodyText = document.body?.innerText ?? ''
  return bodyText.includes('Application submitted') ||
    bodyText.includes('Thank you for applying') ||
    bodyText.includes('successfully submitted')
}

// Store job data before redirect
function storeJobData() {
  const data = scrapeJobData()
  if (data) {
    chrome.storage.session.set({ pendingJob: { ...data, sourcePlatform: SOURCE } })
  }
}

// On job listing page: store data (pre-redirect)
if (!isConfirmationPage()) {
  storeJobData()
  // Re-store if DOM updates (SPA behavior)
  const observer = new MutationObserver(() => storeJobData())
  observer.observe(document.body, { childList: true, subtree: true })
}

// On confirmation page: fire the message
if (isConfirmationPage()) {
  chrome.storage.session.get('pendingJob', ({ pendingJob }) => {
    if (pendingJob) {
      chrome.runtime.sendMessage({ type: 'JOB_APPLIED', payload: pendingJob })
      chrome.storage.session.remove('pendingJob')
    } else {
      // Fallback: scrape from confirmation page
      const fallback = scrapeJobData()
      if (fallback) {
        chrome.runtime.sendMessage({ type: 'JOB_APPLIED', payload: { ...fallback, sourcePlatform: SOURCE } })
      }
    }
  })
}
```

- [ ] **Step 2: Build and reload extension**

```bash
cd extension && npm run build
```

Reload extension in `chrome://extensions`.

- [ ] **Step 3: Test detection manually**

1. Open a Greenhouse job listing (e.g., `boards.greenhouse.io/somecompany/jobs/12345`)
2. Open Chrome DevTools → Application → Session Storage — verify nothing stored yet, but after visiting job page check `chrome.storage.session` via the service worker console
3. Submit a test application (use a dummy test if needed)
4. Verify the confirmation page triggers `JOB_APPLIED` message (visible in service worker logs)

- [ ] **Step 4: Commit**

```bash
git add extension/src/content/
git commit -m "feat: greenhouse content script with URL + DOM detection"
```

### ✅ Manual Verification

1. Build and reload: `cd extension && npm run build`, then click "Update" in `chrome://extensions`
2. Navigate to a real Greenhouse job listing (e.g., `boards.greenhouse.io/<company>/jobs/<id>`)
3. Open the service worker console (`chrome://extensions` → Job Tracker → "Service Worker")
4. In the service worker console DevTools, run:
   ```js
   chrome.storage.session.get('pendingJob', console.log)
   ```
   Expected: `{ pendingJob: { company: '...', role: '...', url: '...', jdText: '...', sourcePlatform: 'greenhouse' } }`
5. Navigate to a confirmation-style URL (contains `confirmation`) or a page containing "Application submitted" text
6. Service worker console should log `[Job Tracker] Logged:` (once Task 12 is complete) or the `JOB_APPLIED` message receipt

---

## Task 12: Service Worker + MCP Client

**Files:**
- Create: `extension/src/shared/mcp-client.ts`
- Create: `extension/src/background/service-worker.ts`

- [ ] **Step 1: Implement MCP client**

```typescript
// src/shared/mcp-client.ts
import type { DetectedJob } from './types.js'

export async function logApplication(
  job: DetectedJob,
  mcpUrl: string,
  mcpSecret: string
): Promise<{ job_id: string; status: string }> {
  const response = await fetch(`${mcpUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mcpSecret}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'log_application',
        arguments: {
          company: job.company,
          role: job.role,
          url: job.url,
          jd_text: job.jdText,
          source_platform: job.sourcePlatform,
        }
      }
    })
  })

  if (response.status === 401) throw new Error('AUTH_FAILED')
  if (!response.ok) throw new Error(`MCP_ERROR: ${response.status}`)

  const data = await response.json() as { result?: { content?: Array<{ text: string }> } }
  // Parse job_id from response text (simple approach)
  const text = data.result?.content?.[0]?.text ?? ''
  // NOTE: This regex depends on the server response format "ID: {uuid}" defined in server.ts Task 4.
  // If you change the server's response text format, update this regex too.
  const idMatch = text.match(/ID: ([\w-]+)/)
  return { job_id: idMatch?.[1] ?? '', status: text.includes('Already logged') ? 'duplicate' : 'logged' }
}
```

- [ ] **Step 2: Implement service worker**

```typescript
// src/background/service-worker.ts
import type { DetectedJob, ExtensionSettings } from '../shared/types.js'
import { DEFAULT_SETTINGS } from '../shared/types.js'
import { logApplication } from '../shared/mcp-client.js'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'JOB_APPLIED') return

  const job = message.payload as DetectedJob

  chrome.storage.local.get('settings', async ({ settings }) => {
    const { mcpUrl, mcpSecret } = { ...DEFAULT_SETTINGS, ...(settings as ExtensionSettings) }

    try {
      const result = await logApplication(job, mcpUrl, mcpSecret)
      console.log('[Job Tracker] Logged:', result)

      // Store in local history for popup
      const { history = [] } = await chrome.storage.local.get('history') as { history: unknown[] }
      await chrome.storage.local.set({
        history: [{ ...job, jobId: result.job_id, status: 'Applied', appliedDate: new Date().toISOString() }, ...history].slice(0, 50)
      })

      sendResponse({ success: true, result })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[Job Tracker] Failed to log:', msg)
      sendResponse({ success: false, error: msg })
    }
  })

  return true // Keep message channel open for async response
})
```

- [ ] **Step 3: Build, reload, and test end-to-end**

```bash
cd extension && npm run build
```

1. Start MCP server: `cd mcp-server && npm run dev`
2. Reload extension in Chrome
3. Apply to a job on Greenhouse
4. Check service worker console (`chrome://extensions` → Job Tracker → "Service Worker" link)
5. Verify row appears in Notion

Expected: Row in Notion with company, role, source=greenhouse, status=Applied.

- [ ] **Step 4: Commit**

```bash
git add extension/src/shared/mcp-client.ts extension/src/background/
git commit -m "feat: service worker and MCP client for extension→notion pipeline"
```

### ✅ Manual Verification

1. Start MCP server: `cd mcp-server && npm run dev`
2. Build and reload extension
3. Click the extension icon → open Settings → set `mcpUrl=http://localhost:3000` and your `mcpSecret` → Save
4. Open a Greenhouse job listing and complete the application flow through to the confirmation page
5. Open the service worker console (`chrome://extensions` → Job Tracker → "Service Worker")
   - Expected log: `[Job Tracker] Logged: { job_id: '...', status: 'logged' }`
6. Open Notion Jobs database → verify the new row with correct company, role, source=greenhouse, status=Applied
7. **Error path**: Stop the MCP server, apply to another job → service worker console should log an error (expected — graceful failure)

---

## Task 13: Extension Popup UI

**Files:**
- Create: `extension/src/popup/index.html`
- Create: `extension/src/popup/App.tsx`
- Create: `extension/src/popup/main.tsx`

- [ ] **Step 1: Implement popup**

```tsx
// src/popup/App.tsx
import { useEffect, useState } from 'react'
import type { JobApplication, ExtensionSettings } from '../shared/types.js'
import { DEFAULT_SETTINGS } from '../shared/types.js'

const STATUS_COLORS: Record<string, string> = {
  Applied: '#3b82f6', OA: '#eab308', Interview: '#22c55e',
  Offer: '#f59e0b', Rejected: '#ef4444',
}

export function App() {
  const [jobs, setJobs] = useState<JobApplication[]>([])
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [view, setView] = useState<'jobs' | 'settings'>('jobs')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    chrome.storage.local.get(['history', 'settings'], (result) => {
      if (result.history) setJobs(result.history as JobApplication[])
      if (result.settings) setSettings(result.settings as ExtensionSettings)
    })
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    await chrome.storage.local.set({ settings })
    setSaving(false)
    setView('jobs')
  }

  return (
    <div style={{ width: 340, minHeight: 400, fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Job Tracker</span>
        <button onClick={() => setView(view === 'jobs' ? 'settings' : 'jobs')}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
          {view === 'jobs' ? '⚙ Settings' : '← Back'}
        </button>
      </div>

      {view === 'settings' ? (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 12, color: '#94a3b8' }}>MCP Server URL
            <input value={settings.mcpUrl} onChange={e => setSettings(s => ({ ...s, mcpUrl: e.target.value }))}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 12, color: '#94a3b8' }}>Shared Secret
            <input type="password" value={settings.mcpSecret} onChange={e => setSettings(s => ({ ...s, mcpSecret: e.target.value }))}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 13 }} />
          </label>
          <button onClick={saveSettings} disabled={saving}
            style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      ) : (
        <div>
          {jobs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#475569', fontSize: 13 }}>
              No applications logged yet.<br />Apply to a job on Greenhouse to get started.
            </div>
          ) : jobs.map(job => (
            <div key={job.jobId} style={{ padding: '10px 16px', borderBottom: '1px solid #1e293b' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{job.company}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{job.role}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ background: STATUS_COLORS[job.status] ?? '#475569', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>
                  {job.status}
                </span>
                <span style={{ fontSize: 11, color: '#475569' }}>
                  {new Date(job.appliedDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

```tsx
// src/popup/main.tsx
import { createRoot } from 'react-dom/client'
import { App } from './App.js'

createRoot(document.getElementById('root')!).render(<App />)
```

```html
<!-- src/popup/index.html -->
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Job Tracker</title></head>
<body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

- [ ] **Step 2: Build and verify popup**

```bash
cd extension && npm run build
```

Reload extension. Click the extension icon — popup should show "No applications logged yet."

Apply to a Greenhouse job. Reopen popup — should show the logged application.

- [ ] **Step 3: Commit**

```bash
git add extension/src/popup/
git commit -m "feat: extension popup with job list and settings panel"
```

### ✅ Manual Verification

1. Build and reload extension
2. Click extension icon → popup opens
   - No applications yet: shows "No applications logged yet."
   - Applications exist: shows list with company name, role, colored status badge, and date
3. Click "⚙ Settings" → settings panel shows MCP URL and Secret (password masked) inputs
4. Change the MCP URL value → click Save → returns to jobs view
5. Reopen popup → verify the saved URL persists
6. Apply to a Greenhouse job (with MCP server running) → reopen popup → new application appears at the top of the list

---

## Task 14: Error Handling Polish

**Files:**
- Modify: `extension/src/background/service-worker.ts`
- Modify: `extension/src/popup/App.tsx`

- [ ] **Step 1: Add offline detection to popup**

Add to `App.tsx` — ping MCP server on mount and show status indicator:

```tsx
const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'auth_error' | 'checking'>('checking')

useEffect(() => {
  chrome.storage.local.get('settings', async ({ settings }) => {
    const { mcpUrl, mcpSecret } = { ...DEFAULT_SETTINGS, ...(settings as ExtensionSettings) }
    try {
      const res = await fetch(`${mcpUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mcpSecret}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      })
      setServerStatus(res.status === 401 ? 'auth_error' : res.ok ? 'online' : 'offline')
    } catch {
      setServerStatus('offline')
    }
  })
}, [])
```

Add status bar to popup header:
```tsx
const statusMessages = {
  online: { color: '#22c55e', text: '● Connected' },
  offline: { color: '#ef4444', text: '● Server offline — run npm run dev' },
  auth_error: { color: '#eab308', text: '● Auth error — check secret in Settings' },
  checking: { color: '#475569', text: '● Checking...' },
}
```

- [ ] **Step 2: Build and test error states**

1. Stop the MCP server — popup should show "Server offline"
2. Set wrong secret in Settings — should show "Auth error"
3. Start server with correct secret — should show "Connected"

- [ ] **Step 3: Commit**

```bash
git add extension/src/
git commit -m "feat: server status indicator in popup with offline/auth error states"
```

### ✅ Manual Verification

1. **Offline state**: Stop the MCP server → open popup → header shows `● Server offline — run npm run dev` (red)
2. **Auth error state**: Start server → in popup Settings, enter a wrong secret → Save → reopen popup → header shows `● Auth error — check secret in Settings` (yellow)
3. **Connected state**: Fix the secret in Settings → reopen popup → header shows `● Connected` (green)
4. **Checking state**: Reload extension and immediately open popup → briefly shows `● Checking...` before resolving

---

## Task 15: Final Integration Test + Demo Prep

- [ ] **Step 1: Run full test suite**

```bash
cd mcp-server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Full end-to-end smoke test**

1. Start MCP server: `npm run dev`
2. Open Claude Desktop — verify job-tracker MCP server appears in tools
3. Apply to a real Greenhouse job
4. Verify row appears in Notion with correct fields
5. Wait 5 seconds — verify Job Type, Seniority, Enriched=true are filled in
6. Ask Claude Desktop: "Show me my recent applications"
7. Ask Claude Desktop: "Create a prep page for [job_id]"
8. Verify prep page appears in Notion linked to the job row

- [ ] **Step 3: Add .gitignore entries**

```bash
echo ".superpowers/" >> .gitignore
echo "mcp-server/.env" >> .gitignore
echo "extension/dist/" >> .gitignore
echo "mcp-server/dist/" >> .gitignore
```

- [ ] **Step 4: Final commit**

```bash
git add .gitignore
git commit -m "chore: add gitignore entries for build artifacts and secrets"
```

- [ ] **Step 5: Record demo**

Suggested demo flow (2-3 minutes):
1. Show empty Notion database
2. Open a Greenhouse job listing
3. Apply — show row appear in Notion automatically
4. Wait for Gemini enrichment — show Job Type/Seniority fill in
5. Switch to Claude Desktop: "Show me my applications" → "Create a prep page for that Stripe job"
6. Show generated prep page in Notion

---

## Summary

| Task | Days | Output |
|---|---|---|
| 1 | 1 | MCP server scaffolded |
| 2 | 1 | Notion DBs created |
| 3 | 1 | Notion client tested |
| 4 | 2 | `log_application` + stdio working in Claude Desktop |
| 5 | 3 | HTTP transport + auth working via curl |
| 6 | 3 | Async Gemini enrichment live |
| 7 | 7a | 4 CRUD tools working |
| 8 | 7b | `search_jobs` working |
| 9 | 8 | `create_prep_page` working |
| 10 | 4–5 | Extension scaffold + detection |
| 11 | 4–5 | Greenhouse content script |
| 12 | 6 | Full end-to-end pipeline |
| 13 | 9 | Popup UI complete |
| 14 | 9 | Error handling polished |
| 15 | 10 | Demo recorded + submitted |
