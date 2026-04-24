import { createServer } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
    LogApplicationArgs,
    LogApplicationResult,
} from "../tools/log-application.js";
import { IncomingMessage } from "http";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Private-Network": "true",
};

const MAX_BODY_BYTES = 512 * 1024; // 512 KB

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        req.on("data", (chunk: Buffer) => {
            totalSize += chunk.length;
            if (totalSize > MAX_BODY_BYTES) {
                req.destroy();
                reject(new Error("Request body too large"));
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf8"));
        });
        req.on("error", reject);
    });
}

function getRoutePath(req: IncomingMessage): string {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    return pathname.replace(/\/+$/, "") || "/";
}

export function startHttpTransport(
    createMcpServer: () => McpServer,
    logApplication: (args: LogApplicationArgs) => Promise<LogApplicationResult>,
    port: number,
    secret: string,
): void {
    const httpServer = createServer((req, res) => {
        const routePath = getRoutePath(req);

        // Handle CORS preflight for all routes
        if (req.method === "OPTIONS") {
            res.writeHead(200, { ...CORS_HEADERS });
            res.end();
            return;
        }

        // Auth check
        const auth = req.headers["authorization"];
        if (auth !== `Bearer ${secret}`) {
            res.writeHead(401, {
                "Content-Type": "application/json",
                ...CORS_HEADERS,
            });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
        }

        if (req.method === "GET" && routePath === "/health") {
            res.writeHead(200, {
                "Content-Type": "application/json",
                ...CORS_HEADERS,
            });
            res.end(JSON.stringify({ status: "ok" }));
            return;
        }

        if (req.method === "POST" && routePath === "/mcp") {
            const server = createMcpServer();
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });
            server
                .connect(transport)
                .then(() => {
                    transport.handleRequest(req, res);
                })
                .catch((err: unknown) => {
                    console.error("MCP request error:", err);
                    if (!res.headersSent) {
                        res.writeHead(500, {
                            "Content-Type": "application/json",
                            ...CORS_HEADERS,
                        });
                        res.end(
                            JSON.stringify({ error: "Internal Server Error" }),
                        );
                    }
                });
            return;
        }

        if (req.method === "POST" && routePath === "/log") {
            readBody(req)
                .then((raw) => {
                    let args: any;
                    try {
                        args = JSON.parse(raw);
                    } catch {
                        res.writeHead(400, {
                            "Content-Type": "application/json",
                            ...CORS_HEADERS,
                        });
                        res.end(JSON.stringify({ error: "Invalid JSON body" }));
                        return;
                    }

                    // Basic validation for MVP
                    if (
                        !args.company ||
                        !args.role ||
                        !args.url ||
                        !args.source_platform
                    ) {
                        res.writeHead(400, {
                            "Content-Type": "application/json",
                            ...CORS_HEADERS,
                        });
                        res.end(
                            JSON.stringify({
                                error: "Missing required fields: company, role, url, source_platform",
                            }),
                        );
                        return;
                    }

                    try {
                        new URL(args.url);
                    } catch {
                        res.writeHead(400, {
                            "Content-Type": "application/json",
                            ...CORS_HEADERS,
                        });
                        res.end(
                            JSON.stringify({ error: "Invalid URL format" }),
                        );
                        return;
                    }

                    return logApplication(args as LogApplicationArgs).then(
                        (result) => {
                            res.writeHead(200, {
                                "Content-Type": "application/json",
                                ...CORS_HEADERS,
                            });
                            res.end(JSON.stringify(result));
                        },
                    );
                })
                .catch((err: unknown) => {
                    if (!res.headersSent) {
                        const isTooBig =
                            err instanceof Error &&
                            err.message === "Request body too large";
                        const status = isTooBig ? 413 : 500;
                        const message = isTooBig
                            ? "Request body too large"
                            : "Internal Server Error";
                        console.error("POST /log error:", err);
                        res.writeHead(status, {
                            "Content-Type": "application/json",
                            ...CORS_HEADERS,
                        });
                        res.end(JSON.stringify({ error: message }));
                    }
                });
            return;
        }

        res.writeHead(404, {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
        });
        res.end(JSON.stringify({ error: "Not Found" }));
    });

    httpServer.listen(port, "127.0.0.1", () => {
        console.error(`HTTP transport listening on http://127.0.0.1:${port}`);
    });
}
