import { Client } from '@notionhq/client'
import { DB_FIELDS, PREP_DB_FIELDS, type Status, type JobType, type Seniority, type Source } from './schema.js'

export interface CreateJobInput {
  company: string
  role: string
  url: string
  jdText: string
  sourcePlatform: Source
  location?: string
  salaryRange?: string
}

export interface JobRow {
  jobId: string
  notionUrl: string
  company: string
  role: string
  status: Status
  appliedDate: string
  jobUrl: string
  location: string
  salaryRange: string
  sourcePlatform: string
  jobType: string
  seniority: string
  enriched: boolean
  notes: string
}

export class NotionClient {
  private client: Client
  private dbId: string
  private prepDbId: string

  constructor(token: string, dbId: string, prepDbId: string) {
    this.client = new Client({ auth: token })
    this.dbId = dbId
    this.prepDbId = prepDbId
  }

  async findByUrl(url: string): Promise<string | null> {
    const res = await this.client.databases.query({
      database_id: this.dbId,
      filter: { property: DB_FIELDS.JOB_URL, url: { equals: url } }
    })
    return res.results[0]?.id ?? null
  }

  async createJob(input: CreateJobInput): Promise<{ jobId: string; notionUrl: string }> {
    const page = await this.client.pages.create({
      parent: { database_id: this.dbId },
      properties: {
        [DB_FIELDS.COMPANY]: { title: [{ text: { content: input.company } }] },
        [DB_FIELDS.ROLE]: { rich_text: [{ text: { content: input.role } }] },
        [DB_FIELDS.STATUS]: { select: { name: 'Applied' } },
        [DB_FIELDS.APPLIED_DATE]: { date: { start: new Date().toISOString().split('T')[0] ?? '' } },
        [DB_FIELDS.JOB_URL]: { url: input.url },
        [DB_FIELDS.SOURCE_PLATFORM]: { select: { name: input.sourcePlatform } },
        [DB_FIELDS.ENRICHED]: { checkbox: false },
        ...(input.location ? { [DB_FIELDS.LOCATION]: { rich_text: [{ text: { content: input.location } }] } } : {}),
        ...(input.salaryRange ? { [DB_FIELDS.SALARY_RANGE]: { rich_text: [{ text: { content: input.salaryRange } }] } } : {}),
      }
    }) as { id: string; url: string }
    return { jobId: page.id, notionUrl: page.url }
  }

  async updateStatus(jobId: string, status: Status): Promise<void> {
    await this.client.pages.update({
      page_id: jobId,
      properties: { [DB_FIELDS.STATUS]: { select: { name: status } } }
    })
  }

  async enrichJob(jobId: string, enrichment: { jobType: JobType; seniority: Seniority; summary: string[] }): Promise<void> {
    await this.client.pages.update({
      page_id: jobId,
      properties: {
        [DB_FIELDS.JOB_TYPE]: { select: { name: enrichment.jobType } },
        [DB_FIELDS.SENIORITY]: { select: { name: enrichment.seniority } },
        [DB_FIELDS.ENRICHED]: { checkbox: true },
      }
    })
    const bullets = enrichment.summary.map(line => ({
      type: 'bulleted_list_item' as const,
      bulleted_list_item: { rich_text: [{ text: { content: line } }] }
    }))
    for (let i = 0; i < bullets.length; i += 100) {
      await this.client.blocks.children.append({ block_id: jobId, children: bullets.slice(i, i + 100) })
    }
  }

  async appendJdText(jobId: string, jdText: string): Promise<void> {
    const chunks = jdText.match(/.{1,2000}/gs) ?? []
    const blocks = chunks.map(chunk => ({
      type: 'paragraph' as const,
      paragraph: { rich_text: [{ text: { content: chunk } }] }
    }))
    for (let i = 0; i < blocks.length; i += 100) {
      await this.client.blocks.children.append({ block_id: jobId, children: blocks.slice(i, i + 100) })
    }
  }

  async queryJobs(filters: { status?: Status; jobType?: JobType; company?: string; limit?: number }): Promise<JobRow[]> {
    const andFilters: unknown[] = []
    if (filters.status) andFilters.push({ property: DB_FIELDS.STATUS, select: { equals: filters.status } })
    if (filters.jobType) andFilters.push({ property: DB_FIELDS.JOB_TYPE, select: { equals: filters.jobType } })
    if (filters.company) andFilters.push({ property: DB_FIELDS.COMPANY, title: { contains: filters.company } })
    const res = await this.client.databases.query({
      database_id: this.dbId,
      filter: andFilters.length > 0 ? (andFilters.length === 1 ? andFilters[0] as never : { and: andFilters } as never) : undefined,
      page_size: filters.limit ?? 20,
    })
    return res.results.map(page => this.pageToJobRow(page as never))
  }

  async searchJobs(query: string): Promise<JobRow[]> {
    const [byCompany, byRole, byNotes] = await Promise.all([
      this.client.databases.query({ database_id: this.dbId, filter: { property: DB_FIELDS.COMPANY, title: { contains: query } }, page_size: 20 }),
      this.client.databases.query({ database_id: this.dbId, filter: { property: DB_FIELDS.ROLE, rich_text: { contains: query } }, page_size: 20 }),
      this.client.databases.query({ database_id: this.dbId, filter: { property: DB_FIELDS.NOTES, rich_text: { contains: query } }, page_size: 20 }),
    ])
    const seen = new Set<string>()
    const results: JobRow[] = []
    for (const page of [...byCompany.results, ...byRole.results, ...byNotes.results]) {
      if (!seen.has(page.id)) { seen.add(page.id); results.push(this.pageToJobRow(page as never)) }
    }
    return results.slice(0, 20)
  }

  async appendNote(jobId: string, note: string): Promise<void> {
    const timestamp = new Date().toISOString()
    const page = await this.client.pages.retrieve({ page_id: jobId }) as Record<string, unknown>
    const props = page['properties'] as Record<string, { rich_text?: Array<{ plain_text: string }> }>
    const existing = props[DB_FIELDS.NOTES]?.rich_text?.[0]?.plain_text ?? ''
    const updated = existing ? `${existing}\n[${timestamp}] ${note}` : `[${timestamp}] ${note}`
    await this.client.pages.update({
      page_id: jobId,
      properties: { [DB_FIELDS.NOTES]: { rich_text: [{ text: { content: updated.slice(0, 2000) } }] } }
    })
  }

  async deleteJob(jobId: string): Promise<void> {
    await this.client.pages.update({ page_id: jobId, archived: true })
  }

  async getJobPage(jobId: string): Promise<{ row: JobRow; jdText: string }> {
    const [page, blocks] = await Promise.all([
      this.client.pages.retrieve({ page_id: jobId }),
      this.client.blocks.children.list({ block_id: jobId, page_size: 100 })
    ])
    const row = this.pageToJobRow(page as never)
    const jdText = (blocks.results as Array<{ type: string; paragraph?: { rich_text: Array<{ plain_text: string }> } }>)
      .filter(b => b.type === 'paragraph')
      .map(b => b.paragraph?.rich_text.map(t => t.plain_text).join('') ?? '')
      .join('\n')
    return { row, jdText }
  }

  async createPrepPage(jobId: string, jobTitle: string, content: string): Promise<string> {
    const page = await this.client.pages.create({
      parent: { database_id: this.prepDbId },
      properties: {
        [PREP_DB_FIELDS.NAME]: { title: [{ text: { content: `Interview Prep — ${jobTitle}` } }] },
        [PREP_DB_FIELDS.JOB]: { rich_text: [{ text: { content: jobId } }] },
      }
    }) as { id: string }
    // Link relation on job row
    await this.client.pages.update({
      page_id: jobId,
      properties: { [DB_FIELDS.PREP_PAGE]: { relation: [{ id: page.id }] } }
    })
    // Append content as paragraph blocks
    if (content.trim()) {
      const chunks = content.match(/.{1,2000}/gs) ?? []
      const blocks = chunks.map(chunk => ({
        type: 'paragraph' as const,
        paragraph: { rich_text: [{ text: { content: chunk } }] }
      }))
      for (let i = 0; i < blocks.length; i += 100) {
        await this.client.blocks.children.append({ block_id: page.id, children: blocks.slice(i, i + 100) })
      }
    }
    return page.id
  }

  private pageToJobRow(page: Record<string, unknown>): JobRow {
    const props = page['properties'] as Record<string, { type: string; [key: string]: unknown }>
    const getText = (p: unknown) => {
      const prop = p as { rich_text?: Array<{ plain_text: string }>; title?: Array<{ plain_text: string }> }
      return (prop?.rich_text?.[0]?.plain_text ?? prop?.title?.[0]?.plain_text ?? '') as string
    }
    const getSelect = (p: unknown) => ((p as { select?: { name: string } })?.select?.name ?? '') as string
    return {
      jobId: page['id'] as string,
      notionUrl: (page as { url: string }).url,
      company: getText(props[DB_FIELDS.COMPANY]),
      role: getText(props[DB_FIELDS.ROLE]),
      status: getSelect(props[DB_FIELDS.STATUS]) as Status,
      appliedDate: (props[DB_FIELDS.APPLIED_DATE] as { date?: { start: string } })?.date?.start ?? '',
      jobUrl: (props[DB_FIELDS.JOB_URL] as { url?: string })?.url ?? '',
      location: getText(props[DB_FIELDS.LOCATION]),
      salaryRange: getText(props[DB_FIELDS.SALARY_RANGE]),
      sourcePlatform: getSelect(props[DB_FIELDS.SOURCE_PLATFORM]),
      jobType: getSelect(props[DB_FIELDS.JOB_TYPE]),
      seniority: getSelect(props[DB_FIELDS.SENIORITY]),
      enriched: (props[DB_FIELDS.ENRICHED] as { checkbox?: boolean })?.checkbox ?? false,
      notes: getText(props[DB_FIELDS.NOTES]),
    }
  }
}
