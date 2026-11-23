import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { apiError, authResponse, json, noContent } from './fakeApi'
import type { RecordedCall } from './fakeApi'
import { parseWorkspaceConfig } from '../domain/workspace/parse'

type PutHook = (call: RecordedCall) => Response | Promise<Response> | 'commit-then-drop' | 'drop' | 'commit-then-500' | undefined

export interface FakeTemplate {
  id: string
  name: string
  kind: 'system' | 'custom'
  updatedAt: string
  config: unknown
}

/** The three curated system templates, read from the shared fixtures so tests use the real designs. */
function systemTemplates(): FakeTemplate[] {
  return [['productivity', 'Productivity'], ['analytics', 'Analytics'], ['creative', 'Creative']].map(([key, name]) => {
    const file = join(__dirname, `../../../contracts/fixtures/valid/system-template-${key}.json`)
    return { id: `tpl-${key}`, name, kind: 'system' as const, updatedAt: '2026-11-23T09:00:00Z', config: JSON.parse(readFileSync(file, 'utf-8')).input }
  })
}

interface UserData {
  revision: number
  config: unknown
}

/**
 * In-memory stand-in for the backend: per-user workspaces, sessions, conditional saves with 409,
 * and hooks to inject failures. Handlers plug into `installFetch`.
 */
export function createFakeServer(
  titles: Record<string, string> = { a: 'Original A', b: 'Original B' },
  /** Optional full starting configs per user (otherwise an empty workspace with the given title). */
  configs: Record<string, unknown> = {},
) {
  const users: Record<string, UserData> = {}
  for (const [id, title] of Object.entries(titles)) {
    const parsed = parseWorkspaceConfig(configs[id] ?? { schemaVersion: 1, title, sections: [] })
    if (!parsed.ok) throw new Error(parsed.message)
    users[id] = { revision: 1, config: parsed.config }
  }

  const server = {
    users,
    session: null as string | null,
    templates: systemTemplates(),
    templateListGets: 0,
    templateDetailGets: [] as string[],
    templateHook: undefined as ((call: RecordedCall) => Response | Promise<Response> | undefined) | undefined,
    puts: [] as Array<{ baseRevision: number; config: unknown; csrf?: string }>,
    gets: 0,
    putHook: undefined as PutHook | undefined,
    getHook: undefined as ((call: RecordedCall) => Response | Promise<Response> | undefined) | undefined,
    /** Another tab/session saved something: bump the user's revision with a new config. */
    changeElsewhere(userId: string, mutate: (config: Record<string, unknown>) => void) {
      const data = users[userId]
      const config = structuredClone(data.config) as Record<string, unknown>
      mutate(config)
      data.config = config
      data.revision += 1
    },
    /** Apply a save to the user's data (for tests whose hook supplies the response itself). */
    commit(userId: string, body: { config: unknown }) {
      users[userId].config = body.config
      users[userId].revision += 1
    },
    expireSession() {
      server.session = null
    },
    handlers: {} as Record<string, (call: RecordedCall) => Response | Promise<Response>>,
  }

  const envelope = (userId: string) => ({
    id: `ws-${userId}`,
    revision: users[userId].revision,
    updatedAt: '2026-11-23T10:00:00Z',
    config: users[userId].config,
  })
  const commit = (userId: string, body: { baseRevision: number; config: unknown }) => {
    users[userId].config = body.config
    users[userId].revision += 1
  }

  const templateDetail = (id: string) => (call: RecordedCall) => {
    server.templateDetailGets.push(id)
    const override = server.templateHook?.(call)
    if (override) return override
    if (!server.session) return apiError(401, 'unauthenticated')
    const template = server.templates.find((t) => t.id === id)
    return template ? json(200, template) : apiError(404, 'not_found', 'Template not found.')
  }

  server.handlers = {
    'GET /templates': (call) => {
      server.templateListGets += 1
      const override = server.templateHook?.(call)
      if (override) return override
      if (!server.session) return apiError(401, 'unauthenticated')
      return json(200, { items: server.templates.map(({ id, name, kind, updatedAt }) => ({ id, name, kind, updatedAt })) })
    },
    ...Object.fromEntries(server.templates.map((t) => [`GET /templates/${t.id}`, templateDetail(t.id)])),
    'POST /auth/login': ({ body }) => {
      const id = (body as { email: string }).email.startsWith('b') ? 'b' : 'a'
      server.session = id
      return json(200, authResponse(id))
    },
    'GET /auth/me': () => (server.session ? json(200, authResponse(server.session)) : apiError(401, 'unauthenticated')),
    'POST /auth/logout': () => {
      server.session = null
      return noContent()
    },
    'GET /workspace': (call) => {
      server.gets += 1
      const override = server.getHook?.(call)
      if (override) return override
      return server.session ? json(200, envelope(server.session)) : apiError(401, 'unauthenticated')
    },
    'PUT /workspace': async (call) => {
      const body = call.body as { baseRevision: number; config: unknown }
      server.puts.push({ ...body, csrf: call.headers['X-CSRF-Token'] })
      const userId = server.session
      if (!userId) return apiError(401, 'unauthenticated')
      const hook = server.putHook?.(call)
      if (hook === 'drop') throw new TypeError('connection lost')
      if (hook === 'commit-then-drop' || hook === 'commit-then-500') {
        if (body.baseRevision === users[userId].revision) commit(userId, body)
        if (hook === 'commit-then-drop') throw new TypeError('connection lost')
        return new Response('<html>Bad gateway</html>', { status: 502 })
      }
      if (hook) return hook
      if (body.baseRevision !== users[userId].revision) {
        return apiError(409, 'revision_conflict', 'changed', { currentRevision: users[userId].revision })
      }
      commit(userId, body)
      return json(200, envelope(userId))
    },
  }
  return server
}

export type FakeServer = ReturnType<typeof createFakeServer>
