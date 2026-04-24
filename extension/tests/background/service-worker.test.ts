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

// Build a chrome mock factory so we can reset between tests
function makeChromeStub(settingsOverride?: Record<string, unknown>) {
  const sessionSetMock = vi.fn().mockResolvedValue(undefined)
  const localGetMock = vi.fn().mockResolvedValue(
    settingsOverride !== undefined ? settingsOverride : {},
  )

  return {
    sessionSetMock,
    localGetMock,
    chrome: {
      runtime: {
        id: 'test-extension-id',
        onMessage: {
          addListener: vi.fn(),
        },
      },
      storage: {
        local: {
          get: localGetMock,
        },
        session: {
          set: sessionSetMock,
        },
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('handleJobDetected()', () => {
  it('sets status: error when mcpSecret is empty — no fetch called', async () => {
    const { sessionSetMock, chrome } = makeChromeStub({
      settings: { mcpUrl: 'http://127.0.0.1:3000', mcpSecret: '' },
    })
    vi.stubGlobal('chrome', chrome)

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { handleJobDetected } = await import('../../src/background/service-worker.ts')
    await handleJobDetected(makeJob())

    expect(fetchSpy).not.toHaveBeenCalled()

    const calls = sessionSetMock.mock.calls as Array<[Record<string, unknown>]>
    const finalCall = calls[calls.length - 1]?.[0] as Record<string, unknown>
    const lastLogged = finalCall?.['lastLogged'] as Record<string, unknown>
    expect(lastLogged?.['status']).toBe('error')
    expect(lastLogged?.['error']).toBe('MCP secret not configured')
  })

  it('calls storage.session.set twice (pending then logged) on successful MCP call', async () => {
    const { sessionSetMock, chrome } = makeChromeStub({
      settings: { mcpUrl: 'http://127.0.0.1:3000', mcpSecret: 'valid-secret' },
    })
    vi.stubGlobal('chrome', chrome)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ job_id: 'j1', notion_url: 'https://notion.so/j1', status: 'logged' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const { handleJobDetected } = await import('../../src/background/service-worker.ts')
    await handleJobDetected(makeJob())

    expect(sessionSetMock).toHaveBeenCalledTimes(2)

    const calls = sessionSetMock.mock.calls as Array<[Record<string, unknown>]>
    const firstEntry = (calls[0]?.[0] as Record<string, unknown>)?.['lastLogged'] as Record<string, unknown>
    const secondEntry = (calls[1]?.[0] as Record<string, unknown>)?.['lastLogged'] as Record<string, unknown>

    expect(firstEntry?.['status']).toBe('pending')
    expect(secondEntry?.['status']).toBe('logged')
    expect(secondEntry?.['jobId']).toBe('j1')
    expect(secondEntry?.['notionUrl']).toBe('https://notion.so/j1')
  })

  it('sets status: error when MCP call fails', async () => {
    const { sessionSetMock, chrome } = makeChromeStub({
      settings: { mcpUrl: 'http://127.0.0.1:3000', mcpSecret: 'valid-secret' },
    })
    vi.stubGlobal('chrome', chrome)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    )

    const { handleJobDetected } = await import('../../src/background/service-worker.ts')
    await handleJobDetected(makeJob())

    expect(sessionSetMock).toHaveBeenCalledTimes(2)

    const calls = sessionSetMock.mock.calls as Array<[Record<string, unknown>]>
    const finalEntry = (calls[1]?.[0] as Record<string, unknown>)?.['lastLogged'] as Record<string, unknown>

    expect(finalEntry?.['status']).toBe('error')
    expect(finalEntry?.['error']).toBe('HTTP 401')
  })
})
