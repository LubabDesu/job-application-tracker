import type { DetectedJob } from './types.js'

export interface McpCallResult {
  success: boolean
  jobId?: string
  notionUrl?: string
  error?: string
}

interface LogResponseBody {
  job_id?: string
  notion_url?: string
  status?: string
}

function isLogResponseBody(value: unknown): value is LogResponseBody {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (v['job_id'] === undefined || typeof v['job_id'] === 'string') &&
    (v['notion_url'] === undefined || typeof v['notion_url'] === 'string') &&
    (v['status'] === undefined || typeof v['status'] === 'string')
  )
}

export async function callLogApplication(
  mcpUrl: string,
  mcpSecret: string,
  job: DetectedJob,
): Promise<McpCallResult> {
  let response: Response
  try {
    response = await fetch(`${mcpUrl}/log`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mcpSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        company: job.company,
        role: job.role,
        url: job.url,
        jd_text: job.jdText,
        source_platform: job.sourcePlatform,
      }),
    })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { success: false, error: errorMessage }
  }

  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}` }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { success: false, error: 'Invalid response from server' }
  }

  if (!isLogResponseBody(body)) {
    return { success: false, error: 'Invalid response from server' }
  }

  return {
    success: true,
    jobId: body.job_id,
    notionUrl: body.notion_url,
  }
}
