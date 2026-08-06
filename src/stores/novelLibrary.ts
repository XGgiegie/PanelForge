import JSZip from 'jszip'
import { defineStore } from 'pinia'

export type NovelChapter = {
  id: string
  index: number
  title: string
  wordCount: number
  preview: string
  startOffset: number
  endOffset: number
}

export type NovelCharacterRole = '主角' | '反派' | '配角' | '其他'

export type NovelCharacterTraits = {
  extroversion: number
  rationality: number
  kindness: number
  decisiveness: number
  guardedness: number
}

export type NovelCharacterProfile = {
  id: string
  name: string
  role: NovelCharacterRole
  gender: string
  age: number | null
  traits: NovelCharacterTraits
  goal: string
  relationship: string
  appearance: string
  deletedAt?: string
}

export type CharacterProfileMutationResult = {
  profile: NovelCharacterProfile
  characterContent: PanelForgeCharacterContentSnapshot | null
}

export type NovelCreativeBrief = {
  outline?: string
  characters?: string
  characterProfiles?: NovelCharacterProfile[]
  plot?: string
  direction?: string
  updatedAt?: string
}

export type NovelItem = {
  id: string
  title: string
  fileName: string
  genre: string
  premise: string
  importedAt: string
  updatedAt: string
  wordCount: number
  chapterCount: number
  chapters: NovelChapter[]
  content: string
  creativeBrief?: NovelCreativeBrief
}

export type NovelImportInput = {
  fileName: string
  content: string
  title?: string
  genre?: string
  premise?: string
  chapters?: NovelChapter[]
  creativeBrief?: NovelCreativeBrief
}

type EpubManifestItem = {
  id: string
  href: string
  mediaType: string
}

type EpubSection = {
  title: string
  text: string
}

const DB_NAME = 'panelforge-novel-library'
const DB_VERSION = 1
const STORE_NAME = 'novels'
const FALLBACK_STORAGE_KEY = 'panelforge:novel-library'

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openNovelDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onerror = () => reject(request.error ?? new Error('Failed to open novel database'))
    request.onsuccess = () => resolve(request.result)
  })
}

function readFallbackNovels() {
  if (typeof localStorage === 'undefined') {
    return []
  }

  try {
    const raw = localStorage.getItem(FALLBACK_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as NovelItem[]) : []
  } catch {
    return []
  }
}

function writeFallbackNovels(novels: NovelItem[]) {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(novels))
  } catch {
    // Large novels should live in IndexedDB; ignore fallback quota failures.
  }
}

function getContentStorage() {
  return window.panelForge?.contentStorage
}

function toPlainStorageValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function readLegacyNovelRecords() {
  if (!canUseIndexedDb()) {
    return readFallbackNovels()
  }

  try {
    const db = await openNovelDatabase()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    return await new Promise<NovelItem[]>((resolve, reject) => {
      request.onerror = () => {
        db.close()
        reject(request.error ?? new Error('Failed to read novel records'))
      }
      request.onsuccess = () => {
        db.close()
        resolve(request.result as NovelItem[])
      }
    })
  } catch {
    return readFallbackNovels()
  }
}

async function readNovelRecords() {
  const contentStorage = getContentStorage()

  if (!contentStorage) {
    return readLegacyNovelRecords()
  }

  try {
    const storedNovels = (await contentStorage.listNovels()) as NovelItem[]

    if (storedNovels.length > 0) {
      return storedNovels
    }

    const legacyNovels = await readLegacyNovelRecords()

    if (legacyNovels.length > 0) {
      await contentStorage.seedNovels(toPlainStorageValue(legacyNovels))
    }

    return legacyNovels
  } catch {
    // Keep existing projects available while the Electron main process is restarting in development.
    return readLegacyNovelRecords()
  }
}

async function putNovelRecord(novel: NovelItem) {
  const contentStorage = getContentStorage()

  if (contentStorage) {
    try {
      await contentStorage.upsertNovel(toPlainStorageValue(novel))
      return
    } catch {
      // Fall through to the legacy store only when the local IPC bridge is temporarily unavailable.
    }
  }

  if (!canUseIndexedDb()) {
    return
  }

  const db = await openNovelDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(novel)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('Failed to write novel record'))
    }
  })
}

async function deleteNovelRecord(id: string) {
  const contentStorage = getContentStorage()

  if (contentStorage) {
    try {
      await contentStorage.deleteNovel(id)
      return
    } catch {
      // Fall through to the legacy store only when the local IPC bridge is temporarily unavailable.
    }
  }

  if (!canUseIndexedDb()) {
    return
  }

  const db = await openNovelDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('Failed to delete novel record'))
    }
  })
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function countText(text: string) {
  return text.replace(/\s/g, '').length
}

function createPreview(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 120) || '该章节暂无正文'
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || '未命名剧本'
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function decodeTextWithEncoding(bytes: Uint8Array, encoding: string, fatal = false) {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes)
  } catch {
    return null
  }
}

function getDecodedTextScore(text: string) {
  const replacementCount = text.match(/\uFFFD/g)?.length ?? 0
  const chineseCount = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const brokenCount = text.match(/锟斤拷|烫烫|屯屯/g)?.length ?? 0

  return chineseCount * 2 - replacementCount * 120 - brokenCount * 160 + Math.min(text.length, 2000) * 0.001
}

async function decodePlainTextFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const utf8Text = decodeTextWithEncoding(bytes, 'utf-8', true)

  if (utf8Text !== null) {
    return normalizePlainText(utf8Text.replace(/^\uFEFF/, ''))
  }

  const candidates = ['gb18030', 'gbk', 'big5', 'utf-8']
    .map((encoding) => {
      const text = decodeTextWithEncoding(bytes, encoding)
      return text ? { encoding, text, score: getDecodedTextScore(text) } : null
    })
    .filter((item): item is { encoding: string; text: string; score: number } => Boolean(item))

  const bestCandidate = candidates.sort((a, b) => b.score - a.score)[0]

  return normalizePlainText((bestCandidate?.text ?? '').replace(/^\uFEFF/, ''))
}

function normalizePlainText(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeTitle(text: string) {
  return normalizePlainText(text).replace(/\n+/g, ' ').slice(0, 80).trim()
}

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

function getElementsByLocalName(document: Document, localName: string) {
  const namespacedElements = Array.from(document.getElementsByTagNameNS('*', localName))

  if (namespacedElements.length > 0) {
    return namespacedElements
  }

  return Array.from(document.getElementsByTagName(localName))
}

function getXmlText(document: Document, localName: string) {
  return normalizeTitle(getElementsByLocalName(document, localName)[0]?.textContent ?? '')
}

function getBasePath(filePath: string) {
  const index = filePath.lastIndexOf('/')
  return index >= 0 ? filePath.slice(0, index + 1) : ''
}

function decodeHref(href: string) {
  const cleanHref = href.split('#')[0]

  try {
    return decodeURIComponent(cleanHref)
  } catch {
    return cleanHref
  }
}

function resolveEpubPath(basePath: string, href: string) {
  const parts = `${basePath}${decodeHref(href)}`.split('/')
  const normalizedParts: string[] = []

  parts.forEach((part) => {
    if (!part || part === '.') {
      return
    }

    if (part === '..') {
      normalizedParts.pop()
      return
    }

    normalizedParts.push(part)
  })

  return normalizedParts.join('/')
}

function getZipTextFile(zip: JSZip, filePath: string) {
  return zip.file(filePath) ?? zip.file(encodeURI(filePath))
}

async function readZipTextFile(zip: JSZip, filePath: string) {
  const file = getZipTextFile(zip, filePath)
  return file ? file.async('text') : null
}

function isReadableEpubItem(item: EpubManifestItem) {
  const extension = getFileExtension(item.href)

  return (
    item.mediaType === 'application/xhtml+xml' ||
    item.mediaType === 'text/html' ||
    extension === 'xhtml' ||
    extension === 'html' ||
    extension === 'htm'
  )
}

function getReadableFileName(filePath: string, index: number) {
  const fileName = filePath.split('/').pop() ?? ''
  const title = stripFileExtension(fileName)

  return title === '未命名剧本' ? `第 ${index + 1} 章` : title
}

function parseEpubHtmlSection(html: string, fallbackTitle: string): EpubSection {
  const document = new DOMParser().parseFromString(html, 'text/html')

  document.querySelectorAll('script, style').forEach((element) => element.remove())
  document.querySelectorAll('br').forEach((element) => element.replaceWith('\n'))
  document
    .querySelectorAll('p, div, section, article, header, footer, li, h1, h2, h3, h4, h5, h6')
    .forEach((element) => element.append('\n'))

  const titleElement = document.querySelector('h1, h2, h3, title')
  const heading = normalizeTitle(titleElement?.textContent ?? fallbackTitle)

  if (titleElement && titleElement.tagName.toLowerCase() !== 'title') {
    titleElement.remove()
  }

  const text = normalizePlainText(document.body?.textContent ?? document.documentElement.textContent ?? '')

  return {
    title: heading || fallbackTitle,
    text,
  }
}

function createEpubContentAndChapters(sections: EpubSection[]) {
  let content = ''
  const chapters: NovelChapter[] = []

  sections.forEach((section, sectionIndex) => {
    const title = section.title || `第 ${sectionIndex + 1} 章`
    const chapterContent = `${title}\n\n${section.text}`.trim()
    const prefix = content ? '\n\n' : ''
    const chapterStartOffset = content.length + prefix.length
    const startOffset = chapterStartOffset + title.length + 2

    content += `${prefix}${chapterContent}`

    chapters.push({
      id: createId('chapter'),
      index: chapters.length + 1,
      title,
      wordCount: countText(section.text),
      preview: createPreview(section.text),
      startOffset,
      endOffset: content.length,
    })
  })

  return { content, chapters }
}

async function createEpubImportInput(file: File): Promise<NovelImportInput> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const containerXml = await readZipTextFile(zip, 'META-INF/container.xml')

  if (!containerXml) {
    throw new Error(`无法读取《${file.name}》的 EPUB 目录文件`)
  }

  const containerDocument = parseXml(containerXml)
  const opfPath = getElementsByLocalName(containerDocument, 'rootfile')[0]?.getAttribute('full-path')

  if (!opfPath) {
    throw new Error(`无法定位《${file.name}》的 EPUB 内容清单`)
  }

  const opfXml = await readZipTextFile(zip, opfPath)

  if (!opfXml) {
    throw new Error(`无法读取《${file.name}》的 EPUB 内容清单`)
  }

  const opfDocument = parseXml(opfXml)
  const basePath = getBasePath(opfPath)
  const title = getXmlText(opfDocument, 'title') || stripFileExtension(file.name)
  const manifest = new Map<string, EpubManifestItem>()

  getElementsByLocalName(opfDocument, 'item').forEach((element) => {
    const id = element.getAttribute('id')
    const href = element.getAttribute('href')

    if (!id || !href) {
      return
    }

    manifest.set(id, {
      id,
      href,
      mediaType: element.getAttribute('media-type') ?? '',
    })
  })

  const sections: EpubSection[] = []

  for (const itemRef of getElementsByLocalName(opfDocument, 'itemref')) {
    const idRef = itemRef.getAttribute('idref')
    const item = idRef ? manifest.get(idRef) : null

    if (!item || !isReadableEpubItem(item)) {
      continue
    }

    const filePath = resolveEpubPath(basePath, item.href)
    const html = await readZipTextFile(zip, filePath)

    if (!html) {
      continue
    }

    const section = parseEpubHtmlSection(html, getReadableFileName(filePath, sections.length))

    if (countText(section.text) > 0) {
      sections.push(section)
    }
  }

  if (sections.length === 0) {
    throw new Error(`《${file.name}》没有解析到可用章节`)
  }

  return {
    fileName: file.name,
    title,
    ...createEpubContentAndChapters(sections),
  }
}

function isEpubFile(file: File) {
  return getFileExtension(file.name) === 'epub' || file.type === 'application/epub+zip'
}

export async function createNovelImportInputFromFile(file: File): Promise<NovelImportInput> {
  if (isEpubFile(file)) {
    return createEpubImportInput(file)
  }

  return {
    fileName: file.name,
    content: await decodePlainTextFile(file),
  }
}

export function createNovelImportInputsFromFiles(files: File[]) {
  return Promise.all(files.map((file) => createNovelImportInputFromFile(file)))
}

export function extractNovelChapters(content: string): NovelChapter[] {
  const normalizedContent = content.replace(/\r\n?/g, '\n').trim()

  if (!normalizedContent) {
    return []
  }

  const chapterHeadingPattern =
    /^[ \t\u3000]*(第[ \t\u3000]*[0-9０-９〇○零一二三四五六七八九十百千万亿两兩壹贰叁参肆伍陆柒捌玖拾佰仟萬億貳參陸]+[ \t\u3000]*章[^\n]*)[ \t\u3000]*$/gm
  const matches = [...normalizedContent.matchAll(chapterHeadingPattern)]

  if (matches.length === 0) {
    return [
      {
        id: createId('chapter'),
        index: 1,
        title: '全文',
        wordCount: countText(normalizedContent),
        preview: createPreview(normalizedContent),
        startOffset: 0,
        endOffset: normalizedContent.length,
      },
    ]
  }

  const chapters: NovelChapter[] = []
  const firstHeadingIndex = matches[0].index ?? 0
  const preface = normalizedContent.slice(0, firstHeadingIndex).trim()

  if (countText(preface) > 0) {
    chapters.push({
      id: createId('chapter'),
      index: chapters.length + 1,
      title: '序章',
      wordCount: countText(preface),
      preview: createPreview(preface),
      startOffset: 0,
      endOffset: firstHeadingIndex,
    })
  }

  matches.forEach((match) => {
    const title = (match[1] ?? `第 ${chapters.length + 1} 章`).trim()
    const startOffset = (match.index ?? 0) + match[0].length
    const nextMatch = matches.find((item) => (item.index ?? 0) > (match.index ?? 0))
    const endOffset = nextMatch?.index ?? normalizedContent.length
    const chapterText = normalizedContent.slice(startOffset, endOffset).trim()

    chapters.push({
      id: createId('chapter'),
      index: chapters.length + 1,
      title,
      wordCount: countText(chapterText),
      preview: createPreview(chapterText),
      startOffset,
      endOffset,
    })
  })

  return chapters
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getNovelChapterText(novel: NovelItem, chapter: NovelChapter) {
  const text = novel.content.slice(chapter.startOffset, chapter.endOffset).trim()
  const titlePattern = new RegExp(`^${escapeRegExp(chapter.title)}\\s*`)

  return text.replace(titlePattern, '').trim() || '该章节暂无正文'
}

function createNovelRecord(input: NovelImportInput): NovelItem {
  const now = new Date().toISOString()
  const title = input.title?.trim() || stripFileExtension(input.fileName)
  const chapters = input.chapters?.length ? input.chapters : extractNovelChapters(input.content)
  const creativeBrief = input.creativeBrief ? normalizeCreativeBrief(input.creativeBrief) : undefined

  return {
    id: createId('novel'),
    title,
    fileName: input.fileName,
    genre: input.genre?.trim() ?? '',
    premise: input.premise?.trim() ?? '',
    importedAt: now,
    updatedAt: now,
    wordCount: countText(input.content),
    chapterCount: chapters.length,
    chapters,
    content: input.content,
    creativeBrief,
  }
}

function sortNovels(novels: NovelItem[]) {
  return [...novels].sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime())
}

export function createEmptyCreativeBrief(): NovelCreativeBrief {
  return {
    characters: '',
    characterProfiles: [],
  }
}

export function getNovelFoundationForPrompt(novel?: Pick<NovelItem, 'genre' | 'premise'> | null) {
  const genre = novel?.genre?.trim()
  const premise = novel?.premise?.trim()

  return [
    genre ? `题材：${genre}` : '',
    premise ? `世界与时代前提：${premise}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function getCreativeBriefCharacters(brief?: NovelCreativeBrief) {
  const profiles = getCreativeBriefCharacterProfiles(brief)

  if (profiles.length > 0) {
    return profiles
      .map((profile, index) => {
        const age = profile.age === null ? '未知' : `${profile.age}岁`

        return [
          `${index + 1}. ${profile.name}（${profile.role}）`,
          `基础信息：性别 ${profile.gender || '未知'}，年龄 ${age}`,
          `性格量化：外向度 ${profile.traits.extroversion}/100，理性度 ${profile.traits.rationality}/100，善良度 ${profile.traits.kindness}/100，果断度 ${profile.traits.decisiveness}/100，戒备度 ${profile.traits.guardedness}/100`,
          profile.goal ? `核心目标：${profile.goal}` : '',
          profile.relationship ? `人物关系：${profile.relationship}` : '',
          profile.appearance ? `外观特征：${profile.appearance}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      })
      .join('\n\n')
  }

  return brief?.characters?.trim() ?? ''
}

export function getCreativeBriefCharacterProfiles(
  brief?: NovelCreativeBrief,
  options: { includeDeleted?: boolean } = {},
) {
  const profiles = normalizeCharacterProfiles(brief?.characterProfiles)

  return options.includeDeleted ? profiles : profiles.filter((profile) => !profile.deletedAt)
}

export function getCreativeBriefForPrompt(brief?: NovelCreativeBrief) {
  const characters = getCreativeBriefCharacters(brief)

  return characters ? `角色信息：\n${characters}` : ''
}

export function createEmptyCharacterProfile(): NovelCharacterProfile {
  return {
    id: createId('character-profile'),
    name: '',
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
}

function normalizeScore(value: unknown, minimum: number, maximum: number, fallback: number) {
  const score = Number(value)

  if (!Number.isFinite(score)) {
    return fallback
  }

  return Math.max(minimum, Math.min(maximum, Math.round(score)))
}

function normalizeCharacterProfiles(profiles?: NovelCharacterProfile[]) {
  if (!Array.isArray(profiles)) {
    return []
  }

  const validRoles: NovelCharacterRole[] = ['主角', '反派', '配角', '其他']

  return profiles.map((profile, index) => {
    const source = profile as Partial<NovelCharacterProfile>
    const sourceTraits = source.traits as Partial<NovelCharacterTraits> | undefined
    const age = source.age === null || source.age === undefined ? Number.NaN : Number(source.age)

    const rawRole = String(source.role ?? '')
    const isLegacyImportantSupport = rawRole === '重要配角'
    const role = validRoles.includes(rawRole as NovelCharacterRole) ? (rawRole as NovelCharacterRole) : '配角'

    return {
      id: source.id?.trim() || `character-profile-${index + 1}`,
      name: source.name?.trim() ?? '',
      role: isLegacyImportantSupport ? '配角' : role,
      gender: source.gender?.trim() || '未知',
      age: Number.isFinite(age) ? Math.max(0, Math.min(120, Math.round(age))) : null,
      traits: {
        extroversion: normalizeScore(sourceTraits?.extroversion, 0, 100, 50),
        rationality: normalizeScore(sourceTraits?.rationality, 0, 100, 50),
        kindness: normalizeScore(sourceTraits?.kindness, 0, 100, 50),
        decisiveness: normalizeScore(sourceTraits?.decisiveness, 0, 100, 50),
        guardedness: normalizeScore(sourceTraits?.guardedness, 0, 100, 50),
      },
      goal: source.goal?.trim() ?? '',
      relationship: source.relationship?.trim() ?? '',
      appearance: source.appearance?.trim() ?? '',
      deletedAt: source.deletedAt?.trim() || undefined,
    }
  })
}

export function createCreativeBriefFromCharacterProfiles(profiles: NovelCharacterProfile[]): NovelCreativeBrief {
  return {
    characters: '',
    characterProfiles: normalizeCharacterProfiles(profiles),
  }
}

function normalizeCreativeBrief(brief: NovelCreativeBrief): NovelCreativeBrief {
  return {
    outline: brief.outline?.trim() ?? '',
    characters: brief.characters?.trim() ?? '',
    characterProfiles: normalizeCharacterProfiles(brief.characterProfiles),
    updatedAt: brief.updatedAt,
  }
}

export const useNovelLibraryStore = defineStore('novelLibrary', {
  state: () => ({
    novels: [] as NovelItem[],
    selectedNovelId: '',
    isLoaded: false,
    isLoading: false,
  }),
  getters: {
    selectedNovel: (state) => state.novels.find((novel) => novel.id === state.selectedNovelId) ?? null,
    totalWordCount: (state) => state.novels.reduce((total, novel) => total + novel.wordCount, 0),
    totalChapterCount: (state) => state.novels.reduce((total, novel) => total + novel.chapterCount, 0),
  },
  actions: {
    async loadLibrary() {
      if (this.isLoaded || this.isLoading) {
        return
      }

      this.isLoading = true

      try {
        this.novels = sortNovels(await readNovelRecords())
        this.selectedNovelId = this.novels[0]?.id ?? ''
        this.isLoaded = true
      } finally {
        this.isLoading = false
      }
    },
    async importNovel(input: NovelImportInput) {
      if (!input.genre?.trim()) {
        throw new Error('请先选择作品题材。')
      }

      const novel = createNovelRecord(input)

      this.novels = sortNovels([novel, ...this.novels])
      this.selectedNovelId = novel.id

      if (!canUseIndexedDb()) {
        writeFallbackNovels(this.novels)
        return
      }

      try {
        await putNovelRecord(novel)
      } catch {
        writeFallbackNovels(this.novels)
      }
    },
    async importNovels(inputs: NovelImportInput[]) {
      for (const input of inputs) {
        await this.importNovel(input)
      }
    },
    async reparseNovelChapters(id: string) {
      const novel = this.novels.find((item) => item.id === id)

      if (!novel) {
        return null
      }

      const now = new Date().toISOString()
      const chapters = extractNovelChapters(novel.content)
      const updatedNovel: NovelItem = {
        ...novel,
        chapterCount: chapters.length,
        chapters,
        updatedAt: now,
      }

      this.novels = sortNovels(this.novels.map((item) => (item.id === id ? updatedNovel : item)))

      if (!canUseIndexedDb()) {
        writeFallbackNovels(this.novels)
        return updatedNovel
      }

      try {
        await putNovelRecord(updatedNovel)
      } catch {
        writeFallbackNovels(this.novels)
      }

      return updatedNovel
    },
    selectNovel(id: string) {
      this.selectedNovelId = id
    },
    async removeNovel(id: string) {
      this.novels = this.novels.filter((novel) => novel.id !== id)

      if (this.selectedNovelId === id) {
        this.selectedNovelId = this.novels[0]?.id ?? ''
      }

      if (!canUseIndexedDb()) {
        writeFallbackNovels(this.novels)
        return
      }

      try {
        await deleteNovelRecord(id)
      } catch {
        writeFallbackNovels(this.novels)
      }
    },
    async updateCreativeBrief(id: string, brief: NovelCreativeBrief) {
      const novel = this.novels.find((item) => item.id === id)

      if (!novel) {
        return
      }

      const now = new Date().toISOString()
      const requestedProfiles = normalizeCharacterProfiles(brief.characterProfiles)
      const requestedProfileIds = new Set(requestedProfiles.map((profile) => profile.id))
      const archivedProfiles = getCreativeBriefCharacterProfiles(novel.creativeBrief, { includeDeleted: true })
        .filter((profile) => profile.deletedAt && !requestedProfileIds.has(profile.id))
      const updatedNovel = {
        ...novel,
        creativeBrief: normalizeCreativeBrief({
          ...novel.creativeBrief,
          ...brief,
          characterProfiles: [...requestedProfiles, ...archivedProfiles],
          updatedAt: now,
        }),
        updatedAt: now,
      }

      this.novels = sortNovels(this.novels.map((item) => (item.id === id ? updatedNovel : item)))

      if (!canUseIndexedDb()) {
        writeFallbackNovels(this.novels)
        return
      }

      try {
        await putNovelRecord(updatedNovel)
      } catch {
        writeFallbackNovels(this.novels)
      }
    },
    async archiveCharacterProfile(id: string, profileId: string): Promise<CharacterProfileMutationResult | null> {
      const novel = this.novels.find((item) => item.id === id)

      if (!novel) {
        return null
      }

      const profiles = getCreativeBriefCharacterProfiles(novel.creativeBrief, { includeDeleted: true })
      const profile = profiles.find((item) => item.id === profileId && !item.deletedAt)

      if (!profile) {
        return null
      }

      const deletedAt = new Date().toISOString()
      const archivedProfile: NovelCharacterProfile = {
        ...profile,
        traits: { ...profile.traits },
        deletedAt,
      }
      const updatedProfiles = profiles.map((item) => (item.id === profileId ? archivedProfile : item))
      const updatedNovel: NovelItem = {
        ...novel,
        creativeBrief: normalizeCreativeBrief({
          ...novel.creativeBrief,
          characterProfiles: updatedProfiles,
          updatedAt: deletedAt,
        }),
        updatedAt: deletedAt,
      }
      const contentStorage = getContentStorage()
      let characterContent: PanelForgeCharacterContentSnapshot | null = null

      if (contentStorage?.archiveCharacterProfile) {
        characterContent = await contentStorage.archiveCharacterProfile({
          novel: toPlainStorageValue(updatedNovel),
          novelId: novel.id,
          profileId,
          characterName: profile.name,
          deletedAt,
        })
      } else {
        await putNovelRecord(updatedNovel)
      }

      this.novels = sortNovels(this.novels.map((item) => (item.id === id ? updatedNovel : item)))

      if (!contentStorage && !canUseIndexedDb()) {
        writeFallbackNovels(this.novels)
      }

      return {
        profile: archivedProfile,
        characterContent,
      }
    },
    async restoreCharacterProfile(id: string, profileId: string): Promise<CharacterProfileMutationResult | null> {
      const novel = this.novels.find((item) => item.id === id)

      if (!novel) {
        return null
      }

      const profiles = getCreativeBriefCharacterProfiles(novel.creativeBrief, { includeDeleted: true })
      const profile = profiles.find((item) => item.id === profileId && item.deletedAt)

      if (!profile) {
        return null
      }

      const normalizedName = profile.name.replace(/\s+/g, '').toLowerCase()
      const hasActiveNameConflict = profiles.some(
        (item) =>
          item.id !== profileId &&
          !item.deletedAt &&
          item.name.replace(/\s+/g, '').toLowerCase() === normalizedName,
      )

      if (hasActiveNameConflict) {
        throw new Error(`当前小说已经存在名为“${profile.name}”的角色。`)
      }

      const restoredAt = new Date().toISOString()
      const restoredProfile: NovelCharacterProfile = {
        ...profile,
        traits: { ...profile.traits },
        deletedAt: undefined,
      }
      const updatedProfiles = profiles.map((item) => (item.id === profileId ? restoredProfile : item))
      const updatedNovel: NovelItem = {
        ...novel,
        creativeBrief: normalizeCreativeBrief({
          ...novel.creativeBrief,
          characterProfiles: updatedProfiles,
          updatedAt: restoredAt,
        }),
        updatedAt: restoredAt,
      }
      const contentStorage = getContentStorage()
      let characterContent: PanelForgeCharacterContentSnapshot | null = null

      if (contentStorage?.restoreCharacterProfile) {
        characterContent = await contentStorage.restoreCharacterProfile({
          novel: toPlainStorageValue(updatedNovel),
          novelId: novel.id,
          profileId,
          characterName: profile.name,
          restoredAt,
        })
      } else {
        await putNovelRecord(updatedNovel)
      }

      this.novels = sortNovels(this.novels.map((item) => (item.id === id ? updatedNovel : item)))

      if (!contentStorage && !canUseIndexedDb()) {
        writeFallbackNovels(this.novels)
      }

      return {
        profile: restoredProfile,
        characterContent,
      }
    },
  },
})
