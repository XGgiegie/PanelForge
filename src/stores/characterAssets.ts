import { defineStore } from 'pinia'

export type CharacterAssetKind = 'portrait' | 'reference'

export type CharacterImageGenerationStatus = 'generating' | 'succeeded' | 'failed'
export type CharacterImageHistorySource = 'ai' | 'upload'

export type CharacterAsset = {
  id: string
  novelId: string
  profileId?: string
  name: string
  description: string
  referenceImageDataUrl: string
  fileName: string
  kind?: CharacterAssetKind
  generationId?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

export type CharacterImageGenerationRecord = {
  id: string
  novelId: string
  profileId: string
  profileKey: string
  characterName: string
  prompt: string
  aspectRatio: string
  resolution: string
  referenceImageCount: number
  source: CharacterImageHistorySource
  status: CharacterImageGenerationStatus
  fileName?: string
  imageDataUrl?: string
  errorMessage?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

type CharacterAssetInput = {
  novelId: string
  profileId?: string
  name: string
  description?: string
  file: File
}

type GeneratedCharacterAssetInput = {
  novelId: string
  profileId: string
  name: string
  description?: string
  imageDataUrl: string
  fileName?: string
  generationId?: string
}

type CharacterReferenceInput = {
  novelId: string
  profileId: string
  name: string
  description?: string
  file: File
}

type StartCharacterImageGenerationInput = {
  novelId: string
  profileId: string
  characterName: string
  prompt: string
  aspectRatio: string
  resolution: string
  referenceImageCount: number
}

type AddUploadedImageHistoryInput = {
  novelId: string
  profileId: string
  characterName: string
  file: File
}

type EnsureImageHistoryInput = {
  novelId: string
  profileId: string
  characterName: string
  imageDataUrl: string
  fileName?: string
}

const DB_NAME = 'panelforge-character-assets'
const DB_VERSION = 2
const STORE_NAME = 'characters'
const GENERATION_STORE_NAME = 'image-generations'
const FALLBACK_STORAGE_KEY = 'panelforge:character-assets'
const GENERATION_FALLBACK_STORAGE_KEY = 'panelforge:character-image-generations'
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

      if (!db.objectStoreNames.contains(GENERATION_STORE_NAME)) {
        const store = db.createObjectStore(GENERATION_STORE_NAME, { keyPath: 'id' })
        store.createIndex('novelId', 'novelId', { unique: false })
        store.createIndex('profileKey', 'profileKey', { unique: false })
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

function readFallbackImageGenerations() {
  if (typeof localStorage === 'undefined') {
    return []
  }

  try {
    const rawValue = localStorage.getItem(GENERATION_FALLBACK_STORAGE_KEY)

    return rawValue ? (JSON.parse(rawValue) as CharacterImageGenerationRecord[]) : []
  } catch {
    return []
  }
}

function writeFallbackImageGenerations(records: CharacterImageGenerationRecord[]) {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(GENERATION_FALLBACK_STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Generated image history should normally live in IndexedDB; ignore fallback quota failures.
  }
}

function getContentStorage() {
  return window.panelForge?.contentStorage
}

function toPlainStorageValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function readLegacyCharacterRecords() {
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

async function readLegacyImageGenerationRecords() {
  if (!canUseIndexedDb()) {
    return readFallbackImageGenerations()
  }

  try {
    const db = await openCharacterDatabase()
    const transaction = db.transaction(GENERATION_STORE_NAME, 'readonly')
    const store = transaction.objectStore(GENERATION_STORE_NAME)
    const request = store.getAll()

    return await new Promise<CharacterImageGenerationRecord[]>((resolve, reject) => {
      request.onerror = () => {
        db.close()
        reject(request.error ?? new Error('Failed to read character image generations'))
      }
      request.onsuccess = () => {
        db.close()
        resolve(request.result as CharacterImageGenerationRecord[])
      }
    })
  } catch {
    return readFallbackImageGenerations()
  }
}

async function readCharacterContent() {
  const contentStorage = getContentStorage()

  if (!contentStorage) {
    const [characters, imageGenerations] = await Promise.all([
      readLegacyCharacterRecords(),
      readLegacyImageGenerationRecords(),
    ])

    return { characters, imageGenerations }
  }

  try {
    const stored = await contentStorage.listCharacterContent()
    const characters = stored.characterAssets as CharacterAsset[]
    const imageGenerations = stored.characterImageGenerations as CharacterImageGenerationRecord[]

    if (characters.length > 0 || imageGenerations.length > 0) {
      return { characters, imageGenerations }
    }

    const [legacyCharacters, legacyImageGenerations] = await Promise.all([
      readLegacyCharacterRecords(),
      readLegacyImageGenerationRecords(),
    ])

    if (legacyCharacters.length > 0 || legacyImageGenerations.length > 0) {
      await contentStorage.seedCharacterContent({
        characterAssets: toPlainStorageValue(legacyCharacters),
        characterImageGenerations: toPlainStorageValue(legacyImageGenerations),
      })
    }

    return {
      characters: legacyCharacters,
      imageGenerations: legacyImageGenerations,
    }
  } catch {
    // Keep existing assets visible while the Electron main process is restarting in development.
    const [characters, imageGenerations] = await Promise.all([
      readLegacyCharacterRecords(),
      readLegacyImageGenerationRecords(),
    ])

    return { characters, imageGenerations }
  }
}

async function putCharacterRecord(character: CharacterAsset) {
  const contentStorage = getContentStorage()

  if (contentStorage) {
    try {
      await contentStorage.upsertCharacterAsset(toPlainStorageValue(character))
      return
    } catch {
      // Fall through to the legacy store only when the local IPC bridge is temporarily unavailable.
    }
  }

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

async function putImageGenerationRecord(record: CharacterImageGenerationRecord) {
  const contentStorage = getContentStorage()

  if (contentStorage) {
    try {
      await contentStorage.upsertCharacterImageGeneration(toPlainStorageValue(record))
      return
    } catch {
      // Fall through to the legacy store only when the local IPC bridge is temporarily unavailable.
    }
  }

  if (!canUseIndexedDb()) {
    return
  }

  const db = await openCharacterDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(GENERATION_STORE_NAME, 'readwrite')
    transaction.objectStore(GENERATION_STORE_NAME).put(record)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('Failed to write character image generation'))
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

function sortImageGenerations(records: CharacterImageGenerationRecord[]) {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function createProfileKey(novelId: string, profileId: string) {
  return `${novelId}:${profileId}`
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
    imageGenerations: [] as CharacterImageGenerationRecord[],
    isLoaded: false,
    isLoading: false,
  }),
  getters: {
    getCharactersByNovelId: (state) => (novelId: string) =>
      state.characters.filter(
        (character) => character.novelId === novelId && character.kind !== 'reference' && !character.deletedAt,
      ),
    getReferenceImagesByNovelId: (state) => (novelId: string) =>
      state.characters.filter(
        (character) => character.novelId === novelId && character.kind === 'reference' && !character.deletedAt,
      ),
    getImageGenerationsByProfile: (state) => (novelId: string, profileId: string) =>
      state.imageGenerations.filter(
        (record) => record.profileKey === createProfileKey(novelId, profileId) && !record.deletedAt,
      ),
  },
  actions: {
    applyCharacterContentSnapshot(snapshot: PanelForgeCharacterContentSnapshot) {
      this.characters = sortCharacters(snapshot.characterAssets as CharacterAsset[])
      this.imageGenerations = sortImageGenerations(
        snapshot.characterImageGenerations as CharacterImageGenerationRecord[],
      )
      this.isLoaded = true
    },
    async loadAssets() {
      if (this.isLoaded || this.isLoading) {
        return
      }

      this.isLoading = true

      try {
        const { characters, imageGenerations } = await readCharacterContent()
        this.characters = sortCharacters(characters)
        this.imageGenerations = sortImageGenerations(imageGenerations)
        this.isLoaded = true
      } finally {
        this.isLoading = false
      }
    },
    async upsertCharacter(input: CharacterAssetInput) {
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
      const existingCharacter = this.characters.find(
        (character) =>
          character.novelId === input.novelId &&
          character.kind !== 'reference' &&
          !character.deletedAt &&
          normalizeCharacterName(character.name) === normalizeCharacterName(name),
      )
      const character: CharacterAsset = existingCharacter
        ? {
            ...existingCharacter,
            profileId: input.profileId ?? existingCharacter.profileId,
            name,
            description: input.description?.trim() ?? '',
            referenceImageDataUrl: await readImageAsDataUrl(input.file),
            fileName: input.file.name,
            kind: 'portrait',
            generationId: undefined,
            updatedAt: now,
          }
        : {
            id: createId('character'),
            novelId: input.novelId,
            profileId: input.profileId,
            name,
            description: input.description?.trim() ?? '',
            referenceImageDataUrl: await readImageAsDataUrl(input.file),
            fileName: input.file.name,
            kind: 'portrait',
            generationId: undefined,
            createdAt: now,
            updatedAt: now,
          }

      this.characters = sortCharacters([
        character,
        ...this.characters.filter((item) => item.id !== character.id),
      ])

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
    async addCharacter(input: CharacterAssetInput) {
      return this.upsertCharacter(input)
    },
    async upsertGeneratedCharacter(input: GeneratedCharacterAssetInput) {
      const name = input.name.trim()

      if (!name) {
        throw new Error('请填写角色名称。')
      }

      if (!input.imageDataUrl.startsWith('data:image/')) {
        throw new Error('生成结果不是可保存的图片。')
      }

      await this.loadAssets()

      const now = new Date().toISOString()
      const existingCharacter = this.characters.find(
        (character) =>
          character.novelId === input.novelId &&
          character.kind !== 'reference' &&
          !character.deletedAt &&
          normalizeCharacterName(character.name) === normalizeCharacterName(name),
      )
      const character: CharacterAsset = existingCharacter
        ? {
            ...existingCharacter,
            profileId: input.profileId,
            name,
            description: input.description?.trim() ?? '',
            referenceImageDataUrl: input.imageDataUrl,
            fileName: input.fileName?.trim() || `${name}-AI参考图.png`,
            kind: 'portrait',
            generationId: input.generationId,
            updatedAt: now,
          }
        : {
            id: createId('character'),
            novelId: input.novelId,
            profileId: input.profileId,
            name,
            description: input.description?.trim() ?? '',
            referenceImageDataUrl: input.imageDataUrl,
            fileName: input.fileName?.trim() || `${name}-AI参考图.png`,
            kind: 'portrait',
            generationId: input.generationId,
            createdAt: now,
            updatedAt: now,
          }

      this.characters = sortCharacters([
        character,
        ...this.characters.filter((item) => item.id !== character.id),
      ])

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
    async addCharacterReference(input: CharacterReferenceInput) {
      const name = input.name.trim()

      if (!name) {
        throw new Error('请先填写角色名称。')
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
        id: createId('character-reference'),
        novelId: input.novelId,
        profileId: input.profileId,
        name,
        description: input.description?.trim() ?? '',
        referenceImageDataUrl: await readImageAsDataUrl(input.file),
        fileName: input.file.name,
        kind: 'reference',
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
    async startImageGeneration(input: StartCharacterImageGenerationInput) {
      await this.loadAssets()

      const now = new Date().toISOString()
      const record: CharacterImageGenerationRecord = {
        id: createId('character-generation'),
        novelId: input.novelId,
        profileId: input.profileId,
        profileKey: createProfileKey(input.novelId, input.profileId),
        characterName: input.characterName.trim(),
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        referenceImageCount: input.referenceImageCount,
        source: 'ai',
        status: 'generating',
        createdAt: now,
        updatedAt: now,
      }

      this.imageGenerations = sortImageGenerations([record, ...this.imageGenerations])

      if (!canUseIndexedDb()) {
        writeFallbackImageGenerations(this.imageGenerations)
        return record
      }

      try {
        await putImageGenerationRecord(record)
      } catch {
        writeFallbackImageGenerations(this.imageGenerations)
      }

      return record
    },
    async addUploadedImageHistory(input: AddUploadedImageHistoryInput) {
      const characterName = input.characterName.trim()

      if (!characterName) {
        throw new Error('请先填写角色名称。')
      }

      if (!input.file.type.startsWith('image/')) {
        throw new Error('请上传图片文件。')
      }

      if (input.file.size > MAX_REFERENCE_IMAGE_SIZE) {
        throw new Error('单张角色图片不能超过 8MB。')
      }

      await this.loadAssets()

      const now = new Date().toISOString()
      const record: CharacterImageGenerationRecord = {
        id: createId('character-upload'),
        novelId: input.novelId,
        profileId: input.profileId,
        profileKey: createProfileKey(input.novelId, input.profileId),
        characterName,
        prompt: '',
        aspectRatio: '上传图片',
        resolution: '',
        referenceImageCount: 0,
        source: 'upload',
        status: 'succeeded',
        fileName: input.file.name,
        imageDataUrl: await readImageAsDataUrl(input.file),
        createdAt: now,
        updatedAt: now,
      }
      this.imageGenerations = sortImageGenerations([record, ...this.imageGenerations])

      if (!canUseIndexedDb()) {
        writeFallbackImageGenerations(this.imageGenerations)
        return record
      }

      try {
        await putImageGenerationRecord(record)
      } catch {
        writeFallbackImageGenerations(this.imageGenerations)
      }

      return record
    },
    async ensureImageHistory(input: EnsureImageHistoryInput) {
      await this.loadAssets()

      const profileKey = createProfileKey(input.novelId, input.profileId)
      const existingRecord = this.imageGenerations.find(
        (record) => record.profileKey === profileKey && record.imageDataUrl === input.imageDataUrl,
      )

      if (existingRecord) {
        return existingRecord
      }

      const now = new Date().toISOString()
      const record: CharacterImageGenerationRecord = {
        id: createId('character-history'),
        novelId: input.novelId,
        profileId: input.profileId,
        profileKey,
        characterName: input.characterName.trim(),
        prompt: '',
        aspectRatio: '已有图片',
        resolution: '',
        referenceImageCount: 0,
        source: 'upload',
        status: 'succeeded',
        fileName: input.fileName,
        imageDataUrl: input.imageDataUrl,
        createdAt: now,
        updatedAt: now,
      }
      this.imageGenerations = sortImageGenerations([record, ...this.imageGenerations])

      if (!canUseIndexedDb()) {
        writeFallbackImageGenerations(this.imageGenerations)
        return record
      }

      try {
        await putImageGenerationRecord(record)
      } catch {
        writeFallbackImageGenerations(this.imageGenerations)
      }

      return record
    },
    async completeImageGeneration(id: string, imageDataUrl: string) {
      const record = this.imageGenerations.find((item) => item.id === id)

      if (!record) {
        throw new Error('未找到角色生成记录。')
      }

      const updatedRecord: CharacterImageGenerationRecord = {
        ...record,
        status: 'succeeded',
        imageDataUrl,
        errorMessage: undefined,
        updatedAt: new Date().toISOString(),
      }
      this.imageGenerations = sortImageGenerations([
        updatedRecord,
        ...this.imageGenerations.filter((item) => item.id !== id),
      ])

      if (!canUseIndexedDb()) {
        writeFallbackImageGenerations(this.imageGenerations)
        return updatedRecord
      }

      try {
        await putImageGenerationRecord(updatedRecord)
      } catch {
        writeFallbackImageGenerations(this.imageGenerations)
      }

      return updatedRecord
    },
    async failImageGeneration(id: string, errorMessage: string) {
      const record = this.imageGenerations.find((item) => item.id === id)

      if (!record) {
        return null
      }

      const updatedRecord: CharacterImageGenerationRecord = {
        ...record,
        status: 'failed',
        errorMessage: errorMessage.trim() || '角色图片生成失败。',
        updatedAt: new Date().toISOString(),
      }
      this.imageGenerations = sortImageGenerations([
        updatedRecord,
        ...this.imageGenerations.filter((item) => item.id !== id),
      ])

      if (!canUseIndexedDb()) {
        writeFallbackImageGenerations(this.imageGenerations)
        return updatedRecord
      }

      try {
        await putImageGenerationRecord(updatedRecord)
      } catch {
        writeFallbackImageGenerations(this.imageGenerations)
      }

      return updatedRecord
    },
    async setImageGenerationAsPortrait(input: { generationId: string; name: string; description?: string }) {
      await this.loadAssets()
      const record = this.imageGenerations.find((item) => item.id === input.generationId)

      if (!record?.imageDataUrl || record.status !== 'succeeded') {
        throw new Error('只能选择生成成功的角色图。')
      }

      return this.upsertGeneratedCharacter({
        novelId: record.novelId,
        profileId: record.profileId,
        name: input.name,
        description: input.description,
        imageDataUrl: record.imageDataUrl,
        fileName: record.source === 'upload' ? record.fileName || `${input.name.trim()}-全身主图.png` : `${input.name.trim()}-AI全身主图.png`,
        generationId: record.id,
      })
    },
    async removeCharacter(id: string) {
      await this.loadAssets()
      const character = this.characters.find((item) => item.id === id)

      if (!character || character.deletedAt) {
        return
      }

      const deletedAt = new Date().toISOString()
      const archivedCharacter: CharacterAsset = {
        ...character,
        deletedAt,
        updatedAt: deletedAt,
      }
      this.characters = sortCharacters([
        archivedCharacter,
        ...this.characters.filter((item) => item.id !== id),
      ])

      if (!canUseIndexedDb()) {
        writeFallbackCharacters(this.characters)
        return
      }

      try {
        await putCharacterRecord(archivedCharacter)
      } catch {
        writeFallbackCharacters(this.characters)
      }
    },
    async archiveCharacterProfileAssets(input: {
      novelId: string
      profileId: string
      characterName: string
      deletedAt: string
      snapshot?: PanelForgeCharacterContentSnapshot | null
    }) {
      if (input.snapshot) {
        this.applyCharacterContentSnapshot(input.snapshot)
        return
      }

      await this.loadAssets()

      const normalizedName = normalizeCharacterName(input.characterName)
      const matchedGenerationIds = new Set(
        this.imageGenerations
          .filter(
            (record) =>
              record.novelId === input.novelId &&
              (record.profileId === input.profileId ||
                (!record.profileId && normalizeCharacterName(record.characterName) === normalizedName)),
          )
          .map((record) => record.id),
      )
      const archivedGenerations = this.imageGenerations.map((record) =>
        matchedGenerationIds.has(record.id)
          ? {
              ...record,
              profileId: input.profileId,
              profileKey: createProfileKey(input.novelId, input.profileId),
              deletedAt: input.deletedAt,
              updatedAt: input.deletedAt,
            }
          : record,
      )
      const archivedCharacters = this.characters.map((character) => {
        const belongsToProfile =
          character.novelId === input.novelId &&
          (character.profileId === input.profileId ||
            matchedGenerationIds.has(character.generationId ?? '') ||
            (!character.profileId && normalizeCharacterName(character.name) === normalizedName))

        return belongsToProfile
          ? {
              ...character,
              profileId: input.profileId,
              deletedAt: input.deletedAt,
              updatedAt: input.deletedAt,
            }
          : character
      })
      const changedCharacters = archivedCharacters.filter(
        (character, index) => character !== this.characters[index],
      )
      const changedGenerations = archivedGenerations.filter(
        (record, index) => record !== this.imageGenerations[index],
      )

      this.characters = sortCharacters(archivedCharacters)
      this.imageGenerations = sortImageGenerations(archivedGenerations)

      try {
        await Promise.all([
          ...changedCharacters.map((character) => putCharacterRecord(character)),
          ...changedGenerations.map((record) => putImageGenerationRecord(record)),
        ])
      } catch {
        writeFallbackCharacters(this.characters)
        writeFallbackImageGenerations(this.imageGenerations)
      }
    },
    async restoreCharacterProfileAssets(input: {
      novelId: string
      profileId: string
      characterName: string
      restoredAt: string
      snapshot?: PanelForgeCharacterContentSnapshot | null
    }) {
      if (input.snapshot) {
        this.applyCharacterContentSnapshot(input.snapshot)
        return
      }

      await this.loadAssets()

      const normalizedName = normalizeCharacterName(input.characterName)
      const matchedGenerationIds = new Set(
        this.imageGenerations
          .filter(
            (record) =>
              record.novelId === input.novelId &&
              (record.profileId === input.profileId ||
                (!record.profileId && normalizeCharacterName(record.characterName) === normalizedName)),
          )
          .map((record) => record.id),
      )
      const restoredGenerations = this.imageGenerations.map((record) =>
        matchedGenerationIds.has(record.id)
          ? {
              ...record,
              profileId: input.profileId,
              profileKey: createProfileKey(input.novelId, input.profileId),
              deletedAt: undefined,
              updatedAt: input.restoredAt,
            }
          : record,
      )
      const restoredCharacters = this.characters.map((character) => {
        const belongsToProfile =
          character.novelId === input.novelId &&
          (character.profileId === input.profileId ||
            matchedGenerationIds.has(character.generationId ?? '') ||
            (!character.profileId && normalizeCharacterName(character.name) === normalizedName))

        return belongsToProfile
          ? {
              ...character,
              profileId: input.profileId,
              deletedAt: undefined,
              updatedAt: input.restoredAt,
            }
          : character
      })
      const changedCharacters = restoredCharacters.filter(
        (character, index) => character !== this.characters[index],
      )
      const changedGenerations = restoredGenerations.filter(
        (record, index) => record !== this.imageGenerations[index],
      )

      this.characters = sortCharacters(restoredCharacters)
      this.imageGenerations = sortImageGenerations(restoredGenerations)

      try {
        await Promise.all([
          ...changedCharacters.map((character) => putCharacterRecord(character)),
          ...changedGenerations.map((record) => putImageGenerationRecord(record)),
        ])
      } catch {
        writeFallbackCharacters(this.characters)
        writeFallbackImageGenerations(this.imageGenerations)
      }
    },
  },
})
