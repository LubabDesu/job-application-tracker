/**
 * test-task9.ts — Manual test for the create_prep_page tool
 *
 * Prerequisites:
 *   1. Server running: cd mcp-server && npm run dev
 *   2. A real job page ID in your Notion DB (get one from a previous log_application call)
 *
 * Usage:
 *   JOB_ID=<notion-page-id> npx tsx test-task9.ts
 *
 * What it tests:
 *   1. Happy path — generates an AI prep page for the given job and returns the prep page ID
 */

import "dotenv/config";

const SECRET = process.env.MCP_SECRET!;
const PORT = process.env.PORT ?? "3000";
const BASE = `http://localhost:${PORT}/mcp`;
const JOB_ID = process.env.JOB_ID;

if (!JOB_ID) {
  console.error("Set JOB_ID env var to a real Notion page ID before running.");
  console.error("  Example: JOB_ID=abc-123 npx tsx test-task9.ts");
  process.exit(1);
}

async function callCreatePrepPage(jobId: string): Promise<void> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_prep_page",
        arguments: { job_id: jobId },
      },
    }),
  });

  const text = await res.text();
  console.log(`  HTTP ${res.status}`);

  // Parse SSE response: find line starting with "data: " and extract JSON
  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data: "));

  if (dataLine) {
    const jsonStr = dataLine.slice(6);
    try {
      const parsed = JSON.parse(jsonStr) as unknown;
      console.log("  Parsed result:", JSON.stringify(parsed, null, 2));
    } catch {
      console.log("  Raw data:", jsonStr);
    }
  } else {
    console.log("  Body:", text);
  }
}

console.log(`\n--- Test 1: create prep page for job ${JOB_ID} ---`);
await callCreatePrepPage(JOB_ID);

console.log(`\n Done. Open Notion and verify the prep page was created and linked to the job.`);
