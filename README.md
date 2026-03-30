# Job Tracker — Chrome Extension + MCP Server

Auto-log job applications to Notion as you apply on Workday and Greenhouse.

## What it does

- Detects when you apply on Workday or Greenhouse
- Extracts job title, company, location, and job description
- Logs the application to your Notion database via a local MCP server
- AI enrichment: job type, seniority level, and AI summary bullets (via OpenRouter)
- Popup shows live status (logging → ✓ logged → View in Notion link)
- Interview prep page generator: creates structured prep notes in Notion on demand

## Requirements

- Node.js 18+
- A Notion workspace with an integration token
- An OpenRouter API key (for AI enrichment)
- Chrome browser

## Setup

### 1. Clone the repo

```bash
git clone <this-repo>
cd project-tracker
```

### 2. Set up the Notion database

Create a Notion integration at https://www.notion.so/my-integrations and copy the token.

Run the database setup script to create the Jobs and Prep databases:

```bash
cd mcp-server
cp .env.example .env
# Edit .env with your NOTION_TOKEN
npm install
npx ts-node src/setup-db.ts
```

This creates two databases: Jobs and Prep. Copy the database IDs from the output into your `.env`.

### 3. Configure the MCP server

Edit `mcp-server/.env`:

```
NOTION_TOKEN=secret_...
NOTION_DATABASE_ID=...        # Jobs database ID
NOTION_PREP_DATABASE_ID=...   # Prep database ID
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=qwen/qwen3-235b-a22b   # or any OpenRouter model
MCP_SECRET=your-secret-here             # any random string, used for auth
PORT=3000
```

### 4. Start the MCP server

```bash
cd mcp-server
npm run dev
```

Server starts on `http://localhost:3000`.

### 5. Load the extension

Build the extension:

```bash
cd extension
./node_modules/.bin/vite build
```

Load in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/dist/` folder

### 6. Configure the extension

Open the extension popup → click the gear icon → enter:
- **MCP URL**: `http://localhost:3000`
- **MCP Secret**: the value you set in `mcp-server/.env`

Click **Save settings**.

### 7. Verify it works

With the MCP server running, open the extension popup. You should see a green dot: **Server connected**.

To smoke-test without applying to a real job, navigate to any real webpage (not chrome://), open the popup, right-click → Inspect, and in the console:

```js
chrome.runtime.sendMessage({
  type: 'JOB_DETECTED',
  job: {
    company: 'Test Co',
    role: 'Software Engineer',
    url: 'https://testco.wd1.myworkdayjobs.com/en-US/jobs/job/123',
    jdText: 'We build great things.',
    sourcePlatform: 'workday'
  }
})
```

Expected: popup shows "Logging..." → "✓ Software Engineer at Test Co" → Notion row created.

## Development

```bash
# Run MCP server tests
cd mcp-server && npm test

# Run extension tests
cd extension && npm test

# Build extension
cd extension && ./node_modules/.bin/vite build
```

> **Note:** Use `./node_modules/.bin/vite build` directly (not `npm run build`) on Apple Silicon due to an arm64/x64 Rollup architecture mismatch.

## Chrome Web Store packaging

The extension is at version `0.1.0` (self-hosted, for technical users). For Web Store submission:

1. Replace `src/icons/icon.svg` with actual PNG icons at 16x16, 48x48, and 128x128
2. Run `node generate-icons.mjs` for guidance on SVG-to-PNG conversion
3. Add a privacy policy URL to the manifest
4. Zip the `dist/` folder after building
5. Upload to the Chrome Web Store developer dashboard

## Architecture

```
extension/
  src/
    content/          # Workday + Greenhouse content scripts
    background/       # Service worker (message hub + MCP client)
    popup/            # React popup (App.tsx, Settings.tsx)
    shared/           # Types + MCP client stub

mcp-server/
  src/
    tools/            # log_application, update_status, search_jobs, create_prep_page, etc.
    notion/           # Notion CRUD wrapper
    openrouter/       # OpenRouter LLM client
    transports/       # HTTP transport with /log REST shim + /health
```

## License

MIT
