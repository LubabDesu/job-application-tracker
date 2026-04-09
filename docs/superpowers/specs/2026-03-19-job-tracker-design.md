# Job Tracker — Design Spec

**Date:** 2026-03-19
**Deadline:** 2026-03-29 (10 days)
**Context:** Notion MCP Challenge submission

---

## Overview

A Chrome extension + MCP server that automatically tracks job applications in Notion. When a user applies on Greenhouse, the extension detects the submission, extracts the job description, and calls the MCP server to log it. The MCP server is the star of the submission — it exposes 7 Notion tools over two transports (stdio for Claude Desktop, HTTP/SSE for the extension).

---

## Goals

- **Primary:** Demonstrate real-world MCP usefulness for the Notion MCP Challenge
- **Wow factor:** End-to-end demo — apply on Greenhouse, row appears in Notion automatically, ask Claude Desktop natural language questions about your applications
- **Audience:** Eventually multi-user, but auth (Notion OAuth) is deferred — `.env` token for the challenge submission

---

## Out of Scope (for this submission)

- Gmail integration and status update automation
- Notion OAuth / multi-user auth
- LinkedIn, Lever, Workday support (Greenhouse only)
- Chrome Web Store publication

---

## System Architecture

Three components communicate through two integration points:

```
Chrome Extension  ←──HTTP/SSE──→  MCP Server  ←──stdio──→  Claude Desktop
                                       │
                              Notion API + Gemini Flash
```

**MCP Server** is the single source of truth. Neither the extension nor Claude Desktop touches Notion directly — all Notion operations go through MCP tools.

### HTTP/SSE Transport Protocol

The HTTP transport follows the MCP Streamable HTTP spec:

- **Client → Server:** `POST /mcp` with JSON-RPC body (tool call, list tools, etc.)
- **Server → Client:** Response either as direct JSON (for simple responses) or `text/event-stream` SSE for streaming results
- The Chrome extension uses `fetch()` to POST and reads the response body — no persistent SSE connection required for tool calls

---

## Notion Database Schema

Fields auto-populated on `log_application`:

| Field             | Type     | Notes                                                                     |
| ----------------- | -------- | ------------------------------------------------------------------------- |
| Company           | Title    | Required                                                                  |
| Role              | Text     | Required                                                                  |
| Status            | Select   | Applied / OA / Interview / Offer / Rejected                               |
| Applied Date      | Date     | Auto-set to today                                                         |
| Job URL           | URL      | Required — used as dedup key                                              |
| Location          | Text     | Extracted from JD by Gemini                                               |
| Salary Range      | Text     | Extracted from JD by Gemini if present                                    |
| Source Platform   | Select   | greenhouse / linkedin / lever / workday                                   |
| Job Type          | Select   | Backend / Frontend / Fullstack / Infra / ML / Other — set by Gemini async |
| Seniority         | Select   | Intern/ Junior / Mid / Senior / Staff — set by Gemini async               |
| Enriched          | Checkbox | False on create, True after Gemini enrichment completes                   |
| Recruiter Contact | Text     | Manual                                                                    |
| Interview Dates   | Date     | Manual                                                                    |
| Gmail Thread ID   | Text     | Reserved for Gmail integration (M2)                                       |
| Notes             | Text     | Manual / append_notes tool                                                |
| Prep Page         | Relation | Relation to Prep Pages database — configured at DB creation time          |

Page body stores: raw JD text + Gemini-generated summary bullets (appended after enrichment).

**Important:** The `Prep Page` relation property and `Prep Pages` database must be created on Day 1 alongside the Jobs database, even though `create_prep_page` is implemented on Day 8. Retrofitting a relation property breaks existing rows.

---

## MCP Server

**Runtime:** Node.js + TypeScript, ES modules
**Port:** 3000 (HTTP), stdio (Claude Desktop)
**Transports:** Both simultaneously — stdio via `@modelcontextprotocol/sdk` StdioServerTransport, HTTP/SSE via StreamableHTTPServerTransport (Hono or Express)

### File Structure

```
/mcp-server
  src/
    index.ts              ← entry point, starts both transports
    server.ts             ← MCP server definition, registers tools
    tools/
      log-application.ts
      update-status.ts
      get-applications.ts
      create-prep-page.ts
      append-notes.ts
      search-jobs.ts
      delete-application.ts
    notion/
      client.ts           ← Notion REST API wrapper
      schema.ts           ← field names, status/type options as constants
    gemini/
      client.ts           ← Gemini Flash API wrapper
      prompts.ts          ← prompt templates
    transports/
      stdio.ts
      http.ts
  .env
  package.json
  tsconfig.json
```

### 7 MCP Tools

All tools that reference a specific job use `job_id`, which is the **Notion page ID** (UUID string) returned by `log_application` and included in all `get_applications` / `search_jobs` results.

#### `log_application`

Creates a new job row in Notion. Returns immediately after writing the raw row, then enriches asynchronously via Gemini.

**Args:** `company`, `role`, `url`, `jd_text`, `source_platform`, `location?`, `salary_range?`
**Returns:** `{ job_id, notion_url, status: "logged" }`

**Duplicate check:** Before creating, query Notion for an existing row with the same `url`. If found, return `{ job_id, notion_url, status: "duplicate" }` — no new row created.

**Async enrichment (Gemini) — best-effort, silent on failure:**

1. Call Gemini Flash with JD text → extract job type, seniority, 3–5 bullet summary
2. PATCH Notion row: set Job Type, Seniority, append summary bullets to page body, set Enriched = true
3. If Gemini or PATCH fails: log error server-side, leave Enriched = false — no retry, no crash

**Enriched field:** Allows Claude Desktop to surface "show me jobs that haven't been enriched yet" and gives a clear signal that async processing completed.

#### `update_status`

Updates the Status field on an existing job row.

**Args:** `job_id` (Notion page ID), `status` (Applied | OA | Interview | Offer | Rejected)

#### `get_applications`

Structured query of the jobs database by filter fields. Use this for filtering by known values (status, job type, company name).

**Args:** `status?`, `job_type?`, `company?`, `limit?` (default 20)
**Returns:** Array of job rows with all fields including `job_id`.
**Note:** Company filter uses Notion's `contains` filter (case-insensitive partial match).

#### `create_prep_page`

Generates a full AI interview prep Notion page and links it to a job row via the `Prep Page` relation.

**Args:** `job_id` (Notion page ID)
**Process:**

1. Read job row + JD from Notion
2. Call Gemini Flash — generate: likely interview questions by category (behavioral, technical, system design), study topics, company research prompts
3. Create new page in Prep Pages database with generated content
4. Update the `Prep Page` relation field on the job row

#### `append_notes`

Appends a timestamped note to the Notes text field on a job row.

**Args:** `job_id` (Notion page ID), `note`

#### `search_jobs`

Free-text search across job rows. Use this when the query is open-ended (e.g., "find jobs where I mentioned React"). Searches company, role, and notes fields via Notion filter API.

**Args:** `query`
**Returns:** Matching job rows with all fields including `job_id`.
**Implementation note:** Notion has no native full-text search across multiple fields — implement as three parallel `contains` filter calls (company, role, notes) combined with `OR`, then deduplicate results client-side. This is the safe approach; avoid pagination complexity on Day 7 by capping results at 20.

#### `delete_application`

Archives a job row (Notion's soft delete).

**Args:** `job_id` (Notion page ID)
**Behavior:** Calls `PATCH /pages/{job_id}` with `{ "archived": true }`. Row disappears from database views but is recoverable from Notion trash.

---

## Chrome Extension

**Framework:** React + TypeScript, Vite + CRXJS, Manifest V3

### File Structure

```
/extension
  src/
    manifest.json
    content/
      greenhouse.ts       ← content script
    background/
      service-worker.ts
    popup/
      App.tsx
      main.tsx
    shared/
      types.ts
      mcp-client.ts       ← fetch wrapper for MCP HTTP calls
  vite.config.ts
  package.json
```

### Security: Shared Secret

The MCP HTTP endpoint is unauthenticated by default, meaning any page the user visits could POST to `localhost:3000`. To prevent this:

- A `MCP_SECRET` token is set in the server's `.env`
- The extension sends `Authorization: Bearer <secret>` on every request
- The secret is configured once in the extension's Settings panel and stored in `chrome.storage.local`
- The server rejects requests without a valid secret with `401`
- This is low-effort and sufficient for a local dev submission

### Greenhouse Detection Strategy

**Primary — URL/navigation detection:**
Content script watches for navigation to `*/confirmation*` or `*/application_confirmation*` on `*.greenhouse.io` domains. This covers the standard Greenhouse full-page redirect after submission.

**Fallback — DOM mutation:**
`MutationObserver` watches for text content matching "Application submitted", "Thank you for applying", or similar success copy appearing anywhere in `document.body`.

**Pre-redirect data storage:**
JD text and job URL are stored in `chrome.storage.session` (MV3, persists across same-origin navigations within the session, accessible to all content scripts) **before** the page submits. `sessionStorage` is not used because the confirmation page may be served from a different origin, causing silent data loss.

**On detection, extract from `chrome.storage.session`:**

- Company name: `document.title` or `og:site_name` meta tag (from confirmation page)
- Role title: stored pre-redirect or parsed from confirmation page `<h1>`
- Job URL: stored pre-redirect
- JD text: stored pre-redirect

### Data Flow

```
1. User lands on job listing on boards.greenhouse.io
2. Content script scrapes JD text + job URL → stores in chrome.storage.session
3. User submits application
4. Content script detects (URL pattern or DOM mutation on confirmation page)
5. Reads stored data from chrome.storage.session
6. chrome.runtime.sendMessage({ type: "JOB_APPLIED", payload })
7. Service worker: POST http://localhost:3000/mcp
   Headers: Authorization: Bearer <secret>
   Body: { tool: "log_application", args: { ... } }
8. MCP server: writes raw row → returns { job_id, status: "logged" } → enriches async
9. Extension popup shows: "✓ Logged — [Company], [Role]"
```

### Popup UI

- List of recent applications (company, role, status badge, date)
- Status color coding: Applied (blue) / OA (yellow) / Interview (green) / Offer (gold) / Rejected (red)
- Settings panel: MCP server URL (default `http://localhost:3000`) + shared secret field
- Manual log button (fallback if auto-detection missed)

---

## Error Handling

| Scenario                                  | Handling                                                         |
| ----------------------------------------- | ---------------------------------------------------------------- |
| MCP server not running                    | Extension shows "⚠ MCP server offline — run `npm run dev`"       |
| Unauthorized (wrong secret)               | Extension shows "⚠ Auth failed — check secret in Settings"       |
| Notion API rate limit                     | Retry with exponential backoff, max 3 attempts                   |
| Gemini enrichment fails                   | Row stays with raw data, Enriched = false — silent, best-effort  |
| Duplicate application URL                 | Return existing row, no duplicate created                        |
| Greenhouse DOM changes                    | Fallback chain: URL pattern → DOM mutation → manual popup button |
| Notion blocks timeout (large JD)          | Chunk JD into 100-block segments before appending                |
| chrome.storage.session empty on detection | Fall back to scraping company/role from confirmation page DOM    |

---

## 10-Day Build Plan

| Days | Focus                                                                                             | Done When                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1–2  | MCP server scaffold + `log_application` (stdio only) + Notion DB setup (incl. Prep Page relation) | Claude Desktop can log a job to Notion                                                       |
| 3    | HTTP/SSE transport + shared secret auth + async Gemini enrichment                                 | `curl` with Bearer token logs a job, Notion row shows job type + seniority + Enriched = true |
| 4–5  | Chrome extension — Greenhouse detection + chrome.storage.session + service worker                 | Applying on Greenhouse triggers full payload in service worker console                       |
| 6    | Wire extension → MCP → Notion end-to-end                                                          | One Greenhouse apply = one Notion row, automatically                                         |
| 7a   | `update_status`, `append_notes`, `delete_application`, `get_applications`                         | All 4 tools work via Claude Desktop                                                          |
| 7b   | `search_jobs` (Notion multi-field OR filter, dedup, cap 20)                                       | Claude Desktop can search applications by keyword                                            |
| 8    | `create_prep_page` with deep Gemini generation                                                    | "Prep me for Stripe" creates a full linked Notion page                                       |
| 9    | Extension popup polish + error handling                                                           | Demo-ready, handles all failure cases                                                        |
| 10   | Demo recording + submission                                                                       | Shipped                                                                                      |

---

## Environment Variables

```
NOTION_TOKEN=           # Notion integration secret
NOTION_DATABASE_ID=     # Target jobs database ID
NOTION_PREP_DB_ID=      # Prep Pages database ID
GEMINI_API_KEY=         # Free tier Gemini key
PORT=3000               # HTTP transport port (optional, default 3000)
MCP_SECRET=             # Shared secret for HTTP endpoint auth
```

---

## Key Technical Decisions

- **Dual transport:** stdio for Claude Desktop (demo conversational queries), HTTP/SSE for Chrome extension (programmatic calls). Same tool implementations, two transport adapters. HTTP follows MCP Streamable HTTP spec: POST for requests, SSE or direct JSON for responses.
- **Async Gemini enrichment:** `log_application` returns immediately after Notion write. Gemini runs in background, patches the row. `Enriched` checkbox tracks completion. Silent failure — row stays usable with raw data.
- **No direct Notion access from extension:** All Notion ops go through MCP. Extension works with any MCP-compatible backend in the future.
- **`chrome.storage.session` for pre-redirect data:** Survives cross-origin redirects within a browser session; `sessionStorage` does not.
- **Shared secret on HTTP endpoint:** Low-effort protection against drive-by requests from arbitrary pages. Configured once in extension Settings.
- **`get_applications` vs `search_jobs`:** `get_applications` = structured filters on known fields (status, job type, company). `search_jobs` = free-text OR search across company/role/notes. Tool descriptions in the MCP registration must make this distinction clear so Claude picks the right one.
- **`job_id` = Notion page ID:** UUID returned by `log_application` and included in all list/search results. Used as the stable identifier across all other tools.
- **Notion relation property on Day 1:** `Prep Page` relation must exist in the DB schema from the start. Cannot be safely added after rows exist without migration risk.
