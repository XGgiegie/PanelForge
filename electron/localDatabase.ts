import { app } from 'electron'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Database, SqlJsStatic } from 'sql.js'

type SqlJsInitializer = (config?: { locateFile?: (fileName: string) => string }) => Promise<SqlJsStatic>

// Keep sql.js outside Vite's ESM bundle. Its Node build resolves the wasm file through __dirname.
const initSqlJs = createRequire(import.meta.url)('sql.js') as SqlJsInitializer

export type AiImageRecord = {
  id: string
  prompt: string
  rawPrompt: string
  style: string
  source: string
  model: string
  aspectRatio: string
  resolution: string
  text: string
  bucket: string
  objectKey: string
  mimeType: string
  size: number
  createdAt: string
}

export type AiRequestLogStatus = 'running' | 'succeeded' | 'failed'

export type AiRequestLog = {
  id: string
  requestType: string
  status: AiRequestLogStatus
  model: string
  endpoint: string
  requestPayload: string
  responseSummary: string
  errorMessage: string
  durationMs: number | null
  createdAt: string
  completedAt: string
}

export type ContentStorageSnapshot = {
  novels: unknown[]
  characterAssets: unknown[]
  characterImageGenerations: unknown[]
}

export type ArchiveStoredCharacterProfileInput = {
  novel: unknown
  novelId: string
  profileId: string
  characterName: string
  deletedAt: string
}

export type RestoreStoredCharacterProfileInput = {
  novel: unknown
  novelId: string
  profileId: string
  characterName: string
  restoredAt: string
}

type Migration = {
  version: number
  name: string
  statements: string[]
}

type SqlValue = string | number | Uint8Array | null

const DATABASE_FILE_NAME = 'panelforge.db'
const LEGACY_AI_IMAGE_HISTORY_FILE_NAME = 'ai-image-history.json'

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'create_ai_image_records',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS app_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS ai_image_records (
          id TEXT PRIMARY KEY,
          prompt TEXT NOT NULL,
          raw_prompt TEXT NOT NULL DEFAULT '',
          style TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'image-generation',
          model TEXT NOT NULL,
          aspect_ratio TEXT NOT NULL,
          resolution TEXT NOT NULL DEFAULT '1K',
          text TEXT NOT NULL DEFAULT '',
          bucket TEXT NOT NULL,
          object_key TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `,
      'CREATE INDEX IF NOT EXISTS idx_ai_image_records_created_at ON ai_image_records(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ai_image_records_source ON ai_image_records(source)',
    ],
  },
  {
    version: 2,
    name: 'create_ai_request_logs',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS ai_request_logs (
          id TEXT PRIMARY KEY,
          request_type TEXT NOT NULL,
          status TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT '',
          endpoint TEXT NOT NULL DEFAULT '',
          request_payload TEXT NOT NULL DEFAULT '{}',
          response_summary TEXT NOT NULL DEFAULT '',
          error_message TEXT NOT NULL DEFAULT '',
          duration_ms INTEGER,
          created_at TEXT NOT NULL,
          completed_at TEXT NOT NULL DEFAULT ''
        )
      `,
      'CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created_at ON ai_request_logs(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ai_request_logs_status ON ai_request_logs(status)',
    ],
  },
  {
    version: 3,
    name: 'create_content_asset_records',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS novel_records (
          id TEXT PRIMARY KEY,
          record_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS character_asset_records (
          id TEXT PRIMARY KEY,
          novel_id TEXT NOT NULL,
          record_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS character_image_generation_records (
          id TEXT PRIMARY KEY,
          novel_id TEXT NOT NULL,
          profile_key TEXT NOT NULL,
          record_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `,
      'CREATE INDEX IF NOT EXISTS idx_character_asset_records_novel_id ON character_asset_records(novel_id)',
      'CREATE INDEX IF NOT EXISTS idx_character_image_generation_records_novel_id ON character_image_generation_records(novel_id)',
      'CREATE INDEX IF NOT EXISTS idx_character_image_generation_records_profile_key ON character_image_generation_records(profile_key)',
    ],
  },
  {
    version: 4,
    name: 'create_workflow_state_records',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS workflow_state_records (
          state_key TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `,
      'CREATE INDEX IF NOT EXISTS idx_workflow_state_records_updated_at ON workflow_state_records(updated_at DESC)',
    ],
  },
]

let sqlJsPromise: Promise<SqlJsStatic> | null = null
let localDatabase: Database | null = null

export function getLocalDatabasePath() {
  return path.join(app.getPath('userData'), DATABASE_FILE_NAME)
}

function getLegacyAiImageHistoryPath() {
  return path.join(app.getPath('userData'), LEGACY_AI_IMAGE_HISTORY_FILE_NAME)
}

function getSqlWasmPath(fileName: string) {
  const appRoot = process.env.APP_ROOT
  const candidates = [
    path.join(appRoot, 'node_modules', 'sql.js', 'dist', fileName),
    path.join(process.resourcesPath, fileName),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', fileName),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]
}

function loadSqlJs() {
  sqlJsPromise ??= initSqlJs({
    locateFile: (fileName) => getSqlWasmPath(fileName),
  })

  return sqlJsPromise
}

function ensureMigrationTable(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)
}

function ensureAppMetadataTable(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

function getAppliedMigrationVersions(database: Database) {
  const result = database.exec('SELECT version FROM schema_migrations')

  if (!result[0]) {
    return new Set<number>()
  }

  return new Set(result[0].values.map(([version]) => Number(version)))
}

function runMigrations(database: Database) {
  ensureMigrationTable(database)

  const appliedVersions = getAppliedMigrationVersions(database)

  MIGRATIONS.forEach((migration) => {
    if (appliedVersions.has(migration.version)) {
      return
    }

    database.run('BEGIN')

    try {
      migration.statements.forEach((statement) => database.run(statement))
      database.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ])
      database.run('COMMIT')
    } catch (error) {
      database.run('ROLLBACK')
      throw error
    }
  })
}

function persistDatabase(database: Database) {
  const databasePath = getLocalDatabasePath()
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  fs.writeFileSync(databasePath, Buffer.from(database.export()))
}

function getMetadataValue(database: Database, key: string) {
  const statement = database.prepare('SELECT value FROM app_metadata WHERE key = ? LIMIT 1')

  try {
    statement.bind([key])

    if (!statement.step()) {
      return ''
    }

    const row = statement.getAsObject() as { value?: unknown }

    return typeof row.value === 'string' ? row.value : ''
  } finally {
    statement.free()
  }
}

function setMetadataValue(database: Database, key: string, value: string) {
  database.run(
    `
      INSERT OR REPLACE INTO app_metadata (key, value, updated_at)
      VALUES (?, ?, ?)
    `,
    [key, value, new Date().toISOString()],
  )
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function getNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : fallback
}

function getNullableNumber(value: unknown) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : null
}

function getContentRecord(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}记录格式无效。`)
  }

  const record = value as Record<string, unknown>
  const id = getString(record.id)

  if (!id) {
    throw new Error(`${label}记录缺少 ID。`)
  }

  return record
}

function getContentRecordJson(value: unknown, label: string) {
  return JSON.stringify(getContentRecord(value, label))
}

function readContentRecords(database: Database, tableName: string) {
  const statement = database.prepare(`SELECT record_json FROM ${tableName} ORDER BY updated_at DESC`)
  const records: unknown[] = []

  try {
    while (statement.step()) {
      const row = statement.getAsObject() as { record_json?: unknown }

      try {
        const record = JSON.parse(String(row.record_json ?? ''))

        if (record && typeof record === 'object' && !Array.isArray(record)) {
          records.push(record)
        }
      } catch {
        // Invalid historical rows are ignored so one corrupt record cannot hide all assets.
      }
    }
  } finally {
    statement.free()
  }

  return records
}

function insertNovelRecord(database: Database, value: unknown, ignoreExisting = false) {
  const record = getContentRecord(value, '小说')
  const id = getString(record.id)
  const updatedAt = getString(record.updatedAt, new Date().toISOString())

  database.run(
    `
      INSERT ${ignoreExisting ? 'OR IGNORE' : 'OR REPLACE'} INTO novel_records (id, record_json, updated_at)
      VALUES (?, ?, ?)
    `,
    [id, getContentRecordJson(record, '小说'), updatedAt],
  )
}

function insertCharacterAssetRecord(database: Database, value: unknown, ignoreExisting = false) {
  const record = getContentRecord(value, '角色资产')
  const id = getString(record.id)
  const novelId = getString(record.novelId)

  if (!novelId) {
    throw new Error('角色资产记录缺少小说 ID。')
  }

  const updatedAt = getString(record.updatedAt, new Date().toISOString())

  database.run(
    `
      INSERT ${ignoreExisting ? 'OR IGNORE' : 'OR REPLACE'} INTO character_asset_records (
        id, novel_id, record_json, updated_at
      ) VALUES (?, ?, ?, ?)
    `,
    [id, novelId, getContentRecordJson(record, '角色资产'), updatedAt],
  )
}

function insertCharacterImageGenerationRecord(database: Database, value: unknown, ignoreExisting = false) {
  const record = getContentRecord(value, '角色形象历史')
  const id = getString(record.id)
  const novelId = getString(record.novelId)
  const profileKey = getString(record.profileKey)

  if (!novelId || !profileKey) {
    throw new Error('角色形象历史记录缺少关联信息。')
  }

  const updatedAt = getString(record.updatedAt, new Date().toISOString())

  database.run(
    `
      INSERT ${ignoreExisting ? 'OR IGNORE' : 'OR REPLACE'} INTO character_image_generation_records (
        id, novel_id, profile_key, record_json, updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
    [id, novelId, profileKey, getContentRecordJson(record, '角色形象历史'), updatedAt],
  )
}

type RecoveredCharacterProfile = {
  id: string
  name: string
  role: '主角' | '反派' | '配角' | '其他'
  gender: string
  age: number | null
  traits: {
    extroversion: number
    rationality: number
    kindness: number
    decisiveness: number
    guardedness: number
  }
  goal: string
  relationship: string
  appearance: string
}

function normalizeCharacterName(value: unknown) {
  return getString(value).replace(/\s+/g, '').toLowerCase()
}

function createRecoveredCharacterProfile(record: Record<string, unknown>): RecoveredCharacterProfile | null {
  const name = getString(record.characterName)

  if (!name) {
    return null
  }

  const prompt = getString(record.prompt)
  const profile: RecoveredCharacterProfile = {
    id: getString(record.profileId, `character-profile-recovered-${getString(record.id)}`),
    name,
    role: '配角',
    gender: '未知',
    age: null,
    traits: {
      extroversion: 50,
      rationality: 50,
      kindness: 50,
      decisiveness: 50,
      guardedness: 50,
    },
    goal: '',
    relationship: '',
    appearance: '',
  }

  const positioning = prompt.match(/【角色定位】\s*([\s\S]*?)(?=\s*【性格表现】|$)/)?.[1] ?? ''
  const positioningMatch = positioning.match(/(主角|反派|配角|其他)[，,]\s*(男性|女性|未知|非人类\s*\/\s*其他)(?:[，,]\s*(\d{1,3})岁左右的年龄感)?/)

  if (positioningMatch) {
    profile.role = positioningMatch[1] as RecoveredCharacterProfile['role']
    profile.gender = positioningMatch[2].replace(/\s+/g, ' ')
    const age = Number(positioningMatch[3])
    profile.age = Number.isFinite(age) ? Math.max(0, Math.min(120, age)) : null
  }

  const traitLabels: { key: keyof RecoveredCharacterProfile['traits']; label: string }[] = [
    { key: 'extroversion', label: '外向度' },
    { key: 'rationality', label: '理性度' },
    { key: 'kindness', label: '善良度' },
    { key: 'decisiveness', label: '果断度' },
    { key: 'guardedness', label: '戒备度' },
  ]

  traitLabels.forEach(({ key, label }) => {
    const score = prompt.match(new RegExp(`${label}\\s*(\\d{1,3})\\s*\\/\\s*100`))?.[1]

    if (!score) {
      return
    }

    profile.traits[key] = Math.max(0, Math.min(100, Number(score)))
  })

  profile.appearance = (prompt.match(/【外观特征】\s*([\s\S]*?)(?=\s*【构图】|$)/)?.[1] ?? '').trim()

  return profile
}

function recoverCharacterProfilesFromStoredImages(database: Database) {
  const migrationKey = 'character_profiles_recovered_from_existing_images_v1'

  if (getMetadataValue(database, migrationKey) === '1') {
    return
  }

  const novels = readContentRecords(database, 'novel_records')
  const characterAssets = readContentRecords(database, 'character_asset_records')
  const imageGenerations = readContentRecords(database, 'character_image_generation_records')

  if (novels.length === 0 || (characterAssets.length === 0 && imageGenerations.length === 0)) {
    return
  }

  const assetsByNovelId = new Map<string, Record<string, unknown>[]>()
  const generationsByNovelId = new Map<string, Record<string, unknown>[]>()

  characterAssets.forEach((value) => {
    const record = getContentRecord(value, '角色资产')
    const novelId = getString(record.novelId)

    if (!novelId) {
      return
    }

    assetsByNovelId.set(novelId, [...(assetsByNovelId.get(novelId) ?? []), record])
  })

  imageGenerations.forEach((value) => {
    const record = getContentRecord(value, '角色形象历史')
    const novelId = getString(record.novelId)

    if (!novelId) {
      return
    }

    generationsByNovelId.set(novelId, [...(generationsByNovelId.get(novelId) ?? []), record])
  })

  novels.forEach((value) => {
    const novel = getContentRecord(value, '小说')
    const novelId = getString(novel.id)
    const briefSource = novel.creativeBrief
    const creativeBrief =
      briefSource && typeof briefSource === 'object' && !Array.isArray(briefSource)
        ? { ...(briefSource as Record<string, unknown>) }
        : {}
    const currentProfiles = Array.isArray(creativeBrief.characterProfiles) ? creativeBrief.characterProfiles : []

    if (!novelId || currentProfiles.length > 0) {
      return
    }

    const profilesById = new Map<string, RecoveredCharacterProfile>()
    const profilesByName = new Map<string, RecoveredCharacterProfile>()

    ;(generationsByNovelId.get(novelId) ?? []).forEach((record) => {
      const profile = createRecoveredCharacterProfile(record)

      if (!profile) {
        return
      }

      const profileId = profile.id || `character-profile-recovered-${getString(record.id)}`
      const nameKey = normalizeCharacterName(profile.name)

      if (!profilesById.has(profileId) && !profilesByName.has(nameKey)) {
        profilesById.set(profileId, profile)
        profilesByName.set(nameKey, profile)
      }
    })

    ;(assetsByNovelId.get(novelId) ?? []).forEach((record) => {
      if (getString(record.kind) === 'reference') {
        return
      }

      const name = getString(record.name)
      const nameKey = normalizeCharacterName(name)

      if (!name || !nameKey) {
        return
      }

      const existingProfile = profilesByName.get(nameKey)

      if (existingProfile) {
        if (!existingProfile.appearance) {
          existingProfile.appearance = getString(record.description)
        }
        return
      }

      const profile: RecoveredCharacterProfile = {
        id: `character-profile-recovered-${getString(record.id)}`,
        name,
        role: '配角',
        gender: '未知',
        age: null,
        traits: {
          extroversion: 50,
          rationality: 50,
          kindness: 50,
          decisiveness: 50,
          guardedness: 50,
        },
        goal: '',
        relationship: '',
        appearance: getString(record.description),
      }

      profilesById.set(profile.id, profile)
      profilesByName.set(nameKey, profile)
    })

    const recoveredProfiles = [...profilesById.values()]

    if (recoveredProfiles.length === 0) {
      return
    }

    const now = new Date().toISOString()
    novel.creativeBrief = {
      ...creativeBrief,
      characterProfiles: recoveredProfiles,
      updatedAt: now,
    }
    novel.updatedAt = now
    insertNovelRecord(database, novel)
  })

  setMetadataValue(database, migrationKey, '1')
}

function normalizeAiImageRecord(record: Partial<AiImageRecord>): AiImageRecord {
  return {
    id: getString(record.id),
    prompt: getString(record.prompt),
    rawPrompt: getString(record.rawPrompt, getString(record.prompt)),
    style: getString(record.style),
    source: getString(record.source, 'image-generation'),
    model: getString(record.model),
    aspectRatio: getString(record.aspectRatio, '9:16'),
    resolution: getString(record.resolution, '1K'),
    text: getString(record.text),
    bucket: getString(record.bucket),
    objectKey: getString(record.objectKey),
    mimeType: getString(record.mimeType, 'image/png'),
    size: getNumber(record.size),
    createdAt: getString(record.createdAt, new Date().toISOString()),
  }
}

function insertAiImageRecord(database: Database, record: AiImageRecord) {
  database.run(
    `
      INSERT OR REPLACE INTO ai_image_records (
        id,
        prompt,
        raw_prompt,
        style,
        source,
        model,
        aspect_ratio,
        resolution,
        text,
        bucket,
        object_key,
        mime_type,
        size,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      record.id,
      record.prompt,
      record.rawPrompt,
      record.style,
      record.source,
      record.model,
      record.aspectRatio,
      record.resolution,
      record.text,
      record.bucket,
      record.objectKey,
      record.mimeType,
      record.size,
      record.createdAt,
    ],
  )
}

function normalizeAiRequestLog(record: Partial<AiRequestLog>): AiRequestLog {
  const status: AiRequestLogStatus = ['running', 'succeeded', 'failed'].includes(String(record.status))
    ? (record.status as AiRequestLogStatus)
    : 'running'

  return {
    id: getString(record.id),
    requestType: getString(record.requestType, 'unknown'),
    status,
    model: getString(record.model),
    endpoint: getString(record.endpoint),
    requestPayload: getString(record.requestPayload, '{}'),
    responseSummary: getString(record.responseSummary),
    errorMessage: getString(record.errorMessage),
    durationMs: getNullableNumber(record.durationMs),
    createdAt: getString(record.createdAt, new Date().toISOString()),
    completedAt: getString(record.completedAt),
  }
}

function insertAiRequestLog(database: Database, record: AiRequestLog) {
  database.run(
    `
      INSERT OR REPLACE INTO ai_request_logs (
        id,
        request_type,
        status,
        model,
        endpoint,
        request_payload,
        response_summary,
        error_message,
        duration_ms,
        created_at,
        completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      record.id,
      record.requestType,
      record.status,
      record.model,
      record.endpoint,
      record.requestPayload,
      record.responseSummary,
      record.errorMessage,
      record.durationMs,
      record.createdAt,
      record.completedAt,
    ],
  )
}

function migrateLegacyAiImageHistory(database: Database) {
  const migrationKey = 'legacy_ai_image_history_migrated'

  if (getMetadataValue(database, migrationKey) === '1') {
    return
  }

  const legacyPath = getLegacyAiImageHistoryPath()

  if (!fs.existsSync(legacyPath)) {
    return
  }

  try {
    const records = JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as Partial<AiImageRecord>[]

    if (Array.isArray(records) && records.length > 0) {
      records
        .map(normalizeAiImageRecord)
        .filter((record) => record.id && record.bucket && record.objectKey && record.createdAt)
        .forEach((record) => insertAiImageRecord(database, record))
    }
  } catch {
    // Keep the legacy JSON untouched; the app can still start with an empty SQLite history.
  } finally {
    setMetadataValue(database, migrationKey, '1')
  }
}

async function openLocalDatabase() {
  if (localDatabase) {
    return localDatabase
  }

  const SQL = await loadSqlJs()
  const databasePath = getLocalDatabasePath()
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  localDatabase = fs.existsSync(databasePath)
    ? new SQL.Database(fs.readFileSync(databasePath))
    : new SQL.Database()

  runMigrations(localDatabase)
  ensureAppMetadataTable(localDatabase)
  migrateLegacyAiImageHistory(localDatabase)
  recoverCharacterProfilesFromStoredImages(localDatabase)
  persistDatabase(localDatabase)

  return localDatabase
}

function mapSqlRowToAiImageRecord(row: Record<string, SqlValue>): AiImageRecord {
  return {
    id: String(row.id ?? ''),
    prompt: String(row.prompt ?? ''),
    rawPrompt: String(row.raw_prompt ?? ''),
    style: String(row.style ?? ''),
    source: String(row.source ?? 'image-generation'),
    model: String(row.model ?? ''),
    aspectRatio: String(row.aspect_ratio ?? '9:16'),
    resolution: String(row.resolution ?? '1K'),
    text: String(row.text ?? ''),
    bucket: String(row.bucket ?? ''),
    objectKey: String(row.object_key ?? ''),
    mimeType: String(row.mime_type ?? 'image/png'),
    size: Number(row.size ?? 0),
    createdAt: String(row.created_at ?? ''),
  }
}

function mapSqlRowToAiRequestLog(row: Record<string, SqlValue>): AiRequestLog {
  return {
    id: String(row.id ?? ''),
    requestType: String(row.request_type ?? 'unknown'),
    status: ['running', 'succeeded', 'failed'].includes(String(row.status))
      ? (String(row.status) as AiRequestLogStatus)
      : 'running',
    model: String(row.model ?? ''),
    endpoint: String(row.endpoint ?? ''),
    requestPayload: String(row.request_payload ?? '{}'),
    responseSummary: String(row.response_summary ?? ''),
    errorMessage: String(row.error_message ?? ''),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
    createdAt: String(row.created_at ?? ''),
    completedAt: String(row.completed_at ?? ''),
  }
}

function getRows(database: Database, sql: string, params: SqlValue[] = []) {
  const statement = database.prepare(sql)
  const rows: AiImageRecord[] = []

  try {
    statement.bind(params)

    while (statement.step()) {
      rows.push(mapSqlRowToAiImageRecord(statement.getAsObject() as Record<string, SqlValue>))
    }
  } finally {
    statement.free()
  }

  return rows
}

export async function addAiImageRecord(record: AiImageRecord) {
  const database = await openLocalDatabase()
  insertAiImageRecord(database, normalizeAiImageRecord(record))
  persistDatabase(database)
}

export async function addAiRequestLog(record: AiRequestLog) {
  const database = await openLocalDatabase()
  insertAiRequestLog(database, normalizeAiRequestLog(record))
  database.run(`
    DELETE FROM ai_request_logs
    WHERE id NOT IN (
      SELECT id
      FROM ai_request_logs
      ORDER BY created_at DESC
      LIMIT 200
    )
  `)
  persistDatabase(database)
}

export async function finishAiRequestLog(
  recordId: string,
  result: Pick<AiRequestLog, 'status' | 'responseSummary' | 'errorMessage' | 'durationMs' | 'completedAt'>,
) {
  const database = await openLocalDatabase()
  const normalized = normalizeAiRequestLog({ id: recordId, ...result })

  database.run(
    `
      UPDATE ai_request_logs
      SET status = ?, response_summary = ?, error_message = ?, duration_ms = ?, completed_at = ?
      WHERE id = ?
    `,
    [
      normalized.status,
      normalized.responseSummary,
      normalized.errorMessage,
      normalized.durationMs,
      normalized.completedAt,
      recordId,
    ],
  )
  persistDatabase(database)
}

export async function listAiRequestLogs(limit = 200) {
  const database = await openLocalDatabase()
  const normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Math.round(Number(limit)), 200)) : 200
  const statement = database.prepare(`
    SELECT
      id,
      request_type,
      status,
      model,
      endpoint,
      request_payload,
      response_summary,
      error_message,
      duration_ms,
      created_at,
      completed_at
    FROM ai_request_logs
    ORDER BY created_at DESC
    LIMIT ?
  `)
  const rows: AiRequestLog[] = []

  try {
    statement.bind([normalizedLimit])

    while (statement.step()) {
      rows.push(mapSqlRowToAiRequestLog(statement.getAsObject() as Record<string, SqlValue>))
    }
  } finally {
    statement.free()
  }

  return rows
}

export async function clearAiRequestLogs() {
  const database = await openLocalDatabase()
  database.run('DELETE FROM ai_request_logs')
  persistDatabase(database)
}

export async function loadWorkflowState(stateKey: string) {
  const database = await openLocalDatabase()
  const key = getString(stateKey)

  if (!key) {
    throw new Error('工作流状态缺少有效标识。')
  }

  const statement = database.prepare(`
    SELECT state_json
    FROM workflow_state_records
    WHERE state_key = ?
    LIMIT 1
  `)

  try {
    statement.bind([key])

    if (!statement.step()) {
      return null
    }

    const row = statement.getAsObject() as { state_json?: unknown }

    try {
      return JSON.parse(String(row.state_json ?? ''))
    } catch {
      return null
    }
  } finally {
    statement.free()
  }
}

export async function saveWorkflowState(stateKey: string, state: unknown) {
  const database = await openLocalDatabase()
  const key = getString(stateKey)

  if (!key) {
    throw new Error('工作流状态缺少有效标识。')
  }

  let serializedState = ''

  try {
    serializedState = JSON.stringify(state)
  } catch {
    throw new Error('工作流状态无法保存。')
  }

  database.run(
    `
      INSERT INTO workflow_state_records (state_key, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(state_key) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `,
    [key, serializedState, new Date().toISOString()],
  )
  persistDatabase(database)
}

export async function listStoredNovels() {
  const database = await openLocalDatabase()

  return readContentRecords(database, 'novel_records')
}

export async function seedStoredNovels(records: unknown[]) {
  const database = await openLocalDatabase()

  database.run('BEGIN')
  try {
    records.forEach((record) => insertNovelRecord(database, record, true))
    database.run('COMMIT')
  } catch (error) {
    database.run('ROLLBACK')
    throw error
  }

  recoverCharacterProfilesFromStoredImages(database)
  persistDatabase(database)
}

export async function upsertStoredNovel(record: unknown) {
  const database = await openLocalDatabase()
  insertNovelRecord(database, record)
  persistDatabase(database)
}

export async function deleteStoredNovel(recordId: string) {
  const database = await openLocalDatabase()
  database.run('DELETE FROM novel_records WHERE id = ?', [recordId])
  persistDatabase(database)
}

export async function listStoredCharacterContent(): Promise<Pick<ContentStorageSnapshot, 'characterAssets' | 'characterImageGenerations'>> {
  const database = await openLocalDatabase()

  return {
    characterAssets: readContentRecords(database, 'character_asset_records'),
    characterImageGenerations: readContentRecords(database, 'character_image_generation_records'),
  }
}

export async function archiveStoredCharacterProfile(
  input: ArchiveStoredCharacterProfileInput,
): Promise<Pick<ContentStorageSnapshot, 'characterAssets' | 'characterImageGenerations'>> {
  const database = await openLocalDatabase()
  const novelId = getString(input.novelId)
  const profileId = getString(input.profileId)
  const characterName = getString(input.characterName)
  const deletedAt = getString(input.deletedAt, new Date().toISOString())
  const novel = getContentRecord(input.novel, '小说')

  if (!novelId || !profileId || getString(novel.id) !== novelId) {
    throw new Error('角色归档请求缺少有效的小说或角色关联。')
  }

  const normalizedName = normalizeCharacterName(characterName)
  const characterAssets = readContentRecords(database, 'character_asset_records')
  const imageGenerations = readContentRecords(database, 'character_image_generation_records')
  const matchedGenerationIds = new Set<string>()

  database.run('BEGIN')
  try {
    insertNovelRecord(database, novel)

    imageGenerations.forEach((value) => {
      const record = getContentRecord(value, '角色形象历史')
      const belongsToProfile =
        getString(record.novelId) === novelId &&
        (getString(record.profileId) === profileId ||
          (!getString(record.profileId) && normalizeCharacterName(record.characterName) === normalizedName))

      if (!belongsToProfile) {
        return
      }

      matchedGenerationIds.add(getString(record.id))
      record.profileId = profileId
      record.profileKey = `${novelId}:${profileId}`
      record.deletedAt = deletedAt
      record.updatedAt = deletedAt
      insertCharacterImageGenerationRecord(database, record)
    })

    characterAssets.forEach((value) => {
      const record = getContentRecord(value, '角色资产')
      const recordProfileId = getString(record.profileId)
      const generationId = getString(record.generationId)
      const belongsToProfile =
        getString(record.novelId) === novelId &&
        (recordProfileId === profileId ||
          matchedGenerationIds.has(generationId) ||
          (!recordProfileId && normalizeCharacterName(record.name) === normalizedName))

      if (!belongsToProfile) {
        return
      }

      record.profileId = profileId
      record.deletedAt = deletedAt
      record.updatedAt = deletedAt
      insertCharacterAssetRecord(database, record)
    })

    database.run('COMMIT')
  } catch (error) {
    database.run('ROLLBACK')
    throw error
  }

  persistDatabase(database)

  return {
    characterAssets: readContentRecords(database, 'character_asset_records'),
    characterImageGenerations: readContentRecords(database, 'character_image_generation_records'),
  }
}

export async function restoreStoredCharacterProfile(
  input: RestoreStoredCharacterProfileInput,
): Promise<Pick<ContentStorageSnapshot, 'characterAssets' | 'characterImageGenerations'>> {
  const database = await openLocalDatabase()
  const novelId = getString(input.novelId)
  const profileId = getString(input.profileId)
  const characterName = getString(input.characterName)
  const restoredAt = getString(input.restoredAt, new Date().toISOString())
  const novel = getContentRecord(input.novel, '小说')

  if (!novelId || !profileId || getString(novel.id) !== novelId) {
    throw new Error('角色恢复请求缺少有效的小说或角色关联。')
  }

  const normalizedName = normalizeCharacterName(characterName)
  const characterAssets = readContentRecords(database, 'character_asset_records')
  const imageGenerations = readContentRecords(database, 'character_image_generation_records')
  const matchedGenerationIds = new Set<string>()

  database.run('BEGIN')
  try {
    insertNovelRecord(database, novel)

    imageGenerations.forEach((value) => {
      const record = getContentRecord(value, '角色形象历史')
      const belongsToProfile =
        getString(record.novelId) === novelId &&
        (getString(record.profileId) === profileId ||
          (!getString(record.profileId) && normalizeCharacterName(record.characterName) === normalizedName))

      if (!belongsToProfile) {
        return
      }

      matchedGenerationIds.add(getString(record.id))
      record.profileId = profileId
      record.profileKey = `${novelId}:${profileId}`
      delete record.deletedAt
      record.updatedAt = restoredAt
      insertCharacterImageGenerationRecord(database, record)
    })

    characterAssets.forEach((value) => {
      const record = getContentRecord(value, '角色资产')
      const recordProfileId = getString(record.profileId)
      const generationId = getString(record.generationId)
      const belongsToProfile =
        getString(record.novelId) === novelId &&
        (recordProfileId === profileId ||
          matchedGenerationIds.has(generationId) ||
          (!recordProfileId && normalizeCharacterName(record.name) === normalizedName))

      if (!belongsToProfile) {
        return
      }

      record.profileId = profileId
      delete record.deletedAt
      record.updatedAt = restoredAt
      insertCharacterAssetRecord(database, record)
    })

    database.run('COMMIT')
  } catch (error) {
    database.run('ROLLBACK')
    throw error
  }

  persistDatabase(database)

  return {
    characterAssets: readContentRecords(database, 'character_asset_records'),
    characterImageGenerations: readContentRecords(database, 'character_image_generation_records'),
  }
}

export async function seedStoredCharacterContent(
  snapshot: Pick<ContentStorageSnapshot, 'characterAssets' | 'characterImageGenerations'>,
) {
  const database = await openLocalDatabase()

  database.run('BEGIN')
  try {
    snapshot.characterAssets.forEach((record) => insertCharacterAssetRecord(database, record, true))
    snapshot.characterImageGenerations.forEach((record) => insertCharacterImageGenerationRecord(database, record, true))
    database.run('COMMIT')
  } catch (error) {
    database.run('ROLLBACK')
    throw error
  }

  recoverCharacterProfilesFromStoredImages(database)
  persistDatabase(database)
}

export async function upsertStoredCharacterAsset(record: unknown) {
  const database = await openLocalDatabase()
  insertCharacterAssetRecord(database, record)
  recoverCharacterProfilesFromStoredImages(database)
  persistDatabase(database)
}

export async function upsertStoredCharacterImageGeneration(record: unknown) {
  const database = await openLocalDatabase()
  insertCharacterImageGenerationRecord(database, record)
  recoverCharacterProfilesFromStoredImages(database)
  persistDatabase(database)
}

export async function listAiImageRecords(limit = 300) {
  const database = await openLocalDatabase()

  return getRows(
    database,
    `
      SELECT
        id,
        prompt,
        raw_prompt,
        style,
        source,
        model,
        aspect_ratio,
        resolution,
        text,
        bucket,
        object_key,
        mime_type,
        size,
        created_at
      FROM ai_image_records
      ORDER BY created_at DESC
      LIMIT ?
    `,
    [limit],
  )
}

export async function getAiImageRecord(recordId: string) {
  const database = await openLocalDatabase()
  const rows = getRows(
    database,
    `
      SELECT
        id,
        prompt,
        raw_prompt,
        style,
        source,
        model,
        aspect_ratio,
        resolution,
        text,
        bucket,
        object_key,
        mime_type,
        size,
        created_at
      FROM ai_image_records
      WHERE id = ?
      LIMIT 1
    `,
    [recordId],
  )

  return rows[0] ?? null
}

export async function deleteAiImageRecordMetadata(recordId: string) {
  const database = await openLocalDatabase()
  database.run('DELETE FROM ai_image_records WHERE id = ?', [recordId])
  persistDatabase(database)
}
