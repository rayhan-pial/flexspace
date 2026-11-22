import { SCHEMA_VERSION } from './constants'
import type { ConfigErrorCode } from './types'

export class WorkspaceConfigError extends Error {
  readonly code: ConfigErrorCode
  constructor(code: ConfigErrorCode, message: string) {
    super(message)
    this.name = 'WorkspaceConfigError'
    this.code = code
  }
}

type Doc = Record<string, unknown>

/** Pure sequential migrations: MIGRATIONS[n] upgrades a copy from vN to vN+1. Empty today. */
export const MIGRATIONS: Record<number, (doc: Doc) => Doc> = {}

/** Returns a deep copy upgraded to the current schema version; never mutates `raw`. */
export function migrateConfig(raw: unknown): Doc {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new WorkspaceConfigError('invalid_config', 'configuration must be a JSON object')
  }
  let version = (raw as Doc).schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new WorkspaceConfigError('invalid_config', 'schemaVersion must be a positive integer')
  }
  if (version > SCHEMA_VERSION) {
    throw new WorkspaceConfigError('unsupported_schema_version', `schema version ${version} is not supported`)
  }
  let doc = structuredClone(raw) as Doc
  while (version < SCHEMA_VERSION) {
    doc = MIGRATIONS[version](doc)
    version += 1
    doc.schemaVersion = version
  }
  return doc
}
