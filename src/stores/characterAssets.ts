import { defineStore } from 'pinia'

export type CharacterAsset = {
  id: string
  novelId: string
  name: string
  description: string
  referenceImageDataUrl: string
  fileName: string
  createdAt: string
  updatedAt: string
}

type CharacterAssetInput = {
  novelId: string
  name: string
  description?: string
  file: File
}

const DB_NAME = 'panelforge-character-assets'
const DB_VERSION = 1
const STORE_NAME = 'characters'
const FALLBACK_STORAGE_KEY = 'panelforge:character-assets'
const MAX_REFERENCE_IMAGE_SIZE = 8 * 1024 * 1024

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openCharacterDatabase() {
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
    request.onerror = () => reject(request.error ?? new Error('Failed to open character database'))
    request.onsuccess = () => resolve(request.result)
  })
}

function readFallbackCharacters() {
  if (typeof localStorage === 'undefined') {
    return []
  }

  try {
    const rawValue = localStorage.getItem(FALLBACK_STORAGE_KEY)

    return rawValue ? (JSON.parse(rawValue) as CharacterAsset[]) : []
  } catch {
    return []
  }
}

function writeFallbackCharacters(characters: CharacterAsset[]) {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(characters))
  } catch {
    // Character images should normally live in IndexedDB; ignore fallback quota failures.
  }
}

async function readCharacterRecords() {
  if (!canUseIndexedDb()) {
    return readFallbackCharacters()
  }

  try {
    const db = await openCharacterDatabase()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    return await new Promise<CharacterAsset[]>((resolve, reject) => {
      request.onerror = () => {
        db.close()
        reject(request.error ?? new Error('Failed to read character records'))
      }
      request.onsuccess = () => {
        db.close()
        resolve(request.result as CharacterAsset[])
      }
    })
  } catch {
    return readFallbackCharacters()
  }
}

async function putCharacterRecord(character: CharacterAsset) {
  if (!canUseIndexedDb()) {
    return
  }

  const db = await openCharacterDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(character)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('Failed to write character record'))
    }
  })
}

async function deleteCharacterRecord(id: string) {
  if (!canUseIndexedDb()) {
    return
  }

  const db = await openCharacterDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('Failed to delete character record'))
    }
  })
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败。'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
}

function sortCharacters(characters: CharacterAsset[]) {
  return [...characters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function normalizeCharacterName(value: string) {
  return value.replace(/\s+/g, '').trim().toLowerCase()
}

export function findCharacterAssetsForNames(names: string[], assets: CharacterAsset[]) {
  const normalizedNames = names.map(normalizeCharacterName).filter(Boolean)

  return assets.filter((asset) => {
    const assetName = normalizeCharacterName(asset.name)

    return normalizedNames.some((name) => name === assetName || name.includes(assetName) || assetName.includes(name))
  })
}

export function getMissingCharacterNames(names: string[], assets: CharacterAsset[]) {
  return names.filter((name) => {
    const normalizedName = normalizeCharacterName(name)

    if (!normalizedName) {
      return false
    }

    return !assets.some((asset) => {
      const assetName = normalizeCharacterName(asset.name)

      return normalizedName === assetName || normalizedName.includes(assetName) || assetName.includes(normalizedName)
    })
  })
}

export const useCharacterAssetsStore = defineStore('characterAssets', {
  state: () => ({
    characters: [] as CharacterAsset[],
    isLoaded: false,
    isLoading: false,
  }),
  getters: {
    getCharactersByNovelId: (state) => (novelId: string) =>
      state.characters.filter((character) => character.novelId === novelId),
  },
  actions: {
    async loadAssets() {
      if (this.isLoaded || this.isLoading) {
        return
      }

      this.isLoading = true

      try {
        this.characters = sortCharacters(await readCharacterRecords())
        this.isLoaded = true
      } finally {
        this.isLoading = false
      }
    },
    async addCharacter(input: CharacterAssetInput) {
      const name = input.name.trim()

      if (!name) {
        throw new Error('请填写角色名称。')
      }

      if (!input.file.type.startsWith('image/')) {
        throw new Error('请上传图片文件。')
      }

      if (input.file.size > MAX_REFERENCE_IMAGE_SIZE) {
        throw new Error('单张角色参考图不能超过 8MB。')
      }

      await this.loadAssets()

      const now = new Date().toISOString()
      const character: CharacterAsset = {
        id: createId('character'),
        novelId: input.novelId,
        name,
        description: input.description?.trim() ?? '',
        referenceImageDataUrl: await readImageAsDataUrl(input.file),
        fileName: input.file.name,
        createdAt: now,
        updatedAt: now,
      }

      this.characters = sortCharacters([character, ...this.characters])

      if (!canUseIndexedDb()) {
        writeFallbackCharacters(this.characters)
        return character
      }

      try {
        await putCharacterRecord(character)
      } catch {
        writeFallbackCharacters(this.characters)
      }

      return character
    },
    async removeCharacter(id: string) {
      await this.loadAssets()
      this.characters = this.characters.filter((character) => character.id !== id)

      if (!canUseIndexedDb()) {
        writeFallbackCharacters(this.characters)
        return
      }

      try {
        await deleteCharacterRecord(id)
      } catch {
        writeFallbackCharacters(this.characters)
      }
    },
  },
})
