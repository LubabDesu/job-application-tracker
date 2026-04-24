import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Chrome API mock ---

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onMessage: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
})

// Dynamic import after stubs are set up so module-level chrome calls resolve correctly.
const {
  extractCompanyFromUrl,
  isListingPage,
  scrapeListingPage,
  getCachedJob,
  isAlreadyLogged,
  markAsLogged,
  buildDetectedJob,
  attachSubmitListener,
  _resetStateForTesting,
} = await import('../../src/content/greenhouse.ts')

const LISTING_URL = 'https://job-boards.greenhouse.io/botauto/jobs/5172257008'
const CONFIRM_URL = 'https://job-boards.greenhouse.io/botauto/jobs/5172257008/confirmation'

beforeEach(() => {
  _resetStateForTesting()
  vi.clearAllMocks()
  document.body.innerHTML = ''
  document.title = ''

  // Reset storage mock default to empty after clearAllMocks wipes implementations
  vi.mocked(chrome.storage.local.get).mockResolvedValue({})

  // Reset pathname to a neutral listing-page value
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...window.location,
      pathname: '/botauto/jobs/5172257008',
      href: LISTING_URL,
    },
  })
})

// --- 1. extractCompanyFromUrl() ---

describe('extractCompanyFromUrl()', () => {
  it('converts a single-word slug to title case', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/botauto/jobs/5172257008' },
    })
    expect(extractCompanyFromUrl()).toBe('Botauto')
  })

  it('converts a hyphenated slug to title-cased words', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/bot-auto/jobs/5172257008' },
    })
    expect(extractCompanyFromUrl()).toBe('Bot Auto')
  })

  it('works on the confirmation page URL', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/botauto/jobs/5172257008/confirmation' },
    })
    expect(extractCompanyFromUrl()).toBe('Botauto')
  })

  it('returns empty string when path has no slug', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/' },
    })
    expect(extractCompanyFromUrl()).toBe('')
  })
})

// --- 2. isListingPage() ---

describe('isListingPage()', () => {
  it('returns true for /slug/jobs/123 (numeric ID, no trailing segment)', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/botauto/jobs/5172257008' },
    })
    expect(isListingPage()).toBe(true)
  })

  it('returns false for /slug/jobs/123/confirmation', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/botauto/jobs/5172257008/confirmation' },
    })
    expect(isListingPage()).toBe(false)
  })

  it('returns false for a non-job path', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/botauto' },
    })
    expect(isListingPage()).toBe(false)
  })
})

// --- 3. scrapeListingPage() + getCachedJob() ---

describe('scrapeListingPage()', () => {
  it('caches role and jdText when on a listing page', () => {
    // isListingPage() already returns true from beforeEach pathname
    document.body.innerHTML = `
      <h1>Software Engineer</h1>
      <div class="job-description">We build great things here.</div>
    `
    scrapeListingPage()
    const cached = getCachedJob()
    expect(cached?.role).toBe('Software Engineer')
    expect(cached?.jdText).toContain('We build great things here')
  })

  it('does not cache when h1 contains confirmation text', () => {
    document.body.innerHTML = '<h1>Thank you for applying.</h1>'
    scrapeListingPage()
    // Cache stays null — confirmation text is guarded
    expect(getCachedJob()).toBeNull()
  })

  it('does not cache anything when not on a listing page', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/botauto/jobs/5172257008/confirmation' },
    })
    document.body.innerHTML = '<h1>Software Engineer</h1>'
    scrapeListingPage()
    expect(getCachedJob()).toBeNull()
  })

  it('caches jdText even when role is empty', () => {
    document.body.innerHTML = '<div class="job-description">JD only, no h1 yet.</div>'
    scrapeListingPage()
    const cached = getCachedJob()
    expect(cached?.jdText).toContain('JD only')
    expect(cached?.role).toBe('')
  })

  it('does not update cache when both role and jdText are empty', () => {
    document.body.innerHTML = '<div>Nothing relevant</div>'
    scrapeListingPage()
    expect(getCachedJob()).toBeNull()
  })

  it('writes to chrome.storage.local when role is found', () => {
    document.body.innerHTML = '<h1>Software Engineer</h1><div class="job-description">JD text.</div>'
    scrapeListingPage()
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ greenhouse_lastSeenJob: expect.objectContaining({ role: 'Software Engineer' }) })
    )
  })

  it('does not write to chrome.storage.local when both role and jdText are empty', () => {
    document.body.innerHTML = '<div>Nothing relevant</div>'
    scrapeListingPage()
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })

  it('continues gracefully when chrome.storage.local.set throws', () => {
    vi.mocked(chrome.storage.local.set).mockImplementation(() => { throw new Error('CSP') })
    document.body.innerHTML = '<h1>Software Engineer</h1>'
    expect(() => scrapeListingPage()).not.toThrow()
    expect(getCachedJob()?.role).toBe('Software Engineer')
  })
})

// --- 4. Deduplication (synchronous, in-memory) ---

describe('Deduplication', () => {
  it('isAlreadyLogged returns false for a new URL', () => {
    expect(isAlreadyLogged(CONFIRM_URL)).toBe(false)
  })

  it('markAsLogged makes isAlreadyLogged return true', () => {
    markAsLogged(CONFIRM_URL)
    expect(isAlreadyLogged(CONFIRM_URL)).toBe(true)
  })

  it('markAsLogged tracks multiple URLs independently', () => {
    const url1 = 'https://job-boards.greenhouse.io/botauto/jobs/1/confirmation'
    const url2 = 'https://job-boards.greenhouse.io/botauto/jobs/2/confirmation'
    markAsLogged(url1)
    expect(isAlreadyLogged(url1)).toBe(true)
    expect(isAlreadyLogged(url2)).toBe(false)
    markAsLogged(url2)
    expect(isAlreadyLogged(url2)).toBe(true)
  })

  it('_resetStateForTesting clears the logged set', () => {
    markAsLogged(CONFIRM_URL)
    _resetStateForTesting()
    expect(isAlreadyLogged(CONFIRM_URL)).toBe(false)
  })
})

// --- 5. buildDetectedJob() ---

describe('buildDetectedJob()', () => {
  it('pulls company from URL, not DOM', () => {
    // No company-related DOM element — company must come from URL slug
    document.body.innerHTML = '<h1>Software Engineer</h1>'
    const job = buildDetectedJob()
    expect(job.company).toBe('Botauto')
    expect(job.sourcePlatform).toBe('greenhouse')
  })

  it('pulls role from cache, not h1 on confirmation page', () => {
    // Simulate: listing page cached the role, then URL changed to confirmation
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/botauto/jobs/5172257008',
        href: LISTING_URL,
      },
    })
    document.body.innerHTML = '<h1>Software Engineer</h1><div class="job-description">We build things.</div>'
    scrapeListingPage()

    // Now navigate to confirmation page — h1 is now the "thank you" text
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/botauto/jobs/5172257008/confirmation',
        href: CONFIRM_URL,
      },
    })
    document.body.innerHTML = '<h1>Thank you for applying.</h1>'

    const job = buildDetectedJob()
    expect(job.role).toBe('Software Engineer')   // from cache, not h1
    expect(job.jdText).toContain('We build things')
  })

  it('returns empty role when cache is cold', () => {
    const job = buildDetectedJob()
    expect(job.role).toBe('')
  })

  it('returns current href as url', () => {
    const job = buildDetectedJob()
    expect(job.url).toBe(window.location.href)
  })
})

// --- 6. attachSubmitListener() ---

describe('attachSubmitListener()', () => {
  it('attaches listener to #submit_app when present', () => {
    document.body.innerHTML = `
      <h1>Software Engineer</h1>
      <input id="submit_app" type="submit" value="Submit Application" />
    `
    attachSubmitListener()
    const button = document.querySelector('#submit_app')
    expect(button?.hasAttribute('data-jt-attached')).toBe(true)
  })

  it('falls back to input[type="submit"] when #submit_app is absent', () => {
    document.body.innerHTML = `
      <h1>Software Engineer</h1>
      <input type="submit" value="Submit" />
    `
    attachSubmitListener()
    const button = document.querySelector('input[type="submit"]')
    expect(button?.hasAttribute('data-jt-attached')).toBe(true)
  })

  it('falls back to button[type="submit"] when input submit is absent', () => {
    document.body.innerHTML = `
      <h1>Software Engineer</h1>
      <button type="submit">Submit</button>
    `
    attachSubmitListener()
    const button = document.querySelector('button[type="submit"]')
    expect(button?.hasAttribute('data-jt-attached')).toBe(true)
  })

  it('does not attach a second listener when already attached (data-jt-attached guard)', async () => {
    // Cache role so JOB_DETECTED fires
    document.body.innerHTML = '<h1>Software Engineer</h1><div class="job-description">JD</div>'
    scrapeListingPage()

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/botauto/jobs/5172257008/application', href: CONFIRM_URL },
    })
    document.body.innerHTML = '<button type="submit">Submit</button>'
    attachSubmitListener()
    attachSubmitListener() // second call — must be a no-op

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    })
  })

  it('does nothing gracefully when no submit button is in the DOM', () => {
    document.body.innerHTML = '<div>No buttons here</div>'
    expect(() => attachSubmitListener()).not.toThrow()
  })

  it('_resetStateForTesting resets the attached buttons tracking', () => {
    document.body.innerHTML = '<button type="submit">Submit</button>'
    attachSubmitListener()
    _resetStateForTesting()
    // After reset, a new button gets a listener attached
    document.body.innerHTML = '<button type="submit">Submit</button>'
    attachSubmitListener()
    const button = document.querySelector('button[type="submit"]')
    expect(button?.hasAttribute('data-jt-attached')).toBe(true)
  })
})

// --- 7. Submit click → JOB_DETECTED ---

describe('Submit click → JOB_DETECTED (warm cache)', () => {
  it('fires JOB_DETECTED on click when cache is warm', async () => {
    // Step 1: cache role + JD from listing page
    document.body.innerHTML = '<h1>Software Engineer</h1><div class="job-description">We build things.</div>'
    scrapeListingPage()

    // Step 2: navigate to application form
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/botauto/jobs/5172257008/confirmation',
        href: CONFIRM_URL,
      },
    })
    document.body.innerHTML = `
      <h1>Thank you for applying.</h1>
      <button type="submit">Submit Application</button>
    `
    attachSubmitListener()

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'JOB_DETECTED',
        job: expect.objectContaining({
          company: 'Botauto',
          role: 'Software Engineer',
          sourcePlatform: 'greenhouse',
        }),
      }),
    )
    expect(isAlreadyLogged(CONFIRM_URL)).toBe(true)
  })

  it('second click does not fire JOB_DETECTED again (dedup)', async () => {
    document.body.innerHTML = '<h1>Software Engineer</h1><div class="job-description">JD</div>'
    scrapeListingPage()

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/botauto/jobs/5172257008/confirmation', href: CONFIRM_URL },
    })
    document.body.innerHTML = '<button type="submit">Submit</button>'
    attachSubmitListener()
    markAsLogged(CONFIRM_URL)

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    await new Promise(r => setTimeout(r, 10))
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('does not mark URL as logged when role is empty', async () => {
    // Cache is cold, no h1 with real role
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/botauto/jobs/5172257008/confirmation', href: CONFIRM_URL },
    })
    document.body.innerHTML = '<button type="submit">Submit</button>'
    attachSubmitListener()

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    await new Promise(r => setTimeout(r, 10))
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
    expect(isAlreadyLogged(CONFIRM_URL)).toBe(false)
  })
})

// --- 8. Submit click → Simplify storage recovery ---

describe('Submit click → chrome.storage.local recovery', () => {
  const storageConfirmUrl = 'https://job-boards.greenhouse.io/specterops/jobs/8490047002/confirmation?gh_src=Simplify'

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/specterops/jobs/8490047002/confirmation',
        href: storageConfirmUrl,
      },
    })
  })

  it('sends JOB_DETECTED when role is recovered from chrome.storage.local', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      greenhouse_lastSeenJob: { role: 'Security Engineer', jdText: 'We build secure things.' },
    })

    document.body.innerHTML = `
      <h1>Thank you for applying.</h1>
      <button type="submit">Submit</button>
    `
    attachSubmitListener()

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'JOB_DETECTED',
        job: expect.objectContaining({ role: 'Security Engineer', company: 'Specterops' }),
      })
    )
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('greenhouse_lastSeenJob')
  })

  it('skips JOB_DETECTED when storage also has no role', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({})
    document.body.innerHTML = `
      <h1>Thank you for applying.</h1>
      <button type="submit">Submit</button>
    `
    attachSubmitListener()

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    await new Promise(r => setTimeout(r, 10))
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('continues gracefully when chrome.storage.local.get throws', async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error('CSP'))
    document.body.innerHTML = `
      <h1>Thank you for applying.</h1>
      <button type="submit">Submit</button>
    `
    attachSubmitListener()

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    await new Promise(r => setTimeout(r, 10))
    // No role available — should not send
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('second concurrent click is deduped synchronously', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      greenhouse_lastSeenJob: { role: 'Security Engineer', jdText: 'JD.' },
    })
    document.body.innerHTML = `
      <h1>Thank you for applying.</h1>
      <button type="submit">Submit</button>
    `
    // Attach twice to simulate two separate click-listener setups — only one
    // should fire due to { once: true } and data-jt-attached guard
    attachSubmitListener()

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    // Simulate two rapid clicks
    button.click()
    button.click()

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    })
  })
})
