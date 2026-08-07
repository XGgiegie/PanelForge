import { defineStore } from 'pinia'

import {
  getCreativeBriefCharacterProfiles,
  getNovelChapterText,
  type NovelChapter,
  type NovelItem,
} from './novelLibrary'
import type { StoryboardDraftRecord } from './storyboardDraft'

export type ChapterShot = {
  id: string
  index: number
  title: string
  scene: string
  camera: string
  characters: string[]
  characterProfileIds: string[]
  dialogue: string
  narration: string
  imagePrompt: string
  durationSeconds: number
}

export type GeneratedShotVideo = {
  videoUrl: string
  taskId: string
  status: string
  model?: string
  ratio?: string
  resolution?: string
  duration?: number
  watermark?: boolean
  errorMessage?: string
  createdAt?: string
  completedAt?: string
  expiresAt?: string
  rawResponse?: string
  updatedAt: string
}

export type CanvasVideoReferenceType = 'image_url' | 'video_url' | 'audio_url'

export type CanvasVideoReference = {
  type: CanvasVideoReferenceType
  url: string
}

export type CanvasVideoGenerationConfig = {
  ratio: string
  resolution: string
  duration: number
  watermark: boolean
  references: CanvasVideoReference[]
}

export type CanvasGenerationModelType = 'text' | 'image' | 'video'

type DramaProductionState = {
  generatedShotIds: Record<string, string[]>
  generatedShotImages: Record<string, Record<string, string>>
  generatedShotImageUrls: Record<string, Record<string, string>>
  generatedVideoPromptShotIds: Record<string, string[]>
  generatedVideoShotIds: Record<string, string[]>
  generatedShotVideos: Record<string, Record<string, GeneratedShotVideo>>
  videoGenerationConfigs: Record<string, Record<string, CanvasVideoGenerationConfig>>
  modelOverrides: Record<string, Partial<Record<CanvasGenerationModelType, string>>>
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
      generatedShotImages: {},
      generatedShotImageUrls: {},
      generatedVideoPromptShotIds: {},
      generatedVideoShotIds: {},
      generatedShotVideos: {},
      videoGenerationConfigs: {},
      modelOverrides: {},
      previewReadyKeys: [],
    }
  }

  try {
    const rawValue = localStorage.getItem(DRAMA_PRODUCTION_STORAGE_KEY)

    if (!rawValue) {
      return {
        generatedShotIds: {},
        generatedShotImages: {},
        generatedShotImageUrls: {},
        generatedVideoPromptShotIds: {},
        generatedVideoShotIds: {},
        generatedShotVideos: {},
        videoGenerationConfigs: {},
        modelOverrides: {},
        previewReadyKeys: [],
      }
    }

    const parsedValue = JSON.parse(rawValue) as Partial<DramaProductionState>

    return {
      generatedShotIds: parsedValue.generatedShotIds ?? {},
      generatedShotImages: parsedValue.generatedShotImages ?? {},
      generatedShotImageUrls: parsedValue.generatedShotImageUrls ?? {},
      generatedVideoPromptShotIds: parsedValue.generatedVideoPromptShotIds ?? {},
      generatedVideoShotIds: parsedValue.generatedVideoShotIds ?? {},
      generatedShotVideos: parsedValue.generatedShotVideos ?? {},
      videoGenerationConfigs: parsedValue.videoGenerationConfigs ?? {},
      modelOverrides: parsedValue.modelOverrides ?? {},
      previewReadyKeys: parsedValue.previewReadyKeys ?? [],
    }
  } catch {
    return {
      generatedShotIds: {},
      generatedShotImages: {},
      generatedShotImageUrls: {},
      generatedVideoPromptShotIds: {},
      generatedVideoShotIds: {},
      generatedShotVideos: {},
      videoGenerationConfigs: {},
      modelOverrides: {},
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

function normalizeCharacterReference(value: string) {
  return value.replace(/\s+/g, '').trim().toLowerCase()
}

function resolveShotCharacterProfileIds(novel: NovelItem, characterNames: string[]) {
  const profiles = getCreativeBriefCharacterProfiles(novel.creativeBrief)
  const profileIds = new Set<string>()

  characterNames.forEach((characterName) => {
    const normalizedName = normalizeCharacterReference(characterName)

    if (!normalizedName) {
      return
    }

    if (normalizedName === '主角') {
      profiles.filter((profile) => profile.role === '主角').forEach((profile) => profileIds.add(profile.id))
      return
    }

    if (normalizedName === '男主' || normalizedName === '女主') {
      const genderKeyword = normalizedName === '男主' ? '男' : '女'

      profiles
        .filter((profile) => profile.role === '主角' && profile.gender.includes(genderKeyword))
        .forEach((profile) => profileIds.add(profile.id))
      return
    }

    profiles
      .filter((profile) => {
        const normalizedProfileName = normalizeCharacterReference(profile.name)

        if (!normalizedProfileName) {
          return false
        }

        return (
          normalizedProfileName === normalizedName ||
          normalizedProfileName.includes(normalizedName) ||
          normalizedName.includes(normalizedProfileName)
        )
      })
      .forEach((profile) => profileIds.add(profile.id))
  })

  return [...profileIds]
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
      characterProfileIds: resolveShotCharacterProfileIds(novel, shot.characters.length ? shot.characters : ['主角']),
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
      characterProfileIds: resolveShotCharacterProfileIds(novel, ['主角']),
      dialogue: extractDialogue(text),
      narration: index === 0 ? compactText(chapter.preview, 52) : '',
      imagePrompt: `竖屏 9:16 半写实电影感 AI 漫剧首帧，真实摄影逻辑，${scene}，人物比例与表情自然，材质真实，柔和电影光线和轻薄空气雾营造克制氛围，画面干净通透并适合连续分镜。`,
      durationSeconds: index === fallbackShotTitles.length - 1 ? 7 : 6,
    }
  })
}

export const useDramaProductionStore = defineStore('dramaProduction', {
  state: () => ({
    generatedShotIds: {} as Record<string, string[]>,
    generatedShotImages: {} as Record<string, Record<string, string>>,
    generatedShotImageUrls: {} as Record<string, Record<string, string>>,
    generatedVideoPromptShotIds: {} as Record<string, string[]>,
    generatedVideoShotIds: {} as Record<string, string[]>,
    generatedShotVideos: {} as Record<string, Record<string, GeneratedShotVideo>>,
    videoGenerationConfigs: {} as Record<string, Record<string, CanvasVideoGenerationConfig>>,
    modelOverrides: {} as Record<string, Partial<Record<CanvasGenerationModelType, string>>>,
    previewReadyKeys: [] as string[],
    isLoaded: false,
  }),
  getters: {
    getGeneratedShotIds: (state) => (productionKey: string) => state.generatedShotIds[productionKey] ?? [],
    getGeneratedShotImage: (state) => (productionKey: string, shotId: string) =>
      state.generatedShotImages[productionKey]?.[shotId] ?? '',
    getGeneratedShotImageUrl: (state) => (productionKey: string, shotId: string) =>
      state.generatedShotImageUrls[productionKey]?.[shotId] ?? '',
    getGeneratedVideoPromptShotIds: (state) => (productionKey: string) =>
      state.generatedVideoPromptShotIds[productionKey] ?? [],
    getGeneratedVideoShotIds: (state) => (productionKey: string) =>
      state.generatedVideoShotIds[productionKey] ?? [],
    getGeneratedShotVideo: (state) => (productionKey: string, shotId: string) =>
      state.generatedShotVideos[productionKey]?.[shotId] ?? null,
    getVideoGenerationConfig: (state) => (productionKey: string, shotId: string) =>
      state.videoGenerationConfigs[productionKey]?.[shotId] ?? null,
    getModelOverride: (state) => (productionKey: string, modelType: CanvasGenerationModelType) =>
      state.modelOverrides[productionKey]?.[modelType] ?? '',
    isPreviewReady: (state) => (productionKey: string) => state.previewReadyKeys.includes(productionKey),
  },
  actions: {
    loadState() {
      if (this.isLoaded) {
        return
      }

      const state = readDramaProductionState()
      this.generatedShotIds = state.generatedShotIds
      this.generatedShotImages = state.generatedShotImages
      this.generatedShotImageUrls = state.generatedShotImageUrls
      this.generatedVideoPromptShotIds = state.generatedVideoPromptShotIds
      this.generatedVideoShotIds = state.generatedVideoShotIds
      this.generatedShotVideos = state.generatedShotVideos
      this.videoGenerationConfigs = state.videoGenerationConfigs
      this.modelOverrides = state.modelOverrides
      this.previewReadyKeys = state.previewReadyKeys
      this.isLoaded = true
    },
    saveState() {
      writeDramaProductionState({
        generatedShotIds: this.generatedShotIds,
        generatedShotImages: this.generatedShotImages,
        generatedShotImageUrls: this.generatedShotImageUrls,
        generatedVideoPromptShotIds: this.generatedVideoPromptShotIds,
        generatedVideoShotIds: this.generatedVideoShotIds,
        generatedShotVideos: this.generatedShotVideos,
        videoGenerationConfigs: this.videoGenerationConfigs,
        modelOverrides: this.modelOverrides,
        previewReadyKeys: this.previewReadyKeys,
      })
    },
    setModelOverride(productionKey: string, modelType: CanvasGenerationModelType, model: string) {
      this.loadState()

      const normalizedModel = model.trim()
      const currentOverrides = this.modelOverrides[productionKey] ?? {}
      const nextOverrides = { ...currentOverrides }

      if (normalizedModel) {
        nextOverrides[modelType] = normalizedModel
      } else {
        delete nextOverrides[modelType]
      }

      this.modelOverrides = {
        ...this.modelOverrides,
        [productionKey]: nextOverrides,
      }
      this.saveState()
    },
    setVideoGenerationConfig(productionKey: string, shotId: string, config: CanvasVideoGenerationConfig) {
      this.loadState()
      this.videoGenerationConfigs = {
        ...this.videoGenerationConfigs,
        [productionKey]: {
          ...(this.videoGenerationConfigs[productionKey] ?? {}),
          [shotId]: {
            ratio: config.ratio,
            resolution: config.resolution,
            duration: config.duration,
            watermark: config.watermark,
            references: config.references.map((reference) => ({ ...reference })),
          },
        },
      }
      this.saveState()
    },
    markShotImageGenerated(productionKey: string, shotId: string, imageDataUrl = '', imageUrl = '') {
      this.loadState()

      const ids = new Set(this.generatedShotIds[productionKey] ?? [])
      ids.add(shotId)
      this.generatedShotIds = {
        ...this.generatedShotIds,
        [productionKey]: [...ids],
      }
      if (imageDataUrl) {
        this.generatedShotImages = {
          ...this.generatedShotImages,
          [productionKey]: {
            ...(this.generatedShotImages[productionKey] ?? {}),
            [shotId]: imageDataUrl,
          },
        }
      }
      if (imageUrl) {
        this.generatedShotImageUrls = {
          ...this.generatedShotImageUrls,
          [productionKey]: {
            ...(this.generatedShotImageUrls[productionKey] ?? {}),
            [shotId]: imageUrl,
          },
        }
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
    markShotVideoPromptGenerated(productionKey: string, shotId: string) {
      this.loadState()

      const ids = new Set(this.generatedVideoPromptShotIds[productionKey] ?? [])
      ids.add(shotId)
      this.generatedVideoPromptShotIds = {
        ...this.generatedVideoPromptShotIds,
        [productionKey]: [...ids],
      }
      this.saveState()
    },
    upsertShotVideoTask(productionKey: string, shotId: string, video: Omit<GeneratedShotVideo, 'updatedAt'>) {
      this.loadState()

      const ids = new Set(this.generatedVideoShotIds[productionKey] ?? [])
      if (video.videoUrl && ['completed', 'succeeded'].includes(video.status)) {
        ids.add(shotId)
      } else {
        ids.delete(shotId)
      }
      this.generatedVideoShotIds = {
        ...this.generatedVideoShotIds,
        [productionKey]: [...ids],
      }
      this.generatedShotVideos = {
        ...this.generatedShotVideos,
        [productionKey]: {
          ...(this.generatedShotVideos[productionKey] ?? {}),
          [shotId]: {
            ...video,
            updatedAt: new Date().toISOString(),
          },
        },
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
    clearShotVideoPipeline(productionKey: string, shotId: string) {
      this.loadState()

      this.generatedVideoPromptShotIds = {
        ...this.generatedVideoPromptShotIds,
        [productionKey]: (this.generatedVideoPromptShotIds[productionKey] ?? []).filter((id) => id !== shotId),
      }
      this.generatedVideoShotIds = {
        ...this.generatedVideoShotIds,
        [productionKey]: (this.generatedVideoShotIds[productionKey] ?? []).filter((id) => id !== shotId),
      }
      this.generatedShotVideos = {
        ...this.generatedShotVideos,
        [productionKey]: Object.fromEntries(
          Object.entries(this.generatedShotVideos[productionKey] ?? {}).filter(([id]) => id !== shotId),
        ),
      }
      this.saveState()
    },
    clearShotVideoAsset(productionKey: string, shotId: string) {
      this.loadState()

      this.generatedVideoShotIds = {
        ...this.generatedVideoShotIds,
        [productionKey]: (this.generatedVideoShotIds[productionKey] ?? []).filter((id) => id !== shotId),
      }
      this.generatedShotVideos = {
        ...this.generatedShotVideos,
        [productionKey]: Object.fromEntries(
          Object.entries(this.generatedShotVideos[productionKey] ?? {}).filter(([id]) => id !== shotId),
        ),
      }
      this.saveState()
    },
    clearShotProductionPipeline(productionKey: string, shotId: string) {
      this.loadState()

      this.generatedShotIds = {
        ...this.generatedShotIds,
        [productionKey]: (this.generatedShotIds[productionKey] ?? []).filter((id) => id !== shotId),
      }
      this.generatedShotImages = {
        ...this.generatedShotImages,
        [productionKey]: Object.fromEntries(
          Object.entries(this.generatedShotImages[productionKey] ?? {}).filter(([id]) => id !== shotId),
        ),
      }
      this.generatedShotImageUrls = {
        ...this.generatedShotImageUrls,
        [productionKey]: Object.fromEntries(
          Object.entries(this.generatedShotImageUrls[productionKey] ?? {}).filter(([id]) => id !== shotId),
        ),
      }
      this.generatedVideoPromptShotIds = {
        ...this.generatedVideoPromptShotIds,
        [productionKey]: (this.generatedVideoPromptShotIds[productionKey] ?? []).filter((id) => id !== shotId),
      }
      this.generatedVideoShotIds = {
        ...this.generatedVideoShotIds,
        [productionKey]: (this.generatedVideoShotIds[productionKey] ?? []).filter((id) => id !== shotId),
      }
      this.saveState()
    },
  },
})
