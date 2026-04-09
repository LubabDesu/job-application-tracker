import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { NotionClient } from './notion/client.js'
import { OpenRouterClient } from './openrouter/client.js'
import { handleLogApplication } from './tools/log-application.js'
import { handleUpdateStatus } from './tools/update-status.js'
import { handleAppendNotes } from './tools/append-notes.js'
import { handleDeleteApplication } from './tools/delete-application.js'
import { handleGetApplications } from './tools/get-applications.js'
import { handleSearchJobs } from './tools/search-jobs.js'
import { handleCreatePrepPage } from './tools/create-prep-page.js'
import { SOURCE_OPTIONS, STATUS_OPTIONS, JOB_TYPE_OPTIONS } from './notion/schema.js'

export function createMcpServer(notion: NotionClient, openrouter: OpenRouterClient) {
  const server = new McpServer({ name: 'job-tracker', version: '0.1.0' })

  server.registerTool('log_application', {
    description: 'Log a new job application to Notion. Use when a user has applied to a job.',
    inputSchema: {
      company: z.string().describe('Company name'),
      role: z.string().describe('Job title / role'),
      url: z.string().url().describe('URL of the job posting'),
      jd_text: z.string().describe('Full job description text'),
      source_platform: z.enum(SOURCE_OPTIONS as unknown as [string, ...string[]]).describe('Platform where the job was found'),
      location: z.string().optional().describe('Job location'),
      salary_range: z.string().optional().describe('Salary range if listed'),
    },
  }, async ({ company, role, url, jd_text, source_platform, location, salary_range }) => {
      const result = await handleLogApplication(notion, {
        company,
        role,
        url,
        jd_text,
        source_platform: source_platform as import('./notion/schema.js').Source,
        location,
        salary_range,
      }, openrouter)
      return {
        content: [{
          type: 'text',
          text: result.status === 'logged'
            ? `✓ Logged: ${company} — ${role}\nNotion: ${result.notion_url}\nID: ${result.job_id}`
            : `Already logged: ${company} — ${role} (ID: ${result.job_id})`
        }]
      }
    }
  )

  server.registerTool('update_status', {
    description: 'Update the status of a logged job application.',
    inputSchema: {
      job_id: z.string().describe('Notion page ID of the job (returned by log_application)'),
      status: z.enum(STATUS_OPTIONS as unknown as [string, ...string[]]).describe('New application status'),
    },
  }, async ({ job_id, status }) => {
    const result = await handleUpdateStatus(notion, {
      job_id,
      status: status as import('./notion/schema.js').Status,
    })
    return {
      content: [{
        type: 'text',
        text: `✓ Status updated to "${result.status}" for job ${result.job_id}`,
      }]
    }
  })

  server.registerTool('append_notes', {
    description: 'Add a timestamped note to a job application. Use to record interview feedback, recruiter conversations, or reminders.',
    inputSchema: {
      job_id: z.string().describe('Notion page ID of the job'),
      note: z.string().describe('Note text to append'),
    },
  }, async ({ job_id, note }) => {
    await handleAppendNotes(notion, { job_id, note })
    return {
      content: [{
        type: 'text',
        text: `Note appended to job ${job_id}`,
      }]
    }
  })

  server.registerTool('delete_application', {
    description: 'Archive a job application (soft delete). Use to remove test entries or jobs no longer relevant.',
    inputSchema: {
      job_id: z.string().describe('Notion page ID of the job to archive'),
    },
  }, async ({ job_id }) => {
    const result = await handleDeleteApplication(notion, { job_id })
    return {
      content: [{
        type: 'text',
        text: `Archived job ${result.job_id}`,
      }]
    }
  })

  server.registerTool('get_applications', {
    description: 'List job applications with optional filters. Use for structured queries by status, job type, or company. For keyword search use search_jobs instead.',
    inputSchema: {
      status: z.enum(STATUS_OPTIONS as unknown as [string, ...string[]]).optional().describe('Filter by application status'),
      job_type: z.enum(JOB_TYPE_OPTIONS as unknown as [string, ...string[]]).optional().describe('Filter by job type'),
      company: z.string().optional().describe('Filter by company name (partial match)'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results to return (default 20)'),
    },
  }, async ({ status, job_type, company, limit }) => {
    const result = await handleGetApplications(notion, {
      status: status as import('./notion/schema.js').Status | undefined,
      job_type: job_type as import('./notion/schema.js').JobType | undefined,
      company,
      limit,
    })
    const lines = result.jobs.map(
      j => `• ${j.company} — ${j.role} [${j.status}] (ID: ${j.jobId})`
    )
    const header = `Found ${result.count} application(s):`
    return {
      content: [{
        type: 'text',
        text: result.count === 0 ? 'No applications found.' : [header, ...lines].join('\n'),
      }]
    }
  })

  server.registerTool('search_jobs', {
    description: 'Search job applications by keyword. Searches across company name, role title, and notes. Use for free-text search; use get_applications for structured filters.',
    inputSchema: {
      query: z.string().describe('Keyword to search for across company, role, and notes'),
    },
  }, async ({ query }) => {
    const result = await handleSearchJobs(notion, { query })
    if (result.count === 0) {
      return {
        content: [{
          type: 'text',
          text: `No results found for "${query}".`,
        }]
      }
    }
    const lines = result.jobs.map(
      j => `• ${j.company} — ${j.role} [${j.status}] (ID: ${j.jobId})`
    )
    const header = `Found ${result.count} result(s) for "${query}":`
    return {
      content: [{
        type: 'text',
        text: [header, ...lines].join('\n'),
      }]
    }
  })

  server.registerTool('create_prep_page', {
    description: 'Generate an AI interview prep page for a job application. Creates a structured Notion page with behavioral/technical questions, study topics, and company research. Links the prep page back to the job.',
    inputSchema: {
      job_id: z.string().describe('Notion page ID of the job (returned by log_application)'),
    },
  }, async ({ job_id }) => {
    const result = await handleCreatePrepPage(notion, openrouter, { job_id })
    return {
      content: [{
        type: 'text',
        text: `✓ Prep page created for job ${result.job_id}\nPrep page ID: ${result.prep_page_id}`,
      }]
    }
  })

  return server
}
