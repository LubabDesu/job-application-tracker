import { useState, useEffect } from 'react'
import type { LogEntry } from '../shared/types.js'
import Settings from './Settings.js'

// Keyframe animations injected once at the root
const STYLES = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity:0.25; transform:scale(0.8); } 50% { opacity:1; transform:scale(1); } }
  @keyframes fadein { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
  a:hover { opacity: 0.8; }
`

// Design tokens
const BG          = '#0c0c11'
const BORDER      = 'rgba(255,255,255,0.07)'
const TEXT        = '#dcdce8'
const MUTED       = '#4e4e66'
const SUCCESS     = '#34d399'
const PENDING_CLR = '#fbbf24'
const ERROR_CLR   = '#f87171'
const FONT        = `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

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

function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: 9,
      height: 9,
      border: `1.5px solid rgba(251,191,36,0.2)`,
      borderTopColor: PENDING_CLR,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
      animation: pulse ? 'pulse 2s ease-in-out infinite' : 'none',
    }} />
  )
}

function StatusLabel({ color, children }: { color: string; children: string }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      color,
      letterSpacing: '0.07em',
      textTransform: 'uppercase' as const,
    }}>
      {children}
    </span>
  )
}

function Header({ onSettings }: { onSettings: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: 'rgba(52,211,153,0.12)',
          border: '1px solid rgba(52,211,153,0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'monospace',
          color: SUCCESS,
          letterSpacing: '-0.04em',
          flexShrink: 0,
        }}>JT</div>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT, letterSpacing: '-0.01em' }}>
          Job Tracker
        </span>
      </div>
      <button
        onClick={onSettings}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        aria-label="Open settings"
        title="Settings"
        style={{
          background: hov ? 'rgba(255,255,255,0.06)' : 'transparent',
          border: 'none',
          padding: '3px 6px',
          borderRadius: 5,
          color: hov ? TEXT : MUTED,
          fontSize: 13,
          lineHeight: 1,
          cursor: 'pointer',
          transition: 'color 0.12s, background 0.12s',
          fontFamily: FONT,
        }}
      >
        ⚙
      </button>
    </div>
  )
}

export default function App() {
  const [entry, setEntry] = useState<LogEntry | null>(null)
  const [showSettings, setShowSettings] = useState(false)

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
      if (isLogEntry(change.newValue)) setEntry(change.newValue)
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  const shell: React.CSSProperties = {
    width: 300,
    background: BG,
    padding: '14px 14px 16px',
    fontFamily: FONT,
    fontSize: 13,
    color: TEXT,
  }

  const divider: React.CSSProperties = {
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 12,
  }

  if (showSettings) {
    return (
      <>
        <style>{STYLES}</style>
        <Settings onBack={() => setShowSettings(false)} />
      </>
    )
  }

  const renderStatus = () => {
    // Idle
    if (entry === null) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, animation: 'fadein 0.2s ease' }}>
          <Dot color={MUTED} pulse />
          <span style={{ fontSize: 12, color: MUTED }}>No applications tracked yet</span>
        </div>
      )
    }

    // Pending
    if (entry.status === 'pending') {
      return (
        <div style={{ animation: 'fadein 0.2s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <Spinner />
            <StatusLabel color={PENDING_CLR}>Logging</StatusLabel>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: TEXT, marginBottom: 2 }}>{entry.role}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{entry.company}</div>
        </div>
      )
    }

    // Logged
    if (entry.status === 'logged') {
      return (
        <div style={{ animation: 'fadein 0.2s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <Dot color={SUCCESS} />
            <StatusLabel color={SUCCESS}>Logged</StatusLabel>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: TEXT, marginBottom: 2 }}>{entry.role}</div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>{entry.company}</div>
          {entry.notionUrl !== undefined && (
            <a
              href={entry.notionUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: SUCCESS,
                textDecoration: 'none',
                background: 'rgba(52,211,153,0.1)',
                border: '1px solid rgba(52,211,153,0.2)',
                padding: '3px 9px',
                borderRadius: 4,
                transition: 'opacity 0.12s',
              }}
            >
              View in Notion →
            </a>
          )}
        </div>
      )
    }

    // Error
    return (
      <div style={{ animation: 'fadein 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
          <Dot color={ERROR_CLR} />
          <StatusLabel color={ERROR_CLR}>Error</StatusLabel>
        </div>
        <div style={{ fontSize: 12, color: MUTED }}>{entry.error ?? 'Unknown error'}</div>
      </div>
    )
  }

  return (
    <>
      <style>{STYLES}</style>
      <div style={shell}>
        <Header onSettings={() => setShowSettings(true)} />
        <div style={divider}>{renderStatus()}</div>
      </div>
    </>
  )
}
