import { useState, useEffect } from 'react'
import type { ExtensionSettings } from '../shared/types.js'
import { DEFAULT_SETTINGS } from '../shared/types.js'

interface Props {
  onBack: () => void
}

export default function Settings({ onBack }: Props) {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    chrome.storage.local.get('settings').then((result) => {
      const stored = result['settings'] as Partial<ExtensionSettings> | undefined
      if (stored !== undefined) {
        setSettings({ ...DEFAULT_SETTINGS, ...stored })
      }
    })
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    chrome.storage.local.set({ settings }).then(() => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: '#555',
    marginBottom: '3px',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '5px 7px',
    fontSize: '12px',
    border: '1px solid #d0d7de',
    borderRadius: '4px',
    fontFamily: 'system-ui, sans-serif',
  }

  const fieldStyle: React.CSSProperties = { marginBottom: '10px' }

  return (
    <div style={{ width: '240px', padding: '16px', fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#1a1a1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px 0 0', fontSize: '13px', color: '#555' }}
          aria-label="Back"
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Settings</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={fieldStyle}>
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

        <div style={fieldStyle}>
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
            padding: '6px',
            fontSize: '13px',
            fontWeight: 500,
            background: saved ? '#1a7f37' : '#0969da',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {saved ? 'Saved \u2713' : 'Save'}
        </button>
      </form>
    </div>
  )
}
