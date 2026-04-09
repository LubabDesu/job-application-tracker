import type { NotionClient } from '../notion/client.js'
import type { Status, JobType } from '../notion/schema.js'

export interface GetApplicationsArgs {
  status?: Status
  job_type?: JobType
  company?: string
  limit?: number
}

export async function handleGetApplications(
  notion: NotionClient,
  args: GetApplicationsArgs
): Promise<{ jobs: Awaited<ReturnType<NotionClient['queryJobs']>>; count: number }> {
  const jobs = await notion.queryJobs({
    status: args.status,
    jobType: args.job_type,
    company: args.company,
    limit: args.limit,
  })
  return { jobs, count: jobs.length }
}
