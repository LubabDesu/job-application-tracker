import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Chrome API mock ---

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
  storage: {
    local: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
})

const {
  extractCompanyFromUrl,
  isListingPage,
  scrapeJobDetails,
  getCachedJob,
  isAlreadyLogged,
  markAsLogged,
  buildDetectedJob,
  handleListingPage,
  attachSubmitListener,
  _resetStateForTesting,
} = await import('../../src/content/ashby.ts')

const LISTING_URL = 'https://jobs.ashbyhq.com/sentry/5e112240-922a-48f1-8865-9e7f89687f39'
const CONFIRM_URL = 'https://jobs.ashbyhq.com/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application'
const CONFIRM_URL_SIMPLIFY = 'https://jobs.ashbyhq.com/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application?gh_src=Simplify'

beforeEach(() => {
  _resetStateForTesting()
  vi.clearAllMocks()
  document.body.innerHTML = ''
  document.title = ''
  vi.mocked(chrome.storage.local.get).mockResolvedValue({})

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...window.location,
      pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39',
      href: LISTING_URL,
    },
  })
})

// --- 1. extractCompanyFromUrl() ---

describe('extractCompanyFromUrl()', () => {
  it('converts single-word slug to title case', () => {
    expect(extractCompanyFromUrl()).toBe('Sentry')
  })

  it('converts hyphenated slug to title-cased words', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/hao-ai-lab/some-uuid' },
    })
    expect(extractCompanyFromUrl()).toBe('Hao Ai Lab')
  })

  it('works on the application page URL', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application' },
    })
    expect(extractCompanyFromUrl()).toBe('Sentry')
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
  it('returns true for /{slug}/{uuid}', () => {
    expect(isListingPage()).toBe(true)
  })

  it('returns false for /{slug}/{uuid}/application', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application' },
    })
    expect(isListingPage()).toBe(false)
  })

  it('returns false for /{slug} (company page)', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/sentry' },
    })
    expect(isListingPage()).toBe(false)
  })
})

// --- 3. scrapeJobDetails() ---

describe('scrapeJobDetails()', () => {
  it('extracts role from h1', () => {
    document.body.innerHTML = '<h1>Software Engineer, Intern (Fall 2026)</h1>'
    const result = scrapeJobDetails()
    expect(result.role).toBe('Software Engineer, Intern (Fall 2026)')
  })

  it('extracts jdText from job-description selector', () => {
    document.body.innerHTML = '<h1>SWE</h1><div class="job-description">We build great things.</div>'
    const result = scrapeJobDetails()
    expect(result.jdText).toContain('We build great things')
  })

  it('returns empty strings when DOM has no relevant content', () => {
    document.body.innerHTML = '<div>Nothing here</div>'
    const result = scrapeJobDetails()
    expect(result.role).toBe('')
    expect(result.jdText).toBe('')
  })
})

// --- 4. handleListingPage() ---

describe('handleListingPage()', () => {
  it('caches role and jdText and writes to chrome.storage.local', () => {
    document.body.innerHTML = '<h1>Software Engineer, Intern (Fall 2026)</h1><div class="job-description">JD text here.</div>'
    handleListingPage()
    const cached = getCachedJob()
    expect(cached?.role).toBe('Software Engineer, Intern (Fall 2026)')
    expect(cached?.jdText).toContain('JD text here')
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ ashby_lastSeenJob: expect.objectContaining({ role: 'Software Engineer, Intern (Fall 2026)' }) })
    )
  })

  it('does not cache when not on a listing page', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application' },
    })
    document.body.innerHTML = '<h1>Software Engineer, Intern (Fall 2026)</h1>'
    handleListingPage()
    expect(getCachedJob()).toBeNull()
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })

  it('does not cache when both role and jdText are empty', () => {
    document.body.innerHTML = '<div>Nothing relevant</div>'
    handleListingPage()
    expect(getCachedJob()).toBeNull()
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })

  it('continues gracefully when chrome.storage.local.set throws', () => {
    vi.mocked(chrome.storage.local.set).mockImplementation(() => { throw new Error('CSP') })
    document.body.innerHTML = '<h1>Software Engineer</h1>'
    expect(() => handleListingPage()).not.toThrow()
    expect(getCachedJob()?.role).toBe('Software Engineer')
  })
})

// --- 5. Deduplication ---

describe('Deduplication', () => {
  it('isAlreadyLogged returns false for a new URL', () => {
    expect(isAlreadyLogged(LISTING_URL)).toBe(false)
  })

  it('markAsLogged makes isAlreadyLogged return true', () => {
    markAsLogged(LISTING_URL)
    expect(isAlreadyLogged(LISTING_URL)).toBe(true)
  })

  it('_resetStateForTesting clears the logged set', () => {
    markAsLogged(LISTING_URL)
    _resetStateForTesting()
    expect(isAlreadyLogged(LISTING_URL)).toBe(false)
  })
})

// --- 6. buildDetectedJob() ---

describe('buildDetectedJob()', () => {
  it('uses URL slug for company, cache for role/jdText', () => {
    const job = buildDetectedJob(LISTING_URL, { role: 'SWE Intern', jdText: 'JD.' })
    expect(job.company).toBe('Sentry')
    expect(job.role).toBe('SWE Intern')
    expect(job.jdText).toBe('JD.')
    expect(job.sourcePlatform).toBe('ashby')
    expect(job.url).toBe(LISTING_URL)
  })

  it('returns empty role when cache is null', () => {
    const job = buildDetectedJob(LISTING_URL, null)
    expect(job.role).toBe('')
  })
})

// --- 7. attachSubmitListener() ---

describe('attachSubmitListener()', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application',
        href: CONFIRM_URL,
      },
    })
  })

  it('attaches listener to [data-qa="submit-application-button"] when present', () => {
    document.body.innerHTML = `
      <h1>Software Engineer, Intern (Fall 2026)</h1>
      <button data-qa="submit-application-button">Submit Application</button>
    `
    attachSubmitListener()
    const button = document.querySelector('[data-qa="submit-application-button"]')
    expect(button?.hasAttribute('data-jt-attached')).toBe(true)
  })

  it('falls back to button[type="submit"] when primary selector is absent', () => {
    document.body.innerHTML = `
      <h1>Software Engineer, Intern (Fall 2026)</h1>
      <button type="submit">Submit</button>
    `
    attachSubmitListener()
    const button = document.querySelector('button[type="submit"]')
    expect(button?.hasAttribute('data-jt-attached')).toBe(true)
  })

  it('does not attach a second listener when already attached (data-jt-attached guard)', async () => {
    // Cache role so JOB_DETECTED fires
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39', href: LISTING_URL },
    })
    document.body.innerHTML = '<h1>Software Engineer, Intern (Fall 2026)</h1><div class="job-description">JD</div>'
    handleListingPage()

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application', href: CONFIRM_URL },
    })
    document.body.innerHTML = `
      <h1>Software Engineer, Intern (Fall 2026)</h1>
      <button type="submit">Submit</button>
    `
    attachSubmitListener()
    attachSubmitListener() // second call — must be a no-op

    // Only one listener — confirmed by click firing JOB_DETECTED exactly once
    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()
    // Wait for microtask queue
    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    })
  })

  it('does nothing gracefully when no submit button is in the DOM', () => {
    document.body.innerHTML = '<div>No buttons here</div>'
    expect(() => attachSubmitListener()).not.toThrow()
  })

  it('_resetStateForTesting resets the attached buttons set', () => {
    document.body.innerHTML = '<button type="submit">Submit</button>'
    attachSubmitListener()
    _resetStateForTesting()
    // After reset, a fresh button in the DOM gets a listener attached again
    document.body.innerHTML = '<button type="submit">Submit</button>'
    attachSubmitListener()
    const button = document.querySelector('button[type="submit"]')
    expect(button?.hasAttribute('data-jt-attached')).toBe(true)
  })
})

// --- 8. Click handler — happy path ---

describe('Submit click → JOB_DETECTED (warm cache)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application',
        href: CONFIRM_URL,
      },
    })
  })

  it('fires JOB_DETECTED on click when cache is warm', async () => {
    // Cache from listing page visit
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39', href: LISTING_URL },
    })
    document.body.innerHTML = '<h1>Software Engineer, Intern (Fall 2026)</h1><div class="job-description">JD here.</div>'
    handleListingPage()

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application', href: CONFIRM_URL },
    })
    document.body.innerHTML = `
      <h1>Software Engineer, Intern (Fall 2026)</h1>
      <button data-qa="submit-application-button">Submit Application</button>
    `
    attachSubmitListener()

    const button = document.querySelector('[data-qa="submit-application-button"]') as HTMLButtonElement
    button.click()

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'JOB_DETECTED',
        job: expect.objectContaining({
          company: 'Sentry',
          role: 'Software Engineer, Intern (Fall 2026)',
          sourcePlatform: 'ashby',
        }),
      })
    )
    expect(isAlreadyLogged(LISTING_URL)).toBe(true)
  })

  it('fires JOB_DETECTED via DOM scrape when cache is cold (h1 on /application)', async () => {
    document.body.innerHTML = `
      <h1>Software Engineer, Intern (Fall 2026)</h1>
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
        job: expect.objectContaining({ company: 'Sentry', role: 'Software Engineer, Intern (Fall 2026)' }),
      })
    )
  })

  it('second click does not fire JOB_DETECTED again (dedup)', async () => {
    document.body.innerHTML = `
      <h1>Software Engineer, Intern (Fall 2026)</h1>
      <button type="submit">Submit</button>
    `
    attachSubmitListener()
    markAsLogged(LISTING_URL)

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    // Small wait to confirm no async send occurs
    await new Promise(r => setTimeout(r, 10))
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('does not mark URL as logged when role is empty', async () => {
    document.body.innerHTML = `
      <button type="submit">Submit</button>
    `
    attachSubmitListener()

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    await new Promise(r => setTimeout(r, 10))
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
    expect(isAlreadyLogged(LISTING_URL)).toBe(false)
  })
})

// --- 9. Click handler — Simplify redirect URL normalization ---

describe('Submit click → URL normalization (Simplify ?gh_src)', () => {
  it('normalizes /application?params to listing URL as dedup key', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        pathname: '/sentry/5e112240-922a-48f1-8865-9e7f89687f39/application',
        href: CONFIRM_URL_SIMPLIFY,
      },
    })
    document.body.innerHTML = `
      <h1>Software Engineer, Intern (Fall 2026)</h1>
      <button type="submit">Submit</button>
    `
    attachSubmitListener()

    const button = document.querySelector('button[type="submit"]') as HTMLButtonElement
    button.click()

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    })
    // Dedup key is the normalized listing URL, not the Simplify URL
    expect(isAlreadyLogged(LISTING_URL)).toBe(true)
    expect(isAlreadyLogged(CONFIRM_URL_SIMPLIFY)).toBe(false)
  })
})
