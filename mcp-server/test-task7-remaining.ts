import "dotenv/config"

const SECRET = process.env.MCP_SECRET!
const PORT = process.env.PORT ?? "3000"
const BASE = `http://localhost:${PORT}/mcp`
const JOB_ID = process.env.JOB_ID

interface JsonRpcResponse {
  id: number
  result?: { content?: Array<{ type: string; text: string }> }
  error?: { code: number; message: string }
}

async function callTool(
  id: number,
  toolName: string,
  args: Record<string, unknown>
): Promise<JsonRpcResponse> {
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
      params: { name: toolName, arguments: args },
    }),
  })

  const text = await res.text()
  if (res.status !== 200) {
    console.error(`HTTP ${res.status}: ${text}`)
    process.exit(1)
  }

  // SSE body has multiple lines; find the one starting with "data: "
  const dataLine = text.split("\n").find(l => l.startsWith("data: "))
  if (!dataLine) throw new Error(`No data line in SSE response:\n${text}`)
  return JSON.parse(dataLine.slice(6)) as JsonRpcResponse
}

function printResult(_label: string, resp: JsonRpcResponse): void {
  if (resp.error) {
    console.error(`  ERROR ${resp.error.code}: ${resp.error.message}`)
    return
  }
  const content = resp.result?.content ?? []
  for (const block of content) {
    if (block.type === "text") console.log(`  ${block.text}`)
  }
}

// ── Test 1: get_applications (no filters) ───────────────────────────────────
console.log("\n--- Test 1: get_applications (no filters) ---")
console.log("Expected: list of all applications with company, role, status, and ID")
const resp1 = await callTool(1, "get_applications", {})
printResult("get_applications (no filters)", resp1)

// ── Test 2: get_applications with status filter ─────────────────────────────
console.log("\n--- Test 2: get_applications (status=Applied) ---")
console.log("Expected: only entries with status 'Applied'")
const resp2 = await callTool(2, "get_applications", { status: "Applied" })
printResult("get_applications (status=Applied)", resp2)

// ── Test 3: append_notes (requires JOB_ID env var) ─────────────────────────
if (!JOB_ID) {
  console.log("\n--- Test 3: append_notes SKIPPED ---")
  console.log("  Set JOB_ID=<notion-page-id> to run this test.")
  console.log("  Example: JOB_ID=abc-123 npx tsx test-task7-remaining.ts")
} else {
  console.log(`\n--- Test 3: append_notes (JOB_ID=${JOB_ID}) ---`)
  console.log("Expected: 'Note appended to job <id>'")
  const resp3 = await callTool(3, "append_notes", {
    job_id: JOB_ID,
    note: "Manual test note from test-task7-remaining.ts",
  })
  printResult("append_notes", resp3)
}
