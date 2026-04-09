import type { DetectedJob } from '../shared/types.js'

// --- Selectors ---

const JD_SELECTORS = [
  '.job-description',
  '#job-description',
  '.content',
  '[data-job-description]',
  'main',
] as const

const SUBMIT_BUTTON_SELECTORS = [
  '#submit_app',
  'input[type="submit"]',
  'button[type="submit"]',
  '[data-qa="submit-application"]',
] as const

// --- In-memory session state ---
// Using module-level state instead of chrome.storage.session, which is blocked
// by strict CSPs on Greenhouse pages.

interface CachedJobData {
  role: string
  jdText: string
}

function isCachedJobData(value: unknown): value is CachedJobData {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['role'] === 'string' && typeof v['jdText'] === 'string'
}

const CONFIRMATION_TEXT_PATTERNS = [
  /thank you for applying/i,
  /application submitted/i,
  /application received/i,
  /successfully applied/i,
] as const

let lastSeenJob: CachedJobData | null = null
const loggedUrls = new Set<string>()
const attachedButtons = new Set<Element>()
let _observerActive = true

// Exported for testing only
export function _resetStateForTesting(): void {
  lastSeenJob = null
  loggedUrls.clear()
  attachedButtons.clear()
  _observerActive = false
}

// --- URL helpers ---

// Greenhouse URL pattern: job-boards.greenhouse.io/{slug}/jobs/{id}[/confirmation]
// The slug is always the first path segment and is always present.
export function extractCompanyFromUrl(): string {
  const parts = window.location.pathname.split('/').filter(Boolean)
  // parts[0] = slug, parts[1] = 'jobs', parts[2] = id, parts[3] = 'confirmation' (optional)
  const slug = parts[0] ?? ''
  if (slug === '') return ''
  // Convert slug to title case: "bot-auto" → "Bot Auto", "botauto" → "Botauto"
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Returns true when on a listing page (e.g. /botauto/jobs/5172257008),
// i.e. the path ends with a numeric job ID and has no trailing /confirmation.
export function isListingPage(): boolean {
  return /\/jobs\/\d+$/.test(window.location.pathname)
}

// --- DOM helpers ---

function extractText(selectors: readonly string[]): string {
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el !== null && el.textContent !== null) {
      const text = el.textContent.trim()
      if (text.length > 0) {
        return text
      }
    }
  }
  return ''
}

// --- Listing-page cache ---

export function scrapeListingPage(): void {
  if (!isListingPage()) return

  // Role: use h1 on the listing page. Guard against confirmation text (e.g.
  // "Thank you for applying.") arriving in h1 if the URL hasn't changed yet.
  const h1 = document.querySelector('h1')
  const h1Text = h1?.textContent?.trim() ?? ''
  const isConfirmationText = CONFIRMATION_TEXT_PATTERNS.some(p => p.test(h1Text))
  const role = isConfirmationText ? '' : h1Text

  const jdText = extractText(JD_SELECTORS)

  if (role !== '' || jdText !== '') {
    lastSeenJob = { role, jdText }
    try {
      void chrome.storage.local.set({ greenhouse_lastSeenJob: { role, jdText } })
    } catch {
      // CSP may block — in-memory only
    }
  }
}

// Exported for testing
export function getCachedJob(): CachedJobData | null {
  return lastSeenJob
}

// --- Deduplication (in-memory, CSP-safe) ---

export function isAlreadyLogged(url: string): boolean {
  return loggedUrls.has(url)
}

export function markAsLogged(url: string): void {
  loggedUrls.add(url)
}

// --- Job assembly ---

export function buildDetectedJob(): DetectedJob {
  return {
    company: extractCompanyFromUrl(),
    role: lastSeenJob?.role ?? '',
    url: window.location.href,
    jdText: lastSeenJob?.jdText ?? '',
    sourcePlatform: 'greenhouse',
  }
}

// --- Submit click handler ---

async function handleSubmitClick(): Promise<void> {
  const url = window.location.href

  if (isAlreadyLogged(url)) {
    console.log('[greenhouse] alreadyLogged: true')
    return
  }

  // Mark synchronously before any await — prevents re-entrant sends from
  // concurrent click events or observer ticks while this function is suspended.
  markAsLogged(url)

  if (lastSeenJob === null) {
    try {
      const result = await chrome.storage.local.get('greenhouse_lastSeenJob')
      if (isCachedJobData(result['greenhouse_lastSeenJob'])) {
        lastSeenJob = result['greenhouse_lastSeenJob'] as CachedJobData
        console.log('[greenhouse] restored cache from chrome.storage.local')
      }
    } catch {
      // CSP blocked — continue with empty cache, fall through to DOM scrape
    }
  }

  if (lastSeenJob === null) {
    const h1 = document.querySelector('h1')
    const h1Text = h1?.textContent?.trim() ?? ''
    const isConfirmationText = CONFIRMATION_TEXT_PATTERNS.some(p => p.test(h1Text))
    const role = isConfirmationText ? '' : h1Text
    const jdText = extractText(JD_SELECTORS)
    if (role !== '' || jdText !== '') {
      lastSeenJob = { role, jdText }
    }
  }

  const job = buildDetectedJob()
  console.log('[Job Tracker] detected job:', job)

  if (job.role === '') {
    loggedUrls.delete(url)
    console.warn('[greenhouse] skipping — role empty (listing page not visited in this tab)')
    return
  }

  try {
    await chrome.runtime.sendMessage({ type: 'JOB_DETECTED', job })
    console.log('[Job Tracker] JOB_DETECTED sent successfully')
  } catch (err) {
    loggedUrls.delete(url)
    console.error('[greenhouse] Failed to send JOB_DETECTED message:', err)
    return
  }
  try { void chrome.storage.local.remove('greenhouse_lastSeenJob') } catch { }
  console.log('[Job Tracker] URL marked as logged')
}

// --- Submit button listener ---

export function attachSubmitListener(): void {
  for (const selector of SUBMIT_BUTTON_SELECTORS) {
    const button = document.querySelector(selector)
    if (button === null) continue
    if (button.hasAttribute('data-jt-attached')) continue

    button.setAttribute('data-jt-attached', 'true')
    attachedButtons.add(button)

    button.addEventListener(
      'click',
      () => {
        handleSubmitClick().catch((err: unknown) => {
          console.error('[greenhouse] handleSubmitClick error:', err)
        })
      },
      { once: true },
    )

    console.log('[greenhouse] submit listener attached to', selector)
    break
  }
}

// --- MutationObserver for SPA navigation ---

function startObserver(): void {
  const observer = new MutationObserver(() => {
    // Guard: disabled in test environment via _resetStateForTesting()
    if (!_observerActive) return

    // Always attempt to cache listing-page data on any mutation so data is
    // available when the user reaches the application form.
    scrapeListingPage()

    // Attach submit listener whenever the DOM mutates — catches the button
    // when the SPA renders the application form.
    attachSubmitListener()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// --- Entry point ---

console.log('[Job Tracker] content script loaded on', window.location.href)

// Attempt to cache role + JD on initial load (listing page).
scrapeListingPage()

// Attach submit listener on initial load (for server-rendered forms).
attachSubmitListener()

startObserver()
