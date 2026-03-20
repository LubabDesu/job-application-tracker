import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotionClient } from '../../src/notion/client.js'

const mockCreate = vi.fn()
const mockQuery = vi.fn()
const mockUpdate = vi.fn()
const mockRetrieve = vi.fn()
const mockAppend = vi.fn()

vi.mock('@notionhq/client', () => ({
  Client: vi.fn(() => ({
    pages: { create: mockCreate, update: mockUpdate, retrieve: mockRetrieve },
    databases: { query: mockQuery },
    blocks: { children: { append: mockAppend } },
  }))
}))

describe('NotionClient', () => {
  let client: NotionClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new NotionClient('fake-token', 'db-id', 'prep-db-id')
  })

  it('findByUrl returns null when no results', async () => {
    mockQuery.mockResolvedValue({ results: [] })
    const result = await client.findByUrl('https://example.com/job')
    expect(result).toBeNull()
  })

  it('findByUrl returns page id when found', async () => {
    mockQuery.mockResolvedValue({ results: [{ id: 'page-123' }] })
    const result = await client.findByUrl('https://example.com/job')
    expect(result).toBe('page-123')
  })

  it('createJob returns new page id', async () => {
    mockCreate.mockResolvedValue({ id: 'new-page-id', url: 'https://notion.so/new-page-id' })
    const id = await client.createJob({
      company: 'Stripe', role: 'SWE', url: 'https://job.url',
      jdText: 'Some JD', sourcePlatform: 'greenhouse',
    })
    expect(id).toEqual({ jobId: 'new-page-id', notionUrl: 'https://notion.so/new-page-id' })
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('updateStatus calls pages.update with correct args', async () => {
    mockUpdate.mockResolvedValue({})
    await client.updateStatus('page-id', 'Interview')
    expect(mockUpdate).toHaveBeenCalledWith({
      page_id: 'page-id',
      properties: { Status: { select: { name: 'Interview' } } }
    })
  })
})
