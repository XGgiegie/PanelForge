import { defineStore } from 'pinia'

import { getNovelChapterText, type NovelChapter, type NovelItem } from './novelLibrary'
import type { StoryboardDraftRecord } from './storyboardDraft'

export type ChapterShot = {
  id: string
  index: number
  title: string
  scene: string
  camera: string
  characters: string[]
  dialogue: string
  narration: string
  imagePrompt: string
  durationSeconds: number
}

type DramaProductionState = {
  generatedShotIds: Record<string, string[]>
  generatedVideoShotIds: Record<string, string[]>
  previewReadyKeys: string[]
}

const DRAMA_PRODUCTION_STORAGE_KEY = 'panelforge:drama-production-demo'
const fallbackShotTitles = [
  '开场画面',
  '主角登场',
  '线索出现',
  '关系碰撞',
  '压力升级',
  '关键选择',
  '情绪爆点',
  '结尾钩子',
]
const fallbackCameras = ['远景转近景', '中景跟拍', '特写', '过肩镜头', '低机位', '快速切入', '静态近景', '留白定格']

function readDramaProductionState(): DramaProductionState {
  if (typeof localStorage === 'undefined') {
    return {
      generatedShotIds: {},
      generatedVideoShotIds: {},
      previewReadyKeys: [],
    }
  }

  try {
    const rawValue = localStorage.getItem(DRAMA_PRODUCTION_STORAGE_KEY)

    if (!rawValue) {
      return {
        generatedShotIds: {},
        generatedVideoShotIds: {},
        previewReadyKeys: [],
      }
    }

    const parsedValue = JSON.parse(rawValue) as Partial<DramaProductionState>

    return {
      generatedShotIds: parsedValue.generatedShotIds ?? {},
      generatedVideoShotIds: parsedValue.generatedVideoShotIds ?? {},
      previewReadyKeys: parsedValue.previewReadyKeys ?? [],
    }
  } catch {
    return {
      generatedShotIds: {},
      generatedVideoShotIds: {},
      previewReadyKeys: [],
    }
  }
}

function writeDramaProductionState(state: DramaProductionState) {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(DRAMA_PRODUCTION_STORAGE_KEY, JSON.stringify(state))
}

function compactText(value: string, maxLength = 88) {
  const text = value.replace(/\s+/g, ' ').trim()

  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength)}…`
}

function extractDialogue(text: string) {
  const match = text.match(/[“「](.{2,36})[”」]/)

  return match?.[1] ? compactText(match[1], 36) : ''
}

function getShotSourceTexts(novel: NovelItem, chapter: NovelChapter) {
  const chapterText = getNovelChapterText(novel, chapter)
  const paragraphs = chapterText
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 8)

  if (paragraphs.length >= fallbackShotTitles.length) {
    return paragraphs.slice(0, fallbackShotTitles.length)
  }

  const fallback = chapter.preview || chapterText || novel.content || novel.title

  return fallbackShotTitles.map((_, index) => paragraphs[index] ?? fallback)
}

export function createChapterProductionKey(novelId: string, chapterIndex: number) {
  return `${novelId}:chapter-${chapterIndex}`
}

export function createChapterShots(
  novel: NovelItem,
  chapter: NovelChapter,
  storyboardRecord?: StoryboardDraftRecord | null,
): ChapterShot[] {
  if (storyboardRecord?.shots.length) {
    return storyboardRecord.shots.map((shot, index) => ({
      id: shot.id,
      index: index + 1,
      title: shot.title || `分镜 ${index + 1}`,
      scene: shot.scene || shot.action || chapter.title,
      camera: shot.camera || fallbackCameras[index % fallbackCameras.length],
      characters: shot.characters.length ? shot.characters : ['主角'],
      dialogue: shot.dialogue,
      narration: shot.narration,
      imagePrompt: shot.imagePrompt || shot.scene || shot.action,
      durationSeconds: shot.durationSeconds,
    }))
  }

  return getShotSourceTexts(novel, chapter).map((text, index) => {
    const scene = compactText(text, 72)

    return {
      id: `demo-shot-${String(index + 1).padStart(2, '0')}`,
      index: index + 1,
      title: fallbackShotTitles[index] ?? `分镜 ${index + 1}`,
      scene,
      camera: fallbackCameras[index % fallbackCameras.length],
      characters: ['主角'],
      dialogue: extractDialogue(text),
      narration: index === 0 ? compactText(chapter.preview, 52) : '',
      imagePrompt: `竖屏漫剧，${scene}，人物表情清晰，画面适合连续分镜。`,
      durationSeconds: index === fallbackShotTitles.length - 1 ? 7 : 6,
    }
  })
}

export const useDramaProductionStore = defineStore('dramaProduction', {
  state: () => ({
    generatedShotIds: {} as Record<string, string[]>,
    generatedVideoShotIds: {} as Record<string, string[]>,
    previewReadyKeys: [] as string[],
    isLoaded: false,
  }),
  getters: {
    getGeneratedShotIds: (state) => (productionKey: string) => state.generatedShotIds[productionKey] ?? [],
    getGeneratedVideoShotIds: (state) => (productionKey: string) =>
      state.generatedVideoShotIds[productionKey] ?? [],
    isPreviewReady: (state) => (productionKey: string) => state.previewReadyKeys.includes(productionKey),
  },
  actions: {
    loadState() {
      if (this.isLoaded) {
        return
      }

      const state = readDramaProductionState()
      this.generatedShotIds = state.generatedShotIds
      this.generatedVideoShotIds = state.generatedVideoShotIds
      this.previewReadyKeys = state.previewReadyKeys
      this.isLoaded = true
    },
    saveState() {
      writeDramaProductionState({
        generatedShotIds: this.generatedShotIds,
        generatedVideoShotIds: this.generatedVideoShotIds,
        previewReadyKeys: this.previewReadyKeys,
      })
    },
    markShotImageGenerated(productionKey: string, shotId: string) {
      this.loadState()

      const ids = new Set(this.generatedShotIds[productionKey] ?? [])
      ids.add(shotId)
      this.generatedShotIds = {
        ...this.generatedShotIds,
        [productionKey]: [...ids],
      }
      this.saveState()
    },
    markAllShotImagesGenerated(productionKey: string, shotIds: string[]) {
      this.loadState()
      this.generatedShotIds = {
        ...this.generatedShotIds,
        [productionKey]: [...new Set(shotIds)],
      }
      this.saveState()
    },
    markShotVideoGenerated(productionKey: string, shotId: string) {
      this.loadState()

      const ids = new Set(this.generatedVideoShotIds[productionKey] ?? [])
      ids.add(shotId)
      this.generatedVideoShotIds = {
        ...this.generatedVideoShotIds,
        [productionKey]: [...ids],
      }
      this.saveState()
    },
    markPreviewReady(productionKey: string) {
      this.loadState()

      if (!this.previewReadyKeys.includes(productionKey)) {
        this.previewReadyKeys = [...this.previewReadyKeys, productionKey]
      }

      this.saveState()
    },
  },
})
