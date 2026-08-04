<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { NButton, NCard, NEmpty, NInput, NTag, NText } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import {
  findCharacterAssetsForNames,
  getMissingCharacterNames,
  useCharacterAssetsStore,
} from '../stores/characterAssets'
import { getCanvasAssetTypeLabel, useCanvasAssetsStore, type CanvasAssetType } from '../stores/canvasAssets'
import { createChapterAnalysisKey } from '../stores/chapterAnalysis'
import { createFirstFrameImagePrompt } from '../services/firstFrameImagePrompt'
import { createSeedanceVideoPrompt, getSeedanceVideoModelName } from '../services/seedanceVideoPrompt'
import {
  createChapterProductionKey,
  createChapterShots,
  useDramaProductionStore,
  type ChapterShot,
} from '../stores/dramaProduction'
import { useNovelLibraryStore } from '../stores/novelLibrary'
import { useStoryboardDraftStore } from '../stores/storyboardDraft'

const route = useRoute()
const router = useRouter()
const library = useNovelLibraryStore()
const characterAssets = useCharacterAssetsStore()
const canvasAssets = useCanvasAssetsStore()
const storyboardDraft = useStoryboardDraftStore()
const dramaProduction = useDramaProductionStore()
const generatingImageShotIds = ref<string[]>([])
const generatingVideoPromptShotIds = ref<string[]>([])
const generatingVideoShotIds = ref<string[]>([])
const failedVideoShotIds = ref<string[]>([])
const generationTimers: number[] = []
const canvasViewport = ref<HTMLElement | null>(null)
const textAssetInput = ref<HTMLInputElement | null>(null)
const imageAssetInput = ref<HTMLInputElement | null>(null)
const videoAssetInput = ref<HTMLInputElement | null>(null)
const shotNodeHeights = ref<Record<string, number>>({})
type ProductionStep = 'shot' | 'image' | 'videoPrompt' | 'video'

const selectedShotId = ref('')
const selectedProductionStep = ref<ProductionStep>('shot')
const editingNodeKey = ref('')
const isAssetLibraryOpen = ref(false)
const isNodeEditMode = ref(true)
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
let editingFocusTimer: number | null = null
let lastPointerDownTarget: HTMLElement | null = null

type ShotPromptDraft = {
  scene: string
  image: string
  characters: string
  narration: string
  camera: string
  extra: string
  firstFramePrompt: string
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
  tone: 'default' | 'blue'
}

const shotPromptDrafts = ref<Record<string, ShotPromptDraft>>({})

const NODE_LEFT = 320
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
const FIRST_FRAME_TENSION_PROMPT = '强化张力：情绪更强、动作更明确、光影更有冲突、主体更突出。'
const CANVAS_NODE_STEPS: ProductionStep[] = ['shot', 'image', 'videoPrompt', 'video']

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
const canvasNodeGeometries = computed<Record<string, CanvasNodeGeometry>>(() => {
  const geometries: Record<string, CanvasNodeGeometry> = {}

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
  shots.value.flatMap((shot) => [
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
)
const selectedCanvasNodeKey = computed(() =>
  selectedShotId.value ? getCanvasNodeKey(selectedShotId.value, selectedProductionStep.value) : '',
)
const topConnections = computed(() => {
  if (!selectedCanvasNodeKey.value) {
    return []
  }

  return canvasConnections.value.filter(
    (connection) => connection.from === selectedCanvasNodeKey.value || connection.to === selectedCanvasNodeKey.value,
  )
})
const topConnectionIds = computed(() => new Set(topConnections.value.map((connection) => connection.id)))
const baseConnections = computed(() =>
  canvasConnections.value.filter((connection) => !topConnectionIds.value.has(connection.id)),
)
const canvasHeight = computed(() => {
  const lastLayout = shotLayouts.value[shotLayouts.value.length - 1]

  if (!lastLayout) {
    return MIN_CANVAS_HEIGHT
  }

  return Math.max(MIN_CANVAS_HEIGHT, lastLayout.top + lastLayout.height + NODE_TOP)
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
const videoModelName = getSeedanceVideoModelName()
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
    return selectedFirstFramePrompt.value.trim().length === 0 || isImageGenerating(selectedShot.value)
  }

  if (selectedProductionStep.value === 'videoPrompt') {
    return !isImageGenerated(selectedShot.value) || isVideoPromptGenerating(selectedShot.value)
  }

  return (
    !isVideoPromptGenerated(selectedShot.value) ||
    selectedVideoPrompt.value.trim().length === 0 ||
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
  const shouldResetFirstFramePrompt = shouldResetFromImage && field !== 'firstFramePrompt'

  if (chapterProductionKey.value) {
    if (shouldResetFromImage) {
      dramaProduction.clearShotProductionPipeline(chapterProductionKey.value, shot.id)
      generatingImageShotIds.value = removeGeneratingId(generatingImageShotIds.value, shot.id)
      generatingVideoPromptShotIds.value = removeGeneratingId(generatingVideoPromptShotIds.value, shot.id)
      generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
      failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
    } else if (value.trim().length === 0) {
      dramaProduction.clearShotVideoPipeline(chapterProductionKey.value, shot.id)
      generatingVideoPromptShotIds.value = removeGeneratingId(generatingVideoPromptShotIds.value, shot.id)
      generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
      failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
    } else {
      dramaProduction.clearShotVideoAsset(chapterProductionKey.value, shot.id)
      generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
      failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
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
    scene: draft.scene,
    firstFrameDescription: draft.image,
    characters: draft.characters,
    narration: draft.narration,
    camera: draft.camera,
    extra: draft.extra,
  })
}

function createVideoPromptFromDraft(shot: ChapterShot) {
  const draft = getShotPromptDraft(shot)

  return createSeedanceVideoPrompt({
    title: shot.title,
    scene: draft.scene,
    firstFrame: draft.firstFramePrompt || createFirstFramePromptFromDraft(shot),
    characters: draft.characters,
    narration: draft.narration,
    camera: draft.camera,
    extra: draft.extra,
    durationSeconds: shot.durationSeconds,
  })
}

function getShotNodeStyle(index: number): CSSProperties {
  const layout = shotLayouts.value[index]

  return {
    left: `${NODE_LEFT}px`,
    top: `${layout?.top ?? NODE_TOP}px`,
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

function getNodePromptPopoverStyle(width = 460): CSSProperties {
  const scale = 1 / Math.max(zoom.value, 0.1)

  return {
    transform: `translateX(-50%) scale(${scale})`,
    transformOrigin: 'top center',
    width: `${width}px`,
  }
}

function getEditingNodeKey(shot: ChapterShot, step: ProductionStep) {
  return getCanvasNodeKey(shot.id, step)
}

function isShotStepEditing(shot: ChapterShot, step: ProductionStep) {
  return editingNodeKey.value === getEditingNodeKey(shot, step)
}

function focusEditingInput(shot: ChapterShot, step: ProductionStep) {
  const nodeElement = shotNodeElements.get(shot.id)
  const popover = nodeElement?.querySelector(`[data-editing-step="${step}"]`)
  const input = popover?.querySelector('textarea, input') as HTMLInputElement | HTMLTextAreaElement | null

  if (!input) {
    return
  }

  input.focus({ preventScroll: true })

  if (!input.readOnly && typeof input.setSelectionRange === 'function') {
    const end = input.value.length
    input.setSelectionRange(end, end)
  }
}

function scheduleEditingInputFocus(shot: ChapterShot, step: ProductionStep) {
  if (editingFocusTimer) {
    window.clearTimeout(editingFocusTimer)
  }

  editingFocusTimer = window.setTimeout(() => {
    editingFocusTimer = null
    focusEditingInput(shot, step)
  }, 32)
}

function closeEditingPopover() {
  if (editingFocusTimer) {
    window.clearTimeout(editingFocusTimer)
    editingFocusTimer = null
  }

  editingNodeKey.value = ''
}

function getElementShotId(element: Element | null) {
  return element?.closest<HTMLElement>('.chapter-canvas-node')?.dataset.shotId ?? ''
}

function isInFocusedNode(element: Element | null) {
  const shotId = getElementShotId(element)

  return Boolean(shotId && shotId === selectedShotId.value)
}

function handleCanvasRootPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement
  lastPointerDownTarget = target

  if (!editingNodeKey.value || target.closest('.chapter-canvas-node-prompt-popover') || isInFocusedNode(target)) {
    return
  }

  closeEditingPopover()
}

function handlePromptPopoverFocusOut(event: FocusEvent) {
  const currentTarget = event.currentTarget as HTMLElement
  const nextTarget = event.relatedTarget as Node | null

  if (nextTarget && currentTarget.contains(nextTarget)) {
    return
  }

  const pointerTarget = lastPointerDownTarget
  lastPointerDownTarget = null

  window.setTimeout(() => {
    const activeElement = document.activeElement as HTMLElement | null

    if (
      activeElement &&
      (currentTarget.contains(activeElement) || isInFocusedNode(activeElement))
    ) {
      return
    }

    if (
      pointerTarget &&
      (currentTarget.contains(pointerTarget) || isInFocusedNode(pointerTarget))
    ) {
      return
    }

    closeEditingPopover()
  })
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

  canvasPan.value = {
    x: (viewport.clientWidth - SHOT_NODE_WIDTH * zoom.value) / 2 - NODE_LEFT * zoom.value,
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
  const isEditingTarget = Boolean(
    target.closest('.chapter-canvas-node-prompt-popover, input, textarea, button, select, [contenteditable="true"]'),
  )
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

function openCharactersPage() {
  if (!novel.value) {
    return
  }

  const charactersRoute = router.resolve({
    name: 'script-characters',
    params: {
      scriptId: novel.value.id,
    },
  })
  const routeHash = charactersRoute.href.startsWith('#') ? charactersRoute.href : `#${charactersRoute.href}`

  window.open(routeHash, `script-characters-${novel.value.id}`, 'width=1100,height=780')
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
  return findCharacterAssetsForNames(shot.characters, novelCharacterAssets.value)
}

function getShotMissingCharacters(shot: ChapterShot) {
  return getMissingCharacterNames(shot.characters, novelCharacterAssets.value)
}

function hasShotCharacterReference(name: string) {
  return getMissingCharacterNames([name], novelCharacterAssets.value).length === 0
}

function selectShotStep(shot: ChapterShot, step: ProductionStep) {
  if (isNodeEditMode.value) {
    editShotStep(shot, step)
    return
  }

  selectedShotId.value = shot.id
  selectedProductionStep.value = step
  editingNodeKey.value = ''
}

function editShotStep(shot: ChapterShot, step: ProductionStep) {
  selectedShotId.value = shot.id
  selectedProductionStep.value = step
  editingNodeKey.value = getEditingNodeKey(shot, step)

  void nextTick(() => {
    scheduleEditingInputFocus(shot, step)
  })
}

function isImageGenerated(shot: ChapterShot) {
  return generatedImageShotIds.value.includes(shot.id)
}

function isImageGenerating(shot: ChapterShot) {
  return generatingImageShotIds.value.includes(shot.id)
}

function isVideoPromptGenerated(shot: ChapterShot) {
  return generatedVideoPromptShotIds.value.includes(shot.id)
}

function isVideoPromptGenerating(shot: ChapterShot) {
  return generatingVideoPromptShotIds.value.includes(shot.id)
}

function isVideoGenerated(shot: ChapterShot) {
  return generatedVideoShotIds.value.includes(shot.id)
}

function isVideoGenerating(shot: ChapterShot) {
  return generatingVideoShotIds.value.includes(shot.id)
}

function isVideoFailed(shot: ChapterShot) {
  return failedVideoShotIds.value.includes(shot.id)
}

function getVideoStatusText(shot: ChapterShot) {
  if (isVideoFailed(shot)) {
    return '生成失败'
  }

  if (isVideoGenerating(shot)) {
    return '生成中'
  }

  return isVideoGenerated(shot) ? '已生成' : '等待生成'
}

function getFirstFrameStatusText(shot: ChapterShot) {
  if (isImageGenerating(shot)) {
    return '生成中'
  }

  return isImageGenerated(shot) ? '已生成' : '等待生成'
}

function getVideoPromptText(shot: ChapterShot) {
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

function generateImage(shot: ChapterShot, delay = 700, force = false) {
  if (!chapterProductionKey.value || (!force && isImageGenerated(shot)) || isImageGenerating(shot)) {
    return
  }

  if (force) {
    dramaProduction.clearShotVideoPipeline(chapterProductionKey.value, shot.id)
    updateShotPromptDraft(shot, 'videoPrompt', '')
    generatingVideoPromptShotIds.value = removeGeneratingId(generatingVideoPromptShotIds.value, shot.id)
    generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
    failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
  }

  generatingImageShotIds.value = addGeneratingId(generatingImageShotIds.value, shot.id)
  const timer = window.setTimeout(() => {
    if (!generatingImageShotIds.value.includes(shot.id)) {
      return
    }

    dramaProduction.markShotImageGenerated(chapterProductionKey.value, shot.id)
    generatingImageShotIds.value = removeGeneratingId(generatingImageShotIds.value, shot.id)
    if (selectedShot.value?.id === shot.id) {
      selectedProductionStep.value = 'videoPrompt'
    }
  }, delay)

  generationTimers.push(timer)
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
  generateImage(selectedShot.value, 700, true)
}

function generateVideoPrompt(shot: ChapterShot, delay = 600, force = false) {
  if (
    !chapterProductionKey.value ||
    !isImageGenerated(shot) ||
    (!force && isVideoPromptGenerated(shot)) ||
    isVideoPromptGenerating(shot)
  ) {
    return
  }

  generatingVideoPromptShotIds.value = addGeneratingId(generatingVideoPromptShotIds.value, shot.id)
  const timer = window.setTimeout(() => {
    if (!generatingVideoPromptShotIds.value.includes(shot.id)) {
      return
    }

    updateShotPromptDraft(shot, 'videoPrompt', createVideoPromptFromDraft(shot))
    dramaProduction.markShotVideoPromptGenerated(chapterProductionKey.value, shot.id)
    generatingVideoPromptShotIds.value = removeGeneratingId(generatingVideoPromptShotIds.value, shot.id)
    if (selectedShot.value?.id === shot.id) {
      selectedProductionStep.value = 'video'
    }
  }, delay)

  generationTimers.push(timer)
}

function generateVideo(shot: ChapterShot, delay = 900, force = false) {
  if (
    !chapterProductionKey.value ||
    !isVideoPromptGenerated(shot) ||
    getShotPromptDraft(shot).videoPrompt.trim().length === 0 ||
    (!force && isVideoGenerated(shot)) ||
    isVideoGenerating(shot)
  ) {
    return
  }

  failedVideoShotIds.value = removeGeneratingId(failedVideoShotIds.value, shot.id)
  generatingVideoShotIds.value = addGeneratingId(generatingVideoShotIds.value, shot.id)
  const timer = window.setTimeout(() => {
    if (!generatingVideoShotIds.value.includes(shot.id)) {
      return
    }

    dramaProduction.markShotVideoGenerated(chapterProductionKey.value, shot.id)
    generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
  }, delay)

  generationTimers.push(timer)
}

function generateSelectedAsset() {
  if (!selectedShot.value || selectedGenerateDisabled.value) {
    return
  }

  if (selectedProductionStep.value === 'shot') {
    return
  }

  if (selectedProductionStep.value === 'image') {
    generateImage(selectedShot.value, 700, true)
    return
  }

  if (selectedProductionStep.value === 'videoPrompt') {
    generateVideoPrompt(selectedShot.value, 600, true)
    return
  }

  generateVideo(selectedShot.value, 900, true)
}

function closeWindow() {
  window.close()
}

onMounted(async () => {
  await library.loadLibrary()
  await characterAssets.loadAssets()
  await canvasAssets.loadAssets()
  storyboardDraft.loadDrafts()
  dramaProduction.loadState()
  void nextTick(() => centerFirstNode())
})

onBeforeUnmount(() => {
  if (editingFocusTimer) {
    window.clearTimeout(editingFocusTimer)
    editingFocusTimer = null
  }

  generationTimers.forEach((timer) => window.clearTimeout(timer))
  shotNodeResizeObserver?.disconnect()
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

    shotNodeHeights.value = nextHeights
    void nextTick(() => refreshShotNodeHeights())
  },
)
</script>

<template>
  <div class="chapter-canvas-view" @pointerdown.capture="handleCanvasRootPointerDown">
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

          <n-button class="chapter-canvas-asset-manage" size="small" secondary block @click="openCharactersPage">
            管理资产
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
                  :class="{ 'chapter-canvas-connection-path--blue': connection.tone === 'blue' }"
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
                  :class="{ 'chapter-canvas-connection-path--blue': connection.tone === 'blue' }"
                  :d="getConnectionPath(connection)"
                />
              </g>
            </svg>

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
                          :class="{ 'chapter-canvas-character-name--missing': !hasShotCharacterReference(name) }"
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
                      <img :src="character.referenceImageDataUrl" :alt="character.name" />
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

                  <div
                    v-if="isShotStepEditing(shot, 'shot')"
                    class="chapter-canvas-node-prompt-popover"
                    data-editing-step="shot"
                    :style="getNodePromptPopoverStyle(720)"
                    @focusout="handlePromptPopoverFocusOut"
                    @click.stop
                    @pointerdown.stop
                  >
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
                    }"
                    :aria-label="getFirstFrameStatusText(shot)"
                  />

                  <div
                    v-if="isShotStepEditing(shot, 'image')"
                    class="chapter-canvas-node-prompt-popover"
                    data-editing-step="image"
                    :style="getNodePromptPopoverStyle(680)"
                    @focusout="handlePromptPopoverFocusOut"
                    @click.stop
                    @pointerdown.stop
                  >
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

                  <p>{{ getVideoPromptText(shot) }}</p>

                  <div
                    v-if="isShotStepEditing(shot, 'videoPrompt')"
                    class="chapter-canvas-node-prompt-popover"
                    data-editing-step="videoPrompt"
                    :style="getNodePromptPopoverStyle(760)"
                    @focusout="handlePromptPopoverFocusOut"
                    @click.stop
                    @pointerdown.stop
                  >
                    <label class="chapter-canvas-node-prompt-field">
                      <span>Seedance 提示词</span>
                      <n-input
                        v-model:value="selectedVideoPrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        placeholder="先生成视频提示词，也可以手动修改"
                        :autosize="{ minRows: 5, maxRows: 9 }"
                      />
                    </label>
                    <div class="chapter-canvas-node-prompt-actions">
                      <n-tag size="small">{{ videoModelName }}</n-tag>
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
                  />

                  <div
                    v-if="isShotStepEditing(shot, 'video')"
                    class="chapter-canvas-node-prompt-popover"
                    data-editing-step="video"
                    :style="getNodePromptPopoverStyle(720)"
                    @focusout="handlePromptPopoverFocusOut"
                    @click.stop
                    @pointerdown.stop
                  >
                    <label class="chapter-canvas-node-prompt-field">
                      <span>使用的视频提示词</span>
                      <n-input
                        :value="selectedVideoPrompt"
                        class="chapter-canvas-prompt-input"
                        type="textarea"
                        readonly
                        placeholder="先完成视频提示词节点"
                        :autosize="{ minRows: 4, maxRows: 8 }"
                      />
                    </label>
                    <div class="chapter-canvas-node-prompt-actions">
                      <n-tag size="small">{{ getVideoStatusText(shot) }}</n-tag>
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
