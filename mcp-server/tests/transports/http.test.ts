import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { HttpBindings } from '@hono/node-server'

const TEST_SECRET = 'test-secret-abc'

// ---------------------------------------------------------------------------
// Minimal Hono app that mirrors the auth logic in src/transports/http.ts
// We test the middleware in isolation without the MCP transport side-effects.
// ---------------------------------------------------------------------------

type Bindings = HttpBindings

function buildTestApp(secret: string) {
  const app = new Hono<{ Bindings: Bindings }>()

  app.use('/mcp', async (c, next) => {
    const auth = c.req.header('Authorization')
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

  // Stub handler so auth-passing requests get a 200
  app.post('/mcp', (c) => c.json({ ok: true }, 200))

  return app
}

describe('HTTP transport auth middleware', () => {
  const app = buildTestApp(TEST_SECRET)

  it('returns 401 when Authorization header is missing', async () => {
    const req = new Request('http://localhost/mcp', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await app.fetch(req)
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when Authorization header has the wrong secret', async () => {
    const req = new Request('http://localhost/mcp', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-secret',
      },
    })
    const res = await app.fetch(req)
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Unauthorized')
  })

  it('passes auth and returns 200 when the correct Bearer token is provided', async () => {
    const req = new Request('http://localhost/mcp', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_SECRET}`,
      },
    })
    const res = await app.fetch(req)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})
