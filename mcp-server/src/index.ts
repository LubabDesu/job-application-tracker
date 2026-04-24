import 'dotenv/config'

console.error('Environment keys:', Object.keys(process.env).filter(k => k.startsWith('NOTION_') || k.startsWith('OPENROUTER_') || k === 'MCP_SECRET'))

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { NotionClient } from './notion/client.js'
import { OpenRouterClient } from './openrouter/client.js'
import { createMcpServer } from './server.js'
import { startHttpTransport } from './transports/http.js'
import { handleLogApplication } from './tools/log-application.js'

const requiredEnv = ['NOTION_TOKEN', 'NOTION_DATABASE_ID', 'NOTION_PREP_DB_ID', 'OPENROUTER_API_KEY', 'MCP_SECRET']
for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`)
}

const notion = new NotionClient(
  process.env.NOTION_TOKEN!,
  process.env.NOTION_DATABASE_ID!,
  process.env.NOTION_PREP_DB_ID!
)
const openrouter = new OpenRouterClient(process.env.OPENROUTER_API_KEY!, process.env.OPENROUTER_MODEL)

// HTTP transport: factory creates a fresh server per request (stateless HTTP pattern)
startHttpTransport(
  () => createMcpServer(notion, openrouter),
  (args) => handleLogApplication(notion, args, openrouter),
  Number(process.env.PORT ?? 3000),
  process.env.MCP_SECRET!
)

// Stdio transport: single long-lived server for Claude Desktop
const stdioServer = createMcpServer(notion, openrouter)
const transport = new StdioServerTransport()
await stdioServer.connect(transport)
