import type { DetectedJob, ExtensionSettings, LogEntry } from '../shared/types.js'
import { callLogApplication } from '../shared/mcp-client.js'
import { DEFAULT_SETTINGS } from '../shared/types.js'

export type { LogEntry }

const VALID_PLATFORMS = new Set<string>(['ashby', 'workday', 'greenhouse'])
const MAX_JD_TEXT_LENGTH = 50_000

function isValidDetectedJob(value: unknown): value is DetectedJob {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['company'] === 'string' && v['company'].length > 0 &&
    typeof v['role'] === 'string' && v['role'].length > 0 &&
    typeof v['url'] === 'string' && /^https?:\/\//.test(v['url']) &&
    typeof v['jdText'] === 'string' &&
    typeof v['sourcePlatform'] === 'string' && VALID_PLATFORMS.has(v['sourcePlatform'])
  )
}

export async function handleJobDetected(job: DetectedJob): Promise<void> {
  const result = await chrome.storage.local.get('settings')
  const settings: ExtensionSettings =
    (result['settings'] as ExtensionSettings | undefined) ?? DEFAULT_SETTINGS

  const pendingEntry: LogEntry = {
    status: 'pending',
    company: job.company,
    role: job.role,
    loggedAt: new Date().toISOString(),
  }
  await chrome.storage.session.set({ lastLogged: pendingEntry })

  if (!settings.mcpSecret) {
    const errorEntry: LogEntry = {
      ...pendingEntry,
      status: 'error',
      error: 'MCP secret not configured',
    }
    await chrome.storage.session.set({ lastLogged: errorEntry })
    return
  }

  const mcpResult = await callLogApplication(settings.mcpUrl, settings.mcpSecret, job)

  if (mcpResult.success) {
    const loggedEntry: LogEntry = {
      ...pendingEntry,
      status: 'logged',
      jobId: mcpResult.jobId,
      notionUrl: mcpResult.notionUrl,
    }
    await chrome.storage.session.set({ lastLogged: loggedEntry })
  } else {
    const errorEntry: LogEntry = {
      ...pendingEntry,
      status: 'error',
      error: mcpResult.error,
    }
    await chrome.storage.session.set({ lastLogged: errorEntry })
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    // Only accept messages from our own extension contexts
    if (sender.id !== chrome.runtime.id) return false

    if (
      typeof message !== 'object' ||
      message === null ||
      (message as Record<string, unknown>)['type'] !== 'JOB_DETECTED'
    ) {
      return false
    }

    const rawJob = (message as Record<string, unknown>)['job']
    if (!isValidDetectedJob(rawJob)) {
      console.warn('[service-worker] invalid JOB_DETECTED payload, ignoring')
      sendResponse({ ok: false, error: 'Invalid job data' })
      return true
    }

    // Cap jdText to prevent unbounded memory/token usage
    const job: DetectedJob = {
      ...rawJob,
      jdText: rawJob.jdText.slice(0, MAX_JD_TEXT_LENGTH),
    }

    handleJobDetected(job)
      .then(() => {
        sendResponse({ ok: true })
      })
      .catch((_err: unknown) => {
        sendResponse({ ok: false, error: 'Internal error' })
      })
    return true
  },
)
