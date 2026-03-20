import 'dotenv/config'

const requiredEnv = ['NOTION_TOKEN', 'NOTION_DATABASE_ID', 'GEMINI_API_KEY', 'MCP_SECRET']
for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`)
}

console.log('Job Tracker MCP Server starting...')
