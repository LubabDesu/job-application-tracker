import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleAppendNotes } from '../../src/tools/append-notes.js'
import { handleDeleteApplication } from '../../src/tools/delete-application.js'
import { handleGetApplications } from '../../src/tools/get-applications.js'
import type { NotionClient, JobRow } from '../../src/notion/client.js'

const makeJobRow = (overrides: Partial<JobRow> = {}): JobRow => ({
  jobId: 'job-1',
  notionUrl: 'https://notion.so/job-1',
  company: 'Acme',
  role: 'SWE',
  status: 'Applied',
  appliedDate: '2026-03-20',
  jobUrl: 'https://acme.com/jobs/1',
  location: 'Remote',
  salaryRange: '',
  sourcePlatform: 'greenhouse',
  jobType: 'Backend',
  seniority: 'Mid',
  enriched: false,
  notes: '',
  ...overrides,
})

const mockNotion = {
  appendNote: vi.fn(),
  deleteJob: vi.fn(),
  queryJobs: vi.fn(),
} as unknown as NotionClient

beforeEach(() => vi.clearAllMocks())

describe('handleAppendNotes', () => {
  it('calls notion.appendNote with the correct job_id and note', async () => {
    mockNotion.appendNote = vi.fn().mockResolvedValue(undefined)

    const result = await handleAppendNotes(mockNotion, {
      job_id: 'job-abc',
      note: 'Great interview with the hiring manager.',
    })

    expect(mockNotion.appendNote).toHaveBeenCalledOnce()
    expect(mockNotion.appendNote).toHaveBeenCalledWith(
      'job-abc',
      'Great interview with the hiring manager.'
    )
    expect(result).toEqual({ success: true })
  })

  it('propagates errors from notion.appendNote', async () => {
    mockNotion.appendNote = vi.fn().mockRejectedValue(new Error('Notion API error'))

    await expect(
      handleAppendNotes(mockNotion, { job_id: 'job-abc', note: 'test' })
    ).rejects.toThrow('Notion API error')
  })
})

describe('handleDeleteApplication', () => {
  it('calls notion.deleteJob and returns success with the job_id', async () => {
    mockNotion.deleteJob = vi.fn().mockResolvedValue(undefined)

    const result = await handleDeleteApplication(mockNotion, { job_id: 'job-xyz' })

    expect(mockNotion.deleteJob).toHaveBeenCalledOnce()
    expect(mockNotion.deleteJob).toHaveBeenCalledWith('job-xyz')
    expect(result).toEqual({ success: true, job_id: 'job-xyz' })
  })

  it('propagates errors from notion.deleteJob', async () => {
    mockNotion.deleteJob = vi.fn().mockRejectedValue(new Error('Not found'))

    await expect(
      handleDeleteApplication(mockNotion, { job_id: 'bad-id' })
    ).rejects.toThrow('Not found')
  })
})

describe('handleGetApplications', () => {
  it('returns jobs and count from notion.queryJobs with no filters', async () => {
    const jobs = [makeJobRow(), makeJobRow({ jobId: 'job-2', company: 'BetaCorp' })]
    mockNotion.queryJobs = vi.fn().mockResolvedValue(jobs)

    const result = await handleGetApplications(mockNotion, {})

    expect(mockNotion.queryJobs).toHaveBeenCalledOnce()
    expect(mockNotion.queryJobs).toHaveBeenCalledWith({
      status: undefined,
      jobType: undefined,
      company: undefined,
      limit: undefined,
    })
    expect(result.jobs).toBe(jobs)
    expect(result.count).toBe(2)
  })

  it('passes filters through to notion.queryJobs', async () => {
    const jobs = [makeJobRow()]
    mockNotion.queryJobs = vi.fn().mockResolvedValue(jobs)

    const result = await handleGetApplications(mockNotion, {
      status: 'Applied',
      job_type: 'Backend',
      company: 'Acme',
      limit: 5,
    })

    expect(mockNotion.queryJobs).toHaveBeenCalledWith({
      status: 'Applied',
      jobType: 'Backend',
      company: 'Acme',
      limit: 5,
    })
    expect(result.count).toBe(1)
  })

  it('returns empty jobs array and count of 0 when no matches', async () => {
    mockNotion.queryJobs = vi.fn().mockResolvedValue([])

    const result = await handleGetApplications(mockNotion, { status: 'Offer' })

    expect(result.jobs).toEqual([])
    expect(result.count).toBe(0)
  })
})
