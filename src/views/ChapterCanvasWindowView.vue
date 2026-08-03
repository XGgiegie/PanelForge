<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { NButton, NCard, NEmpty, NInput, NTag, NText } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import {
  findCharacterAssetsForNames,
  getMissingCharacterNames,
  useCharacterAssetsStore,
} from '../stores/characterAssets'
import { createChapterAnalysisKey } from '../stores/chapterAnalysis'
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
const storyboardDraft = useStoryboardDraftStore()
const dramaProduction = useDramaProductionStore()
const generatingImageShotIds = ref<string[]>([])
const generatingVideoPromptShotIds = ref<string[]>([])
const generatingVideoShotIds = ref<string[]>([])
const failedVideoShotIds = ref<string[]>([])
const generationTimers: number[] = []
const canvasViewport = ref<HTMLElement | null>(null)
const shotNodeHeights = ref<Record<string, number>>({})
const selectedShotId = ref('')
const selectedProductionStep = ref<'image' | 'videoPrompt' | 'video'>('image')
const zoom = ref(0.88)
const isPanning = ref(false)
const panStart = ref({
  pointerId: 0,
  x: 0,
  y: 0,
  scrollLeft: 0,
  scrollTop: 0,
})
const shotNodeElements = new Map<string, HTMLElement>()
const shotNodeIds = new WeakMap<HTMLElement, string>()
let shotNodeResizeObserver: ResizeObserver | null = null

type ShotPromptDraft = {
  image: string
  characters: string
  narration: string
  camera: string
  extra: string
  videoPrompt: string
}

type ShotPromptDraftField = keyof ShotPromptDraft

const shotPromptDrafts = ref<Record<string, ShotPromptDraft>>({})

const NODE_LEFT = 120
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
const canvasHeight = computed(() => {
  const lastLayout = shotLayouts.value[shotLayouts.value.length - 1]

  if (!lastLayout) {
    return MIN_CANVAS_HEIGHT
  }

  return Math.max(MIN_CANVAS_HEIGHT, lastLayout.top + lastLayout.height + NODE_TOP)
})
const canvasShellStyle = computed<CSSProperties>(() => ({
  height: `${canvasHeight.value * zoom.value}px`,
  width: `${CANVAS_WIDTH * zoom.value}px`,
}))
const canvasPlaneStyle = computed<CSSProperties>(() => ({
  height: `${canvasHeight.value}px`,
  transform: `scale(${zoom.value})`,
  width: `${CANVAS_WIDTH}px`,
}))
const zoomText = computed(() => `${Math.round(zoom.value * 100)}%`)
const selectedGenerateButtonText = computed(() => {
  if (!selectedShot.value) {
    return '生成'
  }

  if (selectedProductionStep.value === 'image') {
    if (isImageGenerating(selectedShot.value)) {
      return '图片生成中'
    }

    return isImageGenerated(selectedShot.value) ? '重新生成图片' : '生成图片'
  }

  if (selectedProductionStep.value === 'videoPrompt') {
    if (!isImageGenerated(selectedShot.value)) {
      return '先生成图片'
    }

    if (isVideoPromptGenerating(selectedShot.value)) {
      return '提示词生成中'
    }

    return isVideoPromptGenerated(selectedShot.value) ? '重新生成视频提示词' : '生成视频提示词'
  }

  if (!isVideoPromptGenerated(selectedShot.value)) {
    return '先生成视频提示词'
  }

  if (isVideoGenerating(selectedShot.value)) {
    return '视频生成中'
  }

  return isVideoGenerated(selectedShot.value) ? '重新生成视频' : '生成视频'
})
const selectedGenerateDisabled = computed(() => {
  if (!selectedShot.value) {
    return true
  }

  if (selectedProductionStep.value === 'image') {
    return selectedImagePrompt.value.trim().length === 0 || isImageGenerating(selectedShot.value)
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
    videoPrompt: '',
  }
}

function getShotPromptDraft(shot: ChapterShot) {
  return shotPromptDrafts.value[shot.id] ?? createDefaultShotPromptDraft(shot)
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
      ...(shouldResetFromImage ? { videoPrompt: '' } : {}),
    },
  }

  if (shouldResetFromImage && selectedShot.value?.id === shot.id && selectedProductionStep.value !== 'image') {
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

function createVideoPromptFromDraft(shot: ChapterShot) {
  const draft = getShotPromptDraft(shot)

  return [
    `制作 ${shot.durationSeconds}s 竖屏漫剧视频。`,
    `画面：${draft.image}`,
    `角色：${draft.characters}`,
    draft.narration ? `旁白/对白：${draft.narration}` : '',
    `镜头：${draft.camera}`,
    draft.extra ? `补充要求：${draft.extra}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function getShotNodeStyle(index: number): CSSProperties {
  const layout = shotLayouts.value[index]

  return {
    left: `${NODE_LEFT}px`,
    top: `${layout?.top ?? NODE_TOP}px`,
  }
}

function getChainNodeStyle(width: number): CSSProperties {
  return {
    width: `${width}px`,
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

function setZoom(nextZoom: number) {
  zoom.value = Math.min(1.2, Math.max(0.58, Number(nextZoom.toFixed(2))))
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

  viewport.scrollLeft = Math.max(0, NODE_LEFT * zoom.value - (viewport.clientWidth - SHOT_NODE_WIDTH * zoom.value) / 2)
  viewport.scrollTop = Math.max(0, NODE_TOP * zoom.value - 72)
}

function startCanvasPan(event: PointerEvent) {
  const viewport = canvasViewport.value
  const target = event.target as HTMLElement

  if (!viewport || event.button !== 0 || target.closest('.chapter-canvas-node')) {
    return
  }

  isPanning.value = true
  panStart.value = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
  }
  viewport.setPointerCapture(event.pointerId)
}

function moveCanvasPan(event: PointerEvent) {
  const viewport = canvasViewport.value

  if (!viewport || !isPanning.value) {
    return
  }

  viewport.scrollLeft = panStart.value.scrollLeft - (event.clientX - panStart.value.x)
  viewport.scrollTop = panStart.value.scrollTop - (event.clientY - panStart.value.y)
}

function stopCanvasPan(event: PointerEvent) {
  const viewport = canvasViewport.value

  if (!viewport || !isPanning.value) {
    return
  }

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
  setZoom(zoom.value + (event.deltaY > 0 ? -0.06 : 0.06))
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

function getShotCharacterReferences(shot: ChapterShot) {
  return findCharacterAssetsForNames(shot.characters, novelCharacterAssets.value)
}

function getShotMissingCharacters(shot: ChapterShot) {
  return getMissingCharacterNames(shot.characters, novelCharacterAssets.value)
}

function hasShotCharacterReference(name: string) {
  return getMissingCharacterNames([name], novelCharacterAssets.value).length === 0
}

function selectShot(shot: ChapterShot) {
  selectedShotId.value = shot.id
}

function selectShotStep(shot: ChapterShot, step: 'image' | 'videoPrompt' | 'video') {
  selectedShotId.value = shot.id
  selectedProductionStep.value = step
}

function clearSelectedShot() {
  selectedShotId.value = ''
}

function canUseProductionStep(step: 'image' | 'videoPrompt' | 'video') {
  if (!selectedShot.value) {
    return false
  }

  if (step === 'image') {
    return true
  }

  if (step === 'videoPrompt') {
    return isImageGenerated(selectedShot.value)
  }

  return isVideoPromptGenerated(selectedShot.value)
}

function setProductionStep(step: 'image' | 'videoPrompt' | 'video') {
  if (!canUseProductionStep(step)) {
    return
  }

  selectedProductionStep.value = step
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
    return '视频生成失败'
  }

  if (isVideoGenerating(shot)) {
    return '视频生成中'
  }

  return isVideoGenerated(shot) ? '视频已生成' : '等待视频'
}

function shouldShowImageNode(shot: ChapterShot) {
  return isImageGenerated(shot) || isImageGenerating(shot)
}

function shouldShowVideoPromptNode(shot: ChapterShot) {
  return isVideoPromptGenerated(shot) || isVideoPromptGenerating(shot)
}

function shouldShowVideoNode(shot: ChapterShot) {
  return isVideoGenerated(shot) || isVideoGenerating(shot) || isVideoFailed(shot)
}

function getShotNodeCardClass(shot: ChapterShot) {
  return {
    'chapter-canvas-node-card--video-prompt': isVideoPromptGenerated(shot),
    'chapter-canvas-node-card--video-ready': isVideoGenerated(shot),
    'chapter-canvas-node-card--video-generating': isVideoGenerating(shot),
    'chapter-canvas-node-card--video-failed': isVideoFailed(shot),
  }
}

function triggerImageNode(shot: ChapterShot) {
  selectShot(shot)
  selectedProductionStep.value = 'image'
  generateImage(shot, 700, true)
}

function triggerVideoPromptNode(shot: ChapterShot) {
  selectShot(shot)
  selectedProductionStep.value = 'videoPrompt'
  generateVideoPrompt(shot, 600, true)
}

function triggerVideoNode(shot: ChapterShot) {
  selectShot(shot)
  selectedProductionStep.value = 'video'
  generateVideo(shot, 900, true)
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
  storyboardDraft.loadDrafts()
  dramaProduction.loadState()
  void nextTick(() => centerFirstNode())
})

onBeforeUnmount(() => {
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
      <section v-if="selectedShot" class="chapter-canvas-generation-panel">
        <div class="chapter-canvas-generation-menu">
          <div class="chapter-canvas-generation-current">
            <strong>分镜 {{ selectedShot.index }}</strong>
            <span>{{ selectedShot.title }}</span>
          </div>

          <div class="chapter-canvas-generation-tabs">
            <button
              type="button"
              class="chapter-canvas-generation-tab"
              :class="{ 'chapter-canvas-generation-tab--active': selectedProductionStep === 'image' }"
              @click="setProductionStep('image')"
            >
              <span class="chapter-canvas-icon chapter-canvas-icon--image" aria-hidden="true" />
              <span>图片</span>
            </button>
            <button
              type="button"
              class="chapter-canvas-generation-tab"
              :class="{ 'chapter-canvas-generation-tab--active': selectedProductionStep === 'videoPrompt' }"
              :disabled="!canUseProductionStep('videoPrompt')"
              @click="setProductionStep('videoPrompt')"
            >
              <span class="chapter-canvas-step-index">词</span>
              <span>视频提示词</span>
            </button>
            <button
              type="button"
              class="chapter-canvas-generation-tab"
              :class="{ 'chapter-canvas-generation-tab--active': selectedProductionStep === 'video' }"
              :disabled="!canUseProductionStep('video')"
              @click="setProductionStep('video')"
            >
              <span class="chapter-canvas-icon chapter-canvas-icon--video" aria-hidden="true" />
              <span>视频</span>
            </button>
          </div>

          <n-button
            size="small"
            type="primary"
            :disabled="selectedGenerateDisabled"
            @click="generateSelectedAsset"
          >
            {{ selectedGenerateButtonText }}
          </n-button>
          <n-button
            class="chapter-canvas-dark-button chapter-canvas-icon-button"
            size="small"
            title="关闭"
            aria-label="关闭"
            @click="clearSelectedShot"
          >
            <span class="chapter-canvas-icon chapter-canvas-icon--close" aria-hidden="true" />
          </n-button>
        </div>

        <div class="chapter-canvas-field-grid">
          <label class="chapter-canvas-field">
            <span>画面</span>
            <n-input
              v-model:value="selectedImagePrompt"
              class="chapter-canvas-prompt-input"
              type="textarea"
              placeholder="画面内容、场景、构图"
              :autosize="{ minRows: 3, maxRows: 7 }"
            />
          </label>
          <label class="chapter-canvas-field">
            <span>角色</span>
            <n-input
              v-model:value="selectedCharactersPrompt"
              class="chapter-canvas-prompt-input"
              type="textarea"
              placeholder="角色名称、参考图、外观一致性要求"
              :autosize="{ minRows: 3, maxRows: 7 }"
            />
          </label>
          <label class="chapter-canvas-field">
            <span>旁白</span>
            <n-input
              v-model:value="selectedNarrationPrompt"
              class="chapter-canvas-prompt-input"
              type="textarea"
              placeholder="旁白、对白、字幕内容"
              :autosize="{ minRows: 2, maxRows: 5 }"
            />
          </label>
          <label class="chapter-canvas-field">
            <span>镜头</span>
            <n-input
              v-model:value="selectedCameraPrompt"
              class="chapter-canvas-prompt-input"
              type="textarea"
              placeholder="景别、角度、运镜、节奏"
              :autosize="{ minRows: 2, maxRows: 5 }"
            />
          </label>
          <label class="chapter-canvas-field chapter-canvas-field--wide">
            <span>补充要求</span>
            <n-input
              v-model:value="selectedExtraPrompt"
              class="chapter-canvas-prompt-input"
              type="textarea"
              placeholder="额外风格、情绪、禁用内容、修改意见"
              :autosize="{ minRows: 2, maxRows: 5 }"
            />
          </label>
          <label
            v-if="selectedProductionStep !== 'image' || selectedVideoPrompt"
            class="chapter-canvas-field chapter-canvas-field--wide"
          >
            <span>视频提示词</span>
            <n-input
              v-model:value="selectedVideoPrompt"
              class="chapter-canvas-prompt-input"
              type="textarea"
              placeholder="先生成视频提示词，也可以手动修改后再生成视频"
              :autosize="{ minRows: 4, maxRows: 8 }"
            />
          </label>
        </div>
      </section>

      <main
        ref="canvasViewport"
        class="chapter-canvas-scroll"
        :class="{ 'chapter-canvas-scroll--panning': isPanning }"
        @pointerdown="startCanvasPan"
        @pointermove="moveCanvasPan"
        @pointerup="stopCanvasPan"
        @pointercancel="stopCanvasPan"
        @wheel="handleCanvasWheel"
      >
        <section class="chapter-canvas-plane-shell" :style="canvasShellStyle">
          <section class="chapter-canvas-plane" :style="canvasPlaneStyle">
            <template v-for="(shot, index) in shots" :key="shot.id">
              <div
                class="chapter-canvas-node"
                :class="{ 'chapter-canvas-node--selected': selectedShot?.id === shot.id }"
                :style="getShotNodeStyle(index)"
                :ref="(element) => setShotNodeElement(shot.id, element)"
              >
                <n-card
                  class="chapter-canvas-node-card chapter-canvas-node-card--shot"
                  :style="getChainNodeStyle(SHOT_NODE_WIDTH)"
                  size="small"
                  @click.stop="selectShotStep(shot, 'image')"
                >
                  <div class="chapter-canvas-node-port chapter-canvas-node-port--out" />

                  <div class="chapter-canvas-shot-head">
                    <n-tag size="small">分镜 {{ shot.index }}</n-tag>
                    <n-text depth="3">{{ shot.durationSeconds }}s</n-text>
                  </div>

                  <strong>{{ shot.title }}</strong>
                  <p>{{ shot.scene }}</p>

                  <dl>
                    <dt>镜头</dt>
                    <dd>{{ shot.camera }}</dd>
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
                    <template v-if="shot.dialogue">
                      <dt>台词</dt>
                      <dd>{{ shot.dialogue }}</dd>
                    </template>
                    <template v-if="shot.narration">
                      <dt>旁白</dt>
                      <dd>{{ shot.narration }}</dd>
                    </template>
                    <dt>画面</dt>
                    <dd>{{ shot.imagePrompt }}</dd>
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

                  <button
                    class="chapter-canvas-node-trigger"
                    type="button"
                    @click.stop="triggerImageNode(shot)"
                  >
                    {{ isImageGenerated(shot) ? '重新生成图片' : isImageGenerating(shot) ? '图片生成中' : '生成图片' }}
                  </button>
                </n-card>

                <template v-if="shouldShowImageNode(shot)">
                  <div class="chapter-canvas-chain-line" />
                  <n-card
                    class="chapter-canvas-node-card chapter-canvas-stage-card chapter-canvas-stage-card--image"
                    :style="getChainNodeStyle(IMAGE_NODE_WIDTH)"
                    size="small"
                    @click.stop="selectShotStep(shot, 'videoPrompt')"
                  >
                    <div class="chapter-canvas-node-port chapter-canvas-node-port--in" />
                    <div class="chapter-canvas-node-port chapter-canvas-node-port--out" />

                    <div class="chapter-canvas-stage-head">
                      <span class="chapter-canvas-icon chapter-canvas-icon--image" aria-hidden="true" />
                      <strong>图片</strong>
                    </div>
                    <div class="chapter-canvas-generated-preview">
                      <span>{{ isImageGenerating(shot) ? '图片生成中' : '图片已生成' }}</span>
                    </div>
                    <p>{{ getShotPromptDraft(shot).image }}</p>

                    <button
                      class="chapter-canvas-node-trigger"
                      type="button"
                      :disabled="!isImageGenerated(shot) || isVideoPromptGenerating(shot)"
                      @click.stop="triggerVideoPromptNode(shot)"
                    >
                      {{ isVideoPromptGenerated(shot) ? '重新生成提示词' : isVideoPromptGenerating(shot) ? '提示词生成中' : '生成视频提示词' }}
                    </button>
                  </n-card>
                </template>

                <template v-if="shouldShowVideoPromptNode(shot)">
                  <div class="chapter-canvas-chain-line chapter-canvas-chain-line--blue" />
                  <n-card
                    class="chapter-canvas-node-card chapter-canvas-stage-card chapter-canvas-stage-card--prompt"
                    :style="getChainNodeStyle(PROMPT_NODE_WIDTH)"
                    size="small"
                    @click.stop="selectShotStep(shot, 'video')"
                  >
                    <div class="chapter-canvas-node-port chapter-canvas-node-port--in" />
                    <div class="chapter-canvas-node-port chapter-canvas-node-port--out" />

                    <div class="chapter-canvas-stage-head">
                      <span class="chapter-canvas-step-index">词</span>
                      <strong>视频提示词</strong>
                    </div>
                    <p>{{ isVideoPromptGenerating(shot) ? '视频提示词生成中' : getShotPromptDraft(shot).videoPrompt }}</p>

                    <button
                      class="chapter-canvas-node-trigger chapter-canvas-node-trigger--blue"
                      type="button"
                      :disabled="!isVideoPromptGenerated(shot) || isVideoGenerating(shot)"
                      @click.stop="triggerVideoNode(shot)"
                    >
                      {{ isVideoGenerated(shot) ? '重新生成视频' : isVideoGenerating(shot) ? '视频生成中' : '生成视频' }}
                    </button>
                  </n-card>
                </template>

                <template v-if="shouldShowVideoNode(shot)">
                  <div class="chapter-canvas-chain-line chapter-canvas-chain-line--blue" />
                  <n-card
                    class="chapter-canvas-node-card chapter-canvas-stage-card chapter-canvas-stage-card--video"
                    :class="getShotNodeCardClass(shot)"
                    :style="getChainNodeStyle(VIDEO_NODE_WIDTH)"
                    size="small"
                    @click.stop="selectShotStep(shot, 'video')"
                  >
                    <div class="chapter-canvas-node-port chapter-canvas-node-port--in" />

                    <div class="chapter-canvas-stage-head">
                      <span class="chapter-canvas-icon chapter-canvas-icon--video" aria-hidden="true" />
                      <strong>视频</strong>
                    </div>
                    <div
                      class="chapter-canvas-video-status"
                      :class="{
                        'chapter-canvas-video-status--ready': isVideoGenerated(shot),
                        'chapter-canvas-video-status--generating': isVideoGenerating(shot),
                        'chapter-canvas-video-status--failed': isVideoFailed(shot),
                      }"
                    >
                      {{ getVideoStatusText(shot) }}
                    </div>
                    <p>{{ getShotPromptDraft(shot).videoPrompt }}</p>
                  </n-card>
                </template>
              </div>
            </template>
          </section>
        </section>
      </main>

      <footer class="chapter-canvas-bottom-tools">
        <div class="chapter-canvas-actions">
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
            secondary
            title="角色资产"
            aria-label="角色资产"
            @click="openCharactersPage"
          >
            <span class="chapter-canvas-icon chapter-canvas-icon--character" aria-hidden="true" />
          </n-button>
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
