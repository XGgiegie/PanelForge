import { app, BrowserWindow, ipcMain, Menu, net } from 'electron'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  addAiImageRecord,
  type AiImageRecord,
} from './localDatabase'
import { initializeAutoUpdater, registerAutoUpdaterIpc } from './updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

loadLocalEnvFile()

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null
let sourceWindow: BrowserWindow | null = null
let canvasWindow: BrowserWindow | null = null
let characterWorkspaceWindow: BrowserWindow | null = null

function getAppIconPath() {
  const iconFileName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const iconPath = path.join(process.env.APP_ROOT, 'build', iconFileName)
  return fs.existsSync(iconPath) ? iconPath : undefined
}

type AiHubMixChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type AiHubMixChatCompletionRequest = {
  apiKey?: string
  appCode?: string
  model?: string
  messages?: AiHubMixChatMessage[]
  temperature?: number
}

type AiHubMixChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
      multi_mod_content?: AiHubMixMultimodalPart[]
    }
  }>
  error?: {
    message?: string
  }
}

type AiHubMixApiErrorResponse = {
  error?: {
    message?: string
  }
}

type AiHubMixMultimodalPart = {
  text?: string
  inline_data?: {
    data?: string
    mime_type?: string
  }
}

type AiHubMixKeyValidationRequest = {
  apiKey?: string
  appCode?: string
}

type AiHubMixDefaultConfigResponse = {
  apiKey: string
  appCode: string
  textModel: string
  imageModel: string
  videoModel: string
}

type AiHubMixImageGenerationRequest = {
  apiKey?: string
  appCode?: string
  model?: string
  prompt?: string
  rawPrompt?: string
  style?: string
  aspectRatio?: string
  resolution?: string
  source?: string
  referenceImages?: string[]
}

type AiImageStorageStatus = {
  status: 'saved' | 'failed'
  message: string
  recordId?: string
  objectKey?: string
  bucket?: string
}

type AiHubMixImageGenerationResponse = {
  imageDataUrl: string
  imageUrl?: string
  text: string
  model: string
  aspectRatio: string
  resolution: string
  storage?: AiImageStorageStatus
}

type AiHubMixVideoReferenceContent = {
  type: 'image_url' | 'video_url' | 'audio_url'
  image_url?: {
    url: string
  }
  video_url?: {
    url: string
  }
  audio_url?: {
    url: string
  }
  role?: 'reference_image' | 'reference_video' | 'reference_audio'
}

type AiHubMixVideoGenerationRequest = {
  apiKey?: string
  appCode?: string
  model?: string
  prompt?: string
  firstFrameImageUrl?: string
  content?: AiHubMixVideoReferenceContent[]
  ratio?: string
  duration?: number
  watermark?: boolean
}

type AiHubMixVideoGenerationResponse = {
  videoUrl: string
  taskId: string
  status: string
  model: string
  ratio: string
  duration: number
  rawResponse: string
}

type OpenChapterSourceWindowRequest = {
  routeHash?: string
  title?: string
}

type OpenChapterCanvasWindowRequest = {
  routeHash?: string
  title?: string
}

type OpenCharacterWorkspaceWindowRequest = {
  routeHash?: string
  title?: string
}

type AiHubMixKeyValidationResponse = {
  valid: true
  model: 'gpt-5.5'
}

function loadLocalEnvFile() {
  const envPath = path.join(process.env.APP_ROOT, '.env')

  if (!fs.existsSync(envPath)) {
    return
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)

  lines.forEach((line) => {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return
    }

    const equalIndex = trimmedLine.indexOf('=')

    if (equalIndex <= 0) {
      return
    }

    const key = trimmedLine.slice(0, equalIndex).trim()
    const rawValue = trimmedLine.slice(equalIndex + 1).trim()

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key]) {
      return
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
  })
}

function getEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()

    if (value) {
      return value
    }
  }

  return ''
}

function getAiHubMixTextModel() {
  return getEnvValue('PANELFORGE_AIHUBMIX_TEXT_MODEL') || 'gpt-5.5'
}

function getAiHubMixImageModel() {
  return getEnvValue('PANELFORGE_AIHUBMIX_IMAGE_MODEL') || 'gemini-3-pro-image'
}

function getAiHubMixVideoModel() {
  return getEnvValue('PANELFORGE_AIHUBMIX_VIDEO_MODEL') || 'doubao-seedance-2-0-260128'
}

function getAiHubMixDefaultConfig(): AiHubMixDefaultConfigResponse {
  return {
    apiKey: getEnvValue('PANELFORGE_AIHUBMIX_API_KEY', 'AIHUBMIX_API_KEY'),
    appCode: getEnvValue('PANELFORGE_AIHUBMIX_APP_CODE', 'AIHUBMIX_APP_CODE', 'APP_CODE'),
    textModel: getAiHubMixTextModel(),
    imageModel: getAiHubMixImageModel(),
    videoModel: getAiHubMixVideoModel(),
  }
}

function getAiHubMixApiKey(apiKey?: string) {
  const value = apiKey?.trim() || getAiHubMixDefaultConfig().apiKey

  if (!value) {
    throw new Error('请先在设置中填写 AIHubMix Key。')
  }

  return value
}

function getAiHubMixAppCode(appCode?: string) {
  const value = appCode?.trim() || getAiHubMixDefaultConfig().appCode

  if (!value) {
    throw new Error('请先在设置中填写 AIHubMix APP-Code。')
  }

  return value
}

function normalizeImageAspectRatio(aspectRatio?: string) {
  const value = aspectRatio?.trim() || '9:16'
  const supportedRatios = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])

  return supportedRatios.has(value) ? value : '9:16'
}

function normalizeImageResolution(resolution?: string) {
  const value = resolution?.trim().toUpperCase() || '1K'
  const supportedResolutions = new Set(['1K', '2K', '4K'])

  return supportedResolutions.has(value) ? value : '1K'
}

function getImageDataUrlFromPart(part: AiHubMixMultimodalPart) {
  const data = part.inline_data?.data

  if (!data) {
    return ''
  }

  return `data:${part.inline_data?.mime_type || 'image/png'};base64,${data}`
}

type MinioConfig = {
  endpointUrl: URL
  publicBaseUrl: URL
  accessKey: string
  secretKey: string
  bucket: string
  region: string
}

const EMPTY_BODY_HASH = createHash('sha256').update('').digest('hex')

function getEnvBoolean(key: string, fallback: boolean) {
  const value = process.env[key]?.trim().toLowerCase()

  if (!value) {
    return fallback
  }

  return value === 'true' || value === '1' || value === 'yes'
}

function getEnvNumber(key: string, fallback: number) {
  const value = Number(process.env[key]?.trim())

  return Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeBaseUrl(rawEndpoint: string, useSSL: boolean, port: number) {
  if (/^https?:\/\//i.test(rawEndpoint)) {
    const url = new URL(rawEndpoint)
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url
  }

  return new URL(`${useSSL ? 'https' : 'http'}://${rawEndpoint}:${port}`)
}

function getMinioConfig(bucketOverride?: string): MinioConfig {
  const useSSL = getEnvBoolean('PANELFORGE_MINIO_USE_SSL', false)
  const port = getEnvNumber('PANELFORGE_MINIO_PORT', useSSL ? 443 : 9000)
  const endpointUrl = normalizeBaseUrl(getEnvValue('PANELFORGE_MINIO_ENDPOINT') || 'localhost', useSSL, port)
  const publicBaseUrl = normalizeBaseUrl(
    getEnvValue('PANELFORGE_MINIO_PUBLIC_URL') || endpointUrl.origin,
    endpointUrl.protocol === 'https:',
    Number(endpointUrl.port) || (endpointUrl.protocol === 'https:' ? 443 : 80),
  )

  return {
    endpointUrl,
    publicBaseUrl,
    accessKey: getEnvValue('PANELFORGE_MINIO_ACCESS_KEY', 'MINIO_ACCESS_KEY') || 'minioadmin',
    secretKey: getEnvValue('PANELFORGE_MINIO_SECRET_KEY', 'MINIO_SECRET_KEY') || 'minioadmin',
    bucket: bucketOverride || getEnvValue('PANELFORGE_MINIO_BUCKET', 'MINIO_BUCKET') || 'panelforge-images',
    region: getEnvValue('PANELFORGE_MINIO_REGION', 'MINIO_REGION') || 'us-east-1',
  }
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function getMinioObjectUri(bucket: string, objectKey: string) {
  const encodedBucket = encodeRfc3986(bucket)
  const encodedObjectKey = objectKey
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/')

  return `/${encodedBucket}/${encodedObjectKey}`
}

function getAwsDates(date = new Date()) {
  const isoValue = date.toISOString().replace(/[:-]|\.\d{3}/g, '')

  return {
    amzDate: isoValue,
    dateStamp: isoValue.slice(0, 8),
  }
}

function sha256Hex(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function hmacSha256(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest()
}

function getMinioSigningKey(secretKey: string, dateStamp: string, region: string) {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp)
  const kRegion = hmacSha256(kDate, region)
  const kService = hmacSha256(kRegion, 's3')

  return hmacSha256(kService, 'aws4_request')
}

function createMinioAuthorizationHeader(input: {
  config: MinioConfig
  method: string
  canonicalUri: string
  canonicalQueryString?: string
  payloadHash: string
  amzDate: string
  dateStamp: string
  signedHeaders: string
  canonicalHeaders: string
}) {
  const credentialScope = `${input.dateStamp}/${input.config.region}/s3/aws4_request`
  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    input.canonicalQueryString ?? '',
    input.canonicalHeaders,
    input.signedHeaders,
    input.payloadHash,
  ].join('\n')
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    input.amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const signature = createHmac('sha256', getMinioSigningKey(input.config.secretKey, input.dateStamp, input.config.region))
    .update(stringToSign)
    .digest('hex')

  return `AWS4-HMAC-SHA256 Credential=${input.config.accessKey}/${credentialScope}, SignedHeaders=${input.signedHeaders}, Signature=${signature}`
}

async function fetchSignedMinio(input: {
  config: MinioConfig
  method: 'HEAD' | 'PUT' | 'DELETE'
  bucket: string
  objectKey?: string
  body?: Buffer
  contentType?: string
}) {
  const canonicalUri = input.objectKey
    ? getMinioObjectUri(input.bucket, input.objectKey)
    : `/${encodeRfc3986(input.bucket)}`
  const body = input.body ?? Buffer.alloc(0)
  const payloadHash = input.body ? sha256Hex(body) : EMPTY_BODY_HASH
  const { amzDate, dateStamp } = getAwsDates()
  const canonicalHeaders = [
    `host:${input.config.endpointUrl.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n')
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const headers: Record<string, string> = {
    Authorization: createMinioAuthorizationHeader({
      config: input.config,
      method: input.method,
      canonicalUri,
      payloadHash,
      amzDate,
      dateStamp,
      signedHeaders,
      canonicalHeaders,
    }),
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }

  if (input.contentType) {
    headers['Content-Type'] = input.contentType
  }

  return net.fetch(`${input.config.endpointUrl.origin}${canonicalUri}`, {
    method: input.method,
    headers,
    body: input.body,
  })
}

async function getMinioErrorMessage(response: Response, fallback: string) {
  try {
    const text = await response.text()
    return text || fallback
  } catch {
    return fallback
  }
}

async function ensureMinioBucket(config: MinioConfig) {
  const headResponse = await fetchSignedMinio({
    config,
    method: 'HEAD',
    bucket: config.bucket,
  })

  if (headResponse.ok) {
    return
  }

  if (headResponse.status !== 404) {
    throw new Error(await getMinioErrorMessage(headResponse, `MinIO Bucket 检查失败（HTTP ${headResponse.status}）。`))
  }

  const createResponse = await fetchSignedMinio({
    config,
    method: 'PUT',
    bucket: config.bucket,
  })

  if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error(await getMinioErrorMessage(createResponse, `MinIO Bucket 创建失败（HTTP ${createResponse.status}）。`))
  }
}

function parseImageDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)

  if (!match) {
    throw new Error('图片数据格式无效，无法保存到 MinIO。')
  }

  const mimeType = match[1] || 'image/png'
  const body = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]), 'utf8')

  return {
    body,
    mimeType,
  }
}

function getImageExtension(mimeType: string) {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    return 'jpg'
  }

  if (mimeType.includes('webp')) {
    return 'webp'
  }

  return 'png'
}

function getUnknownErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function createPresignedMinioUrl(record: Pick<AiImageRecord, 'bucket' | 'objectKey'>, expires = 60 * 60 * 12) {
  const config = getMinioConfig(record.bucket)
  const canonicalUri = getMinioObjectUri(record.bucket, record.objectKey)
  const { amzDate, dateStamp } = getAwsDates()
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`
  const queryEntries: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKey}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ]
  const canonicalQueryString = queryEntries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .sort()
    .join('&')
  const canonicalHeaders = `host:${config.publicBaseUrl.host}\n`
  const authorization = createMinioAuthorizationHeader({
    config,
    method: 'GET',
    canonicalUri,
    canonicalQueryString,
    payloadHash: 'UNSIGNED-PAYLOAD',
    amzDate,
    dateStamp,
    signedHeaders: 'host',
    canonicalHeaders,
  })
  const signature = authorization.split('Signature=')[1]

  return `${config.publicBaseUrl.origin}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`
}

async function uploadAiImageToMinio(input: {
  imageDataUrl: string
  prompt: string
  rawPrompt?: string
  style?: string
  source?: string
  model: string
  aspectRatio: string
  resolution: string
  text: string
}) {
  const config = getMinioConfig()
  const image = parseImageDataUrl(input.imageDataUrl)
  const createdAt = new Date().toISOString()
  const id = `ai-image-${randomUUID()}`
  const objectDatePath = createdAt.slice(0, 10).replace(/-/g, '/')
  const objectKey = `image-generation/${objectDatePath}/${id}.${getImageExtension(image.mimeType)}`

  await ensureMinioBucket(config)

  const uploadResponse = await fetchSignedMinio({
    config,
    method: 'PUT',
    bucket: config.bucket,
    objectKey,
    body: image.body,
    contentType: image.mimeType,
  })

  if (!uploadResponse.ok) {
    throw new Error(await getMinioErrorMessage(uploadResponse, `图片保存到 MinIO 失败（HTTP ${uploadResponse.status}）。`))
  }

  const record: AiImageRecord = {
    id,
    prompt: input.prompt,
    rawPrompt: input.rawPrompt?.trim() || input.prompt,
    style: input.style?.trim() || '',
    source: input.source?.trim() || 'image-generation',
    model: input.model,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    text: input.text,
    bucket: config.bucket,
    objectKey,
    mimeType: image.mimeType,
    size: image.body.byteLength,
    createdAt,
  }
  await addAiImageRecord(record)

  return {
    record,
    imageUrl: createPresignedMinioUrl(record),
  }
}

async function saveGeneratedImageToMinio(input: {
  imageDataUrl: string
  prompt: string
  rawPrompt?: string
  style?: string
  source?: string
  model: string
  aspectRatio: string
  resolution: string
  text: string
}) {
  try {
    const saved = await uploadAiImageToMinio(input)

    return {
      imageUrl: saved.imageUrl,
      storage: {
        status: 'saved',
        message: '图片已保存到 MinIO。',
        recordId: saved.record.id,
        objectKey: saved.record.objectKey,
        bucket: saved.record.bucket,
      } satisfies AiImageStorageStatus,
    }
  } catch (error) {
    return {
      imageUrl: '',
      storage: {
        status: 'failed',
        message: getUnknownErrorMessage(error, '图片已生成，但保存到 MinIO 失败。'),
      } satisfies AiImageStorageStatus,
    }
  }
}

function normalizeVideoRatio(ratio?: string) {
  const value = ratio?.trim() || '9:16'
  const supportedRatios = new Set(['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'])

  return supportedRatios.has(value) ? value : '9:16'
}

function normalizeVideoDuration(duration?: number) {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return 6
  }

  return Math.max(3, Math.min(30, Math.round(duration)))
}

function compactRawResponse(value: string) {
  return value.length > 4000 ? `${value.slice(0, 4000)}…` : value
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^data:/i.test(value)
}

function isVideoUrl(value: string) {
  return /^data:video\//i.test(value) || /\.(mp4|mov|webm)(?:[?#].*)?$/i.test(value)
}

function findNestedStringByKeys(value: unknown, keys: string[]): string {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const record = value as Record<string, unknown>

  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'string' && keys.includes(key)) {
      return item
    }
  }

  for (const item of Object.values(record)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const found = findNestedStringByKeys(child, keys)

        if (found) {
          return found
        }
      }
      continue
    }

    const found = findNestedStringByKeys(item, keys)

    if (found) {
      return found
    }
  }

  return ''
}

function findVideoUrl(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const record = value as Record<string, unknown>

  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'string' || !isUrl(item)) {
      continue
    }

    const normalizedKey = key.toLowerCase()

    if (normalizedKey.includes('video') || isVideoUrl(item)) {
      return item
    }
  }

  for (const item of Object.values(record)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const found = findVideoUrl(child)

        if (found) {
          return found
        }
      }
      continue
    }

    const found = findVideoUrl(item)

    if (found) {
      return found
    }
  }

  return ''
}

function getAiHubMixErrorMessage(status: number, responseText: string, data: AiHubMixApiErrorResponse | null) {
  return data?.error?.message || responseText || `AIHubMix 请求失败（HTTP ${status}）`
}

function normalizeChapterSourceRouteHash(routeHash?: string) {
  const rawRouteHash = routeHash?.trim() ?? ''
  const routePath = rawRouteHash.startsWith('#') ? rawRouteHash.slice(1) : rawRouteHash

  if (!/^\/scripts\/[^/]+\/chapters\/[1-9]\d*\/source$/.test(routePath)) {
    throw new Error('无效的正文窗口路由。')
  }

  return routePath
}

function normalizeChapterCanvasRouteHash(routeHash?: string) {
  const rawRouteHash = routeHash?.trim() ?? ''
  const routePath = rawRouteHash.startsWith('#') ? rawRouteHash.slice(1) : rawRouteHash

  if (!/^\/scripts\/[^/]+\/chapters\/[1-9]\d*\/canvas$/.test(routePath)) {
    throw new Error('无效的画布窗口路由。')
  }

  return routePath
}

function normalizeCharacterWorkspaceRouteHash(routeHash?: string) {
  const rawRouteHash = routeHash?.trim() ?? ''
  const routePath = rawRouteHash.startsWith('#') ? rawRouteHash.slice(1) : rawRouteHash

  if (!/^\/scripts\/[^/]+\/outline$/.test(routePath)) {
    throw new Error('无效的角色工作台窗口路由。')
  }

  return routePath
}

function loadRendererRoute(targetWindow: BrowserWindow, routePath: string) {
  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL)
    url.hash = routePath
    targetWindow.loadURL(url.toString())
    return
  }

  targetWindow.loadFile(path.join(RENDERER_DIST, 'index.html'), {
    hash: routePath,
  })
}

function openChapterSourceWindow(payload: OpenChapterSourceWindowRequest = {}) {
  const routePath = normalizeChapterSourceRouteHash(payload.routeHash)
  const title = payload.title?.trim() || '章节正文'

  if (sourceWindow && !sourceWindow.isDestroyed()) {
    sourceWindow.setTitle(title)
    loadRendererRoute(sourceWindow, routePath)
    sourceWindow.show()
    sourceWindow.focus()
    return
  }

  sourceWindow = new BrowserWindow({
    width: 880,
    height: 760,
    minWidth: 640,
    minHeight: 520,
    title,
    icon: getAppIconPath(),
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  sourceWindow.on('closed', () => {
    sourceWindow = null
  })

  loadRendererRoute(sourceWindow, routePath)
  sourceWindow.focus()
}

function openChapterCanvasWindow(payload: OpenChapterCanvasWindowRequest = {}) {
  const routePath = normalizeChapterCanvasRouteHash(payload.routeHash)
  const title = payload.title?.trim() || '分镜画布'

  if (canvasWindow && !canvasWindow.isDestroyed()) {
    canvasWindow.setTitle(title)
    loadRendererRoute(canvasWindow, routePath)
    canvasWindow.show()
    canvasWindow.focus()
    return
  }

  canvasWindow = new BrowserWindow({
    width: 1500,
    height: 860,
    minWidth: 1180,
    minHeight: 640,
    title,
    icon: getAppIconPath(),
    backgroundColor: '#f7f7f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  canvasWindow.on('closed', () => {
    canvasWindow = null
  })

  loadRendererRoute(canvasWindow, routePath)
  canvasWindow.focus()
}

function openCharacterWorkspaceWindow(payload: OpenCharacterWorkspaceWindowRequest = {}) {
  const routePath = normalizeCharacterWorkspaceRouteHash(payload.routeHash)
  const title = payload.title?.trim() || '角色工作台'

  if (characterWorkspaceWindow && !characterWorkspaceWindow.isDestroyed()) {
    characterWorkspaceWindow.setTitle(title)
    loadRendererRoute(characterWorkspaceWindow, routePath)
    characterWorkspaceWindow.show()
    characterWorkspaceWindow.focus()
    return
  }

  characterWorkspaceWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title,
    icon: getAppIconPath(),
    backgroundColor: '#f7f9f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  characterWorkspaceWindow.on('closed', () => {
    characterWorkspaceWindow = null
  })

  loadRendererRoute(characterWorkspaceWindow, routePath)
  characterWorkspaceWindow.focus()
}

async function requestAiHubMixChatCompletion(payload: AiHubMixChatCompletionRequest) {
  const apiKey = getAiHubMixApiKey(payload.apiKey)
  const appCode = getAiHubMixAppCode(payload.appCode)
  const model = payload.model?.trim() || getAiHubMixTextModel()

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    throw new Error('缺少 AI 分析消息内容。')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)

  try {
    const response = await net.fetch('https://aihubmix.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'APP-Code': appCode,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: payload.messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
      }),
      signal: controller.signal,
    })
    const responseText = await response.text()
    let data: AiHubMixChatCompletionResponse | null = null

    try {
      data = JSON.parse(responseText) as AiHubMixChatCompletionResponse
    } catch {
      data = null
    }

    if (!response.ok) {
      throw new Error(getAiHubMixErrorMessage(response.status, responseText, data))
    }

    const content = data?.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('AIHubMix 没有返回可用的分析内容。')
    }

    return {
      content,
      model,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AIHubMix 请求超时，请稍后重试。')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function generateAiHubMixImage(payload: AiHubMixImageGenerationRequest): Promise<AiHubMixImageGenerationResponse> {
  const apiKey = getAiHubMixApiKey(payload.apiKey)
  const appCode = getAiHubMixAppCode(payload.appCode)
  const model = payload.model?.trim() || getAiHubMixImageModel()
  const prompt = payload.prompt?.trim()
  const aspectRatio = normalizeImageAspectRatio(payload.aspectRatio)
  const resolution = normalizeImageResolution(payload.resolution)
  const referenceImages = (payload.referenceImages ?? [])
    .map((image) => image.trim())
    .filter((image) => image.startsWith('data:image/') || image.startsWith('https://') || image.startsWith('http://'))
    .slice(0, 5)

  if (!prompt) {
    throw new Error('请先填写图片提示词。')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180000)

  try {
    const response = await net.fetch('https://aihubmix.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'APP-Code': appCode,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: [`aspect_ratio=${aspectRatio}`, `resolution=${resolution}`].join('\n'),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              ...referenceImages.map((image) => ({
                type: 'image_url',
                image_url: {
                  url: image,
                },
              })),
            ],
          },
        ],
        modalities: ['text', 'image'],
      }),
      signal: controller.signal,
    })
    const responseText = await response.text()
    let data: AiHubMixChatCompletionResponse | null = null

    try {
      data = JSON.parse(responseText) as AiHubMixChatCompletionResponse
    } catch {
      data = null
    }

    if (!response.ok) {
      throw new Error(getAiHubMixErrorMessage(response.status, responseText, data))
    }

    const parts = data?.choices?.[0]?.message?.multi_mod_content ?? []
    const text = parts
      .map((part) => part.text?.trim() ?? '')
      .filter(Boolean)
      .join('\n')
    const imageDataUrl = parts.map(getImageDataUrlFromPart).find(Boolean) ?? ''

    if (!imageDataUrl) {
      throw new Error('图片模型没有返回可用图片。')
    }

    const storageResult = await saveGeneratedImageToMinio({
      imageDataUrl,
      prompt,
      rawPrompt: payload.rawPrompt,
      style: payload.style,
      source: payload.source,
      model,
      aspectRatio,
      resolution,
      text,
    })

    return {
      imageDataUrl,
      imageUrl: storageResult.imageUrl || undefined,
      text,
      model,
      aspectRatio,
      resolution,
      storage: storageResult.storage,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('图片生成请求超时，请稍后重试。')
    }

    if (error instanceof TypeError) {
      throw new Error('无法连接 AIHubMix，请检查网络后重试。')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function generateAiHubMixVideo(payload: AiHubMixVideoGenerationRequest): Promise<AiHubMixVideoGenerationResponse> {
  const apiKey = getAiHubMixApiKey(payload.apiKey)
  const appCode = getAiHubMixAppCode(payload.appCode)
  const model = payload.model?.trim() || getAiHubMixVideoModel()
  const prompt = payload.prompt?.trim()
  const ratio = normalizeVideoRatio(payload.ratio)
  const duration = normalizeVideoDuration(payload.duration)

  if (!prompt) {
    throw new Error('请先填写视频提示词。')
  }

  const content = [...(payload.content ?? [])]
  const firstFrameImageUrl = payload.firstFrameImageUrl?.trim()

  if (firstFrameImageUrl) {
    content.unshift({
      type: 'image_url',
      image_url: {
        url: firstFrameImageUrl,
      },
      role: 'reference_image',
    })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180000)

  try {
    const response = await net.fetch('https://aihubmix.com/v1/videos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'APP-Code': appCode,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        ...(content.length ? { content } : {}),
        ratio,
        duration,
        watermark: payload.watermark ?? false,
      }),
      signal: controller.signal,
    })
    const responseText = await response.text()
    let data: (Record<string, unknown> & AiHubMixApiErrorResponse) | null = null

    try {
      data = JSON.parse(responseText) as Record<string, unknown> & AiHubMixApiErrorResponse
    } catch {
      data = null
    }

    if (!response.ok) {
      throw new Error(getAiHubMixErrorMessage(response.status, responseText, data))
    }

    const videoUrl = findVideoUrl(data)
    const taskId = findNestedStringByKeys(data, ['id', 'task_id', 'taskId', 'request_id', 'requestId'])
    const status = findNestedStringByKeys(data, ['status', 'state']) || (videoUrl ? 'succeeded' : taskId ? 'submitted' : '')

    if (!videoUrl && !taskId) {
      throw new Error('视频模型没有返回视频地址或任务 ID。')
    }

    return {
      videoUrl,
      taskId,
      status,
      model,
      ratio,
      duration,
      rawResponse: compactRawResponse(responseText),
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('视频生成请求超时，请稍后重试。')
    }

    if (error instanceof TypeError) {
      throw new Error('无法连接 AIHubMix，请检查网络后重试。')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function validateAiHubMixKey(payload: AiHubMixKeyValidationRequest): Promise<AiHubMixKeyValidationResponse> {
  const apiKey = getAiHubMixApiKey(payload.apiKey)
  const appCode = getAiHubMixAppCode(payload.appCode)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await net.fetch('https://aihubmix.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'APP-Code': appCode,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getAiHubMixTextModel(),
        messages: [
          {
            role: 'user',
            content: 'Reply with OK only.',
          },
        ],
        temperature: 0,
      }),
      signal: controller.signal,
    })
    const responseText = await response.text()
    let data: AiHubMixChatCompletionResponse | null = null

    try {
      data = JSON.parse(responseText) as AiHubMixChatCompletionResponse
    } catch {
      data = null
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('AIHubMix Key 无效、已失效或没有访问权限。')
      }

      if (response.status === 402) {
        throw new Error('AIHubMix 已识别该 Key，但当前账户余额不足。')
      }

      if (response.status === 429) {
        throw new Error('AIHubMix 已识别该 Key，但请求过于频繁，请稍后再试。')
      }

      const serviceMessage = getAiHubMixErrorMessage(response.status, responseText, data)
      throw new Error(`gpt-5.5 验证请求失败：${serviceMessage}`)
    }

    return {
      valid: true,
      model: 'gpt-5.5',
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AIHubMix 验证请求超时，请检查网络后重试。')
    }

    if (error instanceof TypeError) {
      throw new Error('无法连接 AIHubMix，请检查网络后重试。')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 820,
    minWidth: 1120,
    minHeight: 640,
    title: 'PanelForge',
    icon: getAppIconPath(),
    backgroundColor: '#f6f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  ipcMain.handle('app:ping', () => ({
    status: 'ok',
    at: new Date().toISOString(),
  }))

  ipcMain.handle('window:open-chapter-source', (_event, payload: OpenChapterSourceWindowRequest) => {
    openChapterSourceWindow(payload)

    return {
      opened: true,
    }
  })

  ipcMain.handle('window:open-chapter-canvas', (_event, payload: OpenChapterCanvasWindowRequest) => {
    openChapterCanvasWindow(payload)

    return {
      opened: true,
    }
  })

  ipcMain.handle('window:open-character-workspace', (_event, payload: OpenCharacterWorkspaceWindowRequest) => {
    openCharacterWorkspaceWindow(payload)

    return {
      opened: true,
    }
  })

  ipcMain.handle('aihubmix:validate-key', (_event, payload: AiHubMixKeyValidationRequest) => {
    return validateAiHubMixKey(payload)
  })

  ipcMain.handle('aihubmix:get-default-config', () => getAiHubMixDefaultConfig())

  ipcMain.handle('aihubmix:chat-completion', (_event, payload: AiHubMixChatCompletionRequest) => {
    return requestAiHubMixChatCompletion(payload)
  })

  ipcMain.handle('aihubmix:generate-image', (_event, payload: AiHubMixImageGenerationRequest) => {
    return generateAiHubMixImage(payload)
  })

  ipcMain.handle('aihubmix:generate-video', (_event, payload: AiHubMixVideoGenerationRequest) => {
    return generateAiHubMixVideo(payload)
  })

  registerAutoUpdaterIpc()
  createWindow()
  initializeAutoUpdater({ isDev: Boolean(VITE_DEV_SERVER_URL) })
})
