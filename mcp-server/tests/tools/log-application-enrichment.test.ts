import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enrichAsync } from '../../src/tools/log-application.js'
import type { NotionClient } from '../../src/notion/client.js'
import type { OpenRouterClient } from '../../src/openrouter/client.js'

describe('enrichAsync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('calls openrouter and patches notion row', async () => {
    const mockOpenRouter = {
      generate: vi.fn().mockResolvedValue(JSON.stringify({
        jobType: 'Backend',
        seniority: 'Senior',
        summary: ['Build APIs', 'Work with Postgres', 'Lead small team']
      }))
    } as unknown as OpenRouterClient

    const mockNotion = {
      enrichJob: vi.fn().mockResolvedValue(undefined)
    } as unknown as NotionClient

    await enrichAsync(mockNotion, mockOpenRouter, 'page-123', 'We need a backend engineer...')

    expect(mockOpenRouter.generate).toHaveBeenCalledOnce()
    expect(mockNotion.enrichJob).toHaveBeenCalledWith('page-123', {
      jobType: 'Backend',
      seniority: 'Senior',
      summary: ['Build APIs', 'Work with Postgres', 'Lead small team']
    })
  })

  it('cleans Markdown blocks and handles invalid enum values', async () => {
    const mockOpenRouter = {
      generate: vi.fn().mockResolvedValue('```json\n{"jobType": "SpacePilot", "seniority": "MegaBoss", "summary": ["Fly ship"]}\n```')
    } as unknown as OpenRouterClient

    const mockNotion = { enrichJob: vi.fn().mockResolvedValue(undefined) } as unknown as NotionClient

    await enrichAsync(mockNotion, mockOpenRouter, 'page-123', 'JD text')

    // Falls back to Other/Mid because SpacePilot/MegaBoss are invalid
    expect(mockNotion.enrichJob).toHaveBeenCalledWith('page-123', {
      jobType: 'Other',
      seniority: 'Mid',
      summary: ['Fly ship']
    })
  })

  it('does not throw when openrouter fails', async () => {
    const mockOpenRouter = { generate: vi.fn().mockRejectedValue(new Error('API error')) } as unknown as OpenRouterClient
    const mockNotion = { enrichJob: vi.fn() } as unknown as NotionClient

    await expect(enrichAsync(mockNotion, mockOpenRouter, 'page-id', 'JD text')).resolves.toBeUndefined()
    expect(mockNotion.enrichJob).not.toHaveBeenCalled()
  })
})
