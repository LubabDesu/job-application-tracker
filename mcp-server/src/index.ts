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

const TRANSPORT_MODES = ['both', 'http', 'stdio'] as const
type TransportMode = typeof TRANSPORT_MODES[number]

function parseTransportMode(value: string | undefined): TransportMode {
  const mode = value ?? 'both'
  if ((TRANSPORT_MODES as readonly string[]).includes(mode)) return mode as TransportMode
  throw new Error(`Invalid TRANSPORT value: ${mode}. Expected one of: ${TRANSPORT_MODES.join(', ')}`)
}

const transportMode = parseTransportMode(process.env.TRANSPORT)

const requiredEnv = ['NOTION_TOKEN', 'NOTION_DATABASE_ID', 'NOTION_PREP_DB_ID', 'OPENROUTER_API_KEY']
if (transportMode !== 'stdio') requiredEnv.push('MCP_SECRET')

for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`)
}

const notion = new NotionClient(
  process.env.NOTION_TOKEN!,
  process.env.NOTION_DATABASE_ID!,
  process.env.NOTION_PREP_DB_ID!
)
const openrouter = new OpenRouterClient(process.env.OPENROUTER_API_KEY!, process.env.OPENROUTER_MODEL)

if (transportMode === 'both' || transportMode === 'http') {
  const httpHost = process.env.HOST ?? (process.env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1')

  // HTTP transport: factory creates a fresh server per request (stateless HTTP pattern)
  startHttpTransport(
    () => createMcpServer(notion, openrouter),
    (args) => handleLogApplication(notion, args, openrouter),
    Number(process.env.PORT ?? 3000),
    process.env.MCP_SECRET!,
    httpHost
  )
}

if (transportMode === 'both' || transportMode === 'stdio') {
  // Stdio transport: single long-lived server for Claude Desktop
  const stdioServer = createMcpServer(notion, openrouter)
  const transport = new StdioServerTransport()
  await stdioServer.connect(transport)
}
