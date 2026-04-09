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

// Dynamic import after stubs are set up so module-level chrome calls resolve correctly
import type { CachedJobData } from '../../src/content/workday.ts'

const {
  isJobDetailPage,
  isConfirmationPage,
  scrapeJobDetails,
  buildDetectedJob,
  isAlreadyLogged,
  markAsLogged,
  logAutomationIds,
  handleConfirmation,
  handleJobDetailPage,
  cacheJobDetails,
  getCachedJobDetails,
  _resetStateForTesting,
} = await import('../../src/content/workday.ts')

beforeEach(() => {
  _resetStateForTesting()
  vi.clearAllMocks()
  document.body.innerHTML = ''
  document.title = ''
})

// --- 1. isJobDetailPage() ---

describe('isJobDetailPage()', () => {
  it('returns true when jobPostingPage attr is present', () => {
    document.body.innerHTML = '<div data-automation-id="jobPostingPage"><h1>Engineer</h1></div>'
    expect(isJobDetailPage()).toBe(true)
  })

  it('returns false when jobPostingPage attr is absent', () => {
    document.body.innerHTML = '<h1>Software Engineer</h1>'
    expect(isJobDetailPage()).toBe(false)
  })

  it('returns false on empty body', () => {
    document.body.innerHTML = ''
    expect(isJobDetailPage()).toBe(false)
  })
})

// --- 2. isConfirmationPage() ---

describe('isConfirmationPage()', () => {
  it('matches "successfully submitted your application" pattern', () => {
    document.body.innerHTML = '<p>You have successfully submitted your application.</p>'
    expect(isConfirmationPage()).toBe(true)
  })

  it('matches "application.*received" pattern', () => {
    document.body.innerHTML = '<p>Your application has been received by our team.</p>'
    expect(isConfirmationPage()).toBe(true)
  })

  it('matches "thank you for applying" pattern', () => {
    document.body.innerHTML = '<p>Thank you for applying to our company.</p>'
    expect(isConfirmationPage()).toBe(true)
  })

  it('returns false when no pattern matches', () => {
    document.body.innerHTML = '<p>Please complete the form below.</p>'
    expect(isConfirmationPage()).toBe(false)
  })

  it('matching is case-insensitive', () => {
    document.body.innerHTML = '<p>THANK YOU FOR APPLYING to Acme Corp.</p>'
    expect(isConfirmationPage()).toBe(true)
  })

  it("matches Fiserv-style 'application...successfully submitted'", () => {
    document.body.textContent = "Your application has been successfully submitted.";
    expect(isConfirmationPage()).toBe(true);
  });
  it("matches 'Application Submitted' modal title", () => {
    document.body.textContent = "Application Submitted";
    expect(isConfirmationPage()).toBe(true);
  });
})

// --- 3. scrapeJobDetails() ---

describe('scrapeJobDetails()', () => {
  it('extracts role from h1', () => {
    document.body.innerHTML = '<h1>Software Engineer</h1>'
    const { role } = scrapeJobDetails()
    expect(role).toBe('Software Engineer')
  })

  it('extracts location from [data-automation-id="locations"]', () => {
    document.body.innerHTML = '<div data-automation-id="locations"><dd>San Francisco, CA</dd></div>'
    const { location } = scrapeJobDetails()
    expect(location).toContain('San Francisco, CA')
  })

  it('extracts jdText from [data-automation-id="jobPostingDescription"] (primary)', () => {
    document.body.innerHTML = '<div data-automation-id="jobPostingDescription">JD content from Salesforce Workday instance.</div>'
    const { jdText } = scrapeJobDetails()
    expect(jdText).toContain('JD content from Salesforce Workday instance')
  })

  it('extracts jdText from [data-automation-id="job-posting-details"]', () => {
    document.body.innerHTML = '<div data-automation-id="job-posting-details">We are hiring a great engineer to join our team.</div>'
    const { jdText } = scrapeJobDetails()
    expect(jdText).toContain('We are hiring a great engineer')
  })

  it('extracts company as last segment of "Role | Company" title', () => {
    document.title = 'Software Engineer | Acme Corp'
    const { company } = scrapeJobDetails()
    expect(company).toBe('Acme Corp')
  })

  it('extracts company from myworkdayjobs.com subdomain', () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'salesforce.wd12.myworkdayjobs.com' },
    })
    document.title = 'Summer 2026 Intern – Software Engineer – Careers'
    const { company } = scrapeJobDetails()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    expect(company).toBe('Salesforce')
  })

  it('falls back to empty strings when no matching elements exist', () => {
    document.body.innerHTML = '<div>Nothing relevant here</div>'
    document.title = ''
    const { role, location, jdText } = scrapeJobDetails()
    expect(role).toBe('')
    expect(location).toBe('')
    expect(jdText).toBe('')
  })
})

// --- 4. buildDetectedJob() ---

describe('buildDetectedJob()', () => {
  it('builds correct shape from cached data', () => {
    const cached = { company: 'Acme', role: 'Engineer', jdText: 'Build things', location: 'SF' }
    const job = buildDetectedJob('https://example.com/job/123', cached, 3)
    expect(job).toMatchObject({
      company: 'Acme',
      role: 'Engineer',
      url: 'https://example.com/job/123',
      jdText: 'Build things',
      sourcePlatform: 'workday',
      applicationStep: 3,
    })
  })

  it('sets sourcePlatform to "workday"', () => {
    const cached = { company: 'X', role: 'Y', jdText: '', location: '' }
    const job = buildDetectedJob('https://example.com', cached, null)
    expect(job.sourcePlatform).toBe('workday')
  })

  it('sets jdText to empty string when cache is null', () => {
    const job = buildDetectedJob('https://example.com', null, null)
    expect(job.jdText).toBe('')
    expect(job.company).toBe('')
    expect(job.role).toBe('')
  })
})

// --- 5. Deduplication ---

describe('Deduplication', () => {
  it('isAlreadyLogged returns false when key is absent', () => {
    const result = isAlreadyLogged('https://example.com/job/1')
    expect(result).toBe(false)
  })

  it('markAsLogged creates a new entry on cold start', () => {
    markAsLogged('https://example.com/job/1')
    const result = isAlreadyLogged('https://example.com/job/1')
    expect(result).toBe(true)
  })

  it('markAsLogged appends to existing set', () => {
    markAsLogged('https://example.com/job/1')
    markAsLogged('https://example.com/job/2')

    expect(isAlreadyLogged('https://example.com/job/1')).toBe(true)
    expect(isAlreadyLogged('https://example.com/job/2')).toBe(true)
    expect(isAlreadyLogged('https://example.com/job/3')).toBe(false)
  })

  it('handleConfirmation skips sendMessage when URL is already logged', async () => {
    markAsLogged(window.location.href)
    document.body.innerHTML = '<p>You have successfully submitted your application.</p>'
    await handleConfirmation()
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })
})

// --- 6. Discovery ---

describe('logAutomationIds()', () => {
  it('calls console.log with an array of automation IDs', () => {
    document.body.innerHTML = `
      <div data-automation-id="jobTitle">Engineer</div>
      <div data-automation-id="locations">SF</div>
      <button data-automation-id="bottom-navigation-next-button">Next</button>
    `
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    logAutomationIds()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[workday] automation-ids found:',
      expect.arrayContaining(['jobTitle', 'locations', 'bottom-navigation-next-button']),
    )
    consoleSpy.mockRestore()
  })
})

// --- Additional: cacheJobDetails round-trip ---

describe('cacheJobDetails + getCachedJobDetails round-trip', () => {
  it('stores and retrieves the most recently cached job (single-slot)', () => {
    const url = 'https://acme.myworkdayjobs.com/en-US/job/se'
    const data = { company: 'Acme', role: 'SE', jdText: 'Build stuff', location: 'Remote' }

    cacheJobDetails(url, data)
    // URL param is ignored in the single-slot design — any url returns lastSeenJob
    const retrieved = getCachedJobDetails(url)

    expect(retrieved).toEqual(data)
  })

  it('overwrites previous entry when called again (last-write wins)', () => {
    const first = { company: 'Acme', role: 'Engineer', jdText: 'First JD', location: 'NY' }
    const second = { company: 'Globex', role: 'Manager', jdText: 'Second JD', location: 'SF' }

    cacheJobDetails('https://acme.wd1.myworkdayjobs.com/job/1', first)
    cacheJobDetails('https://globex.wd1.myworkdayjobs.com/job/2', second)

    const retrieved = getCachedJobDetails('https://acme.wd1.myworkdayjobs.com/job/1')
    expect(retrieved).toEqual(second)
  })

  it('returns null after _resetStateForTesting', () => {
    cacheJobDetails('https://acme.wd1.myworkdayjobs.com/job/1', {
      company: 'Acme', role: 'SE', jdText: 'JD', location: 'Remote',
    })
    _resetStateForTesting()
    expect(getCachedJobDetails('https://acme.wd1.myworkdayjobs.com/job/1')).toBeNull()
  })
})

// --- 6b. cacheJobDetails — storage write-through ---

describe("cacheJobDetails — storage write-through", () => {
    beforeEach(() => { _resetStateForTesting(); });

    it("writes to chrome.storage.local", () => {
        const data: CachedJobData = { company: "Fiserv", role: "Engineer", jdText: "Build things", location: "Remote" };
        cacheJobDetails("/irrelevant", data);
        expect(chrome.storage.local.set).toHaveBeenCalledWith({ workday_lastSeenJob: data });
    });

    it("does not throw when chrome.storage.local.set throws", () => {
        (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error("CSP"); });
        expect(() => cacheJobDetails("/irrelevant", { company: "X", role: "Y", jdText: "", location: "" })).not.toThrow();
    });
});

// --- 7. handleConfirmation() — Simplify / redirect-flow fallback ---

describe('handleConfirmation() — cache miss on confirmation page', () => {
  it('does not send JOB_DETECTED and does not log URL when cache is empty and page has no role', async () => {
    // Confirmation text triggers the handler, but no JD DOM and no cached data
    document.body.innerHTML = '<p>You have successfully submitted your application.</p>'
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, href: 'https://bmo.wd3.myworkdayjobs.com/en-US/External/jobTasks/completed/application?utm_source=Simplify' },
    })

    await handleConfirmation()

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
    expect(isAlreadyLogged('https://bmo.wd3.myworkdayjobs.com/en-US/External/jobTasks/completed/application?utm_source=Simplify')).toBe(false)
  })

  it('sends JOB_DETECTED and logs URL when cache is empty but scrapeJobDetails finds a role on the confirmation page', async () => {
    document.body.innerHTML = `
      <p>You have successfully submitted your application.</p>
      <div data-automation-id="jobPostingHeader">Senior Engineer</div>
    `
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        href: 'https://bmo.wd3.myworkdayjobs.com/en-US/External/jobTasks/completed/application',
        hostname: 'bmo.wd3.myworkdayjobs.com',
      },
    })

    await handleConfirmation()

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'JOB_DETECTED',
        job: expect.objectContaining({ role: 'Senior Engineer', company: 'Bmo' }),
      }),
    )
    expect(isAlreadyLogged('https://bmo.wd3.myworkdayjobs.com/en-US/External/jobTasks/completed/application')).toBe(true)
  })

  it("reads from chrome.storage.local when lastSeenJob is null", async () => {
    const stored: CachedJobData = { company: "Fiserv", role: "Senior Engineer", jdText: "...", location: "Atlanta, GA" };
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ workday_lastSeenJob: stored });
    document.body.textContent = "Your application has been successfully submitted.";
    // No cacheJobDetails call — lastSeenJob is null
    await handleConfirmation();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "JOB_DETECTED", job: expect.objectContaining({ role: "Senior Engineer", company: "Fiserv" }) })
    );
  });
})

// --- Additional: two-wave render scenario ---

describe('handleJobDetailPage() — two-wave render', () => {
  it('keeps retrying until jdText is available, then locks', async () => {
    // Wave 1: role present, jdText absent
    document.body.innerHTML = '<div data-automation-id="jobPostingPage"><h1>Engineer</h1></div>'
    document.title = 'Engineer | Acme'
    await handleJobDetailPage()

    // Cache should have partial data (role but no jdText) — Fix 2 ensures caching happens
    // even before jdText arrives.
    const url = window.location.href.split('/apply/')[0] ?? window.location.href
    let cached = getCachedJobDetails(url)
    expect(cached?.role).toBe('Engineer')
    expect(cached?.jdText).toBe('')

    // Wave 2: jdText now rendered
    document.body.innerHTML = `
      <div data-automation-id="jobPostingPage">
        <h1>Engineer</h1>
        <div data-automation-id="jobPostingDescription">Full JD text here</div>
      </div>`
    await handleJobDetailPage()

    cached = getCachedJobDetails(url)
    expect(cached?.jdText).toContain('Full JD text here')
  })

  it('caches partial data even when role is empty (wave-0 render), retries on next mutation', async () => {
    // Wave-0: jobPostingPage exists but nothing inside it has rendered yet
    document.body.innerHTML = '<div data-automation-id="jobPostingPage"></div>'
    document.title = ''
    await handleJobDetailPage()

    // Single-slot is written with empty-field partial data — confirms the early bail-out
    // is no longer triggered for role-only-empty cases.
    const cached = getCachedJobDetails(window.location.href)
    expect(cached).not.toBeNull()
    expect(cached?.role).toBe('')
    expect(cached?.jdText).toBe('')
  })
})
