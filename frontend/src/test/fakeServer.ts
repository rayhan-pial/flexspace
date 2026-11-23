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
  /** Set for a private custom template: only this user can list, read or delete it. */
  owner?: string
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
    templatePosts: [] as Array<{ name: string; config: unknown; csrf?: string }>,
    templateDeletes: [] as string[],
    templateDeleteCsrf: [] as Array<string | undefined>,
    nextTemplate: 1,
    /** Seed a template (e.g. another user's private one) and make its routes available. */
    addTemplate(template: FakeTemplate) {
      server.templates.push(template)
      register(template)
    },
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

  const visible = (t: FakeTemplate) => !t.owner || t.owner === server.session
  const templateDetail = (id: string) => (call: RecordedCall) => {
    server.templateDetailGets.push(id)
    const override = server.templateHook?.(call)
    if (override) return override
    if (!server.session) return apiError(401, 'unauthenticated')
    const template = server.templates.find((t) => t.id === id && visible(t))
    return template ? json(200, { id: template.id, name: template.name, kind: template.kind, updatedAt: template.updatedAt, config: template.config }) : apiError(404, 'not_found', 'Template not found.')
  }
  const templateDelete = (id: string) => (call: RecordedCall) => {
    server.templateDeletes.push(id)
    server.templateDeleteCsrf.push(call.headers['X-CSRF-Token'])
    const override = server.templateHook?.(call)
    if (override) return override
    if (!server.session) return apiError(401, 'unauthenticated')
    const index = server.templates.findIndex((t) => t.id === id && t.owner === server.session)
    if (index < 0) return apiError(404, 'not_found', 'Template not found.')
    server.templates.splice(index, 1)
    return noContent()
  }
  const register = (t: FakeTemplate) => {
    server.handlers[`GET /templates/${t.id}`] = templateDetail(t.id)
    server.handlers[`DELETE /templates/${t.id}`] = templateDelete(t.id)
  }

  server.handlers = {
    'GET /templates': (call) => {
      server.templateListGets += 1
      const override = server.templateHook?.(call)
      if (override) return override
      if (!server.session) return apiError(401, 'unauthenticated')
      return json(200, { items: server.templates.filter(visible).map(({ id, name, kind, updatedAt }) => ({ id, name, kind, updatedAt })) })
    },
    'POST /templates': (call) => {
      const body = call.body as { name: string; config: unknown }
      server.templatePosts.push({ ...body, csrf: call.headers['X-CSRF-Token'] })
      const override = server.templateHook?.(call)
      if (override) return override
      if (!server.session) return apiError(401, 'unauthenticated')
      const created: FakeTemplate = { id: `tpl-custom-${server.nextTemplate++}`, name: body.name.trim(), kind: 'custom', updatedAt: '2026-11-23T11:00:00Z', config: structuredClone(body.config), owner: server.session }
      server.templates.push(created)
      register(created)
      return json(201, { id: created.id, name: created.name, kind: created.kind, updatedAt: created.updatedAt, config: created.config })
    },
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
  for (const template of server.templates) register(template)
  return server
}

export type FakeServer = ReturnType<typeof createFakeServer>
