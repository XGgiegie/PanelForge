import { defineStore } from 'pinia'

import { requestChapterAnalysis } from '../services/chapterAnalysis'
import { getCreativeBriefOutline } from './novelLibrary'
import type { NovelChapter, NovelCreativeBrief, NovelItem } from './novelLibrary'

export type ChapterAnalysisRecord = {
  id: string
  key: string
  novelId: string
  novelTitle?: string
  chapterId: string
  chapterTitle?: string
  chapterIndex?: number
  model?: string
  outlineSnapshot?: string
  result: string
  updatedAt: string
}

type AnalyzeChapterInput = {
  apiKey: string
  novel: NovelItem
  chapter: NovelChapter
  chapterText: string
  creativeBrief?: NovelCreativeBrief
}

const CHAPTER_ANALYSIS_STORAGE_KEY = 'panelforge:chapter-analysis'
const CHAPTER_ADOPTED_ANALYSIS_STORAGE_KEY = 'panelforge:chapter-adopted-analysis'

export function createChapterAnalysisKey(novelId: string, chapterId: string) {
  return `${novelId}:${chapterId}`
}

function createAnalysisRecordId(key: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${key}:${crypto.randomUUID()}`
  }

  return `${key}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

function normalizeAnalysisRecord(key: string, record: ChapterAnalysisRecord): ChapterAnalysisRecord {
  return {
    ...record,
    id: record.id || createAnalysisRecordId(key),
    key: record.key || key,
    updatedAt: record.updatedAt || new Date().toISOString(),
  }
}

function normalizeAnalysisRecords(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, ChapterAnalysisRecord | ChapterAnalysisRecord[]>).map(([key, record]) => {
      const records = Array.isArray(record) ? record : [record]

      return [
        key,
        records
          .map((item) => normalizeAnalysisRecord(key, item))
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      ]
    }),
  ) as Record<string, ChapterAnalysisRecord[]>
}

function readAnalysisRecords() {
  if (typeof localStorage === 'undefined') {
    return {}
  }

  try {
    const rawValue = localStorage.getItem(CHAPTER_ANALYSIS_STORAGE_KEY)
    return rawValue ? normalizeAnalysisRecords(JSON.parse(rawValue)) : {}
  } catch {
    return {}
  }
}

function writeAnalysisRecords(records: Record<string, ChapterAnalysisRecord[]>) {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(CHAPTER_ANALYSIS_STORAGE_KEY, JSON.stringify(records))
}

function readAdoptedRecordIds() {
  if (typeof localStorage === 'undefined') {
    return {}
  }

  try {
    const rawValue = localStorage.getItem(CHAPTER_ADOPTED_ANALYSIS_STORAGE_KEY)
    return rawValue ? (JSON.parse(rawValue) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeAdoptedRecordIds(recordIds: Record<string, string>) {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(CHAPTER_ADOPTED_ANALYSIS_STORAGE_KEY, JSON.stringify(recordIds))
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '章节分析失败。'
}

export const useChapterAnalysisStore = defineStore('chapterAnalysis', {
  state: () => ({
    records: {} as Record<string, ChapterAnalysisRecord[]>,
    adoptedRecordIds: {} as Record<string, string>,
    isLoaded: false,
    loadingKey: '',
    errorKey: '',
    error: '',
  }),
  getters: {
    getRecords: (state) => (key: string) => state.records[key] ?? [],
    getLatestRecord: (state) => (key: string) => state.records[key]?.[0] ?? null,
    getAdoptedRecordId: (state) => (key: string) => state.adoptedRecordIds[key] ?? '',
  },
  actions: {
    loadRecords() {
      if (this.isLoaded) {
        return
      }

      this.records = readAnalysisRecords()
      this.adoptedRecordIds = readAdoptedRecordIds()
      this.isLoaded = true
    },
    adoptRecord(key: string, recordId: string) {
      this.loadRecords()

      const records = this.records[key] ?? []

      if (!records.some((record) => record.id === recordId)) {
        return
      }

      this.adoptedRecordIds = {
        ...this.adoptedRecordIds,
        [key]: recordId,
      }
      writeAdoptedRecordIds(this.adoptedRecordIds)
    },
    clearError(key?: string) {
      if (!key || this.errorKey === key) {
        this.errorKey = ''
        this.error = ''
      }
    },
    async analyzeChapter(input: AnalyzeChapterInput) {
      this.loadRecords()

      const key = createChapterAnalysisKey(input.novel.id, input.chapter.id)
      this.loadingKey = key
      this.clearError(key)

      try {
        const result = await requestChapterAnalysis(input)
        const now = new Date().toISOString()
        const record: ChapterAnalysisRecord = {
          id: createAnalysisRecordId(key),
          key,
          novelId: input.novel.id,
          novelTitle: input.novel.title,
          chapterId: input.chapter.id,
          chapterTitle: input.chapter.title,
          chapterIndex: input.chapter.index,
          model: 'gpt-5.5',
          outlineSnapshot: getCreativeBriefOutline(input.creativeBrief ?? input.novel.creativeBrief),
          result,
          updatedAt: now,
        }

        this.records = {
          ...this.records,
          [key]: [record, ...(this.records[key] ?? [])],
        }
        writeAnalysisRecords(this.records)

        return record
      } catch (error) {
        this.errorKey = key
        this.error = getErrorMessage(error)
        throw error
      } finally {
        if (this.loadingKey === key) {
          this.loadingKey = ''
        }
      }
    },
  },
})
