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
  sourcePlatform: 'greenhouse' | 'workday' | 'ashby'
  applicationStep?: number
}

export interface ExtensionSettings {
  mcpUrl: string
  mcpSecret: string
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  mcpUrl: 'http://localhost:3000',
  mcpSecret: '',
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
