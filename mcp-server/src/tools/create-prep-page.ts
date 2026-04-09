import type { NotionClient } from '../notion/client.js'
import type { OpenRouterClient } from '../openrouter/client.js'
import { prepPagePrompt } from '../openrouter/prompts.js'

export interface CreatePrepPageArgs {
  job_id: string
}

export interface CreatePrepPageResult {
  prep_page_id: string
  job_id: string
}

interface PrepContent {
  behavioral: string[]
  technical: string[]
  systemDesign: string[]
  studyTopics: string[]
  companyResearch: string[]
}

function isPrepContent(value: unknown): value is PrepContent {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v['behavioral']) &&
    Array.isArray(v['technical']) &&
    Array.isArray(v['systemDesign']) &&
    Array.isArray(v['studyTopics']) &&
    Array.isArray(v['companyResearch'])
  )
}

function parsePrepContent(raw: string): PrepContent {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Failed to parse prep content from LLM')
  }
  if (!isPrepContent(parsed)) {
    throw new Error('Failed to parse prep content from LLM')
  }
  return parsed
}

function formatPrepContent(content: PrepContent): string {
  const section = (title: string, items: string[]): string =>
    `## ${title}\n${items.map(item => `- ${item}`).join('\n')}`

  return [
    section('Behavioral Questions', content.behavioral),
    section('Technical Questions', content.technical),
    section('System Design', content.systemDesign),
    section('Study Topics', content.studyTopics),
    section('Company Research', content.companyResearch),
  ].join('\n\n')
}

export async function handleCreatePrepPage(
  notion: NotionClient,
  openrouter: OpenRouterClient,
  args: CreatePrepPageArgs
): Promise<CreatePrepPageResult> {
  const { row, jdText } = await notion.getJobPage(args.job_id)

  const prompt = prepPagePrompt(row.company, row.role, row.jobType, jdText)
  const raw = await openrouter.generate(prompt)

  const content = parsePrepContent(raw)
  const formatted = formatPrepContent(content)

  const jobTitle = `${row.company} — ${row.role}`
  const prepPageId = await notion.createPrepPage(args.job_id, jobTitle, formatted)

  return { prep_page_id: prepPageId, job_id: args.job_id }
}
