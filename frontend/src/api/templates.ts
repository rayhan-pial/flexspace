import { request } from './client'

export type TemplateKind = 'system' | 'custom'

export interface TemplateSummary {
  id: string
  name: string
  kind: TemplateKind
  updatedAt: string
}

/** `config` is untrusted JSON until it passes `parseWorkspaceConfig`. */
export interface TemplateDetail extends TemplateSummary {
  config: unknown
}

/** System templates first, in their documented order (Productivity is first), then the caller's own. */
export const listTemplates = () => request<{ items: TemplateSummary[] }>('GET', '/templates').then((response) => response.items)

export const getTemplate = (id: string) => request<TemplateDetail>('GET', `/templates/${encodeURIComponent(id)}`)

/** Save a private snapshot. The owner is always the signed-in user, never sent by the client. */
export const createTemplate = (name: string, config: unknown, csrf: string | null) =>
  request<TemplateDetail>('POST', '/templates', { body: { name, config }, csrf })

export const deleteTemplate = (id: string, csrf: string | null) =>
  request<void>('DELETE', `/templates/${encodeURIComponent(id)}`, { csrf })
