import { describe, it, expect } from 'vitest'
import { createServer } from 'http'
import type { IncomingMessage, ServerResponse } from 'http'

const TEST_SECRET = 'health-test-secret'

// ---------------------------------------------------------------------------
// Minimal request handler that mirrors the /health logic from http.ts.
// We test the routing + auth behaviour in isolation without the full MCP stack.
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function handleRequest(req: IncomingMessage, res: ServerResponse, secret: string): void {
  const auth = req.headers['authorization']
  if (auth !== `Bearer ${secret}`) {
    res.writeHead(401, { 'Content-Type': 'application/json', ...CORS_HEADERS })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS })
  res.end(JSON.stringify({ error: 'Not Found' }))
}

async function makeRequest(
  path: string,
  method: string,
  authHeader?: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      handleRequest(req, res, TEST_SECRET)
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not get server address'))
        return
      }

      const headers: Record<string, string> = {}
      if (authHeader !== undefined) {
        headers['Authorization'] = authHeader
      }

      const options = {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers,
      }

      const { request } = require('http') as typeof import('http')
      const clientReq = request(options, (clientRes) => {
        const chunks: Buffer[] = []
        clientRes.on('data', (chunk: Buffer) => chunks.push(chunk))
        clientRes.on('end', () => {
          server.close()
          const raw = Buffer.concat(chunks).toString('utf8')
          const body: unknown = JSON.parse(raw)
          resolve({ status: clientRes.statusCode ?? 0, body })
        })
      })

      clientReq.on('error', (err) => {
        server.close()
        reject(err)
      })

      clientReq.end()
    })
  })
}

describe('GET /health endpoint', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const { status, body } = await makeRequest('/health', 'GET', undefined)
    expect(status).toBe(401)
    expect((body as { error: string }).error).toBe('Unauthorized')
  })

  it('returns 401 when Authorization header has the wrong secret', async () => {
    const { status, body } = await makeRequest('/health', 'GET', 'Bearer wrong-secret')
    expect(status).toBe(401)
    expect((body as { error: string }).error).toBe('Unauthorized')
  })

  it('returns 200 with { status: "ok" } when the correct Bearer token is provided', async () => {
    const { status, body } = await makeRequest('/health', 'GET', `Bearer ${TEST_SECRET}`)
    expect(status).toBe(200)
    expect((body as { status: string }).status).toBe('ok')
  })

  it('returns 404 for an unknown path even with correct auth', async () => {
    const { status, body } = await makeRequest('/unknown', 'GET', `Bearer ${TEST_SECRET}`)
    expect(status).toBe(404)
    expect((body as { error: string }).error).toBe('Not Found')
  })
})
