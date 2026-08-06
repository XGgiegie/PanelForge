import { defineStore } from 'pinia'

import {
  requestStoryboardDraft,
  type StoryboardCharacterReference,
  type StoryboardDraftShot,
} from '../services/storyboardDraft'
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
  characterSnapshot?: string
  shots: StoryboardDraftShot[]
  rawResult: string
  updatedAt: string
}

type GenerateStoryboardDraftInput = {
  apiKey: string
  appCode?: string
  key: string
  novel: NovelItem
  chapter: NovelChapter
  chapterText: string
  analysisRecord: ChapterAnalysisRecord
  characterReferences?: StoryboardCharacterReference[]
}

const STORYBOARD_DRAFT_STORAGE_KEY = 'panelforge:storyboard-drafts'
const STORYBOARD_DRAFT_WORKFLOW_STATE_KEY = 'storyboard-drafts'

type StoredStoryboardDraftState = {
  drafts?: unknown
}

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

function normalizeStoryboardDrafts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, StoryboardDraftRecord>).filter(
      ([key, draft]) => typeof key === 'string' && draft && typeof draft === 'object' && !Array.isArray(draft),
    ),
  ) as Record<string, StoryboardDraftRecord>
}

function getStoredStoryboardDrafts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return normalizeStoryboardDrafts((value as StoredStoryboardDraftState).drafts)
}

function toPlainStorageValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createStoredStoryboardDraftState(drafts: Record<string, StoryboardDraftRecord>) {
  return toPlainStorageValue({ drafts })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '分镜生成失败。'
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
    async loadDrafts() {
      if (this.isLoaded) {
        return
      }

      const localDrafts = normalizeStoryboardDrafts(readStoryboardDrafts())
      const storage = window.panelForge?.contentStorage

      if (storage) {
        try {
          const storedDrafts = getStoredStoryboardDrafts(await storage.loadWorkflowState(STORYBOARD_DRAFT_WORKFLOW_STATE_KEY))

          if (storedDrafts) {
            this.drafts = storedDrafts
          } else {
            this.drafts = localDrafts
            await storage.saveWorkflowState(
              STORYBOARD_DRAFT_WORKFLOW_STATE_KEY,
              createStoredStoryboardDraftState(this.drafts),
            )
          }
        } catch {
          this.drafts = localDrafts
        }
      } else {
        this.drafts = localDrafts
      }

      this.isLoaded = true
    },
    async saveDrafts() {
      writeStoryboardDrafts(this.drafts)

      if (window.panelForge?.contentStorage) {
        try {
          await window.panelForge.contentStorage.saveWorkflowState(
            STORYBOARD_DRAFT_WORKFLOW_STATE_KEY,
            createStoredStoryboardDraftState(this.drafts),
          )
        } catch {
          // The local copy remains available while the desktop storage bridge recovers.
        }
      }
    },
    clearError(key?: string) {
      if (!key || this.errorKey === key) {
        this.errorKey = ''
        this.error = ''
      }
    },
    async generateDraft(input: GenerateStoryboardDraftInput) {
      await this.loadDrafts()
      this.loadingKey = input.key
      this.clearError(input.key)

      try {
        const result = await requestStoryboardDraft({
          apiKey: input.apiKey,
          appCode: input.appCode,
          novel: input.novel,
          chapter: input.chapter,
          chapterText: input.chapterText,
          analysisRecord: input.analysisRecord,
          characterReferences: input.characterReferences,
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
          characterSnapshot: input.analysisRecord.characterSnapshot,
          shots: result.shots,
          rawResult: result.rawResult,
          updatedAt: now,
        }

        this.drafts = {
          ...this.drafts,
          [input.key]: record,
        }
        await this.saveDrafts()

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
