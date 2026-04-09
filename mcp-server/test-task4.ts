import 'dotenv/config'
import { NotionClient } from './src/notion/client.js'
import { handleLogApplication } from './src/tools/log-application.js'

const notion = new NotionClient(
  process.env.NOTION_TOKEN!,
  process.env.NOTION_DATABASE_ID!,
  process.env.NOTION_PREP_DB_ID!
)

// Test 1: log a new job
const result = await handleLogApplication(notion, {
  company: 'Stripe',
  role: 'Backend SWE',
  url: 'https://stripe.com/jobs/manual-test-001',
  jd_text: 'Build scalable payment infrastructure. Python, Go, distributed systems.',
  source_platform: 'greenhouse',
})
console.log('First call:', result)
// Expected: { job_id: '...', notion_url: '...', status: 'logged' }

// Test 2: same URL again → should be duplicate
const result2 = await handleLogApplication(notion, {
  company: 'Stripe',
  role: 'Backend SWE',
  url: 'https://stripe.com/jobs/manual-test-001',
  jd_text: 'Build scalable payment infrastructure.',
  source_platform: 'greenhouse',
})
console.log('Second call:', result2)
// Expected: { job_id: '...', status: 'duplicate' }
