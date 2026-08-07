<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import {
  NAvatar,
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NImage,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSwitch,
  NTag,
  NText,
} from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import {
  AI_IMAGE_ASPECT_RATIO_OPTIONS,
  AI_IMAGE_RESOLUTION_OPTIONS,
  generateAiImage,
  type AiImageAspectRatio,
  type AiImageResolution,
} from '../services/aiImageGeneration'
import {
  AI_VIDEO_MODEL_OPTIONS,
  AI_VIDEO_RATIO_OPTIONS,
  AI_VIDEO_RESOLUTION_OPTIONS,
  generateAiVideo,
  getAiVideoTasks,
  type AiVideoRatio,
  type AiVideoReferenceContent,
  type AiVideoResolution,
} from '../services/aiVideoGeneration'
import { generateVideoPromptWithAi } from '../services/videoPromptGeneration'
import {
  findCharacterAssetsForNames,
  getMissingCharacterNames,
  normalizeCharacterName,
  useCharacterAssetsStore,
} from '../stores/characterAssets'
import { getCanvasAssetTypeLabel, useCanvasAssetsStore, type CanvasAssetType } from '../stores/canvasAssets'
import { createChapterAnalysisKey } from '../stores/chapterAnalysis'
import { createFirstFrameImagePrompt } from '../services/firstFrameImagePrompt'
import { openCharacterWorkspaceWindow } from '../services/characterWorkspaceWindow'
import { ensureVisualStylePrompt } from '../services/visualStylePrompt'
import { useAiSettingsStore } from '../stores/aiSettings'
import {
  createChapterProductionKey,
  createChapterShots,
  useDramaProductionStore,
  type CanvasGenerationModelType,
  type CanvasVideoGenerationConfig,
  type CanvasVideoReferenceType,
  type ChapterShot,
} from '../stores/dramaProduction'
import {
  getCreativeBriefCharacterProfiles,
  getNovelFoundationForPrompt,
  useNovelLibraryStore,
} from '../stores/novelLibrary'
import { useStoryboardDraftStore } from '../stores/storyboardDraft'

const route = useRoute()
const router = useRouter()
const library = useNovelLibraryStore()
const characterAssets = useCharacterAssetsStore()
const canvasAssets = useCanvasAssetsStore()
const storyboardDraft = useStoryboardDraftStore()
const dramaProduction = useDramaProductionStore()
const aiSettings = useAiSettingsStore()
const generatingImageShotIds = ref<string[]>([])
const generatingVideoPromptShotIds = ref<string[]>([])
const generatingVideoShotIds = ref<string[]>([])
const failedVideoShotIds = ref<string[]>([])
const imageGenerationErrors = ref<Record<string, string>>({})
const videoPromptGenerationErrors = ref<Record<string, string>>({})
const videoGenerationErrors = ref<Record<string, string>>({})
const isRefreshingVideoTasks = ref(false)
const canvasViewport = ref<HTMLElement | null>(null)
const textAssetInput = ref<HTMLInputElement | null>(null)
const imageAssetInput = ref<HTMLInputElement | null>(null)
const videoAssetInput = ref<HTMLInputElement | null>(null)
const shotNodeHeights = ref<Record<string, number>>({})
type ProductionStep = 'shot' | 'image' | 'videoPrompt' | 'video'

const selectedShotId = ref('')
const selectedCharacterProfileId = ref('')
const selectedProductionStep = ref<ProductionStep>('shot')
const editingNodeKey = ref('')
const isAssetLibraryOpen = ref(false)
const isNodeEditMode = ref(true)
const isSupportingCastVisible = ref(false)
const uploadingAssetType = ref<CanvasAssetType | ''>('')
const assetUploadError = ref('')
const zoom = ref(0.88)
const canvasPan = ref({ x: 0, y: 0 })
const isPanPending = ref(false)
const isPanning = ref(false)
const panStart = ref({
  pointerId: 0,
  x: 0,
  y: 0,
  panX: 0,
  panY: 0,
})
const shotNodeElements = new Map<string, HTMLElement>()
const shotNodeIds = new WeakMap<HTMLElement, string>()
let shotNodeResizeObserver: ResizeObserver | null = null
let videoTaskPollTimer: ReturnType<typeof setTimeout> | null = null

type ShotPromptDraft = {
  scene: string
  image: string
  characters: string
  narration: string
  camera: string
  extra: string
  firstFramePrompt: string
  imageStyle: string
  imageAspectRatio: AiImageAspectRatio
  imageResolution: AiImageResolution
  videoPrompt: string
}

type ShotPromptDraftField = keyof ShotPromptDraft
type CanvasNodeGeometry = {
  id: string
  x: number
  y: number
  width: number
  height: number
}
type CanvasConnection = {
  id: string
  from: string
  to: string
  tone: 'default' | 'blue' | 'character'
}
type CanvasCharacterNode = {
  id: string
  profileId: string
  assetId: string
  name: string
  role: string
  imageDataUrl: string
  relatedShotIds: string[]
  top: number
}

type VideoReferenceBundle = {
  content: AiVideoReferenceContent[]
  promptGuide: string
}

const shotPromptDrafts = ref<Record<string, ShotPromptDraft>>({})
const shotPromptDraftsLoaded = ref(false)
const CHAPTER_CANVAS_PROMPT_STORAGE_PREFIX = 'panelforge:chapter-canvas-prompts:'
let shotPromptDraftSaveTimer: ReturnType<typeof setTimeout> | null = null
let shotPromptDraftSaveQueue: Promise<void> = Promise.resolve()

function getShotPromptDraftStorageKey(productionKey = chapterProductionKey.value) {
  return productionKey ? `${CHAPTER_CANVAS_PROMPT_STORAGE_PREFIX}${productionKey}` : ''
}

function normalizeShotPromptDrafts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const rawDrafts = 'drafts' in value && value.drafts && typeof value.drafts === 'object' ? value.drafts : value

  if (!rawDrafts || typeof rawDrafts !== 'object' || Array.isArray(rawDrafts)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(rawDrafts as Record<string, unknown>)
      .filter(([, draft]) => draft && typeof draft === 'object' && !Array.isArray(draft))
      .map(([shotId, draft]) => [shotId, { ...(draft as Partial<ShotPromptDraft>) }]),
  ) as Record<string, ShotPromptDraft>
}

function readLocalShotPromptDrafts(storageKey: string) {
  if (typeof localStorage === 'undefined' || !storageKey) {
    return {}
  }

  try {
    const rawValue = localStorage.getItem(storageKey)
    return rawValue ? normalizeShotPromptDrafts(JSON.parse(rawValue)) : {}
  } catch {
    return {}
  }
}

function writeLocalShotPromptDrafts(storageKey: string, drafts: Record<string, ShotPromptDraft>) {
  if (typeof localStorage === 'undefined' || !storageKey) {
    return
  }

  localStorage.setItem(storageKey, JSON.stringify({ drafts }))
}

function createStoredShotPromptDraftState(drafts: Record<string, ShotPromptDraft>) {
  return JSON.parse(JSON.stringify({ drafts })) as { drafts: Record<string, ShotPromptDraft> }
}

async function loadShotPromptDrafts() {
  const storageKey = getShotPromptDraftStorageKey()
  const localDrafts = readLocalShotPromptDrafts(storageKey)
  const storage = window.panelForge?.contentStorage
  let shouldSeedSqlite = false

  if (storage && storageKey) {
    try {
      const storedState = await storage.loadWorkflowState(storageKey)

      if (storedState !== null) {
        shotPromptDrafts.value = normalizeShotPromptDrafts(storedState)
      } else {
        shotPromptDrafts.value = localDrafts
        shouldSeedSqlite = Object.keys(localDrafts).length > 0
      }
    } catch {
      shotPromptDrafts.value = localDrafts
    }
  } else {
    shotPromptDrafts.value = localDrafts
  }

  shotPromptDraftsLoaded.value = true

  if (shouldSeedSqlite) {
    await persistShotPromptDraftsNow()
  }
}

function persistShotPromptDraftsNow() {
  const storageKey = getShotPromptDraftStorageKey()

  if (!shotPromptDraftsLoaded.value || !storageKey) {
    return Promise.resolve()
  }

  const drafts = normalizeShotPromptDrafts(shotPromptDrafts.value)
  writeLocalShotPromptDrafts(storageKey, drafts)
  const storage = window.panelForge?.contentStorage

  if (!storage) {
    return Promise.resolve()
  }

  const storedState = createStoredShotPromptDraftState(drafts)
  shotPromptDraftSaveQueue = shotPromptDraftSaveQueue
    .catch(() => {})
    .then(async () => {
      await storage.saveWorkflowState(storageKey, storedState)
    })
    .catch(() => {})

  return shotPromptDraftSaveQueue
}

function scheduleShotPromptDraftSave() {
  if (shotPromptDraftSaveTimer !== null) {
    clearTimeout(shotPromptDraftSaveTimer)
  }

  shotPromptDraftSaveTimer = setTimeout(() => {
    shotPromptDraftSaveTimer = null
    void persistShotPromptDraftsNow()
  }, 250)
}

const CHARACTER_NODE_LEFT = 64
const CHARACTER_NODE_WIDTH = 220
const CHARACTER_NODE_HEIGHT = 340
const CHARACTER_NODE_GAP = 56
const CHARACTER_IMAGE_HEIGHT = 264
const NODE_LEFT = 420
const NODE_TOP = 150
const SHOT_NODE_WIDTH = 520
const IMAGE_NODE_WIDTH = 320
const PROMPT_NODE_WIDTH = 380
const VIDEO_NODE_WIDTH = 320
const CHAIN_LINE_WIDTH = 96
const CANVAS_WIDTH =
  NODE_LEFT * 2 + SHOT_NODE_WIDTH + IMAGE_NODE_WIDTH + PROMPT_NODE_WIDTH + VIDEO_NODE_WIDTH + CHAIN_LINE_WIDTH * 3 + 120
const NODE_MIN_HEIGHT = 320
const NODE_DEFAULT_HEIGHT = 380
const NODE_GAP_Y = 160
const MIN_CANVAS_HEIGHT = 1160
const PAN_START_THRESHOLD = 4
const FIRST_FRAME_TENSION_PROMPT = '强化张力：情绪更强、动作更明确，真实人物比例与材质更清晰，以柔和电影光线、轻薄空气雾和自然景深增强克制氛围，主体更突出。'
const CANVAS_NODE_STEPS: ProductionStep[] = ['shot', 'image', 'videoPrompt', 'video']
const VIDEO_TASK_POLL_INTERVAL_MS = 5000

const scriptId = computed(() => String(route.params.scriptId ?? ''))
const chapterIndex = computed(() => {
  const value = Number(route.params.chapterIndex ?? 1)

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
})
const novel = computed(() => library.novels.find((item) => item.id === scriptId.value) ?? null)
const chapter = computed(() => {
  if (!novel.value) {
    return null
  }

  return novel.value.chapters[chapterIndex.value - 1] ?? novel.value.chapters[0] ?? null
})
const analysisKey = computed(() => {
  if (!novel.value || !chapter.value) {
    return ''
  }

  return createChapterAnalysisKey(novel.value.id, chapter.value.id)
})
const draft = computed(() => (analysisKey.value ? storyboardDraft.getDraft(analysisKey.value) : null))
const shots = computed(() => {
  if (!novel.value || !chapter.value) {
    return []
  }

  return createChapterShots(novel.value, chapter.value, draft.value)
})
const chapterProductionKey = computed(() =>
  novel.value ? createChapterProductionKey(novel.value.id, chapterIndex.value) : '',
)
const generatedImageShotIds = computed(() =>
  chapterProductionKey.value ? dramaProduction.getGeneratedShotIds(chapterProductionKey.value) : [],
)
const generatedVideoPromptShotIds = computed(() =>
  chapterProductionKey.value ? dramaProduction.getGeneratedVideoPromptShotIds(chapterProductionKey.value) : [],
)
const generatedVideoShotIds = computed(() =>
  chapterProductionKey.value ? dramaProduction.getGeneratedVideoShotIds(chapterProductionKey.value) : [],
)
const novelCharacterAssets = computed(() => {
  if (!novel.value) {
    return []
  }

  return characterAssets.getCharactersByNovelId(novel.value.id)
})
const characterProfiles = computed(() => getCreativeBriefCharacterProfiles(novel.value?.creativeBrief))
const novelCanvasAssets = computed(() => {
  if (!novel.value) {
    return []
  }

  return canvasAssets.getAssetsByNovelId(novel.value.id)
})
const canvasAssetCount = computed(() => novelCharacterAssets.value.length + novelCanvasAssets.value.length)
const selectedShot = computed(() => shots.value.find((shot) => shot.id === selectedShotId.value) ?? null)
const shotLayouts = computed(() => {
  let top = NODE_TOP

  return shots.value.map((shot) => {
    const measuredHeight = shotNodeHeights.value[shot.id]
    const height = Math.max(NODE_MIN_HEIGHT, measuredHeight ?? NODE_DEFAULT_HEIGHT)
    const layout = {
      id: shot.id,
      top,
      height,
    }

    top += height + NODE_GAP_Y

    return layout
  })
})
const referencedCharacterProfileIds = computed(
  () => new Set(shots.value.flatMap((shot) => shot.characterProfileIds)),
)
const allCanvasCharacterNodes = computed<CanvasCharacterNode[]>(() => {
  const nodes = characterProfiles.value
    .filter((profile) => referencedCharacterProfileIds.value.has(profile.id))
    .flatMap((profile) => {
      const asset = getCharacterAssetForProfile(profile.id)

      if (!asset) {
        return []
      }

      return [
        {
          id: getCanvasCharacterNodeKey(profile.id),
          profileId: profile.id,
          assetId: asset.id,
          name: profile.name,
          role: profile.role,
          imageDataUrl: asset.referenceImageDataUrl,
          relatedShotIds: shots.value
            .filter((shot) => shot.characterProfileIds.includes(profile.id))
            .map((shot) => shot.id),
          top: 0,
        },
      ]
    })
    .sort((left, right) => getCharacterNodeRoleRank(left.role) - getCharacterNodeRoleRank(right.role))

  return nodes.map((node, index) => ({
    ...node,
    top: NODE_TOP + index * (CHARACTER_NODE_HEIGHT + CHARACTER_NODE_GAP),
  }))
})
const supportingCharacterNodeCount = computed(
  () => allCanvasCharacterNodes.value.filter((node) => getCharacterNodeRoleRank(node.role) > 1).length,
)
const canvasCharacterNodes = computed(() =>
  allCanvasCharacterNodes.value.filter(
    (node) => isSupportingCastVisible.value || getCharacterNodeRoleRank(node.role) <= 1,
  ),
)
const canvasNodeGeometries = computed<Record<string, CanvasNodeGeometry>>(() => {
  const geometries: Record<string, CanvasNodeGeometry> = {}

  canvasCharacterNodes.value.forEach((node) => {
    geometries[node.id] = {
      id: node.id,
      x: CHARACTER_NODE_LEFT,
      y: node.top,
      width: CHARACTER_NODE_WIDTH,
      height: CHARACTER_NODE_HEIGHT,
    }
  })

  shotLayouts.value.forEach((layout) => {
    CANVAS_NODE_STEPS.forEach((step) => {
      const id = getCanvasNodeKey(layout.id, step)

      geometries[id] = {
        id,
        x: getStepNodeLeft(step),
        y: layout.top,
        width: getStepNodeWidth(step),
        height: layout.height,
      }
    })
  })

  return geometries
})
const canvasConnections = computed<CanvasConnection[]>(() =>
  [
    ...canvasCharacterNodes.value.flatMap((node) =>
      node.relatedShotIds.map((shotId) => ({
        id: `${node.id}:${shotId}`,
        from: node.id,
        to: getCanvasNodeKey(shotId, 'shot'),
        tone: 'character' as const,
      })),
    ),
    ...shots.value.flatMap((shot) => [
      {
        id: `${shot.id}:shot-image`,
        from: getCanvasNodeKey(shot.id, 'shot'),
        to: getCanvasNodeKey(shot.id, 'image'),
        tone: 'default' as const,
      },
      {
        id: `${shot.id}:image-videoPrompt`,
        from: getCanvasNodeKey(shot.id, 'image'),
        to: getCanvasNodeKey(shot.id, 'videoPrompt'),
        tone: 'blue' as const,
      },
      {
        id: `${shot.id}:videoPrompt-video`,
        from: getCanvasNodeKey(shot.id, 'videoPrompt'),
        to: getCanvasNodeKey(shot.id, 'video'),
        tone: 'blue' as const,
      },
    ]),
  ],
)
const characterConnectedShotIds = computed(
  () => new Set(canvasCharacterNodes.value.flatMap((node) => node.relatedShotIds)),
)
const selectedCanvasNodeKey = computed(() =>
  selectedShotId.value ? getCanvasNodeKey(selectedShotId.value, selectedProductionStep.value) : '',
)
const topConnections = computed(() => {
  const selectedCharacterNodeKey = selectedCharacterProfileId.value
    ? getCanvasCharacterNodeKey(selectedCharacterProfileId.value)
    : ''
  const selectedShotNodeKey = selectedShotId.value ? getCanvasNodeKey(selectedShotId.value, 'shot') : ''

  if (!selectedCanvasNodeKey.value && !selectedCharacterNodeKey) {
    return []
  }

  return canvasConnections.value.filter(
    (connection) =>
      connection.from === selectedCanvasNodeKey.value ||
      connection.to === selectedCanvasNodeKey.value ||
      connection.from === selectedCharacterNodeKey ||
      connection.to === selectedCharacterNodeKey ||
      (connection.tone === 'character' && connection.to === selectedShotNodeKey),
  )
})
const topConnectionIds = computed(() => new Set(topConnections.value.map((connection) => connection.id)))
const baseConnections = computed(() =>
  canvasConnections.value.filter((connection) => !topConnectionIds.value.has(connection.id)),
)
const canvasHeight = computed(() => {
  const lastLayout = shotLayouts.value[shotLayouts.value.length - 1]
  const characterBottom = canvasCharacterNodes.value.reduce(
    (bottom, node) => Math.max(bottom, node.top + CHARACTER_NODE_HEIGHT + NODE_TOP),
    0,
  )

  if (!lastLayout) {
    return Math.max(MIN_CANVAS_HEIGHT, characterBottom)
  }

  return Math.max(MIN_CANVAS_HEIGHT, characterBottom, lastLayout.top + lastLayout.height + NODE_TOP)
})
const canvasShellStyle = computed<CSSProperties>(() => ({
  height: `${canvasHeight.value}px`,
  width: `${CANVAS_WIDTH}px`,
}))
const canvasPlaneStyle = computed<CSSProperties>(() => ({
  height: `${canvasHeight.value}px`,
  transform: `translate3d(${canvasPan.value.x}px, ${canvasPan.value.y}px, 0) scale(${zoom.value})`,
  width: `${CANVAS_WIDTH}px`,
}))
const canvasViewportStyle = computed<CSSProperties>(() => ({
  backgroundPosition: `${canvasPan.value.x}px ${canvasPan.value.y}px`,
  backgroundSize: `${32 * zoom.value}px ${32 * zoom.value}px`,
}))
const zoomText = computed(() => `${Math.round(zoom.value * 100)}%`)
function getDefaultCanvasModel(modelType: CanvasGenerationModelType) {
  if (modelType === 'text') {
    return aiSettings.textModel
  }

  if (modelType === 'image') {
    return aiSettings.imageModel
  }

  return aiSettings.videoModel
}

function getCanvasModel(modelType: CanvasGenerationModelType) {
  if (!chapterProductionKey.value) {
    return getDefaultCanvasModel(modelType)
  }

  return dramaProduction.getModelOverride(chapterProductionKey.value, modelType) || getDefaultCanvasModel(modelType)
}

function updateCanvasModel(modelType: CanvasGenerationModelType, model: string) {
  if (!chapterProductionKey.value) {
    return
  }

  dramaProduction.setModelOverride(chapterProductionKey.value, modelType, model)
}

const textModelName = computed({
  get: () => getCanvasModel('text'),
  set: (model: string) => updateCanvasModel('text', model),
})
const imageModelName = computed({
  get: () => getCanvasModel('image'),
  set: (model: string) => updateCanvasModel('image', model),
})
const videoModelName = computed({
  get: () => {
    const model = getCanvasModel('video')

    return AI_VIDEO_MODEL_OPTIONS.some((option) => option.value === model) ? model : AI_VIDEO_MODEL_OPTIONS[0].value
  },
  set: (model: string) => updateCanvasModel('video', model),
})

function getShotVideoConfig(shot: ChapterShot): CanvasVideoGenerationConfig {
  const savedConfig = chapterProductionKey.value
    ? dramaProduction.getVideoGenerationConfig(chapterProductionKey.value, shot.id)
    : null
  const supportedRatio = AI_VIDEO_RATIO_OPTIONS.some((option) => option.value === savedConfig?.ratio)
  const supportedResolution = AI_VIDEO_RESOLUTION_OPTIONS.some((option) => option.value === savedConfig?.resolution)
  const savedDuration = savedConfig?.duration
  const duration =
    typeof savedDuration === 'number' && Number.isFinite(savedDuration)
      ? Math.max(4, Math.min(15, Math.round(savedDuration)))
      : Math.max(4, Math.min(15, Math.round(shot.durationSeconds)))
  const savedReferences = savedConfig?.references
  const references = Array.isArray(savedReferences)
    ? savedReferences.filter(
        (reference) =>
          reference &&
          ['image_url', 'video_url', 'audio_url'].includes(reference.type) &&
          typeof reference.url === 'string',
      )
    : []

  return {
    ratio: supportedRatio ? savedConfig?.ratio ?? '9:16' : '9:16',
    resolution: supportedResolution ? savedConfig?.resolution ?? '720p' : '720p',
    duration,
    watermark: savedConfig?.watermark ?? false,
    references,
  }
}

function updateSelectedVideoConfig(patch: Partial<CanvasVideoGenerationConfig>) {
  if (!selectedShot.value || !chapterProductionKey.value) {
    return
  }

  dramaProduction.setVideoGenerationConfig(chapterProductionKey.value, selectedShot.value.id, {
    ...getShotVideoConfig(selectedShot.value),
    ...patch,
  })
}

function getReferenceUrls(type: CanvasVideoReferenceType) {
  if (!selectedShot.value) {
    return ''
  }

  return getShotVideoConfig(selectedShot.value)
    .references.filter((reference) => reference.type === type)
    .map((reference) => reference.url)
    .join('\n')
}

function updateReferenceUrls(type: CanvasVideoReferenceType, value: string) {
  if (!selectedShot.value) {
    return
  }

  const config = getShotVideoConfig(selectedShot.value)
  const otherReferences = config.references.filter((reference) => reference.type !== type)
  const urls = [...new Set(value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean))]

  updateSelectedVideoConfig({
    references: [...otherReferences, ...urls.map((url) => ({ type, url }))],
  })
}

function isValidVideoReference(reference: { type: CanvasVideoReferenceType; url: string }) {
  const url = reference.url.trim()

  if (/^https?:\/\//i.test(url)) {
    return true
  }

  if (reference.type === 'image_url') {
    return /^data:image\/[a-z0-9.+-]+;base64,/i.test(url)
  }

  if (reference.type === 'video_url') {
    return /^data:video\/[a-z0-9.+-]+;base64,/i.test(url)
  }

  return /^data:audio\/[a-z0-9.+-]+;base64,/i.test(url)
}

const selectedVideoRatio = computed({
  get: () => (selectedShot.value ? (getShotVideoConfig(selectedShot.value).ratio as AiVideoRatio) : '9:16'),
  set: (ratio: AiVideoRatio) => updateSelectedVideoConfig({ ratio }),
})
const selectedVideoResolution = computed({
  get: () =>
    selectedShot.value ? (getShotVideoConfig(selectedShot.value).resolution as AiVideoResolution) : '720p',
  set: (resolution: AiVideoResolution) => updateSelectedVideoConfig({ resolution }),
})
const selectedVideoDuration = computed({
  get: () => (selectedShot.value ? getShotVideoConfig(selectedShot.value).duration : 6),
  set: (duration: number | null) => {
    if (duration !== null) {
      updateSelectedVideoConfig({ duration: Math.max(4, Math.min(15, Math.round(duration))) })
    }
  },
})
const selectedVideoWatermark = computed({
  get: () => (selectedShot.value ? getShotVideoConfig(selectedShot.value).watermark : false),
  set: (watermark: boolean) => updateSelectedVideoConfig({ watermark }),
})
const selectedReferenceImageUrls = computed({
  get: () => getReferenceUrls('image_url'),
  set: (value: string) => updateReferenceUrls('image_url', value),
})
const selectedReferenceVideoUrls = computed({
  get: () => getReferenceUrls('video_url'),
  set: (value: string) => updateReferenceUrls('video_url', value),
})
const selectedReferenceAudioUrls = computed({
  get: () => getReferenceUrls('audio_url'),
  set: (value: string) => updateReferenceUrls('audio_url', value),
})
const selectedVideoReferenceError = computed(() => {
  if (!selectedShot.value) {
    return ''
  }

  const invalidReference = getShotVideoConfig(selectedShot.value).references.find(
    (reference) => !isValidVideoReference(reference),
  )

  return invalidReference ? '参考素材需使用完整的 HTTP(S) 地址或对应类型的 Base64 Data URL。' : ''
})
const selectedGenerateButtonText = computed(() => {
  if (!selectedShot.value) {
    return '生成'
  }

  if (selectedProductionStep.value === 'shot') {
    return '已自动保存'
  }

  if (selectedProductionStep.value === 'image') {
    if (isImageGenerating(selectedShot.value)) {
      return '生成中'
    }

    return isImageGenerated(selectedShot.value) ? '重新生成' : '生成'
  }

  if (selectedProductionStep.value === 'videoPrompt') {
    if (!isImageGenerated(selectedShot.value)) {
      return '先生成首帧'
    }

    if (isVideoPromptGenerating(selectedShot.value)) {
      return '生成中'
    }

    return isVideoPromptGenerated(selectedShot.value) ? '重新生成' : '生成'
  }

  if (!isVideoPromptGenerated(selectedShot.value)) {
    return '先生成视频提示词'
  }

  if (!getGeneratedShotImage(selectedShot.value)) {
    return '缺少首帧'
  }

  if (isVideoGenerating(selectedShot.value)) {
    return '生成中'
  }

  return isVideoGenerated(selectedShot.value) ? '重新生成' : '生成'
})
const selectedGenerateDisabled = computed(() => {
  if (!selectedShot.value) {
    return true
  }

  if (selectedProductionStep.value === 'shot') {
    return true
  }

  if (selectedProductionStep.value === 'image') {
    return !aiSettings.canUseAiHubMix || selectedFirstFramePrompt.value.trim().length === 0 || isImageGenerating(selectedShot.value)
  }

  if (selectedProductionStep.value === 'videoPrompt') {
    return (
      !isImageGenerated(selectedShot.value) ||
      !aiSettings.canUseAiHubMix ||
      textModelName.value.trim().length === 0 ||
      isVideoPromptGenerating(selectedShot.value)
    )
  }

  return (
    !isVideoPromptGenerated(selectedShot.value) ||
    !getGeneratedShotImage(selectedShot.value) ||
    !aiSettings.hasApiKey ||
    !AI_VIDEO_MODEL_OPTIONS.some((option) => option.value === videoModelName.value) ||
    selectedVideoPrompt.value.trim().length === 0 ||
    selectedVideoReferenceError.value.length > 0 ||
    isVideoGenerating(selectedShot.value)
  )
})

const selectedScenePrompt = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).scene : ''
  },
  set(value: string) {
    updateSelectedPromptDraft('scene', value)
  },
})
const selectedImagePrompt = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).image : ''
  },
  set(value: string) {
    updateSelectedPromptDraft('image', value)
  },
})
const selectedCharactersPrompt = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).characters : ''
  },
  set(value: string) {
    updateSelectedPromptDraft('characters', value)
  },
})
const selectedNarrationPrompt = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).narration : ''
  },
  set(value: string) {
    updateSelectedPromptDraft('narration', value)
  },
})
const selectedCameraPrompt = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).camera : ''
  },
  set(value: string) {
    updateSelectedPromptDraft('camera', value)
  },
})
const selectedExtraPrompt = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).extra : ''
  },
  set(value: string) {
    updateSelectedPromptDraft('extra', value)
  },
})
const selectedFirstFramePrompt = computed({
  get() {
    if (!selectedShot.value) {
      return ''
    }

    const draft = getShotPromptDraft(selectedShot.value)

    return draft.firstFramePrompt || createFirstFramePromptFromDraft(selectedShot.value)
  },
  set(value: string) {
    updateSelectedPromptDraft('firstFramePrompt', value)
  },
})
const selectedImageStyle = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).imageStyle : ''
  },
  set(value: string) {
    updateSelectedPromptDraft('imageStyle', value)
  },
})
const selectedImageAspectRatio = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).imageAspectRatio : '9:16'
  },
  set(value: AiImageAspectRatio) {
    updateSelectedPromptDraft('imageAspectRatio', value)
  },
})
const selectedImageResolution = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).imageResolution : '1K'
  },
  set(value: AiImageResolution) {
    updateSelectedPromptDraft('imageResolution', value)
  },
})
const selectedVideoPrompt = computed({
  get() {
    return selectedShot.value ? getShotPromptDraft(selectedShot.value).videoPrompt : ''
  },
  set(value: string) {
    updateSelectedPromptDraft('videoPrompt', value)
  },
})

function createDefaultShotPromptDraft(shot: ChapterShot): ShotPromptDraft {
  const characterReferences = getShotCharacterReferences(shot)
  const missingCharacters = getShotMissingCharacters(shot)
  const referenceText = characterReferences
    .map((character) => {
      return character.description ? `${character.name}：${character.description}` : character.name
    })
    .join('\n')
  const missingText = missingCharacters.length ? `缺少角色参考：${missingCharacters.join('、')}` : ''

  return {
    scene: shot.scene,
    image: shot.imagePrompt || shot.scene,
    characters: [
      shot.characters.length ? shot.characters.join('、') : '无',
      referenceText ? `角色参考：\n${referenceText}` : '',
      missingText,
    ]
      .filter(Boolean)
      .join('\n'),
    narration: shot.narration || shot.dialogue || '',
    camera: shot.camera,
    extra: '',
    firstFramePrompt: '',
    imageStyle: '',
    imageAspectRatio: '9:16',
    imageResolution: '1K',
    videoPrompt: '',
  }
}

function getShotPromptDraft(shot: ChapterShot) {
  return {
    ...createDefaultShotPromptDraft(shot),
    ...(shotPromptDrafts.value[shot.id] ?? {}),
  }
}

function updateSelectedPromptDraft(field: ShotPromptDraftField, value: string) {
  if (!selectedShot.value) {
    return
  }

  updateShotPromptDraft(selectedShot.value, field, value)
}

function updateShotPromptDraft(shot: ChapterShot, field: ShotPromptDraftField, value: string) {
  const currentDraft = getShotPromptDraft(shot)
  const shouldResetFromImage = field !== 'videoPrompt'
  const isImageParameter = field === 'imageStyle' || field === 'imageAspectRatio' || field === 'imageResolution'
  const shouldResetFirstFramePrompt = shouldResetFromImage && field !== 'firstFramePrompt' && !isImageParameter

  if (chapterProductionKey.value) {
    if (shouldResetFromImage) {
      dramaProduction.clearShotProductionPipeline(chapterProductionKey.value, shot.id)
      generatingImageShotIds.value = removeGeneratingId(generatingImageShotIds.value, shot.id)
      generatingVideoPromptShotIds.value = removeGeneratingId(generatingVideoPromptShotIds.value, shot.id)
      generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
      failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
    imageGenerationErrors.value = { ...imageGenerationErrors.value, [shot.id]: '' }
    videoPromptGenerationErrors.value = { ...videoPromptGenerationErrors.value, [shot.id]: '' }
    videoGenerationErrors.value = { ...videoGenerationErrors.value, [shot.id]: '' }
    } else if (value.trim().length === 0) {
      dramaProduction.clearShotVideoPipeline(chapterProductionKey.value, shot.id)
      generatingVideoPromptShotIds.value = removeGeneratingId(generatingVideoPromptShotIds.value, shot.id)
      generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
      failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
      videoGenerationErrors.value = { ...videoGenerationErrors.value, [shot.id]: '' }
    } else {
      dramaProduction.clearShotVideoAsset(chapterProductionKey.value, shot.id)
      generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
      failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
      videoGenerationErrors.value = { ...videoGenerationErrors.value, [shot.id]: '' }
    }
  }

  shotPromptDrafts.value = {
    ...shotPromptDrafts.value,
    [shot.id]: {
      ...currentDraft,
      [field]: value,
      ...(shouldResetFirstFramePrompt ? { firstFramePrompt: '' } : {}),
      ...(shouldResetFromImage ? { videoPrompt: '' } : {}),
    },
  }
  scheduleShotPromptDraftSave()

  if (
    shouldResetFromImage &&
    selectedShot.value?.id === shot.id &&
    selectedProductionStep.value !== 'shot' &&
    selectedProductionStep.value !== 'image'
  ) {
    selectedProductionStep.value = 'image'
  }

  if (
    !shouldResetFromImage &&
    value.trim().length === 0 &&
    selectedShot.value?.id === shot.id &&
    selectedProductionStep.value === 'video'
  ) {
    selectedProductionStep.value = 'videoPrompt'
  }
}

function createFirstFramePromptFromDraft(shot: ChapterShot) {
  const draft = getShotPromptDraft(shot)

  return createFirstFrameImagePrompt({
    novelFoundation: getNovelFoundationForPrompt(novel.value),
    scene: draft.scene,
    firstFrameDescription: draft.image,
    characters: draft.characters,
    narration: draft.narration,
    camera: draft.camera,
    extra: draft.extra,
  })
}

function getShotNodeStyle(index: number): CSSProperties {
  const layout = shotLayouts.value[index]

  return {
    left: `${NODE_LEFT}px`,
    top: `${layout?.top ?? NODE_TOP}px`,
  }
}

function getCharacterNodeStyle(node: CanvasCharacterNode): CSSProperties {
  return {
    left: `${CHARACTER_NODE_LEFT}px`,
    top: `${node.top}px`,
    width: `${CHARACTER_NODE_WIDTH}px`,
  }
}

function getCharacterNodeRoleRank(role: string) {
  if (role === '主角') {
    return 0
  }

  if (role === '反派') {
    return 1
  }

  return 2
}

function getCharacterAssetForProfile(profileId: string) {
  const profile = characterProfiles.value.find((item) => item.id === profileId)

  if (!profile) {
    return undefined
  }

  const normalizedProfileName = normalizeCharacterName(profile.name)

  return (
    novelCharacterAssets.value.find((item) => item.profileId === profileId) ??
    (normalizedProfileName
      ? novelCharacterAssets.value.find((item) => normalizeCharacterName(item.name) === normalizedProfileName)
      : undefined)
  )
}

function toggleSupportingCast() {
  isSupportingCastVisible.value = !isSupportingCastVisible.value

  if (!isSupportingCastVisible.value) {
    const selectedProfile = characterProfiles.value.find((profile) => profile.id === selectedCharacterProfileId.value)

    if (selectedProfile && getCharacterNodeRoleRank(selectedProfile.role) > 1) {
      selectedCharacterProfileId.value = ''
    }
  }
}

function getStepNodeLeft(step: ProductionStep) {
  if (step === 'shot') {
    return NODE_LEFT
  }

  if (step === 'image') {
    return NODE_LEFT + SHOT_NODE_WIDTH + CHAIN_LINE_WIDTH
  }

  if (step === 'videoPrompt') {
    return NODE_LEFT + SHOT_NODE_WIDTH + CHAIN_LINE_WIDTH * 2 + IMAGE_NODE_WIDTH
  }

  return NODE_LEFT + SHOT_NODE_WIDTH + CHAIN_LINE_WIDTH * 3 + IMAGE_NODE_WIDTH + PROMPT_NODE_WIDTH
}

function getStepNodeWidth(step: ProductionStep) {
  if (step === 'shot') {
    return SHOT_NODE_WIDTH
  }

  if (step === 'image') {
    return IMAGE_NODE_WIDTH
  }

  if (step === 'videoPrompt') {
    return PROMPT_NODE_WIDTH
  }

  return VIDEO_NODE_WIDTH
}

function getChainNodeStyle(width: number): CSSProperties {
  return {
    width: `${width}px`,
  }
}

function getCanvasNodeKey(shotId: string, step: ProductionStep) {
  return `${shotId}:${step}`
}

function getCanvasCharacterNodeKey(profileId: string) {
  return `character:${profileId}`
}

function getCanvasInputPoint(node: CanvasNodeGeometry) {
  return {
    x: node.x,
    y: node.y + node.height / 2,
  }
}

function getCanvasOutputPoint(node: CanvasNodeGeometry) {
  return {
    x: node.x + node.width,
    y: node.y + node.height / 2,
  }
}

function getCanvasEdgePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const curve = Math.max(80, Math.abs(to.x - from.x) * 0.45)

  return `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`
}

function getConnectionPath(connection: CanvasConnection) {
  const from = canvasNodeGeometries.value[connection.from]
  const to = canvasNodeGeometries.value[connection.to]
  if (!from || !to) {
    return ''
  }

  return getCanvasEdgePath(getCanvasOutputPoint(from), getCanvasInputPoint(to))
}

function getEditingNodeKey(shot: ChapterShot, step: ProductionStep) {
  return getCanvasNodeKey(shot.id, step)
}

function isShotStepEditing(shot: ChapterShot, step: ProductionStep) {
  return editingNodeKey.value === getEditingNodeKey(shot, step)
}

function closeEditingPopover() {
  editingNodeKey.value = ''
}

function handleNodeEditorVisibilityChange(show: boolean) {
  if (!show) {
    closeEditingPopover()
  }
}

function updateShotNodeHeight(shotId: string, element: HTMLElement) {
  const height = Math.max(NODE_MIN_HEIGHT, Math.ceil(element.offsetHeight))

  if (shotNodeHeights.value[shotId] === height) {
    return
  }

  shotNodeHeights.value = {
    ...shotNodeHeights.value,
    [shotId]: height,
  }
}

function ensureShotNodeResizeObserver() {
  if (shotNodeResizeObserver || typeof ResizeObserver === 'undefined') {
    return
  }

  shotNodeResizeObserver = new ResizeObserver((entries) => {
    let nextHeights = shotNodeHeights.value
    let hasChanges = false

    entries.forEach((entry) => {
      const element = entry.target as HTMLElement
      const shotId = shotNodeIds.get(element)

      if (!shotId) {
        return
      }

      const height = Math.max(NODE_MIN_HEIGHT, Math.ceil(element.offsetHeight))

      if (nextHeights[shotId] !== height) {
        if (!hasChanges) {
          nextHeights = { ...nextHeights }
          hasChanges = true
        }

        nextHeights[shotId] = height
      }
    })

    if (hasChanges) {
      shotNodeHeights.value = nextHeights
    }
  })
}

function setShotNodeElement(shotId: string, value: unknown) {
  const existingElement = shotNodeElements.get(shotId)

  if (existingElement && existingElement !== value) {
    shotNodeResizeObserver?.unobserve(existingElement)
    shotNodeElements.delete(shotId)
    shotNodeIds.delete(existingElement)
  }

  if (!(value instanceof HTMLElement)) {
    return
  }

  ensureShotNodeResizeObserver()
  shotNodeElements.set(shotId, value)
  shotNodeIds.set(value, shotId)
  shotNodeResizeObserver?.observe(value)
  updateShotNodeHeight(shotId, value)
}

function refreshShotNodeHeights() {
  shotNodeElements.forEach((element, shotId) => {
    updateShotNodeHeight(shotId, element)
  })
}

function setZoom(nextZoom: number, anchor?: { x: number; y: number }) {
  const viewport = canvasViewport.value
  const currentZoom = zoom.value
  const nextValue = Math.min(1.2, Math.max(0.58, Number(nextZoom.toFixed(2))))

  if (nextValue === currentZoom) {
    return
  }

  const anchorPoint = anchor ?? {
    x: (viewport?.clientWidth ?? 0) / 2,
    y: (viewport?.clientHeight ?? 0) / 2,
  }
  const worldPoint = {
    x: (anchorPoint.x - canvasPan.value.x) / currentZoom,
    y: (anchorPoint.y - canvasPan.value.y) / currentZoom,
  }

  zoom.value = nextValue
  canvasPan.value = {
    x: anchorPoint.x - worldPoint.x * nextValue,
    y: anchorPoint.y - worldPoint.y * nextValue,
  }
}

function zoomIn() {
  setZoom(zoom.value + 0.08)
}

function zoomOut() {
  setZoom(zoom.value - 0.08)
}

function centerFirstNode() {
  const viewport = canvasViewport.value

  if (!viewport) {
    return
  }

  const focusLeft = canvasCharacterNodes.value.length ? CHARACTER_NODE_LEFT : NODE_LEFT
  const focusRight = NODE_LEFT + SHOT_NODE_WIDTH
  const focusWidth = focusRight - focusLeft

  canvasPan.value = {
    x: (viewport.clientWidth - focusWidth * zoom.value) / 2 - focusLeft * zoom.value,
    y: 72 - NODE_TOP * zoom.value,
  }
}

function startCanvasPan(event: PointerEvent) {
  const viewport = canvasViewport.value
  const target = event.target as HTMLElement
  const isMiddleButton = event.button === 1
  const activeNode = target.closest('.chapter-canvas-node--active')
  const node = target.closest('.chapter-canvas-node')
  const nodeCard = target.closest('.chapter-canvas-node-card')
  const isEditingTarget = Boolean(target.closest('input, textarea, button, select, [contenteditable="true"]'))
  const isNodeBlankArea = Boolean(node && !nodeCard)
  const canPrimaryDrag =
    event.button === 0 && !isEditingTarget && (isNodeBlankArea || !node || activeNode || !isNodeEditMode.value)

  if (!viewport || (!isMiddleButton && !canPrimaryDrag)) {
    return
  }

  if (isMiddleButton) {
    event.preventDefault()
  }

  isPanPending.value = true
  isPanning.value = isMiddleButton
  panStart.value = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    panX: canvasPan.value.x,
    panY: canvasPan.value.y,
  }

  if (isMiddleButton) {
    viewport.setPointerCapture(event.pointerId)
  }
}

function moveCanvasPan(event: PointerEvent) {
  const viewport = canvasViewport.value

  if (!viewport || !isPanPending.value || panStart.value.pointerId !== event.pointerId) {
    return
  }

  const deltaX = event.clientX - panStart.value.x
  const deltaY = event.clientY - panStart.value.y

  if (!isPanning.value) {
    const distance = Math.hypot(deltaX, deltaY)

    if (distance < PAN_START_THRESHOLD) {
      return
    }

    isPanning.value = true
    event.preventDefault()

    if (!viewport.hasPointerCapture(event.pointerId)) {
      viewport.setPointerCapture(event.pointerId)
    }
  }

  canvasPan.value = {
    x: panStart.value.panX + deltaX,
    y: panStart.value.panY + deltaY,
  }
}

function stopCanvasPan(event: PointerEvent) {
  const viewport = canvasViewport.value

  if (!viewport || (!isPanPending.value && !isPanning.value)) {
    return
  }

  isPanPending.value = false
  isPanning.value = false

  if (panStart.value.pointerId === event.pointerId && viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId)
  }
}

function handleCanvasWheel(event: WheelEvent) {
  if (!event.ctrlKey) {
    return
  }

  event.preventDefault()
  const rect = canvasViewport.value?.getBoundingClientRect()
  setZoom(zoom.value + (event.deltaY > 0 ? -0.06 : 0.06), {
    x: event.clientX - (rect?.left ?? 0),
    y: event.clientY - (rect?.top ?? 0),
  })
}

function openRoleSettingsPage() {
  if (!novel.value) {
    return
  }

  openCharacterWorkspaceWindow(router, {
    scriptId: novel.value.id,
    title: `角色工作台 · ${novel.value.title}`,
  })
}

function toggleAssetLibrary() {
  isAssetLibraryOpen.value = !isAssetLibraryOpen.value
}

function setNodeEditMode(value: boolean) {
  isNodeEditMode.value = value

  if (!value) {
    closeEditingPopover()
  }
}

function openCanvasAssetPicker(type: CanvasAssetType) {
  if (uploadingAssetType.value) {
    return
  }

  assetUploadError.value = ''

  if (type === 'text') {
    textAssetInput.value?.click()
    return
  }

  if (type === 'image') {
    imageAssetInput.value?.click()
    return
  }

  videoAssetInput.value?.click()
}

async function handleCanvasAssetFileChange(event: Event, type: CanvasAssetType) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])

  if (!novel.value || files.length === 0) {
    return
  }

  assetUploadError.value = ''
  uploadingAssetType.value = type

  try {
    for (const file of files) {
      await canvasAssets.addAsset({
        novelId: novel.value.id,
        type,
        file,
      })
    }
  } catch (error) {
    assetUploadError.value = error instanceof Error ? error.message : '上传失败，请重新选择文件。'
  } finally {
    uploadingAssetType.value = ''
    input.value = ''
  }
}

function getShotCharacterReferences(shot: ChapterShot) {
  const references = shot.characterProfileIds
    .map((profileId) => getCharacterAssetForProfile(profileId))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))

  findCharacterAssetsForNames(shot.characters, novelCharacterAssets.value).forEach((asset) => {
    if (!references.some((item) => item.id === asset.id)) {
      references.push(asset)
    }
  })

  return references
}

function getShotMissingCharacters(shot: ChapterShot) {
  return shot.characters.filter((name) => !hasShotCharacterReference(shot, name))
}

function hasShotCharacterReference(shot: ChapterShot, name: string) {
  if (getMissingCharacterNames([name], novelCharacterAssets.value).length === 0) {
    return true
  }

  const normalizedName = normalizeCharacterName(name)

  return shot.characterProfileIds.some((profileId) => {
    const profile = characterProfiles.value.find((item) => item.id === profileId)

    if (!profile || !getCharacterAssetForProfile(profileId)) {
      return false
    }

    if (normalizedName === '主角') {
      return profile.role === '主角'
    }

    if (normalizedName === '男主' || normalizedName === '女主') {
      const genderKeyword = normalizedName === '男主' ? '男' : '女'

      return profile.role === '主角' && profile.gender.includes(genderKeyword)
    }

    const normalizedProfileName = normalizeCharacterName(profile.name)

    if (!normalizedProfileName) {
      return false
    }

    return (
      normalizedProfileName === normalizedName ||
      normalizedProfileName.includes(normalizedName) ||
      normalizedName.includes(normalizedProfileName)
    )
  })
}

function selectCharacterNode(profileId: string) {
  selectedCharacterProfileId.value = profileId
  selectedShotId.value = ''
  editingNodeKey.value = ''
}

function selectShotStep(shot: ChapterShot, step: ProductionStep) {
  selectedCharacterProfileId.value = ''

  if (isNodeEditMode.value) {
    editShotStep(shot, step)
    return
  }

  selectedShotId.value = shot.id
  selectedProductionStep.value = step
  editingNodeKey.value = ''
}

function editShotStep(shot: ChapterShot, step: ProductionStep) {
  selectedCharacterProfileId.value = ''
  selectedShotId.value = shot.id
  selectedProductionStep.value = step
  editingNodeKey.value = getEditingNodeKey(shot, step)
}

function isImageGenerated(shot: ChapterShot) {
  return generatedImageShotIds.value.includes(shot.id)
}

function getGeneratedShotImage(shot: ChapterShot) {
  return chapterProductionKey.value ? dramaProduction.getGeneratedShotImage(chapterProductionKey.value, shot.id) : ''
}

function getGeneratedShotImageUrl(shot: ChapterShot) {
  return chapterProductionKey.value ? dramaProduction.getGeneratedShotImageUrl(chapterProductionKey.value, shot.id) : ''
}

function isImageGenerating(shot: ChapterShot) {
  return generatingImageShotIds.value.includes(shot.id)
}

function getImageGenerationError(shot: ChapterShot) {
  return imageGenerationErrors.value[shot.id] ?? ''
}

function isVideoPromptGenerated(shot: ChapterShot) {
  return generatedVideoPromptShotIds.value.includes(shot.id) || getShotPromptDraft(shot).videoPrompt.trim().length > 0
}

function isVideoPromptGenerating(shot: ChapterShot) {
  return generatingVideoPromptShotIds.value.includes(shot.id)
}

function isPendingVideoTaskStatus(status?: string) {
  return status === 'submitted' || status === 'queued' || status === 'pending' || status === 'in_progress'
}

function isVideoGenerated(shot: ChapterShot) {
  const video = getGeneratedShotVideo(shot)

  return Boolean(video?.videoUrl) || (!video && generatedVideoShotIds.value.includes(shot.id))
}

function getGeneratedShotVideo(shot: ChapterShot) {
  return chapterProductionKey.value ? dramaProduction.getGeneratedShotVideo(chapterProductionKey.value, shot.id) : null
}

function isVideoGenerating(shot: ChapterShot) {
  const status = getGeneratedShotVideo(shot)?.status

  return generatingVideoShotIds.value.includes(shot.id) || isPendingVideoTaskStatus(status)
}

function isVideoFailed(shot: ChapterShot) {
  const video = getGeneratedShotVideo(shot)

  if (generatingVideoShotIds.value.includes(shot.id)) {
    return false
  }

  return (
    failedVideoShotIds.value.includes(shot.id) ||
    video?.status === 'failed' ||
    video?.status === 'cancelled' ||
    (video?.status === 'completed' && !video.videoUrl)
  )
}

function getVideoGenerationError(shot: ChapterShot) {
  const localError = videoGenerationErrors.value[shot.id]

  return localError !== undefined ? localError : getGeneratedShotVideo(shot)?.errorMessage || ''
}

function getVideoPromptGenerationError(shot: ChapterShot) {
  return videoPromptGenerationErrors.value[shot.id] ?? ''
}

function getVideoStatusText(shot: ChapterShot) {
  if (isVideoFailed(shot) || getVideoGenerationError(shot)) {
    return '生成失败'
  }

  const video = getGeneratedShotVideo(shot)

  if (generatingVideoShotIds.value.includes(shot.id)) {
    return '正在提交'
  }

  if (video?.status === 'pending' || video?.status === 'submitted' || video?.status === 'queued') {
    return '排队中'
  }

  if (video?.status === 'in_progress' || isVideoGenerating(shot)) {
    return '生成中'
  }

  if (video?.videoUrl) {
    return '已生成'
  }

  if (video?.taskId) {
    return '任务已提交'
  }

  return isVideoGenerated(shot) ? '已生成' : '等待生成'
}

type VideoStatusTagType = 'default' | 'info' | 'success' | 'warning' | 'error'

function getVideoStatusTagType(shot: ChapterShot): VideoStatusTagType {
  const status = getGeneratedShotVideo(shot)?.status

  if (isVideoFailed(shot) || getVideoGenerationError(shot)) {
    return 'error'
  }

  if (status === 'pending' || status === 'submitted' || status === 'queued') {
    return 'warning'
  }

  if (isVideoGenerating(shot)) {
    return 'info'
  }

  return isVideoGenerated(shot) ? 'success' : 'default'
}

function getFirstFrameStatusText(shot: ChapterShot) {
  if (getImageGenerationError(shot)) {
    return '生成失败'
  }

  if (isImageGenerating(shot)) {
    return '生成中'
  }

  return isImageGenerated(shot) ? '已生成' : '等待生成'
}

function getVideoPromptText(shot: ChapterShot) {
  if (getVideoPromptGenerationError(shot)) {
    return '生成失败'
  }

  if (isVideoPromptGenerating(shot)) {
    return '生成中'
  }

  if (isVideoPromptGenerated(shot)) {
    return getShotPromptDraft(shot).videoPrompt
  }

  return isImageGenerated(shot) ? '等待生成' : '先完成首帧'
}

function getShotNodeCardClass(shot: ChapterShot) {
  return {
    'chapter-canvas-node-card--video-prompt': isVideoPromptGenerated(shot),
    'chapter-canvas-node-card--video-ready': isVideoGenerated(shot),
    'chapter-canvas-node-card--video-generating': isVideoGenerating(shot),
    'chapter-canvas-node-card--video-failed': isVideoFailed(shot),
  }
}

function addGeneratingId(ids: string[], shotId: string) {
  return ids.includes(shotId) ? ids : [...ids, shotId]
}

function removeGeneratingId(ids: string[], shotId: string) {
  return ids.filter((id) => id !== shotId)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '生成失败，请稍后重试。'
}

async function generateImage(shot: ChapterShot, _delay = 700, force = false) {
  if (
    !chapterProductionKey.value ||
    !aiSettings.canUseAiHubMix ||
    (!force && isImageGenerated(shot)) ||
    isImageGenerating(shot)
  ) {
    return
  }

  if (force) {
    dramaProduction.clearShotVideoPipeline(chapterProductionKey.value, shot.id)
    updateShotPromptDraft(shot, 'videoPrompt', '')
    generatingVideoPromptShotIds.value = removeGeneratingId(generatingVideoPromptShotIds.value, shot.id)
    generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
    failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
    videoPromptGenerationErrors.value = { ...videoPromptGenerationErrors.value, [shot.id]: '' }
  }

  imageGenerationErrors.value = {
    ...imageGenerationErrors.value,
    [shot.id]: '',
  }
  generatingImageShotIds.value = addGeneratingId(generatingImageShotIds.value, shot.id)

  try {
    const draft = getShotPromptDraft(shot)
    const firstFramePrompt = draft.firstFramePrompt || createFirstFramePromptFromDraft(shot)
    const prompt = ensureVisualStylePrompt(
      [firstFramePrompt, draft.imageStyle ? `风格补充：${draft.imageStyle}` : ''].filter(Boolean).join('\n'),
    )
    const result = await generateAiImage({
      apiKey: aiSettings.aihubmixApiKey,
      appCode: aiSettings.aihubmixAppCode,
      model: imageModelName.value,
      aspectRatio: draft.imageAspectRatio,
      resolution: draft.imageResolution,
      style: draft.imageStyle,
      source: 'storyboard-first-frame',
      prompt,
      rawPrompt: firstFramePrompt,
      referenceImages: getShotCharacterReferences(shot)
        .map((character) => character.referenceImageDataUrl)
        .slice(0, 4),
    })

    if (!generatingImageShotIds.value.includes(shot.id)) {
      return
    }

    dramaProduction.markShotImageGenerated(
      chapterProductionKey.value,
      shot.id,
      result.imageDataUrl,
      result.imageUrl || '',
    )
    generatingImageShotIds.value = removeGeneratingId(generatingImageShotIds.value, shot.id)
    if (selectedShot.value?.id === shot.id) {
      selectedProductionStep.value = 'videoPrompt'
    }
  } catch (error) {
    imageGenerationErrors.value = {
      ...imageGenerationErrors.value,
      [shot.id]: getErrorMessage(error),
    }
    generatingImageShotIds.value = removeGeneratingId(generatingImageShotIds.value, shot.id)
  }
}

function enhanceSelectedFirstFrame() {
  if (
    !selectedShot.value ||
    selectedFirstFramePrompt.value.trim().length === 0 ||
    isImageGenerating(selectedShot.value)
  ) {
    return
  }

  const currentPrompt = selectedFirstFramePrompt.value.trim()

  if (!currentPrompt.includes(FIRST_FRAME_TENSION_PROMPT)) {
    updateShotPromptDraft(
      selectedShot.value,
      'firstFramePrompt',
      [currentPrompt, FIRST_FRAME_TENSION_PROMPT].filter(Boolean).join('\n'),
    )
  }

  selectedProductionStep.value = 'image'
  void generateImage(selectedShot.value, 700, true)
}

async function generateVideoPrompt(shot: ChapterShot, force = false) {
  if (
    !chapterProductionKey.value ||
    !isImageGenerated(shot) ||
    !aiSettings.canUseAiHubMix ||
    !textModelName.value.trim() ||
    (!force && isVideoPromptGenerated(shot)) ||
    isVideoPromptGenerating(shot)
  ) {
    return
  }

  videoPromptGenerationErrors.value = {
    ...videoPromptGenerationErrors.value,
    [shot.id]: '',
  }
  generatingVideoPromptShotIds.value = addGeneratingId(generatingVideoPromptShotIds.value, shot.id)

  try {
    const draft = getShotPromptDraft(shot)
    const prompt = await generateVideoPromptWithAi({
      apiKey: aiSettings.aihubmixApiKey,
      appCode: aiSettings.aihubmixAppCode,
      model: textModelName.value,
      title: shot.title,
      scene: draft.scene,
      firstFrame: draft.firstFramePrompt || createFirstFramePromptFromDraft(shot),
      characters: draft.characters,
      narration: draft.narration,
      camera: draft.camera,
      extra: draft.extra,
      durationSeconds: shot.durationSeconds,
    })

    if (!generatingVideoPromptShotIds.value.includes(shot.id)) {
      return
    }

    updateShotPromptDraft(shot, 'videoPrompt', prompt)
    await persistShotPromptDraftsNow()
    dramaProduction.markShotVideoPromptGenerated(chapterProductionKey.value, shot.id)
    generatingVideoPromptShotIds.value = removeGeneratingId(generatingVideoPromptShotIds.value, shot.id)
    if (selectedShot.value?.id === shot.id) {
      selectedProductionStep.value = 'video'
    }
  } catch (error) {
    videoPromptGenerationErrors.value = {
      ...videoPromptGenerationErrors.value,
      [shot.id]: getErrorMessage(error),
    }
    generatingVideoPromptShotIds.value = removeGeneratingId(generatingVideoPromptShotIds.value, shot.id)
  }
}

function createVideoReferenceBundle(
  shot: ChapterShot,
  config: CanvasVideoGenerationConfig,
  firstFrameImage: string,
): VideoReferenceBundle {
  const content: AiVideoReferenceContent[] = []
  const seenReferences = new Set<string>()
  const imageReferenceNotes: string[] = []
  const videoReferenceNotes: string[] = []
  const audioReferenceNotes: string[] = []
  let imageIndex = 0
  let videoIndex = 0
  let audioIndex = 0

  const normalizedFirstFrameImage = firstFrameImage.trim()
  if (normalizedFirstFrameImage) {
    seenReferences.add(`image_url:${normalizedFirstFrameImage}`)
    imageIndex += 1
    imageReferenceNotes.push(
      `Image ${imageIndex}：第二步已生成的当前分镜首帧。必须作为视频第一帧和主要视觉锚点，延续其中的构图、场景、角色、服装、材质与光影。`,
    )
  }

  getShotCharacterReferences(shot).forEach((character) => {
    const url = character.referenceImageDataUrl.trim()
    const referenceKey = `image_url:${url}`

    if (!url || seenReferences.has(referenceKey)) {
      return
    }

    seenReferences.add(referenceKey)
    imageIndex += 1
    content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
    imageReferenceNotes.push(
      `Image ${imageIndex}：角色“${character.name}”的已选角色图。用于锁定该角色的脸型、五官、发型、服装、体态与材质，不要换脸或变装。`,
    )
  })

  config.references.forEach((reference) => {
    const url = reference.url.trim()
    const referenceKey = `${reference.type}:${url}`

    if (!url || seenReferences.has(referenceKey)) {
      return
    }

    seenReferences.add(referenceKey)

    if (reference.type === 'image_url') {
      imageIndex += 1
      content.push({ type: reference.type, image_url: { url }, role: 'reference_image' })
      imageReferenceNotes.push(`Image ${imageIndex}：用户在视频生成步骤添加的额外参考图片。`)
      return
    }

    if (reference.type === 'video_url') {
      videoIndex += 1
      content.push({ type: reference.type, video_url: { url }, role: 'reference_video' })
      videoReferenceNotes.push(`Video ${videoIndex}：用户添加的参考视频，用于镜头运动、动作或节奏参考。`)
      return
    }

    audioIndex += 1
    content.push({ type: reference.type, audio_url: { url }, role: 'reference_audio' })
    audioReferenceNotes.push(`Audio ${audioIndex}：用户添加的参考音频，用于声音或节奏参考。`)
  })

  const promptGuide = [
    '【Seedance 参考素材映射（必须执行）】',
    ...imageReferenceNotes,
    ...videoReferenceNotes,
    ...audioReferenceNotes,
    '第三步视频提示词决定动作、表演、镜头和节奏；以上图片用于保持首帧与角色一致性。不要把参考图片做成拼贴、分屏或画中画。',
  ].join('\n')

  return { content, promptGuide }
}

function createVideoSubmissionPrompt(shot: ChapterShot, promptGuide: string) {
  const savedVideoPrompt = getShotPromptDraft(shot).videoPrompt.trim()

  return ensureVisualStylePrompt(
    [`【第三步已保存的视频提示词（生成时必须完整执行）】\n${savedVideoPrompt}`, promptGuide].join('\n\n'),
  )
}

function getPendingVideoTaskShots() {
  return shots.value.filter((shot) => {
    const video = getGeneratedShotVideo(shot)

    return Boolean(video?.taskId && !video.videoUrl && isPendingVideoTaskStatus(video.status))
  })
}

function clearVideoTaskPollTimer() {
  if (videoTaskPollTimer !== null) {
    clearTimeout(videoTaskPollTimer)
    videoTaskPollTimer = null
  }
}

function scheduleVideoTaskPolling(delay = VIDEO_TASK_POLL_INTERVAL_MS) {
  clearVideoTaskPollTimer()

  if (!aiSettings.hasApiKey || !getPendingVideoTaskShots().length) {
    return
  }

  videoTaskPollTimer = setTimeout(() => {
    videoTaskPollTimer = null
    void refreshPendingVideoTasks()
  }, delay)
}

async function refreshPendingVideoTasks() {
  if (isRefreshingVideoTasks.value || !chapterProductionKey.value || !aiSettings.hasApiKey) {
    return
  }

  const pendingShots = getPendingVideoTaskShots()
  if (!pendingShots.length) {
    clearVideoTaskPollTimer()
    return
  }

  isRefreshingVideoTasks.value = true

  try {
    const tasks = await getAiVideoTasks({
      apiKey: aiSettings.aihubmixApiKey,
      appCode: aiSettings.aihubmixAppCode,
      tasks: pendingShots.map((shot) => {
        const video = getGeneratedShotVideo(shot)

        return {
          taskId: video?.taskId ?? '',
          model: video?.model || videoModelName.value,
        }
      }),
    })
    const tasksById = new Map(tasks.map((task) => [task.taskId, task]))

    pendingShots.forEach((shot) => {
      const currentVideo = getGeneratedShotVideo(shot)
      const task = currentVideo?.taskId ? tasksById.get(currentVideo.taskId) : undefined

      if (!currentVideo || !task?.found) {
        return
      }

      const completedWithoutOutput = task.status === 'completed' && !task.videoUrl
      const failed = task.status === 'failed' || task.status === 'cancelled' || completedWithoutOutput
      const errorMessage = failed
        ? task.errorMessage || (completedWithoutOutput ? '视频任务已完成，但没有返回可用的视频地址。' : '视频生成任务失败。')
        : ''

      dramaProduction.upsertShotVideoTask(chapterProductionKey.value, shot.id, {
        videoUrl: task.videoUrl,
        taskId: task.taskId,
        status: completedWithoutOutput ? 'failed' : task.status,
        model: task.model || currentVideo.model,
        ratio: currentVideo.ratio,
        resolution: currentVideo.resolution,
        duration: currentVideo.duration,
        watermark: currentVideo.watermark,
        errorMessage,
        createdAt: task.createdAt || currentVideo.createdAt,
        completedAt: task.completedAt || currentVideo.completedAt,
        expiresAt: task.expiresAt || currentVideo.expiresAt,
        rawResponse: task.rawResponse || currentVideo.rawResponse,
      })

      if (failed) {
        failedVideoShotIds.value = addGeneratingId(failedVideoShotIds.value, shot.id)
        videoGenerationErrors.value = { ...videoGenerationErrors.value, [shot.id]: errorMessage }
      } else {
        failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
        videoGenerationErrors.value = { ...videoGenerationErrors.value, [shot.id]: '' }
      }
    })
  } catch {
    // Keep persisted tasks pending. The next polling cycle retries transient query failures.
  } finally {
    isRefreshingVideoTasks.value = false
    scheduleVideoTaskPolling()
  }
}

async function generateVideo(shot: ChapterShot, _delay = 900, force = false) {
  if (
    !chapterProductionKey.value ||
    !isVideoPromptGenerated(shot) ||
    !getGeneratedShotImage(shot) ||
    !aiSettings.hasApiKey ||
    getShotPromptDraft(shot).videoPrompt.trim().length === 0 ||
    (!force && isVideoGenerated(shot)) ||
    isVideoGenerating(shot)
  ) {
    return
  }

  failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
  videoGenerationErrors.value = {
    ...videoGenerationErrors.value,
    [shot.id]: '',
  }
  generatingVideoShotIds.value = addGeneratingId(generatingVideoShotIds.value, shot.id)

  try {
    const videoConfig = getShotVideoConfig(shot)
    const firstFrameImage = getGeneratedShotImage(shot) || getGeneratedShotImageUrl(shot)
    const referenceBundle = createVideoReferenceBundle(shot, videoConfig, firstFrameImage)

    await persistShotPromptDraftsNow()

    const result = await generateAiVideo({
      apiKey: aiSettings.aihubmixApiKey,
      appCode: aiSettings.aihubmixAppCode,
      model: videoModelName.value,
      prompt: createVideoSubmissionPrompt(shot, referenceBundle.promptGuide),
      firstFrameImageUrl: firstFrameImage,
      content: referenceBundle.content,
      ratio: videoConfig.ratio as AiVideoRatio,
      resolution: videoConfig.resolution as AiVideoResolution,
      duration: videoConfig.duration,
      watermark: videoConfig.watermark,
    })

    if (!generatingVideoShotIds.value.includes(shot.id)) {
      return
    }

    dramaProduction.upsertShotVideoTask(chapterProductionKey.value, shot.id, {
      videoUrl: result.videoUrl,
      taskId: result.taskId,
      status: result.status,
      model: result.model,
      ratio: result.ratio,
      resolution: result.resolution,
      duration: result.duration,
      watermark: videoConfig.watermark,
      errorMessage: '',
      rawResponse: result.rawResponse,
    })
    generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
    scheduleVideoTaskPolling(result.videoUrl ? VIDEO_TASK_POLL_INTERVAL_MS : 1200)
  } catch (error) {
    failedVideoShotIds.value = addGeneratingId(failedVideoShotIds.value, shot.id)
    videoGenerationErrors.value = {
      ...videoGenerationErrors.value,
      [shot.id]: getErrorMessage(error),
    }
    generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
  }
}

function generateSelectedAsset() {
  if (!selectedShot.value || selectedGenerateDisabled.value) {
    return
  }

  if (selectedProductionStep.value === 'shot') {
    return
  }

  if (selectedProductionStep.value === 'image') {
    void generateImage(selectedShot.value, 700, true)
    return
  }

  if (selectedProductionStep.value === 'videoPrompt') {
    void generateVideoPrompt(selectedShot.value, true)
    return
  }

  void generateVideo(selectedShot.value, 900, true)
}

function closeWindow() {
  void persistShotPromptDraftsNow().finally(() => window.close())
}

onMounted(async () => {
  await library.loadLibrary()
  await characterAssets.loadAssets()
  await canvasAssets.loadAssets()
  await aiSettings.loadProviderDefaults()
  await storyboardDraft.loadDrafts()
  dramaProduction.loadState()
  await loadShotPromptDrafts()
  scheduleVideoTaskPolling(0)
  void nextTick(() => centerFirstNode())
})

onBeforeUnmount(() => {
  shotNodeResizeObserver?.disconnect()
  if (shotPromptDraftSaveTimer !== null) {
    clearTimeout(shotPromptDraftSaveTimer)
    shotPromptDraftSaveTimer = null
  }
  void persistShotPromptDraftsNow()
  clearVideoTaskPollTimer()
})

watch(
  () => shots.value.map((shot) => shot.id).join('|'),
  () => {
    const activeShotIds = new Set(shots.value.map((shot) => shot.id))
    const nextHeights = Object.fromEntries(
      Object.entries(shotNodeHeights.value).filter(([shotId]) => activeShotIds.has(shotId)),
    )

    if (selectedShotId.value && !activeShotIds.has(selectedShotId.value)) {
      selectedShotId.value = ''
      editingNodeKey.value = ''
    }

    if (
      selectedCharacterProfileId.value &&
      !canvasCharacterNodes.value.some((node) => node.profileId === selectedCharacterProfileId.value)
    ) {
      selectedCharacterProfileId.value = ''
    }

    shotNodeHeights.value = nextHeights
    void nextTick(() => refreshShotNodeHeights())
  },
)
</script>

<template>
  <div class="chapter-canvas-view">
    <div v-if="library.isLoading" class="chapter-source-empty">
      <n-empty description="正在加载画布" />
    </div>

    <div v-else-if="!novel || !chapter" class="chapter-source-empty">
      <n-empty description="章节不存在或剧本已移出">
        <template #extra>
          <n-button @click="closeWindow">关闭窗口</n-button>
        </template>
      </n-empty>
    </div>

    <template v-else>
      <aside v-if="isAssetLibraryOpen" class="chapter-canvas-asset-library">
        <n-card class="chapter-canvas-asset-card" size="small" :content-style="{ padding: '12px' }">
          <div class="chapter-canvas-asset-head">
            <strong>资产库</strong>
            <span>{{ canvasAssetCount }} 个资产</span>
          </div>

          <div class="chapter-canvas-asset-upload-row">
            <input
              ref="textAssetInput"
              class="file-input"
              type="file"
              multiple
              accept=".txt,.md,.markdown,.text,text/plain,text/markdown"
              @change="handleCanvasAssetFileChange($event, 'text')"
            />
            <input
              ref="imageAssetInput"
              class="file-input"
              type="file"
              multiple
              accept="image/*"
              @change="handleCanvasAssetFileChange($event, 'image')"
            />
            <input
              ref="videoAssetInput"
              class="file-input"
              type="file"
              multiple
              accept="video/*"
              @change="handleCanvasAssetFileChange($event, 'video')"
            />
            <n-button
              size="small"
              secondary
              :loading="uploadingAssetType === 'text'"
              :disabled="Boolean(uploadingAssetType)"
              @click="openCanvasAssetPicker('text')"
            >
              文本
            </n-button>
            <n-button
              size="small"
              secondary
              :loading="uploadingAssetType === 'image'"
              :disabled="Boolean(uploadingAssetType)"
              @click="openCanvasAssetPicker('image')"
            >
              图片
            </n-button>
            <n-button
              size="small"
              secondary
              :loading="uploadingAssetType === 'video'"
              :disabled="Boolean(uploadingAssetType)"
              @click="openCanvasAssetPicker('video')"
            >
              视频
            </n-button>
          </div>

          <n-text v-if="assetUploadError" class="chapter-canvas-asset-error" depth="3">
            {{ assetUploadError }}
          </n-text>

          <n-empty v-if="canvasAssetCount === 0" description="暂无资产">
            <template #extra>
              <n-button size="small" secondary @click="openCanvasAssetPicker('image')">上传图片</n-button>
            </template>
          </n-empty>

          <div v-else class="chapter-canvas-asset-body">
            <section v-if="novelCharacterAssets.length" class="chapter-canvas-asset-section">
              <span class="chapter-canvas-asset-section-title">角色参考</span>
              <div class="chapter-canvas-asset-grid">
                <div v-for="character in novelCharacterAssets" :key="character.id" class="chapter-canvas-asset-item">
                  <img :src="character.referenceImageDataUrl" :alt="character.name" />
                  <span>{{ character.name }}</span>
                </div>
              </div>
            </section>

            <section v-if="novelCanvasAssets.length" class="chapter-canvas-asset-section">
              <span class="chapter-canvas-asset-section-title">手动上传</span>
              <div class="chapter-canvas-asset-grid">
                <div v-for="asset in novelCanvasAssets" :key="asset.id" class="chapter-canvas-asset-item">
                  <div v-if="asset.type === 'text'" class="chapter-canvas-asset-preview chapter-canvas-asset-preview--text">
                    文
                  </div>
                  <img v-else-if="asset.type === 'image'" :src="asset.dataUrl" :alt="asset.title" />
                  <video v-else :src="asset.dataUrl" muted playsinline preload="metadata" />
                  <span>{{ asset.title }}</span>
                  <em>{{ getCanvasAssetTypeLabel(asset.type) }}</em>
                </div>
              </div>
            </section>
          </div>

          <n-button class="chapter-canvas-asset-manage" size="small" secondary block @click="openRoleSettingsPage">
            管理角色
          </n-button>
        </n-card>
      </aside>

      <main
        ref="canvasViewport"
        class="chapter-canvas-scroll"
        :class="{ 'chapter-canvas-scroll--panning': isPanning }"
        :style="canvasViewportStyle"
        @pointerdown="startCanvasPan"
        @pointermove="moveCanvasPan"
        @pointerup="stopCanvasPan"
        @pointercancel="stopCanvasPan"
        @auxclick.prevent
        @wheel="handleCanvasWheel"
      >
        <section class="chapter-canvas-plane-shell" :style="canvasShellStyle">
          <section class="chapter-canvas-plane" :style="canvasPlaneStyle">
            <svg class="chapter-canvas-connection-layer" height="1" width="1" aria-hidden="true">
              <g v-for="connection in baseConnections" :key="connection.id">
                <path class="chapter-canvas-connection-hit" :d="getConnectionPath(connection)" />
                <path
                  class="chapter-canvas-connection-path"
                  :class="{
                    'chapter-canvas-connection-path--blue': connection.tone === 'blue',
                    'chapter-canvas-connection-path--character': connection.tone === 'character',
                  }"
                  :d="getConnectionPath(connection)"
                />
              </g>
            </svg>
            <svg
              v-if="topConnections.length"
              class="chapter-canvas-connection-layer chapter-canvas-connection-layer--top"
              height="1"
              width="1"
              aria-hidden="true"
            >
              <g v-for="connection in topConnections" :key="`top-${connection.id}`">
                <path class="chapter-canvas-connection-hit" :d="getConnectionPath(connection)" />
                <path
                  class="chapter-canvas-connection-path chapter-canvas-connection-path--active"
                  :class="{
                    'chapter-canvas-connection-path--blue': connection.tone === 'blue',
                    'chapter-canvas-connection-path--character': connection.tone === 'character',
                  }"
                  :d="getConnectionPath(connection)"
                />
              </g>
            </svg>

            <article
              v-for="characterNode in canvasCharacterNodes"
              :key="characterNode.id"
              class="chapter-canvas-node chapter-canvas-character-node"
              :class="{
                'chapter-canvas-node--active': selectedCharacterProfileId === characterNode.profileId,
              }"
              :style="getCharacterNodeStyle(characterNode)"
              @click.stop="selectCharacterNode(characterNode.profileId)"
            >
              <n-card
                class="chapter-canvas-node-card chapter-canvas-character-card"
                :class="{
                  'chapter-canvas-node-card--selected':
                    selectedCharacterProfileId === characterNode.profileId,
                }"
                data-node-label="角色资产"
                size="small"
                :content-style="{ padding: 0 }"
              >
                <div class="chapter-canvas-node-port chapter-canvas-node-port--out" />
                <n-image
                  class="chapter-canvas-character-image"
                  width="100%"
                  :height="CHARACTER_IMAGE_HEIGHT"
                  object-fit="contain"
                  preview-disabled
                  :src="characterNode.imageDataUrl"
                  :alt="`${characterNode.name} 主形象`"
                />
                <div class="chapter-canvas-character-meta">
                  <div>
                    <n-tag size="small" :type="characterNode.role === '主角' ? 'success' : 'default'">
                      {{ characterNode.role }}
                    </n-tag>
                    <n-text depth="3">连接 {{ characterNode.relatedShotIds.length }} 个分镜</n-text>
                  </div>
                  <strong>{{ characterNode.name }}</strong>
                </div>
              </n-card>
            </article>

            <template v-for="(shot, index) in shots" :key="shot.id">
              <div
                class="chapter-canvas-node"
                :class="{ 'chapter-canvas-node--active': selectedShot?.id === shot.id }"
                :data-shot-id="shot.id"
                :style="getShotNodeStyle(index)"
                :ref="(element) => setShotNodeElement(shot.id, element)"
              >
                <n-card
                  class="chapter-canvas-node-card chapter-canvas-node-card--shot"
                  :class="{
                    'chapter-canvas-node-card--selected':
                      selectedShot?.id === shot.id && selectedProductionStep === 'shot',
                  }"
                  data-node-label="分镜文本"
                  :style="getChainNodeStyle(SHOT_NODE_WIDTH)"
                  size="small"
                  @click.stop="selectShotStep(shot, 'shot')"
                  @dblclick.stop="editShotStep(shot, 'shot')"
                >
                  <div
                    v-if="characterConnectedShotIds.has(shot.id)"
                    class="chapter-canvas-node-port chapter-canvas-node-port--in"
                  />
                  <div class="chapter-canvas-node-port chapter-canvas-node-port--out" />

                  <div class="chapter-canvas-shot-head">
                    <n-tag size="small">分镜 {{ shot.index }}</n-tag>
                    <n-text depth="3">{{ shot.durationSeconds }}s</n-text>
                  </div>

                  <strong>{{ shot.title }}</strong>
                  <p>{{ getShotPromptDraft(shot).scene }}</p>

                  <dl>
                    <dt>镜头</dt>
                    <dd>{{ getShotPromptDraft(shot).camera }}</dd>
                    <dt>角色</dt>
                    <dd>
                      <div class="chapter-canvas-character-names">
                        <span
                          v-for="name in shot.characters"
                          :key="name"
                          :class="{ 'chapter-canvas-character-name--missing': !hasShotCharacterReference(shot, name) }"
                        >
                          {{ name }}
                        </span>
                      </div>
                    </dd>
                    <template v-if="getShotPromptDraft(shot).narration">
                      <dt>旁白</dt>
                      <dd>{{ getShotPromptDraft(shot).narration }}</dd>
                    </template>
                    <dt>画面</dt>
                    <dd>{{ getShotPromptDraft(shot).scene }}</dd>
                  </dl>

                  <div v-if="getShotCharacterReferences(shot).length" class="chapter-canvas-reference-strip">
                    <div
                      v-for="character in getShotCharacterReferences(shot)"
                      :key="character.id"
                      class="chapter-canvas-reference-item"
                    >
                      <n-avatar :size="34" :src="character.referenceImageDataUrl" :alt="character.name" object-fit="cover" />
                      <span>{{ character.name }}</span>
                    </div>
                  </div>
                  <n-text
                    v-else-if="getShotMissingCharacters(shot).length"
                    class="chapter-canvas-reference-missing"
                    depth="3"
                  >
                    缺少参考：{{ getShotMissingCharacters(shot).join('、') }}
                  </n-text>

                  <n-modal
                    v-if="isShotStepEditing(shot, 'shot')"
                    :show="true"
                    preset="card"
                    :title="`分镜 ${shot.index} · 文本`"
                    class="chapter-canvas-node-editor-modal"
                    style="width: min(720px, calc(100vw - 48px))"
                    closable
                    :mask-closable="false"
                    @update:show="handleNodeEditorVisibilityChange"
                  >
                    <div class="chapter-canvas-node-editor-body">
                      <label class="chapter-canvas-node-prompt-field">
                      <span>分镜文本</span>
                      <n-input
                        v-model:value="selectedScenePrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        placeholder="调整这一格分镜的画面文本"
                        :autosize="{ minRows: 3, maxRows: 6 }"
                      />
                    </label>
                    <label class="chapter-canvas-node-prompt-field">
                      <span>角色</span>
                      <n-input
                        v-model:value="selectedCharactersPrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        placeholder="角色、外观参考、一致性要求"
                        :autosize="{ minRows: 2, maxRows: 5 }"
                      />
                    </label>
                    <label class="chapter-canvas-node-prompt-field">
                      <span>旁白 / 对白</span>
                      <n-input
                        v-model:value="selectedNarrationPrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        placeholder="这一格需要承接的旁白或对白"
                        :autosize="{ minRows: 2, maxRows: 4 }"
                      />
                    </label>
                    <label class="chapter-canvas-node-prompt-field">
                      <span>镜头</span>
                      <n-input
                        v-model:value="selectedCameraPrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        placeholder="镜头、景别、构图、运动方式"
                        :autosize="{ minRows: 2, maxRows: 4 }"
                      />
                    </label>
                    <label class="chapter-canvas-node-prompt-field">
                      <span>首帧图描述</span>
                      <n-input
                        v-model:value="selectedImagePrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        placeholder="这一格最终要生成的首帧画面"
                        :autosize="{ minRows: 3, maxRows: 6 }"
                      />
                    </label>
                    <label class="chapter-canvas-node-prompt-field">
                      <span>补充要求</span>
                      <n-input
                        v-model:value="selectedExtraPrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        placeholder="首帧风格、情绪、构图、禁用内容"
                        :autosize="{ minRows: 2, maxRows: 4 }"
                      />
                      </label>
                    </div>
                  </n-modal>
                </n-card>

                <div class="chapter-canvas-chain-line" />
                <n-card
                  class="chapter-canvas-node-card chapter-canvas-stage-card chapter-canvas-stage-card--image"
                  :class="{
                    'chapter-canvas-node-card--selected':
                      selectedShot?.id === shot.id && selectedProductionStep === 'image',
                  }"
                  data-node-label="首帧"
                  :style="getChainNodeStyle(IMAGE_NODE_WIDTH)"
                  :content-style="{ padding: 0 }"
                  size="small"
                  @click.stop="selectShotStep(shot, 'image')"
                  @dblclick.stop="editShotStep(shot, 'image')"
                >
                  <div class="chapter-canvas-node-port chapter-canvas-node-port--in" />
                  <div class="chapter-canvas-node-port chapter-canvas-node-port--out" />

                  <div
                    class="chapter-canvas-media-preview chapter-canvas-media-preview--image"
                    :class="{
                      'chapter-canvas-media-preview--ready': isImageGenerated(shot),
                      'chapter-canvas-media-preview--generating': isImageGenerating(shot),
                      'chapter-canvas-media-preview--failed': getImageGenerationError(shot),
                    }"
                    :aria-label="getFirstFrameStatusText(shot)"
                  >
                    <n-image
                      v-if="getGeneratedShotImage(shot)"
                      class="chapter-canvas-generated-image"
                      width="100%"
                      object-fit="contain"
                      :src="getGeneratedShotImage(shot)"
                      :alt="`${shot.title} 首帧图`"
                    />
                    <span v-else-if="isImageGenerating(shot)">图片生成中</span>
                    <span v-else-if="getImageGenerationError(shot)">生成失败</span>
                  </div>
                  <div class="chapter-canvas-media-model" :title="imageModelName">
                    <n-tag size="small"><span>{{ imageModelName }}</span></n-tag>
                  </div>

                  <n-modal
                    v-if="isShotStepEditing(shot, 'image')"
                    :show="true"
                    preset="card"
                    :title="`分镜 ${shot.index} · 首帧`"
                    class="chapter-canvas-node-editor-modal"
                    style="width: min(720px, calc(100vw - 48px))"
                    closable
                    :mask-closable="false"
                    @update:show="handleNodeEditorVisibilityChange"
                  >
                    <div class="chapter-canvas-node-editor-body">
                    <label class="chapter-canvas-node-prompt-field">
                      <span>图片模型</span>
                      <n-input
                        v-model:value="imageModelName"
                        class="chapter-canvas-prompt-input"
                        size="small"
                        clearable
                        placeholder="使用默认图片模型"
                      />
                    </label>
                    <div class="chapter-canvas-image-parameter-grid">
                      <label class="chapter-canvas-node-prompt-field">
                        <span>画幅</span>
                        <n-select
                          v-model:value="selectedImageAspectRatio"
                          size="small"
                          :options="AI_IMAGE_ASPECT_RATIO_OPTIONS"
                        />
                      </label>
                      <label class="chapter-canvas-node-prompt-field">
                        <span>清晰度</span>
                        <n-select
                          v-model:value="selectedImageResolution"
                          size="small"
                          :options="AI_IMAGE_RESOLUTION_OPTIONS"
                        />
                      </label>
                    </div>
                    <label class="chapter-canvas-node-prompt-field">
                      <span>风格补充</span>
                      <n-input
                        v-model:value="selectedImageStyle"
                        class="chapter-canvas-prompt-input"
                        size="small"
                        clearable
                        placeholder="例如：月色薄雾、柔和侧光、东方影视电影感"
                      />
                    </label>
                    <label class="chapter-canvas-node-prompt-field">
                      <span>首帧提示词</span>
                      <n-input
                        v-model:value="selectedFirstFramePrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        placeholder="已从第一步自动带入，可在生成前微调"
                        :autosize="{ minRows: 5, maxRows: 9 }"
                      />
                    </label>
                    <p class="chapter-canvas-node-prompt-note">来自第一步编辑内容，修改第一步后会自动重新带入。</p>
                    <p v-if="getImageGenerationError(shot)" class="chapter-canvas-node-prompt-note chapter-canvas-node-prompt-note--error">
                      {{ getImageGenerationError(shot) }}
                    </p>
                    <div class="chapter-canvas-node-prompt-actions">
                      <n-button
                        size="small"
                        secondary
                        :disabled="selectedFirstFramePrompt.trim().length === 0 || isImageGenerating(shot)"
                        @click="enhanceSelectedFirstFrame"
                      >
                        强化张力
                      </n-button>
                      <n-button
                        size="small"
                        type="primary"
                        :disabled="selectedGenerateDisabled"
                        @click="generateSelectedAsset"
                      >
                        {{ selectedGenerateButtonText }}
                      </n-button>
                    </div>
                    </div>
                  </n-modal>
                </n-card>

                <div class="chapter-canvas-chain-line chapter-canvas-chain-line--blue" />
                <n-card
                  class="chapter-canvas-node-card chapter-canvas-stage-card chapter-canvas-stage-card--prompt"
                  :class="{
                    'chapter-canvas-node-card--selected':
                      selectedShot?.id === shot.id && selectedProductionStep === 'videoPrompt',
                  }"
                  data-node-label="视频提示词"
                  :style="getChainNodeStyle(PROMPT_NODE_WIDTH)"
                  size="small"
                  @click.stop="selectShotStep(shot, 'videoPrompt')"
                  @dblclick.stop="editShotStep(shot, 'videoPrompt')"
                >
                  <div class="chapter-canvas-node-port chapter-canvas-node-port--in" />
                  <div class="chapter-canvas-node-port chapter-canvas-node-port--out" />

                  <div class="chapter-canvas-stage-model" :title="textModelName">
                    <n-tag size="small"><span>{{ textModelName }}</span></n-tag>
                  </div>
                  <p>{{ getVideoPromptText(shot) }}</p>

                  <n-modal
                    v-if="isShotStepEditing(shot, 'videoPrompt')"
                    :show="true"
                    preset="card"
                    :title="`分镜 ${shot.index} · 视频提示词`"
                    class="chapter-canvas-node-editor-modal"
                    style="width: min(720px, calc(100vw - 48px))"
                    closable
                    :mask-closable="false"
                    @update:show="handleNodeEditorVisibilityChange"
                  >
                    <div class="chapter-canvas-node-editor-body">
                    <label class="chapter-canvas-node-prompt-field">
                      <span>文本模型</span>
                      <n-input
                        v-model:value="textModelName"
                        class="chapter-canvas-prompt-input"
                        size="small"
                        clearable
                        placeholder="使用默认文本模型"
                      />
                    </label>
                    <label class="chapter-canvas-node-prompt-field">
                      <span>视频提示词</span>
                      <n-input
                        v-model:value="selectedVideoPrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        placeholder="先由文本模型生成，也可以手动修改"
                        :autosize="{ minRows: 5, maxRows: 9 }"
                      />
                    </label>
                    <p v-if="getVideoPromptGenerationError(shot)" class="chapter-canvas-node-prompt-note chapter-canvas-node-prompt-note--error">
                      {{ getVideoPromptGenerationError(shot) }}
                    </p>
                    <div class="chapter-canvas-node-prompt-actions">
                      <n-tag size="small">{{ textModelName }}</n-tag>
                      <n-button
                        size="small"
                        type="primary"
                        :disabled="selectedGenerateDisabled"
                        @click="generateSelectedAsset"
                      >
                        {{ selectedGenerateButtonText }}
                      </n-button>
                    </div>
                    </div>
                  </n-modal>
                </n-card>

                <div class="chapter-canvas-chain-line chapter-canvas-chain-line--blue" />
                <n-card
                  class="chapter-canvas-node-card chapter-canvas-stage-card chapter-canvas-stage-card--video"
                  :class="[
                    getShotNodeCardClass(shot),
                    {
                      'chapter-canvas-node-card--selected':
                        selectedShot?.id === shot.id && selectedProductionStep === 'video',
                    },
                  ]"
                  data-node-label="视频"
                  :style="getChainNodeStyle(VIDEO_NODE_WIDTH)"
                  :content-style="{ padding: 0 }"
                  size="small"
                  @click.stop="selectShotStep(shot, 'video')"
                  @dblclick.stop="editShotStep(shot, 'video')"
                >
                  <div class="chapter-canvas-node-port chapter-canvas-node-port--in" />

                  <div
                    class="chapter-canvas-media-preview chapter-canvas-media-preview--video"
                    :class="{
                      'chapter-canvas-media-preview--ready': isVideoGenerated(shot),
                      'chapter-canvas-media-preview--generating': isVideoGenerating(shot),
                      'chapter-canvas-media-preview--failed': isVideoFailed(shot),
                    }"
                    :aria-label="getVideoStatusText(shot)"
                  >
                    <video
                      v-if="getGeneratedShotVideo(shot)?.videoUrl"
                      :src="getGeneratedShotVideo(shot)?.videoUrl"
                      controls
                      playsinline
                    />
                    <span v-else-if="isVideoGenerating(shot)">{{ getVideoStatusText(shot) }}</span>
                    <span v-else-if="isVideoFailed(shot)">生成失败</span>
                    <span v-else-if="getGeneratedShotVideo(shot)?.taskId">任务已提交</span>
                  </div>
                  <div class="chapter-canvas-media-model" :title="videoModelName">
                    <n-tag size="small"><span>{{ videoModelName }}</span></n-tag>
                  </div>

                  <n-modal
                    v-if="isShotStepEditing(shot, 'video')"
                    :show="true"
                    preset="card"
                    :title="`分镜 ${shot.index} · 视频`"
                    class="chapter-canvas-node-editor-modal"
                    style="width: min(720px, calc(100vw - 48px))"
                    closable
                    :mask-closable="false"
                    @update:show="handleNodeEditorVisibilityChange"
                  >
                    <n-form
                      class="chapter-canvas-node-editor-body"
                      label-placement="top"
                      size="small"
                      :show-feedback="false"
                    >
                    <n-form-item label="视频模型">
                      <n-select
                        v-model:value="videoModelName"
                        class="chapter-canvas-prompt-input"
                        size="small"
                        :options="AI_VIDEO_MODEL_OPTIONS"
                        placeholder="选择 Seedance 2.0 模型"
                      />
                    </n-form-item>
                    <div class="chapter-canvas-video-parameter-grid">
                      <n-form-item label="画幅">
                        <n-select
                          v-model:value="selectedVideoRatio"
                          size="small"
                          :options="AI_VIDEO_RATIO_OPTIONS"
                        />
                      </n-form-item>
                      <n-form-item label="分辨率">
                        <n-select
                          v-model:value="selectedVideoResolution"
                          size="small"
                          :options="AI_VIDEO_RESOLUTION_OPTIONS"
                        />
                      </n-form-item>
      <n-form-item label="时长（4–15 秒）">
                        <n-input-number
                          v-model:value="selectedVideoDuration"
                          class="chapter-canvas-video-duration-input"
                          size="small"
                          :min="4"
                          :max="15"
                          :step="1"
                          button-placement="both"
                        />
                      </n-form-item>
                      <n-form-item label="添加水印" class="chapter-canvas-video-watermark-field">
                        <n-switch v-model:value="selectedVideoWatermark" size="small" />
                      </n-form-item>
                    </div>
                    <n-form-item label="使用的视频提示词">
                      <n-input
                        :value="selectedVideoPrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        readonly
                        placeholder="先完成视频提示词节点"
                        :autosize="{ minRows: 4, maxRows: 8 }"
                      />
                    </n-form-item>
                    <n-card
                      class="chapter-canvas-video-references"
                      size="small"
                      title="额外参考素材"
                      :header-style="{ padding: '10px 12px 6px', fontSize: '13px' }"
                      :content-style="{ display: 'grid', gap: '10px', padding: '6px 12px 12px' }"
                    >
                      <template #header-extra>
                        <n-text class="chapter-canvas-video-references-hint" depth="3">可选，每行一个地址</n-text>
                      </template>
                      <n-form-item label="参考图片">
                        <n-input
                          v-model:value="selectedReferenceImageUrls"
                          type="textarea"
                          size="small"
                          placeholder="https://example.com/reference.jpg"
                          :autosize="{ minRows: 1, maxRows: 3 }"
                        />
                      </n-form-item>
                      <n-form-item label="参考视频">
                        <n-input
                          v-model:value="selectedReferenceVideoUrls"
                          type="textarea"
                          size="small"
                          placeholder="https://example.com/reference.mp4"
                          :autosize="{ minRows: 1, maxRows: 3 }"
                        />
                      </n-form-item>
                      <n-form-item label="参考音频">
                        <n-input
                          v-model:value="selectedReferenceAudioUrls"
                          type="textarea"
                          size="small"
                          placeholder="https://example.com/reference.mp3"
                          :autosize="{ minRows: 1, maxRows: 3 }"
                        />
                      </n-form-item>
                    </n-card>
                    <p class="chapter-canvas-node-prompt-note">当前分镜首帧会自动作为参考图片，无需重复填写。</p>
                    <p v-if="selectedVideoReferenceError" class="chapter-canvas-node-prompt-note chapter-canvas-node-prompt-note--error">
                      {{ selectedVideoReferenceError }}
                    </p>
                    <div class="chapter-canvas-node-prompt-actions">
                      <n-tag size="small" :type="getVideoStatusTagType(shot)">{{ getVideoStatusText(shot) }}</n-tag>
                      <n-button
                        size="small"
                        type="primary"
                        :disabled="selectedGenerateDisabled"
                        @click="generateSelectedAsset"
                      >
                        {{ selectedGenerateButtonText }}
                      </n-button>
                    </div>
                    <p v-if="getVideoGenerationError(shot)" class="chapter-canvas-node-prompt-note chapter-canvas-node-prompt-note--error">
                      {{ getVideoGenerationError(shot) }}
                    </p>
                    </n-form>
                  </n-modal>
                </n-card>
              </div>
            </template>
          </section>
        </section>
      </main>

      <footer class="chapter-canvas-bottom-tools">
        <div class="chapter-canvas-actions">
          <n-button
            class="chapter-canvas-dark-button chapter-canvas-icon-button"
            size="small"
            secondary
            :class="{ 'chapter-canvas-dark-button--active': isAssetLibraryOpen }"
            title="资产库"
            aria-label="资产库"
            @click="toggleAssetLibrary"
          >
            <span class="chapter-canvas-icon chapter-canvas-icon--asset" aria-hidden="true" />
          </n-button>
          <n-button
            v-if="supportingCharacterNodeCount"
            class="chapter-canvas-dark-button"
            size="small"
            secondary
            :class="{ 'chapter-canvas-dark-button--active': isSupportingCastVisible }"
            :title="isSupportingCastVisible ? '收起配角节点' : '展开配角节点'"
            @click="toggleSupportingCast"
          >
            {{ isSupportingCastVisible ? '收起配角' : `配角 ${supportingCharacterNodeCount}` }}
          </n-button>
          <n-button
            class="chapter-canvas-dark-button chapter-canvas-icon-button"
            size="small"
            secondary
            :class="{ 'chapter-canvas-dark-button--active': !isNodeEditMode }"
            title="抓手工具"
            aria-label="抓手工具"
            @click="setNodeEditMode(false)"
          >
            <span class="chapter-canvas-icon chapter-canvas-icon--hand" aria-hidden="true" />
          </n-button>
          <n-button
            class="chapter-canvas-dark-button chapter-canvas-icon-button"
            size="small"
            secondary
            :class="{ 'chapter-canvas-dark-button--active': isNodeEditMode }"
            title="选择工具"
            aria-label="选择工具"
            @click="setNodeEditMode(true)"
          >
            <span class="chapter-canvas-icon chapter-canvas-icon--select" aria-hidden="true" />
          </n-button>
          <div class="chapter-canvas-zoom">
            <n-button
              class="chapter-canvas-dark-button chapter-canvas-icon-button"
              size="small"
              quaternary
              title="缩小"
              aria-label="缩小"
              @click="zoomOut"
            >
              <span class="chapter-canvas-icon chapter-canvas-icon--minus" aria-hidden="true" />
            </n-button>
            <span>{{ zoomText }}</span>
            <n-button
              class="chapter-canvas-dark-button chapter-canvas-icon-button"
              size="small"
              quaternary
              title="放大"
              aria-label="放大"
              @click="zoomIn"
            >
              <span class="chapter-canvas-icon chapter-canvas-icon--plus" aria-hidden="true" />
            </n-button>
          </div>
          <n-button
            class="chapter-canvas-dark-button chapter-canvas-icon-button"
            size="small"
            title="关闭"
            aria-label="关闭"
            @click="closeWindow"
          >
            <span class="chapter-canvas-icon chapter-canvas-icon--close" aria-hidden="true" />
          </n-button>
        </div>
      </footer>
    </template>
  </div>
</template>
