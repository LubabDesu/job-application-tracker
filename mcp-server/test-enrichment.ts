import "dotenv/config";
import { NotionClient } from "./src/notion/client.js";

const SECRET = process.env.MCP_SECRET!;
const PORT = process.env.PORT ?? "3000";
const MCP_URL = `http://localhost:${PORT}/mcp`;
const JOB_URL = `https://testco.com/jobs/enrichment-${Date.now()}`;

// Step 1: log the application via MCP
console.log("Step 1: logging application...");
const res = await fetch(MCP_URL, {
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
            name: "log_application",
            arguments: {
                company: "Stripe",
                role: "Senior Backend Engineer",
                url: JOB_URL,
                jd_text: `We are looking for a Senior Backend Engineer to join Stripe's infrastructure team.
You will design and build distributed systems that process millions of transactions per second.
Requirements: 5+ years backend experience, strong TypeScript or Go skills, experience with
high-throughput data pipelines, PostgreSQL, Redis, and Kubernetes. You'll lead architecture
decisions, mentor junior engineers, and own reliability for critical payment flows.`,
                source_platform: "greenhouse",
            },
        },
    }),
});

const body = await res.text();
console.log(`Status: ${res.status}`);
console.log(`Response: ${body}`);

// Extract Notion page ID from the ID line in the response text
const match = body.match(/ID:\s*([0-9a-f-]{36})/);
if (!match) {
    console.error(
        "Could not extract job_id from response — is the server running?",
    );
    process.exit(1);
}
const jobId = match[1];
console.log(`\nJob ID: ${jobId}`);

// Step 2: wait for async enrichment
console.log("\nStep 2: waiting 40s for Qwen enrichment...");
await new Promise((r) => setTimeout(r, 40000));

// Step 3: read the Notion row directly and check enriched fields
console.log("Step 3: checking Notion row...");
const notion = new NotionClient(
    process.env.NOTION_TOKEN!,
    process.env.NOTION_DATABASE_ID!,
    process.env.NOTION_PREP_DB_ID!,
);
const { row } = await notion.getJobPage(jobId);

console.log("\n--- Enrichment result ---");
console.log(`Company:   ${row.company}`);
console.log(`Role:      ${row.role}`);
console.log(`Job Type:  ${row.jobType || "(empty)"}`);
console.log(`Seniority: ${row.seniority || "(empty)"}`);
console.log(`Enriched:  ${row.enriched}`);

if (row.enriched && row.jobType && row.seniority) {
    console.log("\n✓ PASS — enrichment worked");
} else {
    console.log(
        "\n✗ FAIL — enrichment did not complete (check server logs for [enrichAsync] errors)",
    );
}
