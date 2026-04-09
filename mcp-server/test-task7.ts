/**
 * test-task7.ts — Manual test for the update_status tool
 *
 * Prerequisites:
 *   1. Server running: cd mcp-server && npm run dev
 *   2. A real job page ID in your Notion DB (get one from a previous log_application call,
 *      or paste any page ID from the Notion URL: notion.so/.../<PAGE_ID>)
 *
 * Usage:
 *   JOB_ID=<notion-page-id> npx tsx test-task7.ts
 *
 * What it tests:
 *   1. Happy path — updates status from current → "Interview"
 *   2. Another valid status — updates → "Offer"
 *   3. Invalid status — server should return a validation error (not crash)
 */

import "dotenv/config";

const SECRET = process.env.MCP_SECRET!;
const PORT = process.env.PORT ?? "3000";
const BASE = `http://localhost:${PORT}/mcp`;
const JOB_ID = process.env.JOB_ID;

if (!JOB_ID) {
  console.error("❌  Set JOB_ID env var to a real Notion page ID before running.");
  console.error("    Example: JOB_ID=abc-123 npx tsx test-task7.ts");
  process.exit(1);
}

async function callUpdateStatus(jobId: string, status: string): Promise<void> {
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
        name: "update_status",
        arguments: { job_id: jobId, status },
      },
    }),
  });

  const text = await res.text();
  console.log(`  HTTP ${res.status}`);
  console.log(`  Body: ${text}`);
}

console.log(`\n--- Test 1: set status → "Interview" ---`);
await callUpdateStatus(JOB_ID, "Interview");

console.log(`\n--- Test 2: set status → "Offer" ---`);
await callUpdateStatus(JOB_ID, "Offer");

console.log(`\n--- Test 3: invalid status (should error, not crash) ---`);
await callUpdateStatus(JOB_ID, "Vibing");

console.log(`\n✓ Done. Open Notion and confirm the page shows Status = "Offer".`);
