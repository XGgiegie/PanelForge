import { defineStore } from 'pinia'

import { requestStoryboardDraft, type StoryboardDraftShot } from '../services/storyboardDraft'
import type { ChapterAnalysisRecord } from './chapterAnalysis'
import type { NovelChapter, NovelItem } from './novelLibrary'

export type StoryboardDraftRecord = {
  key: string
  novelId: string
  novelTitle?: string
  chapterId: string
  chapterTitle?: string
  chapterIndex?: number
  analysisRecordId: string
  analysisUpdatedAt?: string
  outlineSnapshot?: string
  shots: StoryboardDraftShot[]
  rawResult: string
  updatedAt: string
}

type GenerateStoryboardDraftInput = {
  apiKey: string
  key: string
  novel: NovelItem
  chapter: NovelChapter
  analysisRecord: ChapterAnalysisRecord
}

const STORYBOARD_DRAFT_STORAGE_KEY = 'panelforge:storyboard-drafts'

function readStoryboardDrafts() {
  if (typeof localStorage === 'undefined') {
    return {}
  }

  try {
    const rawValue = localStorage.getItem(STORYBOARD_DRAFT_STORAGE_KEY)
    return rawValue ? (JSON.parse(rawValue) as Record<string, StoryboardDraftRecord>) : {}
  } catch {
    return {}
  }
}

function writeStoryboardDrafts(drafts: Record<string, StoryboardDraftRecord>) {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(STORYBOARD_DRAFT_STORAGE_KEY, JSON.stringify(drafts))
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '分镜草稿生成失败。'
}

export const useStoryboardDraftStore = defineStore('storyboardDraft', {
  state: () => ({
    drafts: {} as Record<string, StoryboardDraftRecord>,
    isLoaded: false,
    loadingKey: '',
    errorKey: '',
    error: '',
  }),
  getters: {
    getDraft: (state) => (key: string) => state.drafts[key] ?? null,
  },
  actions: {
    loadDrafts() {
      if (this.isLoaded) {
        return
      }

      this.drafts = readStoryboardDrafts()
      this.isLoaded = true
    },
    clearError(key?: string) {
      if (!key || this.errorKey === key) {
        this.errorKey = ''
        this.error = ''
      }
    },
    async generateDraft(input: GenerateStoryboardDraftInput) {
      this.loadDrafts()
      this.loadingKey = input.key
      this.clearError(input.key)

      try {
        const result = await requestStoryboardDraft({
          apiKey: input.apiKey,
          novel: input.novel,
          chapter: input.chapter,
          analysisRecord: input.analysisRecord,
        })
        const now = new Date().toISOString()
        const record: StoryboardDraftRecord = {
          key: input.key,
          novelId: input.novel.id,
          novelTitle: input.novel.title,
          chapterId: input.chapter.id,
          chapterTitle: input.chapter.title,
          chapterIndex: input.chapter.index,
          analysisRecordId: input.analysisRecord.id,
          analysisUpdatedAt: input.analysisRecord.updatedAt,
          outlineSnapshot: input.analysisRecord.outlineSnapshot,
          shots: result.shots,
          rawResult: result.rawResult,
          updatedAt: now,
        }

        this.drafts = {
          ...this.drafts,
          [input.key]: record,
        }
        writeStoryboardDrafts(this.drafts)

        return record
      } catch (error) {
        this.errorKey = input.key
        this.error = getErrorMessage(error)
        throw error
      } finally {
        if (this.loadingKey === input.key) {
          this.loadingKey = ''
        }
      }
    },
  },
})
