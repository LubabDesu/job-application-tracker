import type { NotionClient } from '../notion/client.js'
import type { OpenRouterClient } from '../openrouter/client.js'
import type { Source, JobType, Seniority } from '../notion/schema.js'
import { JOB_TYPE_OPTIONS, SENIORITY_OPTIONS } from '../notion/schema.js'
import { enrichmentPrompt } from '../openrouter/prompts.js'

export interface LogApplicationArgs {
  company: string
  role: string
  url: string
  jd_text?: string
  source_platform: Source
  location?: string
  salary_range?: string
}

export interface LogApplicationResult {
  job_id: string
  notion_url?: string
  status: 'logged' | 'duplicate'
}

/**
 * Enrichment runs in the background. It MUST not throw or crash the process.
 */
export async function enrichAsync(
  notion: NotionClient,
  openrouter: OpenRouterClient,
  jobId: string,
  jdText: string
): Promise<void> {
  if (!jdText || !jdText.trim()) return
  try {
    const prompt = enrichmentPrompt(jdText)
    const raw = await openrouter.generate(prompt, 45000) // 45s timeout for background task
    
    if (!raw) {
      console.error(`[enrichAsync] ${jobId}: Empty response from AI`)
      return
    }

    // Clean markdown blocks if present
    const cleaned = raw.replace(/```json\s?|\s?```/g, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error(`[enrichAsync] ${jobId}: Failed to parse JSON from AI:`, cleaned)
      return
    }

    // Validate and sanitize
    const jobType = (JOB_TYPE_OPTIONS as readonly string[]).includes(parsed.jobType) 
      ? (parsed.jobType as JobType) 
      : 'Other'
    const seniority = (SENIORITY_OPTIONS as readonly string[]).includes(parsed.seniority) 
      ? (parsed.seniority as Seniority) 
      : 'Mid'
    const summary = Array.isArray(parsed.summary) 
      ? parsed.summary.filter((s: any) => typeof s === 'string') as string[]
      : []

    await notion.enrichJob(jobId, { jobType, seniority, summary })
    console.error(`[enrichAsync] ✓ Success for ${jobId} (${jobType}/${seniority})`)
  } catch (err) {
    console.error(`[enrichAsync] ✗ Critical failure for ${jobId}:`, err instanceof Error ? err.message : err)
  }
}

export async function handleLogApplication(
  notion: NotionClient,
  args: LogApplicationArgs,
  openrouter?: OpenRouterClient
): Promise<LogApplicationResult> {
  const existing = await notion.findByUrl(args.url)
  if (existing) return { job_id: existing, status: 'duplicate' }

  const { jobId, notionUrl } = await notion.createJob({
    company: args.company,
    role: args.role,
    url: args.url,
    jdText: args.jd_text ?? '',
    sourcePlatform: args.source_platform,
    location: args.location,
    salaryRange: args.salary_range,
  })

  if (args.jd_text && args.jd_text.trim()) {
    await notion.appendJdText(jobId, args.jd_text)

    // Fire-and-forget enrichment (does not block response)
    if (openrouter) {
      void enrichAsync(notion, openrouter, jobId, args.jd_text)
    }
  }

  return { job_id: jobId, notion_url: notionUrl, status: 'logged' }
}
