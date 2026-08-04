import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

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
          source TEXT NOT NULL DEFAULT 'ai-drawing',
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

function normalizeAiImageRecord(record: Partial<AiImageRecord>): AiImageRecord {
  return {
    id: getString(record.id),
    prompt: getString(record.prompt),
    rawPrompt: getString(record.rawPrompt, getString(record.prompt)),
    style: getString(record.style),
    source: getString(record.source, 'ai-drawing'),
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
  persistDatabase(localDatabase)

  return localDatabase
}

function mapSqlRowToAiImageRecord(row: Record<string, SqlValue>): AiImageRecord {
  return {
    id: String(row.id ?? ''),
    prompt: String(row.prompt ?? ''),
    rawPrompt: String(row.raw_prompt ?? ''),
    style: String(row.style ?? ''),
    source: String(row.source ?? 'ai-drawing'),
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
