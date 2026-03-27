import { useState, useEffect } from 'react'
import type { LogEntry } from '../shared/types.js'
import Settings from './Settings.js'

const SPINNER_FRAMES = ['|', '/', '-', '\\']

function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length)
    }, 150)
    return () => clearInterval(id)
  }, [active])
  return SPINNER_FRAMES[frame] ?? '|'
}

function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['status'] === 'string' &&
    typeof v['company'] === 'string' &&
    typeof v['role'] === 'string' &&
    typeof v['loggedAt'] === 'string'
  )
}

function Header({ onSettings }: { onSettings: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
      <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Job Tracker</h2>
      <button
        onClick={onSettings}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#888', padding: '0' }}
        aria-label="Open settings"
        title="Settings"
      >
        ⚙
      </button>
    </div>
  )
}

export default function App() {
  const [entry, setEntry] = useState<LogEntry | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const spinner = useSpinner(entry?.status === 'pending')

  useEffect(() => {
    chrome.storage.session.get('lastLogged').then((result) => {
      const raw = result['lastLogged']
      if (isLogEntry(raw)) setEntry(raw)
    })

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'session') return
      const change = changes['lastLogged']
      if (change === undefined) return
      const raw = change.newValue
      if (isLogEntry(raw)) {
        setEntry(raw)
      }
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const containerStyle: React.CSSProperties = {
    width: '240px',
    padding: '16px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    color: '#1a1a1a',
  }

  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} />
  }

  if (entry === null) {
    return (
      <div style={containerStyle}>
        <Header onSettings={() => setShowSettings(true)} />
        <p style={{ margin: 0, color: '#888' }}>No application logged yet.</p>
      </div>
    )
  }

  if (entry.status === 'pending') {
    return (
      <div style={containerStyle}>
        <Header onSettings={() => setShowSettings(true)} />
        <p style={{ margin: 0, color: '#555' }}>
          {spinner} Logging {entry.role} at {entry.company}...
        </p>
      </div>
    )
  }

  if (entry.status === 'logged') {
    return (
      <div style={containerStyle}>
        <Header onSettings={() => setShowSettings(true)} />
        <p style={{ margin: '0 0 6px', color: '#1a7f37', fontWeight: 500 }}>
          {'\u2713'} {entry.role} at {entry.company}
        </p>
        {entry.notionUrl !== undefined && (
          <a
            href={entry.notionUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#0969da', textDecoration: 'none', fontSize: '12px' }}
          >
            View in Notion &rarr;
          </a>
        )}
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <Header onSettings={() => setShowSettings(true)} />
      <p style={{ margin: 0, color: '#cf222e' }}>
        {'\u2717'} {entry.error ?? 'Unknown error'}
      </p>
    </div>
  )
}
