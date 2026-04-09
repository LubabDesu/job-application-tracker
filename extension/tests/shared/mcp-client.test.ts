import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DetectedJob } from '../../src/shared/types.js'

const makeJob = (overrides: Partial<DetectedJob> = {}): DetectedJob => ({
  company: 'Acme',
  role: 'Software Engineer',
  url: 'https://acme.com/job/123',
  jdText: 'We are hiring.',
  sourcePlatform: 'greenhouse',
  ...overrides,
})

const makeOkResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const makeErrorResponse = (status: number) =>
  new Response('Error', { status })

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('callLogApplication()', () => {
  it('maps jdText → jd_text and sourcePlatform → source_platform in request body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      makeOkResponse({ job_id: 'j1', notion_url: 'https://notion.so/j1', status: 'logged' }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { callLogApplication } = await import('../../src/shared/mcp-client.js')
    const job = makeJob({ jdText: 'Build great things', sourcePlatform: 'workday' })
    await callLogApplication('http://localhost:3000', 'secret', job)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [_url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>

    expect(body['jd_text']).toBe('Build great things')
    expect(body['source_platform']).toBe('workday')
    expect(body).not.toHaveProperty('jdText')
    expect(body).not.toHaveProperty('sourcePlatform')
  })

  it('sends Authorization: Bearer <secret> header', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      makeOkResponse({ job_id: 'j1', notion_url: 'https://notion.so/j1', status: 'logged' }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { callLogApplication } = await import('../../src/shared/mcp-client.js')
    await callLogApplication('http://localhost:3000', 'my-secret', makeJob())

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-secret')
  })

  it('returns { success: true, jobId, notionUrl } on HTTP 200 with valid body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({ job_id: 'abc123', notion_url: 'https://notion.so/abc', status: 'logged' }),
      ),
    )

    const { callLogApplication } = await import('../../src/shared/mcp-client.js')
    const result = await callLogApplication('http://localhost:3000', 'secret', makeJob())

    expect(result).toEqual({
      success: true,
      jobId: 'abc123',
      notionUrl: 'https://notion.so/abc',
    })
  })

  it('returns { success: false, error: "HTTP 401" } on 401 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse(401)))

    const { callLogApplication } = await import('../../src/shared/mcp-client.js')
    const result = await callLogApplication('http://localhost:3000', 'bad-secret', makeJob())

    expect(result).toEqual({ success: false, error: 'HTTP 401' })
  })

  it('returns { success: false, error: <message> } when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { callLogApplication } = await import('../../src/shared/mcp-client.js')
    const result = await callLogApplication('http://localhost:3000', 'secret', makeJob())

    expect(result).toEqual({ success: false, error: 'Network error' })
  })

  it('returns { success: false, error: "Invalid response from server" } when body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not json at all }{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const { callLogApplication } = await import('../../src/shared/mcp-client.js')
    const result = await callLogApplication('http://localhost:3000', 'secret', makeJob())

    expect(result).toEqual({ success: false, error: 'Invalid response from server' })
  })

  it('returns { success: false, error: "Invalid response from server" } when body has wrong field types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({ job_id: 12345 }),  // job_id is a number, not a string — fails isLogResponseBody
      ),
    )

    const { callLogApplication } = await import('../../src/shared/mcp-client.js')
    const result = await callLogApplication('http://localhost:3000', 'secret', makeJob())

    expect(result).toEqual({ success: false, error: 'Invalid response from server' })
  })
})
