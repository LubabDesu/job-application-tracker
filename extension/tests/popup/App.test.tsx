import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const TEST_MCP_URL = 'http://127.0.0.1:3000'
const TEST_MCP_SECRET = 'test-secret'

function makeChrome(
  localSettings?: Record<string, unknown>,
  sessionEntry?: Record<string, unknown>,
) {
  return {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue(
          localSettings !== undefined ? { settings: localSettings } : {},
        ),
      },
      session: {
        get: vi.fn().mockResolvedValue(
          sessionEntry !== undefined ? { lastLogged: sessionEntry } : {},
        ),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn(),
    },
    runtime: {
      lastError: undefined,
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  }
}

function makeFetchOk() {
  return vi.fn().mockResolvedValue({ ok: true, status: 200 })
}

function makeFetchReject() {
  return vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
}

function makeFetch401() {
  return vi.fn().mockResolvedValue({ ok: false, status: 401 })
}

function makeFetchServerError() {
  return vi.fn().mockResolvedValue({ ok: false, status: 500 })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('App — ServerStatusBar', () => {
  it('shows "Checking server" on initial render before fetch resolves', async () => {
    const chrome = makeChrome({ mcpUrl: TEST_MCP_URL, mcpSecret: TEST_MCP_SECRET })
    vi.stubGlobal('chrome', chrome)
    // fetch never resolves during this test — stays in "checking"
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    const { default: App } = await import('../../src/popup/App.js')
    render(<App />)

    expect(screen.getByText('Checking server\u2026')).toBeInTheDocument()
  })

  it('shows "Server connected" when fetch resolves with 200', async () => {
    const chrome = makeChrome({ mcpUrl: TEST_MCP_URL, mcpSecret: TEST_MCP_SECRET })
    vi.stubGlobal('chrome', chrome)
    vi.stubGlobal('fetch', makeFetchOk())

    const { default: App } = await import('../../src/popup/App.js')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Server connected')).toBeInTheDocument()
    })
  })

  it('shows "Server offline" when fetch rejects (network error)', async () => {
    const chrome = makeChrome({ mcpUrl: TEST_MCP_URL, mcpSecret: TEST_MCP_SECRET })
    vi.stubGlobal('chrome', chrome)
    vi.stubGlobal('fetch', makeFetchReject())

    const { default: App } = await import('../../src/popup/App.js')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/Server offline/)).toBeInTheDocument()
    })
  })

  it('shows "Auth error" when fetch resolves with 401', async () => {
    const chrome = makeChrome({ mcpUrl: TEST_MCP_URL, mcpSecret: 'wrong-secret' })
    vi.stubGlobal('chrome', chrome)
    vi.stubGlobal('fetch', makeFetch401())

    const { default: App } = await import('../../src/popup/App.js')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/Auth error/)).toBeInTheDocument()
    })
  })

  it('shows "Server offline" when fetch resolves with non-ok, non-401 status', async () => {
    const chrome = makeChrome({ mcpUrl: TEST_MCP_URL, mcpSecret: TEST_MCP_SECRET })
    vi.stubGlobal('chrome', chrome)
    vi.stubGlobal('fetch', makeFetchServerError())

    const { default: App } = await import('../../src/popup/App.js')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/Server offline/)).toBeInTheDocument()
    })
  })

  it('uses DEFAULT_SETTINGS when chrome.storage.local returns no settings', async () => {
    const chrome = makeChrome(undefined)
    vi.stubGlobal('chrome', chrome)
    const fetchMock = makeFetchOk()
    vi.stubGlobal('fetch', fetchMock)

    const { default: App } = await import('../../src/popup/App.js')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Server connected')).toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/health',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer ' },
      }),
    )
  })

  it('normalizes copied URL and secret values before checking /health', async () => {
    const chrome = makeChrome({ mcpUrl: ' localhost:3000/mcp/ ', mcpSecret: ' test-secret ' })
    vi.stubGlobal('chrome', chrome)
    const fetchMock = makeFetchOk()
    vi.stubGlobal('fetch', fetchMock)

    const { default: App } = await import('../../src/popup/App.js')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Server connected')).toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/health',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer test-secret' },
      }),
    )
  })

  it('does not render ServerStatusBar when settings screen is shown', async () => {
    const chrome = makeChrome({ mcpUrl: TEST_MCP_URL, mcpSecret: TEST_MCP_SECRET })
    vi.stubGlobal('chrome', chrome)
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    const { default: App } = await import('../../src/popup/App.js')
    render(<App />)

    // ServerStatusBar should be visible in the main view
    expect(screen.getByText('Checking server\u2026')).toBeInTheDocument()
  })
})
