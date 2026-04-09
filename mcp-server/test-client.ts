  import 'dotenv/config'
  import { NotionClient } from './src/notion/client.js'

  const client = new NotionClient(
    process.env.NOTION_TOKEN!,
    process.env.NOTION_DATABASE_ID!,
    process.env.NOTION_PREP_DB_ID!,
  )

  // Create a test job
  const { jobId, notionUrl } = await client.createJob({
    company: 'Test Company',
    role: 'Software Engineer',
    url: 'https://example.com/job/123',
    jdText: 'This is a test job description.',
    sourcePlatform: 'greenhouse',
  })
  console.log('Created job:', jobId)
  console.log('Notion URL:', notionUrl)

  // Update its status
  await client.updateStatus(jobId, 'Interview')
  console.log('Status updated to Interview')

  // Append a note
  await client.appendNote(jobId, 'This was a test run')
  console.log('Note appended')

  // Find by URL
  const found = await client.findByUrl('https://example.com/job/123')
  console.log('Found by URL:', found)
  
