import { request } from './client'

/** `config` is untrusted JSON until it passes `parseWorkspaceConfig`. */
export interface WorkspaceEnvelope {
  id: string
  revision: number
  updatedAt: string
  config: unknown
}

export const getWorkspace = () => request<WorkspaceEnvelope>('GET', '/workspace')
