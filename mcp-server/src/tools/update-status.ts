import type { NotionClient } from '../notion/client.js'
import type { Status } from '../notion/schema.js'

export interface UpdateStatusArgs {
  job_id: string
  status: Status
}

export async function handleUpdateStatus(
  notion: NotionClient,
  args: UpdateStatusArgs
): Promise<{ job_id: string; status: Status }> {
  await notion.updateStatus(args.job_id, args.status)
  return { job_id: args.job_id, status: args.status }
}
