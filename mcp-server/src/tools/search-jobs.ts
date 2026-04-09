import type { NotionClient, JobRow } from '../notion/client.js'

export interface SearchJobsArgs {
  query: string
}

export interface SearchJobsResult {
  jobs: JobRow[]
  count: number
}

export async function handleSearchJobs(
  notion: NotionClient,
  args: SearchJobsArgs
): Promise<SearchJobsResult> {
  const jobs = await notion.searchJobs(args.query)
  return { jobs, count: jobs.length }
}
