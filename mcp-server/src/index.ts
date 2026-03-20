import 'dotenv/config'

process.on('uncaughtException', (err) => {
  console.error('[fatal]', err.message)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled rejection', reason)
  process.exit(1)
})

const requiredEnv = ['NOTION_TOKEN', 'NOTION_DATABASE_ID', 'GEMINI_API_KEY', 'MCP_SECRET']
for (const key of requiredEnv) {
  if (!process.env[key]?.trim()) throw new Error(`Missing required env var: ${key}`)
}

console.log('Job Tracker MCP Server starting...')
