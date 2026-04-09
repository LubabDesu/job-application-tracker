import "dotenv/config";

const SECRET = process.env.MCP_SECRET!;
const PORT = process.env.PORT ?? "3000";
const URL = `http://localhost:${PORT}/mcp`;

async function callTool(company: string, url: string) {
    const res = await fetch(URL, {
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
                    company,
                    role: "SWE",
                    url,
                    jd_text: "Build great coffee.",
                    source_platform: "greenhouse",
                },
            },
        }),
    });

    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${text}`);
}

// Test 1: should log a new entry
console.log("\n--- Test 1: new application ---");
await callTool("TestCo", "https://testco.com/jobs/task6-001");

// Test 2: same URL should return duplicate
console.log("\n--- Test 2: duplicate ---");
await callTool("TestCo", "https://testco.com/jobs/task6-001");

// Test 3: wrong auth should 401
console.log("\n--- Test 3: bad auth ---");
const res = await fetch(URL, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer wrong-secret",
    },
    body: "{}",
});
console.log(`Status: ${res.status} (expected 401)`);
