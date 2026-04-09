import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSearchJobs } from '../../src/tools/search-jobs.js'
import type { NotionClient, JobRow } from '../../src/notion/client.js'

const makeJobRow = (overrides: Partial<JobRow> = {}): JobRow => ({
  jobId: 'job-1',
  notionUrl: 'https://notion.so/job-1',
  company: 'Acme',
  role: 'Software Engineer',
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
  searchJobs: vi.fn(),
} as unknown as NotionClient

beforeEach(() => vi.clearAllMocks())

describe('handleSearchJobs', () => {
  it('returns formatted results when searchJobs finds matches', async () => {
    const jobs = [
      makeJobRow({ jobId: 'job-1', company: 'Acme', role: 'Backend Engineer' }),
      makeJobRow({ jobId: 'job-2', company: 'BetaCorp', role: 'Senior Engineer' }),
    ]
    mockNotion.searchJobs = vi.fn().mockResolvedValue(jobs)

    const result = await handleSearchJobs(mockNotion, { query: 'engineer' })

    expect(result.jobs).toBe(jobs)
    expect(result.count).toBe(2)
  })

  it('returns empty array and count of 0 when no results', async () => {
    mockNotion.searchJobs = vi.fn().mockResolvedValue([])

    const result = await handleSearchJobs(mockNotion, { query: 'zzznomatch' })

    expect(result.jobs).toEqual([])
    expect(result.count).toBe(0)
  })

  it('passes the query string to searchJobs correctly', async () => {
    mockNotion.searchJobs = vi.fn().mockResolvedValue([])

    await handleSearchJobs(mockNotion, { query: 'Google' })

    expect(mockNotion.searchJobs).toHaveBeenCalledOnce()
    expect(mockNotion.searchJobs).toHaveBeenCalledWith('Google')
  })

  it('propagates errors from searchJobs', async () => {
    mockNotion.searchJobs = vi.fn().mockRejectedValue(new Error('Notion API error'))

    await expect(
      handleSearchJobs(mockNotion, { query: 'anything' })
    ).rejects.toThrow('Notion API error')
  })
})
