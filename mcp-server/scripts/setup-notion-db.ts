// scripts/setup-notion-db.ts
import 'dotenv/config'
import { Client } from '@notionhq/client'
import { DB_FIELDS, STATUS_OPTIONS, JOB_TYPE_OPTIONS, SENIORITY_OPTIONS, SOURCE_OPTIONS } from '../src/notion/schema.js'

const notionToken = process.env['NOTION_TOKEN']
if (!notionToken?.trim()) {
  console.error('Missing required env var: NOTION_TOKEN')
  process.exit(1)
}

const notion = new Client({ auth: notionToken })
const parentPageId = process.env['NOTION_PARENT_PAGE_ID']!

if (!parentPageId?.trim()) {
  console.error('Missing required env var: NOTION_PARENT_PAGE_ID')
  process.exit(1)
}

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

main().catch((err: unknown) => {
  console.error('[fatal]', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
