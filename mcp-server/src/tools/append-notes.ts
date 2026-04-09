import type { NotionClient } from '../notion/client.js'

export interface AppendNotesArgs {
  job_id: string
  note: string
}

export async function handleAppendNotes(
  notion: NotionClient,
  args: AppendNotesArgs
): Promise<{ success: true }> {
  await notion.appendNote(args.job_id, args.note)
  return { success: true }
}
