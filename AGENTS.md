# Job Tracker — Notion MCP Chrome Extension

## What this is

A Chrome extension that automatically tracks job applications in Notion.
When a user applies on LinkedIn/Greenhouse/Lever, the extension detects it,
extracts the JD, and logs it to Notion via an MCP server. Gmail is watched
for status updates (OA, interview, rejection) which trigger automatic Notion
updates and AI-generated prep pages.

## Stack

- MCP Server: Node.js + TypeScript, runs on localhost (later Cloudflare Workers)
- Chrome Extension: TypeScript + React (Vite + CRXJS for bundling), Manifest V3
- Notion API: REST, integration token in .env
- LLM: OpenRouter (model configurable via OPENROUTER_MODEL env var, for JD parsing + email classification + prep gen)
- Gmail API: OAuth via Chrome extension identity API

## Repo structure

- /mcp-server — MCP server with 5 Notion tools
- /extension — Chrome extension (manifest v3)
- /docs/milestones.md — milestone definitions and done criteria

## Key commands

- `cd mcp-server && npm run dev` — start MCP server locally on port 3000
- `cd mcp-server && npm test` — run tool tests against real Notion DB
- Load /extension folder in chrome://extensions (dev mode) to test extension

## Code style

- TypeScript everywhere in mcp-server
- ES modules (import/export), no CommonJS
- Async/await only, no raw promise chains
- No any types — use unknown and narrow properly

## Env vars (never commit)

- NOTION_TOKEN — Notion integration secret
- NOTION_DATABASE_ID — target jobs database ID
- OPENROUTER_API_KEY — OpenRouter API key
- OPENROUTER_MODEL — model to use (e.g. qwen/qwen3-235b-a22b)

## Current milestone

M1: MCP server scaffold + Notion DB — see docs/superpowers/plans/2026-03-19-job-tracker.md

## Implementation Plan
docs/superpowers/plans/2026-03-19-job-tracker.md — full 15-task plan, 10-day timeline

## Design Spec
docs/superpowers/specs/2026-03-19-job-tracker-design.md

## Development Workflow

**MANDATORY — no exceptions:**
1. ALWAYS delegate implementation to a subagent. Never write code directly in the main conversation.
2. ALWAYS provide a manual test script or command after every task so the user can verify it works.
3. ALWAYS explain what was built, why it exists, and how it connects to the rest of the system — a system narrative, not a code walkthrough.
4. ALWAYS follow up every completed task with a verbose breakdown in this exact structure:

   **a) What changed — file by file**
   For every modified or created file, list each specific change with its exact location (file:line_number). Describe what the code does in plain English, not just what it is. Example: "App.tsx:150–171 — a useEffect that fires on mount, reads mcpUrl and mcpSecret from chrome.storage.local, then pings /health with a 4s AbortController timeout. Sets serverStatus to 'online', 'offline', or 'auth_error' based on the response code."

   **b) How the pieces connect**
   Explain how the new code integrates with existing code — what calls what, what data flows where, what the ordering dependencies are (e.g. "the /health endpoint must be placed AFTER the global auth check in http.ts so that a wrong Bearer token resolves as auth_error not offline in the popup").

   **c) How to test it manually — step by step**
   Numbered steps the user can follow right now. Include exact commands, exact UI actions, and the exact expected outcome for each step. Cover the happy path AND the failure modes. Example:
   - Step 1: Stop the MCP server. Open popup. Expected: red dot, "Server offline — run npm run dev"
   - Step 2: Start server with correct secret. Open popup. Expected: green dot, "Server connected"
   - Step 3: Start server, set wrong secret in Settings, reopen popup. Expected: amber dot, "Auth error — check MCP Secret in Settings"

Subagent roles:
- Implementer: mcp-developer (Tasks 1-9, MCP server)
- Implementer: frontend-developer + react-specialist (Tasks 10-14, Chrome extension)
- Spec reviewer: code-reviewer (after every task)
- Code quality reviewer: typescript-pro (after spec passes)
Subagents live in: .Codex/agents/awesome-Codex-subagents/categories/

## Milestone Progress
M1 in progress — see plan Task 1 (scaffold) → Task 2 (Notion DB setup)

## Gotchas

- Workday uses a 5-step form — only fire on final confirmation screen
- Notion API blocks.children.append() times out with large content — chunk at 100 blocks
- LinkedIn Easy Apply is a modal, not a new page — detect via DOM mutation not URL change
- Use CRXJS Vite plugin to bundle the extension — it handles hot reload and
  manifest v3 content script injection cleanly with React/TS

## Manual Testing — Extension (T12+)

**One-time setup (service worker console):**
1. `cd mcp-server && npm run dev` — start MCP server
2. `./node_modules/.bin/vite build` in `extension/` — rebuild after code changes
3. `chrome://extensions` → Load unpacked → select `extension/dist`
4. Click "Inspect views: service worker" → in that console, set the secret:
   ```js
   chrome.storage.local.set({ settings: { mcpUrl: 'http://localhost:3000', mcpSecret: '<MCP_SECRET from mcp-server/.env>' } })
   ```

**Smoke test (no real application needed):**
Navigate to any normal page (not chrome://), open the popup, right-click → Inspect.
In the popup console:
```js
chrome.runtime.sendMessage({
  type: 'JOB_DETECTED',
  job: { company: 'Test Co', role: 'Software Engineer', url: 'https://testco.wd1.myworkdayjobs.com/en-US/jobs/job/123', jdText: 'We build things.', sourcePlatform: 'workday' }
})
```
Expected: popup updates to show "✓ Software Engineer at Test Co", Notion row created.

**Real test (gray area — unverified):**
It is not yet confirmed whether clicking the Workday "Apply" button and completing the flow triggers `JOB_DETECTED` end-to-end. The content script fires on the confirmation screen — needs a real application attempt to verify. Test on Salesforce Workday when possible.

**Why extensions can't be tested from chrome:// pages:**
Extensions are disabled on `chrome://` pages by design. Always navigate to a real website before testing.

## Workday Scraping — Hard-Won Lessons

**Tenants customize everything.** The same Workday software renders completely different `data-automation-id` sets per company. Never assume a selector works universally — test on at least Salesforce + T-Mobile.

**Two-wave DOM render.** Workday SPAs render in two waves:
- Wave 1 (~0ms): shell + `jobPostingPage` + empty `h1`
- Wave 2 (~2s): actual content — `jobPostingDescription`, `jobPostingHeader`, `locations`
- Guard `jobDetailCached = true` on **both** role AND jdText being non-empty, not just role. h1 arrives before the JD block.

**Role is NOT always in `<h1>`.** On Salesforce Workday, the job title is in `[data-automation-id="jobPostingHeader"]` which renders as an H2. Use `jobPostingHeader` first, fall back to `h1`.

**Company from hostname, not title.** Workday page titles use em dashes (`–`) not ASCII hyphens, and the format varies by tenant (e.g. "Summer 2026 Intern – Careers" gives company = "Careers"). Extract company from the URL subdomain instead: `salesforce.wd12.myworkdayjobs.com` → `"Salesforce"`.

**Location element includes label text.** `[data-automation-id="locations"]` textContent includes the "Locations" heading. Use `querySelectorAll('dd')` inside the container to get just the values.

**`chrome.storage.session` throws on Workday/Salesforce.** These pages have strict CSPs that block Chrome storage APIs in content scripts. Use module-level in-memory state (`Map`, `Set`, `boolean`) instead — the module instance persists across SPA navigation within the same tab.

**Build tooling on Apple Silicon.** `npm run build` fails with `@rollup/rollup-darwin-x64` architecture mismatch. Use `./node_modules/.bin/vite build` directly. Root cause: vite bundles rollup and looks for x64 binary on arm64 machines.
