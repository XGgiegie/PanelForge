import { defineStore } from 'pinia'

export type CanvasAssetType = 'text' | 'image' | 'video'

export type CanvasAsset = {
  id: string
  novelId: string
  type: CanvasAssetType
  title: string
  fileName: string
  mimeType: string
  textContent?: string
  dataUrl?: string
  createdAt: string
  updatedAt: string
}

type CanvasAssetInput = {
  novelId: string
  type: CanvasAssetType
  file: File
}

const DB_NAME = 'panelforge-canvas-assets'
const DB_VERSION = 1
const STORE_NAME = 'assets'
const FALLBACK_STORAGE_KEY = 'panelforge:canvas-assets'
const MAX_TEXT_ASSET_SIZE = 2 * 1024 * 1024
const MAX_IMAGE_ASSET_SIZE = 12 * 1024 * 1024
const MAX_VIDEO_ASSET_SIZE = 80 * 1024 * 1024

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openAssetDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('novelId', 'novelId', { unique: false })
      }
    }
    request.onerror = () => reject(request.error ?? new Error('Failed to open canvas asset database'))
    request.onsuccess = () => resolve(request.result)
  })
}

function readFallbackAssets() {
  if (typeof localStorage === 'undefined') {
    return []
  }

  try {
    const rawValue = localStorage.getItem(FALLBACK_STORAGE_KEY)

    return rawValue ? (JSON.parse(rawValue) as CanvasAsset[]) : []
  } catch {
    return []
  }
}

function writeFallbackAssets(assets: CanvasAsset[]) {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(assets))
  } catch {
    // Large media assets should normally live in IndexedDB; ignore fallback quota failures.
  }
}

async function readAssetRecords() {
  if (!canUseIndexedDb()) {
    return readFallbackAssets()
  }

  try {
    const db = await openAssetDatabase()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    return await new Promise<CanvasAsset[]>((resolve, reject) => {
      request.onerror = () => {
        db.close()
        reject(request.error ?? new Error('Failed to read canvas asset records'))
      }
      request.onsuccess = () => {
        db.close()
        resolve(request.result as CanvasAsset[])
      }
    })
  } catch {
    return readFallbackAssets()
  }
}

async function putAssetRecord(asset: CanvasAsset) {
  if (!canUseIndexedDb()) {
    return
  }

  const db = await openAssetDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(asset)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('Failed to write canvas asset record'))
    }
  })
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败。'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(reader.error ?? new Error('文本读取失败。'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

function sortAssets(assets: CanvasAsset[]) {
  return [...assets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function getAssetTitle(file: File) {
  return file.name.replace(/\.[^.]+$/, '').trim() || file.name
}

function assertAssetFile(type: CanvasAssetType, file: File) {
  if (type === 'text') {
    const isTextFile =
      file.type.startsWith('text/') || /\.(txt|md|markdown|text)$/i.test(file.name)

    if (!isTextFile) {
      throw new Error('请上传 txt 或 md 文本文件。')
    }

    if (file.size > MAX_TEXT_ASSET_SIZE) {
      throw new Error('单个文本资产不能超过 2MB。')
    }
  }

  if (type === 'image') {
    if (!file.type.startsWith('image/')) {
      throw new Error('请上传图片文件。')
    }

    if (file.size > MAX_IMAGE_ASSET_SIZE) {
      throw new Error('单张图片资产不能超过 12MB。')
    }
  }

  if (type === 'video') {
    if (!file.type.startsWith('video/')) {
      throw new Error('请上传视频文件。')
    }

    if (file.size > MAX_VIDEO_ASSET_SIZE) {
      throw new Error('单个视频资产不能超过 80MB。')
    }
  }
}

export function getCanvasAssetTypeLabel(type: CanvasAssetType) {
  if (type === 'text') {
    return '文本'
  }

  if (type === 'image') {
    return '图片'
  }

  return '视频'
}

export const useCanvasAssetsStore = defineStore('canvasAssets', {
  state: () => ({
    assets: [] as CanvasAsset[],
    isLoaded: false,
    isLoading: false,
  }),
  getters: {
    getAssetsByNovelId: (state) => (novelId: string) =>
      state.assets.filter((asset) => asset.novelId === novelId),
  },
  actions: {
    async loadAssets() {
      if (this.isLoaded || this.isLoading) {
        return
      }

      this.isLoading = true

      try {
        this.assets = sortAssets(await readAssetRecords())
        this.isLoaded = true
      } finally {
        this.isLoading = false
      }
    },
    async addAsset(input: CanvasAssetInput) {
      assertAssetFile(input.type, input.file)
      await this.loadAssets()

      const now = new Date().toISOString()
      const asset: CanvasAsset = {
        id: createId('canvas-asset'),
        novelId: input.novelId,
        type: input.type,
        title: getAssetTitle(input.file),
        fileName: input.file.name,
        mimeType: input.file.type,
        createdAt: now,
        updatedAt: now,
      }

      if (input.type === 'text') {
        asset.textContent = await readFileAsText(input.file)
      } else {
        asset.dataUrl = await readFileAsDataUrl(input.file)
      }

      this.assets = sortAssets([asset, ...this.assets])

      if (!canUseIndexedDb()) {
        writeFallbackAssets(this.assets)
        return asset
      }

      try {
        await putAssetRecord(asset)
      } catch {
        writeFallbackAssets(this.assets)
      }

      return asset
    },
  },
})
