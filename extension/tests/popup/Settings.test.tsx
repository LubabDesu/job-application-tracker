import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

function makeChrome(storedSettings?: Record<string, unknown>) {
  const localGetMock = vi.fn().mockResolvedValue(
    storedSettings !== undefined ? { settings: storedSettings } : {},
  )
  const localSetMock = vi.fn().mockResolvedValue(undefined)
  return {
    localGetMock,
    localSetMock,
    chrome: {
      storage: {
        local: { get: localGetMock, set: localSetMock },
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('Settings', () => {
  it('renders mcpUrl and mcpSecret inputs populated from storage', async () => {
    const { chrome } = makeChrome({ mcpUrl: 'http://localhost:3000', mcpSecret: 'abc' })
    vi.stubGlobal('chrome', chrome)

    const { default: Settings } = await import('../../src/popup/Settings.js')
    render(<Settings onBack={() => {}} />)

    await waitFor(() => {
      expect((screen.getByLabelText('MCP URL') as HTMLInputElement).value).toBe('http://localhost:3000')
      expect((screen.getByLabelText('MCP Secret') as HTMLInputElement).value).toBe('abc')
    })
  })

  it('uses DEFAULT_SETTINGS when storage is empty', async () => {
    const { chrome } = makeChrome(undefined)
    vi.stubGlobal('chrome', chrome)

    const { default: Settings } = await import('../../src/popup/Settings.js')
    render(<Settings onBack={() => {}} />)

    await waitFor(() => {
      expect((screen.getByLabelText('MCP URL') as HTMLInputElement).value).toBe('http://localhost:3000')
      expect((screen.getByLabelText('MCP Secret') as HTMLInputElement).value).toBe('')
    })
  })

  it('saves updated settings to chrome.storage.local on form submit', async () => {
    const { chrome, localSetMock } = makeChrome({ mcpUrl: 'http://localhost:3000', mcpSecret: 'old' })
    vi.stubGlobal('chrome', chrome)

    const { default: Settings } = await import('../../src/popup/Settings.js')
    render(<Settings onBack={() => {}} />)

    await waitFor(() => screen.getByLabelText('MCP Secret'))

    const secretInput = screen.getByLabelText('MCP Secret')
    await userEvent.clear(secretInput)
    await userEvent.type(secretInput, 'new-secret')

    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(localSetMock).toHaveBeenCalledWith({
      settings: { mcpUrl: 'http://localhost:3000', mcpSecret: 'new-secret' },
    })
  })

  it('shows "Saved ✓" confirmation after successful save', async () => {
    const { chrome } = makeChrome({ mcpUrl: 'http://localhost:3000', mcpSecret: 'x' })
    vi.stubGlobal('chrome', chrome)

    const { default: Settings } = await import('../../src/popup/Settings.js')
    render(<Settings onBack={() => {}} />)

    await waitFor(() => screen.getByRole('button', { name: /save/i }))
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument()
    })
  })

  it('calls onBack when Back button is clicked', async () => {
    const { chrome } = makeChrome({})
    vi.stubGlobal('chrome', chrome)
    const onBack = vi.fn()

    const { default: Settings } = await import('../../src/popup/Settings.js')
    render(<Settings onBack={onBack} />)

    await waitFor(() => screen.getByRole('button', { name: /back/i }))
    await userEvent.click(screen.getByRole('button', { name: /back/i }))

    expect(onBack).toHaveBeenCalledOnce()
  })
})
