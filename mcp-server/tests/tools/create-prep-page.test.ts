import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCreatePrepPage } from '../../src/tools/create-prep-page.js'
import type { NotionClient, JobRow } from '../../src/notion/client.js'
import type { OpenRouterClient } from '../../src/openrouter/client.js'

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

const validPrepJson = JSON.stringify({
  behavioral: ['Tell me about a time you failed.', 'Describe your greatest strength.'],
  technical: ['Explain Big-O notation.', 'What is a closure?'],
  systemDesign: ['Design a URL shortener.'],
  studyTopics: ['Algorithms', 'System design basics', 'React hooks'],
  companyResearch: ['Company mission', 'Recent funding round'],
})

const mockNotion = {
  getJobPage: vi.fn(),
  createPrepPage: vi.fn(),
} as unknown as NotionClient

const mockOpenRouter = {
  generate: vi.fn(),
} as unknown as OpenRouterClient

beforeEach(() => vi.clearAllMocks())

describe('handleCreatePrepPage', () => {
  it('happy path — calls createPrepPage with correct args and returns prep_page_id and job_id', async () => {
    const row = makeJobRow()
    mockNotion.getJobPage = vi.fn().mockResolvedValue({ row, jdText: 'Build APIs at scale.' })
    mockOpenRouter.generate = vi.fn().mockResolvedValue(validPrepJson)
    mockNotion.createPrepPage = vi.fn().mockResolvedValue('prep-page-abc')

    const result = await handleCreatePrepPage(mockNotion, mockOpenRouter, { job_id: 'job-1' })

    expect(mockNotion.getJobPage).toHaveBeenCalledOnce()
    expect(mockNotion.getJobPage).toHaveBeenCalledWith('job-1')

    expect(mockOpenRouter.generate).toHaveBeenCalledOnce()

    expect(mockNotion.createPrepPage).toHaveBeenCalledOnce()
    expect(mockNotion.createPrepPage).toHaveBeenCalledWith(
      'job-1',
      'Acme — SWE',
      expect.any(String)
    )

    expect(result).toEqual({ prep_page_id: 'prep-page-abc', job_id: 'job-1' })
  })

  it('LLM returns malformed JSON — throws "Failed to parse prep content from LLM"', async () => {
    const row = makeJobRow()
    mockNotion.getJobPage = vi.fn().mockResolvedValue({ row, jdText: 'Build APIs.' })
    mockOpenRouter.generate = vi.fn().mockResolvedValue('not json')

    await expect(
      handleCreatePrepPage(mockNotion, mockOpenRouter, { job_id: 'job-1' })
    ).rejects.toThrow('Failed to parse prep content from LLM')
  })

  it('LLM returns valid JSON but missing required fields — throws "Failed to parse prep content from LLM"', async () => {
    const row = makeJobRow()
    mockNotion.getJobPage = vi.fn().mockResolvedValue({ row, jdText: 'Build APIs.' })
    mockOpenRouter.generate = vi.fn().mockResolvedValue(JSON.stringify({ behavioral: ['Q1'] }))

    await expect(
      handleCreatePrepPage(mockNotion, mockOpenRouter, { job_id: 'job-1' })
    ).rejects.toThrow('Failed to parse prep content from LLM')
  })

  it('notion getJobPage error propagates', async () => {
    mockNotion.getJobPage = vi.fn().mockRejectedValue(new Error('Notion API error'))

    await expect(
      handleCreatePrepPage(mockNotion, mockOpenRouter, { job_id: 'job-bad' })
    ).rejects.toThrow('Notion API error')
  })

  it('content formatting — string passed to createPrepPage contains all section headers and items', async () => {
    const row = makeJobRow()
    mockNotion.getJobPage = vi.fn().mockResolvedValue({ row, jdText: 'Build APIs at scale.' })
    mockOpenRouter.generate = vi.fn().mockResolvedValue(validPrepJson)
    mockNotion.createPrepPage = vi.fn().mockResolvedValue('prep-page-xyz')

    await handleCreatePrepPage(mockNotion, mockOpenRouter, { job_id: 'job-1' })

    const capturedContent = (mockNotion.createPrepPage as ReturnType<typeof vi.fn>).mock.calls[0][2] as string

    expect(capturedContent).toContain('## Behavioral Questions')
    expect(capturedContent).toContain('## Technical Questions')
    expect(capturedContent).toContain('## System Design')
    expect(capturedContent).toContain('## Study Topics')
    expect(capturedContent).toContain('## Company Research')

    expect(capturedContent).toContain('- Tell me about a time you failed.')
    expect(capturedContent).toContain('- Explain Big-O notation.')
    expect(capturedContent).toContain('- Design a URL shortener.')
    expect(capturedContent).toContain('- Algorithms')
    expect(capturedContent).toContain('- Company mission')
  })
})
