import { defineStore } from 'pinia'

import { requestChapterAnalysis } from '../services/chapterAnalysis'
import type { NovelChapter, NovelItem } from './novelLibrary'

export type ChapterAnalysisRecord = {
  key: string
  novelId: string
  novelTitle?: string
  chapterId: string
  chapterTitle?: string
  chapterIndex?: number
  model?: string
  result: string
  updatedAt: string
}

type AnalyzeChapterInput = {
  apiKey: string
  novel: NovelItem
  chapter: NovelChapter
  chapterText: string
}

const CHAPTER_ANALYSIS_STORAGE_KEY = 'panelforge:chapter-analysis'

export function createChapterAnalysisKey(novelId: string, chapterId: string) {
  return `${novelId}:${chapterId}`
}

function readAnalysisRecords() {
  if (typeof localStorage === 'undefined') {
    return {}
  }

  try {
    const rawValue = localStorage.getItem(CHAPTER_ANALYSIS_STORAGE_KEY)
    return rawValue ? (JSON.parse(rawValue) as Record<string, ChapterAnalysisRecord>) : {}
  } catch {
    return {}
  }
}

function writeAnalysisRecords(records: Record<string, ChapterAnalysisRecord>) {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(CHAPTER_ANALYSIS_STORAGE_KEY, JSON.stringify(records))
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '章节分析失败。'
}

export const useChapterAnalysisStore = defineStore('chapterAnalysis', {
  state: () => ({
    records: {} as Record<string, ChapterAnalysisRecord>,
    isLoaded: false,
    loadingKey: '',
    errorKey: '',
    error: '',
  }),
  getters: {
    getRecord: (state) => (key: string) => state.records[key] ?? null,
  },
  actions: {
    loadRecords() {
      if (this.isLoaded) {
        return
      }

      this.records = readAnalysisRecords()
      this.isLoaded = true
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
        const record: ChapterAnalysisRecord = {
          key,
          novelId: input.novel.id,
          novelTitle: input.novel.title,
          chapterId: input.chapter.id,
          chapterTitle: input.chapter.title,
          chapterIndex: input.chapter.index,
          model: 'gpt-5.5',
          result,
          updatedAt: new Date().toISOString(),
        }

        this.records = {
          ...this.records,
          [key]: record,
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