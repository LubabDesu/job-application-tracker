import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeMcpUrl } from '../../src/shared/types.js'

describe('normalizeMcpUrl()', () => {
  it('preserves explicit http and https URLs', () => {
    expect(normalizeMcpUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    expect(normalizeMcpUrl('https://example.com')).toBe('https://example.com')
  })

  it('adds http:// when the saved URL is missing a scheme', () => {
    expect(normalizeMcpUrl('localhost:3000')).toBe('http://127.0.0.1:3000')
    expect(normalizeMcpUrl('//localhost:3000')).toBe('http://127.0.0.1:3000')
  })

  it('removes copied endpoint paths and trailing slashes', () => {
    expect(normalizeMcpUrl(' localhost:3000/mcp/ ')).toBe('http://127.0.0.1:3000')
    expect(normalizeMcpUrl('http://127.0.0.1:3000/health')).toBe('http://127.0.0.1:3000')
    expect(normalizeMcpUrl('http://127.0.0.1:3000/log')).toBe('http://127.0.0.1:3000')
  })

  it('uses the default MCP URL when the stored value is blank', () => {
    expect(normalizeMcpUrl('   ')).toBe(DEFAULT_SETTINGS.mcpUrl)
  })
})
