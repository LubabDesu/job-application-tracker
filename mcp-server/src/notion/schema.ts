// src/notion/schema.ts
export const DB_FIELDS = {
  COMPANY: 'Company',
  ROLE: 'Role',
  STATUS: 'Status',
  APPLIED_DATE: 'Applied Date',
  JOB_URL: 'Job URL',
  LOCATION: 'Location',
  SALARY_RANGE: 'Salary Range',
  SOURCE_PLATFORM: 'Source Platform',
  JOB_TYPE: 'Job Type',
  SENIORITY: 'Seniority',
  ENRICHED: 'Enriched',
  RECRUITER_CONTACT: 'Recruiter Contact',
  INTERVIEW_DATES: 'Interview Dates',
  GMAIL_THREAD_ID: 'Gmail Thread ID',
  NOTES: 'Notes',
  PREP_PAGE: 'Prep Page',
} as const

export const STATUS_OPTIONS = ['Applied', 'OA', 'Interview', 'Offer', 'Rejected'] as const
export type Status = typeof STATUS_OPTIONS[number]

export const JOB_TYPE_OPTIONS = ['Backend', 'Frontend', 'Fullstack', 'Infra', 'ML', 'Other'] as const
export type JobType = typeof JOB_TYPE_OPTIONS[number]

export const SENIORITY_OPTIONS = ['Intern', 'Junior', 'Mid', 'Senior', 'Staff'] as const
export type Seniority = typeof SENIORITY_OPTIONS[number]

export const SOURCE_OPTIONS = ['greenhouse', 'linkedin', 'lever', 'workday'] as const
export type Source = typeof SOURCE_OPTIONS[number]

export const PREP_DB_FIELDS = {
  NAME: 'Name',
  JOB: 'Job',
} as const
