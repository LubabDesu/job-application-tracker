import type { NotionClient } from '../notion/client.js'

export interface DeleteApplicationArgs {
  job_id: string
}

export async function handleDeleteApplication(
  notion: NotionClient,
  args: DeleteApplicationArgs
): Promise<{ success: true; job_id: string }> {
  await notion.deleteJob(args.job_id)
  return { success: true, job_id: args.job_id }
}
