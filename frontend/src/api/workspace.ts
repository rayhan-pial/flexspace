import { request } from './client'

/** `config` is untrusted JSON until it passes `parseWorkspaceConfig`. */
export interface WorkspaceEnvelope {
  id: string
  revision: number
  updatedAt: string
  config: unknown
}

export const getWorkspace = () => request<WorkspaceEnvelope>('GET', '/workspace')

export const putWorkspace = (baseRevision: number, config: unknown, csrf: string | null) =>
  request<WorkspaceEnvelope>('PUT', '/workspace', { body: { baseRevision, config }, csrf })
