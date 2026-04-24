export type Status = 'Applied' | 'OA' | 'Interview' | 'Offer' | 'Rejected'
export type JobType = 'Backend' | 'Frontend' | 'Fullstack' | 'Infra' | 'ML' | 'Other'

export interface JobApplication {
  jobId: string
  company: string
  role: string
  status: Status
  appliedDate: string
  jobUrl: string
  jobType: string
  enriched: boolean
}

export interface DetectedJob {
  company: string
  role: string
  url: string
  jdText: string
  sourcePlatform: 'ashby' | 'greenhouse' | 'lever' | 'linkedin' | 'manual' | 'workday'
  applicationStep?: number
}

export interface ExtensionSettings {
  mcpUrl: string
  mcpSecret: string
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  mcpUrl: 'http://127.0.0.1:3000',
  mcpSecret: '',
}

export function normalizeMcpUrl(mcpUrl: string): string {
  const trimmed = mcpUrl.trim()
  if (trimmed === '') return DEFAULT_SETTINGS.mcpUrl

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed.replace(/^\/+/, '')}`

  try {
    const url = new URL(withScheme)
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
    if (/^\/(?:mcp|log|health)\/?$/i.test(url.pathname)) url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return withScheme
      .replace(/\/+$/, '')
      .replace(/\/(?:mcp|log|health)$/i, '')
  }
}

export function normalizeMcpSecret(mcpSecret: string): string {
  return mcpSecret.trim()
}

export interface LogEntry {
  status: 'pending' | 'logged' | 'error'
  company: string
  role: string
  jobId?: string
  notionUrl?: string
  error?: string
  loggedAt: string
}
