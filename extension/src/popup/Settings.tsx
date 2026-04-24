import { useState, useEffect } from 'react'
import type { ExtensionSettings } from '../shared/types.js'
import { DEFAULT_SETTINGS, normalizeMcpSecret, normalizeMcpUrl } from '../shared/types.js'

const BG = '#fbfaf7'
const SURFACE = '#f3f1ec'
const CARD_BG = '#ffffff'
const BORDER = '#dedad2'
const TEXT_PRIMARY = '#171717'
const TEXT_SECONDARY = '#5f5b53'
const TEXT_MUTED = '#8d877d'
const ACCENT = '#235a8e'
const ACCENT_SOFT = '#6e93b8'
const SUCCESS = '#287a4b'
const SUCCESS_BG = '#edf7f1'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

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
    const normalizedSettings: ExtensionSettings = {
      mcpUrl: normalizeMcpUrl(settings.mcpUrl),
      mcpSecret: normalizeMcpSecret(settings.mcpSecret),
    }
    setSettings(normalizedSettings)
    chrome.storage.local.set({ settings: normalizedSettings }).then(() => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    fontWeight: 800,
    color: TEXT_SECONDARY,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: 6,
  }

  const inputBaseStyle: React.CSSProperties = {
    width: '100%',
    height: 40,
    padding: '0 12px',
    fontSize: 13,
    background: CARD_BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    color: TEXT_PRIMARY,
    fontFamily: FONT,
    outline: 'none',
    transition: 'border-color 160ms ease, box-shadow 160ms ease',
  }

  return (
    <main style={{
      width: 360,
      background: BG,
      padding: 16,
      fontFamily: FONT,
      fontSize: 13,
      color: TEXT_PRIMARY,
      boxSizing: 'border-box',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              background: CARD_BG,
              color: TEXT_SECONDARY,
              cursor: 'pointer',
              fontSize: 14,
              display: 'grid',
              placeItems: 'center',
              transition: 'background 160ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = SURFACE
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = CARD_BG
            }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.1 }}>
              Settings
            </div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 5 }}>
              Connection
            </div>
          </div>
        </div>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          color: ACCENT,
          fontSize: 12,
          fontWeight: 700,
        }}>
          JT
        </div>
      </header>

      <div style={{
        height: 1,
        background: BORDER,
        marginBottom: 14,
      }} />

      <section style={{
        borderRadius: 8,
        border: `1px solid ${BORDER}`,
        background: CARD_BG,
        padding: 14,
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="mcpUrl" style={labelStyle}>MCP URL</label>
            <input
              id="mcpUrl"
              type="text"
              value={settings.mcpUrl}
              onChange={(e) => setSettings({ ...settings, mcpUrl: e.target.value })}
              style={inputBaseStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = ACCENT_SOFT
                e.currentTarget.style.boxShadow = `0 0 0 3px rgba(35,90,142,0.12)`
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = BORDER
                e.currentTarget.style.boxShadow = 'none'
              }}
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
              style={inputBaseStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = ACCENT_SOFT
                e.currentTarget.style.boxShadow = `0 0 0 3px rgba(35,90,142,0.12)`
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = BORDER
                e.currentTarget.style.boxShadow = 'none'
              }}
              aria-label="MCP Secret"
            />
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              height: 42,
              fontSize: 13,
              fontWeight: 700,
              background: saved ? SUCCESS_BG : ACCENT,
              border: saved ? '1px solid rgba(40,122,75,0.28)' : `1px solid ${ACCENT}`,
              color: saved ? SUCCESS : '#ffffff',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: FONT,
              boxShadow: saved ? 'none' : '0 1px 2px rgba(23,23,23,0.12)',
              transition: 'background 200ms ease, color 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
            }}
          >
            {saved ? 'Saved ✓' : 'Save settings'}
          </button>
        </form>
      </section>
    </main>
  )
}
