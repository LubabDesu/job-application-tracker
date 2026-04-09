/**
 * test-task8.ts — Manual test for the search_jobs tool
 *
 * Prerequisites:
 *   1. Server running: cd mcp-server && npm run dev
 *
 * Usage:
 *   npx tsx test-task8.ts
 *
 * What it tests:
 *   1. Search for "engineer" — expected: list of matches or "No results found"
 *   2. Search for "Google"  — expected: matching entries or empty
 *   3. Search for "zzznomatch" — expected: no results
 */

import "dotenv/config"

const SECRET = process.env.MCP_SECRET!
const PORT = process.env.PORT ?? "3000"
const BASE = `http://localhost:${PORT}/mcp`

interface JsonRpcResponse {
  id: number
  result?: { content?: Array<{ type: string; text: string }> }
  error?: { code: number; message: string }
}

async function callSearchJobs(id: number, query: string): Promise<JsonRpcResponse> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name: "search_jobs",
        arguments: { query },
      },
    }),
  })

  const text = await res.text()
  if (res.status !== 200) {
    console.error(`  HTTP ${res.status}: ${text}`)
    process.exit(1)
  }

  // SSE body has multiple lines; find the one starting with "data: "
  const dataLine = text.split("\n").find(l => l.startsWith("data: "))
  if (!dataLine) throw new Error(`No data line in SSE response:\n${text}`)
  return JSON.parse(dataLine.slice(6)) as JsonRpcResponse
}

function printResult(resp: JsonRpcResponse): void {
  if (resp.error) {
    console.error(`  ERROR ${resp.error.code}: ${resp.error.message}`)
    return
  }
  const content = resp.result?.content ?? []
  for (const block of content) {
    if (block.type === "text") console.log(`  ${block.text}`)
  }
}

// ── Test 1: generic keyword search ──────────────────────────────────────────
console.log('\n--- Test 1: search_jobs (query="engineer") ---')
console.log('Expected: list of matches with company, role, status, and ID — or "No results found"')
const resp1 = await callSearchJobs(1, "engineer")
printResult(resp1)

// ── Test 2: search by specific company name ──────────────────────────────────
console.log('\n--- Test 2: search_jobs (query="Google") ---')
console.log('Expected: entries where company, role, or notes contain "Google" — or "No results found"')
const resp2 = await callSearchJobs(2, "Google")
printResult(resp2)

// ── Test 3: search for a term unlikely to match anything ─────────────────────
console.log('\n--- Test 3: search_jobs (query="zzznomatch") ---')
console.log('Expected: No results found for "zzznomatch".')
const resp3 = await callSearchJobs(3, "zzznomatch")
printResult(resp3)

console.log('\nDone.')
