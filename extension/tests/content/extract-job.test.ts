import { beforeEach, describe, expect, it } from 'vitest'

const { extractJobFromPage } = await import('../../src/content/extract-job.ts')

function setLocation(url: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(url),
  })
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.title = ''
  setLocation('https://example.com/jobs/123')
})

describe('extractJobFromPage()', () => {
  it('extracts a Tesla-like custom career page without using page chrome as role or company', () => {
    setLocation('https://www.tesla.com/careers/search/job/internship-software-engineer-camera-robotics-fall-2026-234567')
    document.title = 'Internship, Software Engineer, Camera & Robotics, Fall 2026 | Tesla Careers'
    document.head.innerHTML = `
      <meta property="og:site_name" content="Build your Career at Tesla">
    `
    document.body.innerHTML = `
      <header>
        <nav>
          <a>Skip to main content</a>
          <a>Careers</a>
          <a>Search Jobs</a>
          <a>Sign In</a>
        </nav>
      </header>
      <main>
        <h1>Build your Career at Tesla</h1>
        <section class="tds-layout">
          <p>Engineering & Information Technology</p>
          <div id="job-details-container">
            <h1 class="tds-text--h1-alt">Internship, Software Engineer, Camera & Robotics, Fall 2026</h1>
          </div>
          <div class="job-description">
            <p>Consider before submitting an application: This position is expected to start around August 2026.</p>
            <p>Responsibilities include building camera and robotics software with production engineering teams.</p>
            <p>Requirements include experience with software engineering, robotics, or computer vision.</p>
          </div>
        </section>
      </main>
    `

    const job = extractJobFromPage()

    expect(job?.role).toBe('Internship, Software Engineer, Camera & Robotics, Fall 2026')
    expect(job?.company).toBe('Tesla')
    expect(job?.role).not.toContain('Skip to main content')
    expect(job?.company).not.toContain('Build your Career')
  })

  it('prefers a generic job detail heading over an earlier career marketing heading', () => {
    setLocation('https://careers.exampleco.com/jobs/frontend-platform-engineer')
    document.title = 'Frontend Platform Engineer | Careers at ExampleCo'
    document.head.innerHTML = `
      <meta property="og:site_name" content="Careers at ExampleCo">
    `
    document.body.innerHTML = `
      <main>
        <section class="hero">
          <h1>Join our team and build your career at ExampleCo</h1>
        </section>
        <section class="job-detail-page">
          <h1>Frontend Platform Engineer</h1>
          <div class="job-description">
            <p>Responsibilities include building shared frontend systems for product teams.</p>
            <p>Requirements include TypeScript, React, and frontend architecture experience.</p>
          </div>
        </section>
      </main>
    `

    const job = extractJobFromPage()

    expect(job?.role).toBe('Frontend Platform Engineer')
    expect(job?.company).toBe('ExampleCo')
  })

  it('extracts a ByteDance-like custom career page title and company', () => {
    setLocation('https://jobs.bytedance.com/en/position/7520000000000000000/detail')
    document.title = 'Integrated Marketing Project Intern (Lark Content & Campaigns) - 2026 Start (BS/MS) | Careers at ByteDance'
    document.head.innerHTML = `
      <meta property="og:site_name" content="Careers at ByteDance">
    `
    document.body.innerHTML = `
      <header>
        <h1>Careers</h1>
        <nav>Jobs Teams Locations Life at ByteDance</nav>
      </header>
      <main>
        <section data-testid="job-detail">
          <h2 data-testid="job-detail-title">Integrated Marketing Project Intern (Lark Content & Campaigns) - 2026 Start (BS/MS)</h2>
          <div data-qa="job-description">
            <p>Responsibilities include managing content and campaigns for Lark marketing projects.</p>
            <p>Qualifications include project management, integrated marketing, and excellent writing skills.</p>
          </div>
        </section>
      </main>
    `

    const job = extractJobFromPage()

    expect(job?.role).toBe('Integrated Marketing Project Intern (Lark Content & Campaigns) - 2026 Start (BS/MS)')
    expect(job?.company).toBe('ByteDance')
  })

  it('parses a JobPosting from JSON-LD @graph', () => {
    document.body.innerHTML = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebSite", "name": "Example Careers" },
            {
              "@type": ["Thing", "JobPosting"],
              "title": "Machine Learning Engineer Intern",
              "hiringOrganization": { "@type": "Organization", "name": "Acme AI" },
              "description": "<p>Responsibilities include training models.</p><p>Requirements include Python.</p>"
            }
          ]
        }
      </script>
    `

    const job = extractJobFromPage()

    expect(job).toMatchObject({
      role: 'Machine Learning Engineer Intern',
      company: 'Acme AI',
      jdText: 'Responsibilities include training models. Requirements include Python.',
    })
  })

  it('prefers hiringOrganization.name over marketing og:site_name', () => {
    document.head.innerHTML = '<meta property="og:site_name" content="Build your Career at Example">'
    document.body.innerHTML = `
      <script type="application/ld+json">
        [
          {
            "@type": "JobPosting",
            "identifier": { "name": "Backend Platform Engineer" },
            "hiringOrganization": { "name": "RealCo" },
            "description": "Requirements include distributed systems experience."
          }
        ]
      </script>
    `

    const job = extractJobFromPage()

    expect(job?.role).toBe('Backend Platform Engineer')
    expect(job?.company).toBe('RealCo')
  })

  it('rejects nav and accessibility text as role and selects a real job heading', () => {
    document.body.innerHTML = `
      <header>
        <h1>Skip to main content Search Jobs Sign In</h1>
        <nav>
          <h2>Accessibility Navigation</h2>
        </nav>
      </header>
      <main>
        <h1>Product Design Intern</h1>
      </main>
    `

    const job = extractJobFromPage()

    expect(job?.role).toBe('Product Design Intern')
  })

  it('extracts a real role from a generic main h1 without a job-detail container', () => {
    document.body.innerHTML = `
      <main>
        <h1>Frontend Platform Engineer</h1>
        <section class="description">
          <p>Responsibilities include owning frontend infrastructure for multiple product teams.</p>
          <p>Requirements include strong TypeScript and React experience.</p>
        </section>
      </main>
    `

    const job = extractJobFromPage()

    expect(job?.role).toBe('Frontend Platform Engineer')
  })

  it('extracts a short acronym role title', () => {
    document.body.innerHTML = `
      <main>
        <h1>SWE Intern</h1>
        <section class="job-description">
          <p>Responsibilities include building internal developer tools.</p>
          <p>Requirements include programming coursework and internship availability.</p>
        </section>
      </main>
    `

    const job = extractJobFromPage()

    expect(job?.role).toBe('SWE Intern')
  })

  it('extracts a role title that starts with a year', () => {
    document.body.innerHTML = `
      <main>
        <h1>2026 New Grad Software Engineer</h1>
        <section class="job-description">
          <p>Responsibilities include developing backend services for customer products.</p>
          <p>Requirements include a degree completion date in 2026.</p>
        </section>
      </main>
    `

    const job = extractJobFromPage()

    expect(job?.role).toBe('2026 New Grad Software Engineer')
  })

  it('keeps a real Tesla job-detail title ahead of a marketing h1', () => {
    setLocation('https://www.tesla.com/careers/search/job/ai-engineer-manipulation-optimus-234567')
    document.body.innerHTML = `
      <main>
        <h1>Build your Career at Tesla</h1>
        <section id="job-details-container">
          <h1>AI Engineer, Manipulation, Optimus</h1>
        </section>
        <section class="job-description">
          <p>Responsibilities include building manipulation systems for humanoid robotics.</p>
          <p>Requirements include robotics, controls, or machine learning experience.</p>
        </section>
      </main>
    `

    const job = extractJobFromPage()

    expect(job?.role).toBe('AI Engineer, Manipulation, Optimus')
  })

  it('returns null when only a marketing h1 exists without a job description or title', () => {
    document.body.innerHTML = `
      <main>
        <h1>Build your Career at ExampleCo</h1>
      </main>
    `

    expect(extractJobFromPage()).toBeNull()
  })

  it('returns null when only nav and accessibility text exist', () => {
    document.body.innerHTML = `
      <header>
        <h1>Skip to main content Search Jobs Sign In</h1>
        <nav><h2>Accessibility Navigation</h2></nav>
      </header>
    `

    expect(extractJobFromPage()).toBeNull()
  })
})
