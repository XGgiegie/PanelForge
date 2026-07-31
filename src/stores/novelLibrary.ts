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

export type NovelCreativeBrief = {
  outline: string
  characters?: string
  plot?: string
  direction?: string
  updatedAt?: string
}

export type NovelItem = {
  id: string
  title: string
  fileName: string
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

async function readNovelRecords() {
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

async function putNovelRecord(novel: NovelItem) {
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
  const normalizedContent = content.replace(/\r\n/g, '\n').trim()

  if (!normalizedContent) {
    return []
  }

  const chapterHeadingPattern = /^\s*(第[0-9一二三四五六七八九十百]+章[^\n]*)\s*$/gm
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
    outline: '',
  }
}

export function getCreativeBriefOutline(brief?: NovelCreativeBrief) {
  if (!brief) {
    return ''
  }

  const outline = brief.outline?.trim()

  if (outline) {
    return outline
  }

  return [
    brief.characters ? `角色：${brief.characters.trim()}` : '',
    brief.plot ? `剧情：${brief.plot.trim()}` : '',
    brief.direction ? `方向：${brief.direction.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function createCreativeBriefFromOutline(outline: string): NovelCreativeBrief {
  return {
    outline: outline.trim(),
  }
}

function normalizeCreativeBrief(brief: NovelCreativeBrief): NovelCreativeBrief {
  return {
    outline: getCreativeBriefOutline(brief),
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
      const updatedNovel = {
        ...novel,
        creativeBrief: normalizeCreativeBrief({
          ...brief,
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
  },
})
