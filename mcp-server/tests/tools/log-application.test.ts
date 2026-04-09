import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleLogApplication } from '../../src/tools/log-application.js'
import type { NotionClient } from '../../src/notion/client.js'

const mockNotion = {
  findByUrl: vi.fn(),
  createJob: vi.fn(),
  appendJdText: vi.fn(),
} as unknown as NotionClient

describe('handleLogApplication', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a job and returns logged status', async () => {
    mockNotion.findByUrl = vi.fn().mockResolvedValue(null)
    mockNotion.createJob = vi.fn().mockResolvedValue({ jobId: 'page-123', notionUrl: 'https://notion.so/page-123' })
    mockNotion.appendJdText = vi.fn().mockResolvedValue(undefined)

    const result = await handleLogApplication(mockNotion, {
      company: 'Stripe', role: 'SWE', url: 'https://job.url',
      jd_text: 'Job description here', source_platform: 'greenhouse'
    })

    expect(result.status).toBe('logged')
    expect(result.job_id).toBe('page-123')
    expect(mockNotion.createJob).toHaveBeenCalledOnce()
    expect(mockNotion.appendJdText).toHaveBeenCalledWith('page-123', 'Job description here')
  })

  it('returns duplicate status when URL already exists', async () => {
    mockNotion.findByUrl = vi.fn().mockResolvedValue('existing-page-id')

    const result = await handleLogApplication(mockNotion, {
      company: 'Stripe', role: 'SWE', url: 'https://job.url',
      jd_text: 'JD', source_platform: 'greenhouse'
    })

    expect(result.status).toBe('duplicate')
    expect(result.job_id).toBe('existing-page-id')
    expect(mockNotion.createJob).not.toHaveBeenCalled()
  })
})
