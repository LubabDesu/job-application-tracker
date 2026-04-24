import type { DetectedJob } from '../shared/types.js'

// --- JD selectors (Ashby Overview tab / listing page) ---

const JD_SELECTORS = [
  '[data-qa="job-description"]',
  '.ashby-job-posting-brief-description',
  '.job-posting-description',
  '.job-description',
  'main',
] as const

// --- Submit button selectors ---

const SUBMIT_BUTTON_SELECTORS = [
  '[data-qa="submit-application-button"]',
  'button[type="submit"]',
  'button[class*="submit" i]',
] as const

// --- Cache types ---

export interface CachedJobData {
  role: string
  jdText: string
}

function isCachedJobData(value: unknown): value is CachedJobData {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['role'] === 'string' && typeof v['jdText'] === 'string'
}

// --- In-memory session state ---

let lastSeenJob: CachedJobData | null = null
const loggedUrls = new Set<string>()
const attachedButtons = new Set<Element>()
let _observerActive = true

// Exported for test isolation only
export function _resetStateForTesting(): void {
  lastSeenJob = null
  loggedUrls.clear()
  attachedButtons.clear()
  _observerActive = false
}

// --- URL helpers ---

// URL pattern: jobs.ashbyhq.com/{slug}/{uuid}[/application[?params]]
// slug = first path segment, always present
export function extractCompanyFromUrl(): string {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const slug = parts[0] ?? ''
  if (slug === '') return ''
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Listing page: /{slug}/{uuid} — exactly 2 path segments
export function isListingPage(): boolean {
  const parts = window.location.pathname.split('/').filter(Boolean)
  return parts.length === 2
}

// Strip /application[?params] so the listing URL is used as the dedup key.
// Ensures a Simplify redirect landing on /application doesn't create a
// different key than an SPA navigation from the same listing.
function normalizeJobUrl(href: string): string {
  return href.replace(/\/application(\?[^#]*)?$/, '')
}

// --- DOM helpers ---

function extractText(selectors: readonly string[]): string {
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el !== null && el.textContent !== null) {
      const text = el.textContent.trim()
      if (text.length > 0) return text
    }
  }
  return ''
}

export function scrapeJobDetails(): CachedJobData {
  // Role: confirmed in <h1> on both listing AND application pages on Ashby.
  const role = document.querySelector('h1')?.textContent?.trim() ?? ''
  const jdText = extractText(JD_SELECTORS)
  return { role, jdText }
}

// --- In-memory cache helpers ---

export function getCachedJob(): CachedJobData | null {
  return lastSeenJob
}

export function isAlreadyLogged(url: string): boolean {
  return loggedUrls.has(url)
}

export function markAsLogged(url: string): void {
  loggedUrls.add(url)
}

// --- Job assembly ---

export function buildDetectedJob(url: string, cached: CachedJobData | null): DetectedJob {
  return {
    company: extractCompanyFromUrl(),
    role: cached?.role ?? '',
    url,
    jdText: cached?.jdText ?? '',
    sourcePlatform: 'ashby',
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== 'object' || message === null) return false
  if ((message as Record<string, unknown>)['type'] !== 'GET_JOB_INFO') return false

  const normalizedUrl = normalizeJobUrl(window.location.href)
  const cached = lastSeenJob ?? scrapeJobDetails()
  sendResponse(buildDetectedJob(normalizedUrl, cached))
  return true
})

// --- Listing page handler ---

export function handleListingPage(): void {
  if (!isListingPage()) return
  const details = scrapeJobDetails()
  if (details.role !== '' || details.jdText !== '') {
    lastSeenJob = details
    try {
      void chrome.storage.local.set({ ashby_lastSeenJob: details })
    } catch {
      // CSP may block — in-memory only
    }
    console.log(
      `[ashby] cached: ${details.role} | jd (${details.jdText.length} chars)`,
    )
  }
}

// --- Listing page JD fetch (fallback for Simplify deep-links) ---

async function fetchListingJd(listingUrl: string): Promise<string> {
  try {
    const res = await fetch(listingUrl)
    if (!res.ok) return ''
    const html = await res.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const selector of JD_SELECTORS) {
      if (selector === 'main') continue // too broad — skip as fallback
      const el = doc.querySelector(selector)
      const text = el?.textContent?.trim() ?? ''
      if (text.length > 50) return text
    }
  } catch {
    // Network error, CSP block, or parse failure — silent fallback
  }
  return ''
}

// --- Submit click handler ---

async function handleSubmitClick(): Promise<void> {
  const normalizedUrl = normalizeJobUrl(window.location.href)

  if (isAlreadyLogged(normalizedUrl)) {
    console.log('[ashby] alreadyLogged: true')
    return
  }

  // Mark synchronously before any await — prevents re-entrant sends from
  // concurrent click events or observer ticks while this function is suspended.
  markAsLogged(normalizedUrl)

  let cached = lastSeenJob ?? scrapeJobDetails()

  // Listing page was never visited (e.g. Simplify deep-link to /application).
  // Fetch the listing HTML and extract JD from it.
  if (cached.jdText === '') {
    const fetchedJd = await fetchListingJd(normalizedUrl)
    if (fetchedJd !== '') {
      cached = { ...cached, jdText: fetchedJd }
      console.log(`[ashby] fetched jd from listing (${fetchedJd.length} chars)`)
    }
  }

  const job = buildDetectedJob(normalizedUrl, cached)

  if (job.role === '') {
    loggedUrls.delete(normalizedUrl)
    console.warn('[ashby] skipping JOB_DETECTED — role empty')
    return
  }

  console.log('[ashby] detected job:', job)

  try {
    await chrome.runtime.sendMessage({ type: 'JOB_DETECTED', job })
    console.log('[ashby] JOB_DETECTED sent successfully')
  } catch (err) {
    loggedUrls.delete(normalizedUrl)
    console.error('[ashby] Failed to send JOB_DETECTED message:', err)
    return
  }
  try { void chrome.storage.local.remove('ashby_lastSeenJob') } catch { }
  console.log('[ashby] URL marked as logged')
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
          console.error('[ashby] handleSubmitClick error:', err)
        })
      },
      { once: true },
    )

    console.log('[ashby] submit listener attached to', selector)
    break
  }
}

// --- MutationObserver ---

function startObserver(): void {
  const observer = new MutationObserver(() => {
    // Guard: disabled in test environment via _resetStateForTesting()
    if (!_observerActive) return

    handleListingPage()
    attachSubmitListener()
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// --- Entry point ---

console.log('[ashby] content script loaded on', window.location.href)
handleListingPage()
attachSubmitListener()
startObserver()
