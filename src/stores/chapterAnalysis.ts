import { defineStore } from 'pinia'

import { requestChapterAnalysis } from '../services/chapterAnalysis'
import { getCreativeBriefForPrompt } from './novelLibrary'
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
  characterSnapshot?: string
  result: string
  updatedAt: string
}

type AnalyzeChapterInput = {
  apiKey: string
  appCode?: string
  novel: NovelItem
  chapter: NovelChapter
  chapterText: string
  creativeBrief?: NovelCreativeBrief
}

const CHAPTER_ANALYSIS_STORAGE_KEY = 'panelforge:chapter-analysis'
const CHAPTER_ADOPTED_ANALYSIS_STORAGE_KEY = 'panelforge:chapter-adopted-analysis'
const CHAPTER_ANALYSIS_WORKFLOW_STATE_KEY = 'chapter-analysis'

type StoredChapterAnalysisState = {
  records?: unknown
  adoptedRecordIds?: unknown
}

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

function normalizeAdoptedRecordIds(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key, recordId]) => typeof key === 'string' && typeof recordId === 'string' && recordId.trim().length > 0,
    ),
  ) as Record<string, string>
}

function writeAdoptedRecordIds(recordIds: Record<string, string>) {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(CHAPTER_ADOPTED_ANALYSIS_STORAGE_KEY, JSON.stringify(recordIds))
}

function getStoredAnalysisState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const state = value as StoredChapterAnalysisState

  return {
    records: normalizeAnalysisRecords(state.records),
    adoptedRecordIds: normalizeAdoptedRecordIds(state.adoptedRecordIds),
  }
}

function toPlainStorageValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createStoredAnalysisState(records: Record<string, ChapterAnalysisRecord[]>, adoptedRecordIds: Record<string, string>) {
  return toPlainStorageValue({ records, adoptedRecordIds })
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
    async loadRecords() {
      if (this.isLoaded) {
        return
      }

      const localRecords = readAnalysisRecords()
      const localAdoptedRecordIds = normalizeAdoptedRecordIds(readAdoptedRecordIds())
      const storage = window.panelForge?.contentStorage

      if (storage) {
        try {
          const storedState = getStoredAnalysisState(await storage.loadWorkflowState(CHAPTER_ANALYSIS_WORKFLOW_STATE_KEY))

          if (storedState) {
            this.records = storedState.records
            this.adoptedRecordIds = storedState.adoptedRecordIds
          } else {
            this.records = localRecords
            this.adoptedRecordIds = localAdoptedRecordIds
            await storage.saveWorkflowState(
              CHAPTER_ANALYSIS_WORKFLOW_STATE_KEY,
              createStoredAnalysisState(this.records, this.adoptedRecordIds),
            )
          }
        } catch {
          this.records = localRecords
          this.adoptedRecordIds = localAdoptedRecordIds
        }
      } else {
        this.records = localRecords
        this.adoptedRecordIds = localAdoptedRecordIds
      }

      this.isLoaded = true
    },
    async saveRecords() {
      writeAnalysisRecords(this.records)
      writeAdoptedRecordIds(this.adoptedRecordIds)

      if (window.panelForge?.contentStorage) {
        try {
          await window.panelForge.contentStorage.saveWorkflowState(
            CHAPTER_ANALYSIS_WORKFLOW_STATE_KEY,
            createStoredAnalysisState(this.records, this.adoptedRecordIds),
          )
        } catch {
          // The local copy remains available while the desktop storage bridge recovers.
        }
      }
    },
    async adoptRecord(key: string, recordId: string) {
      await this.loadRecords()

      const records = this.records[key] ?? []

      if (!records.some((record) => record.id === recordId)) {
        return
      }

      this.adoptedRecordIds = {
        ...this.adoptedRecordIds,
        [key]: recordId,
      }
      await this.saveRecords()
    },
    clearError(key?: string) {
      if (!key || this.errorKey === key) {
        this.errorKey = ''
        this.error = ''
      }
    },
    async analyzeChapter(input: AnalyzeChapterInput) {
      await this.loadRecords()

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
          characterSnapshot: getCreativeBriefForPrompt(input.creativeBrief ?? input.novel.creativeBrief),
          result,
          updatedAt: now,
        }

        this.records = {
          ...this.records,
          [key]: [record, ...(this.records[key] ?? [])],
        }
        await this.saveRecords()

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
