import { useState, useEffect } from 'react'
import type { ExtensionSettings } from '../shared/types.js'
import { DEFAULT_SETTINGS } from '../shared/types.js'

const BG      = '#0c0c11'
const BORDER  = 'rgba(255,255,255,0.07)'
const TEXT    = '#dcdce8'
const MUTED   = '#4e4e66'
const SUCCESS = '#34d399'
const FONT    = `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

interface Props {
  onBack: () => void
}

export default function Settings({ onBack }: Props) {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    chrome.storage.local.get('settings').then((result) => {
      const stored = result['settings'] as Partial<ExtensionSettings> | undefined
      if (stored !== undefined) setSettings({ ...DEFAULT_SETTINGS, ...stored })
    })
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    chrome.storage.local.set({ settings }).then(() => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    fontSize: 12,
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    color: TEXT,
    fontFamily: FONT,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    fontWeight: 600,
    color: MUTED,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    marginBottom: 5,
  }

  return (
    <div style={{
      width: 300,
      background: BG,
      padding: '14px 14px 16px',
      fontFamily: FONT,
      fontSize: 13,
      color: TEXT,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${BORDER}`,
            borderRadius: 5,
            color: MUTED,
            padding: '2px 8px',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          ←
        </button>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>Settings</span>
      </div>

      {/* Form */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="mcpUrl" style={labelStyle}>MCP URL</label>
            <input
              id="mcpUrl"
              type="text"
              value={settings.mcpUrl}
              onChange={(e) => setSettings({ ...settings, mcpUrl: e.target.value })}
              style={inputStyle}
              aria-label="MCP URL"
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="mcpSecret" style={labelStyle}>MCP Secret</label>
            <input
              id="mcpSecret"
              type="password"
              value={settings.mcpSecret}
              onChange={(e) => setSettings({ ...settings, mcpSecret: e.target.value })}
              style={inputStyle}
              aria-label="MCP Secret"
            />
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '7px',
              fontSize: 12,
              fontWeight: 500,
              background: saved ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${saved ? 'rgba(52,211,153,0.28)' : BORDER}`,
              color: saved ? SUCCESS : TEXT,
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: FONT,
              transition: 'all 0.15s',
            }}
          >
            {saved ? 'Saved ✓' : 'Save settings'}
          </button>
        </form>
      </div>
    </div>
  )
}
