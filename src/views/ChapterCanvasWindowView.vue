<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type CSSProperties } from 'vue'
import { NButton, NCard, NEmpty, NProgress, NTag, NText } from 'naive-ui'
import { useRoute } from 'vue-router'

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
const library = useNovelLibraryStore()
const storyboardDraft = useStoryboardDraftStore()
const dramaProduction = useDramaProductionStore()
const generatingImageShotIds = ref<string[]>([])
const generatingVideoShotIds = ref<string[]>([])
const generationTimers: number[] = []

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
const generatedVideoShotIds = computed(() =>
  chapterProductionKey.value ? dramaProduction.getGeneratedVideoShotIds(chapterProductionKey.value) : [],
)
const imageProgress = computed(() => {
  if (shots.value.length === 0) {
    return 0
  }

  return Math.round((generatedImageShotIds.value.length / shots.value.length) * 100)
})
const videoProgress = computed(() => {
  if (shots.value.length === 0) {
    return 0
  }

  return Math.round((generatedVideoShotIds.value.length / shots.value.length) * 100)
})

function getShotCardStyle(index: number): CSSProperties {
  const column = index % 4
  const row = Math.floor(index / 4)

  return {
    left: `${80 + column * 420}px`,
    top: `${110 + row * 390}px`,
  }
}

function isImageGenerated(shot: ChapterShot) {
  return generatedImageShotIds.value.includes(shot.id)
}

function isImageGenerating(shot: ChapterShot) {
  return generatingImageShotIds.value.includes(shot.id)
}

function isVideoGenerated(shot: ChapterShot) {
  return generatedVideoShotIds.value.includes(shot.id)
}

function isVideoGenerating(shot: ChapterShot) {
  return generatingVideoShotIds.value.includes(shot.id)
}

function addGeneratingId(ids: string[], shotId: string) {
  return ids.includes(shotId) ? ids : [...ids, shotId]
}

function removeGeneratingId(ids: string[], shotId: string) {
  return ids.filter((id) => id !== shotId)
}

function generateImage(shot: ChapterShot, delay = 700) {
  if (!chapterProductionKey.value || isImageGenerated(shot) || isImageGenerating(shot)) {
    return
  }

  generatingImageShotIds.value = addGeneratingId(generatingImageShotIds.value, shot.id)
  const timer = window.setTimeout(() => {
    dramaProduction.markShotImageGenerated(chapterProductionKey.value, shot.id)
    generatingImageShotIds.value = removeGeneratingId(generatingImageShotIds.value, shot.id)
  }, delay)

  generationTimers.push(timer)
}

function generateVideo(shot: ChapterShot, delay = 900) {
  if (!chapterProductionKey.value || !isImageGenerated(shot) || isVideoGenerated(shot) || isVideoGenerating(shot)) {
    return
  }

  generatingVideoShotIds.value = addGeneratingId(generatingVideoShotIds.value, shot.id)
  const timer = window.setTimeout(() => {
    dramaProduction.markShotVideoGenerated(chapterProductionKey.value, shot.id)
    generatingVideoShotIds.value = removeGeneratingId(generatingVideoShotIds.value, shot.id)
  }, delay)

  generationTimers.push(timer)
}

function generateAllImages() {
  shots.value.forEach((shot, index) => {
    generateImage(shot, 600 + index * 120)
  })
}

function generateAllVideos() {
  shots.value.forEach((shot, index) => {
    generateVideo(shot, 700 + index * 140)
  })
}

function closeWindow() {
  window.close()
}

onMounted(() => {
  library.loadLibrary()
  storyboardDraft.loadDrafts()
  dramaProduction.loadState()
})

onBeforeUnmount(() => {
  generationTimers.forEach((timer) => window.clearTimeout(timer))
})
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
      <header class="chapter-canvas-toolbar">
        <div>
          <n-text depth="3">{{ novel.title }}</n-text>
          <h2>第 {{ chapter.index }} 章分镜画布</h2>
        </div>
        <div class="chapter-canvas-actions">
          <n-button size="small" :disabled="shots.length === 0 || generatingImageShotIds.length > 0" @click="generateAllImages">
            {{ generatingImageShotIds.length > 0 ? '图片生成中' : '生成全部图片' }}
          </n-button>
          <n-button
            size="small"
            type="primary"
            :disabled="
              shots.length === 0 ||
              generatedImageShotIds.length < shots.length ||
              generatingVideoShotIds.length > 0
            "
            @click="generateAllVideos"
          >
            {{ generatingVideoShotIds.length > 0 ? '视频生成中' : '生成全部视频' }}
          </n-button>
          <n-button size="small" @click="closeWindow">关闭</n-button>
        </div>
      </header>

      <section class="chapter-canvas-status">
        <div>
          <strong>{{ draft ? 'AI 分镜已导入' : 'Demo 分镜' }}</strong>
          <n-text depth="3">{{ shots.length }} 个分镜文本卡片</n-text>
        </div>
        <div class="chapter-canvas-progress">
          <span>图片 {{ generatedImageShotIds.length }} / {{ shots.length }}</span>
          <n-progress type="line" :percentage="imageProgress" :show-indicator="false" status="success" />
          <span>视频 {{ generatedVideoShotIds.length }} / {{ shots.length }}</span>
          <n-progress type="line" :percentage="videoProgress" :show-indicator="false" status="success" />
        </div>
      </section>

      <main class="chapter-canvas-scroll">
        <section class="chapter-canvas-plane">
          <n-card
            v-for="(shot, index) in shots"
            :key="shot.id"
            class="chapter-canvas-shot"
            size="small"
            :style="getShotCardStyle(index)"
          >
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
              <dd>{{ shot.characters.join('、') }}</dd>
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

            <div class="chapter-canvas-shot-assets">
              <div :class="{ 'chapter-canvas-asset--ready': isImageGenerated(shot) }">
                {{ isImageGenerated(shot) ? '图片已生成' : isImageGenerating(shot) ? '图片生成中' : '等待图片' }}
              </div>
              <div :class="{ 'chapter-canvas-asset--ready': isVideoGenerated(shot) }">
                {{ isVideoGenerated(shot) ? '视频已生成' : isVideoGenerating(shot) ? '视频生成中' : '等待视频' }}
              </div>
            </div>

            <div class="chapter-canvas-shot-actions">
              <n-button
                size="small"
                secondary
                type="primary"
                :disabled="isImageGenerated(shot) || isImageGenerating(shot)"
                @click="generateImage(shot)"
              >
                {{ isImageGenerated(shot) ? '图片完成' : isImageGenerating(shot) ? '生成中' : '生成图片' }}
              </n-button>
              <n-button
                size="small"
                secondary
                type="primary"
                :disabled="!isImageGenerated(shot) || isVideoGenerated(shot) || isVideoGenerating(shot)"
                @click="generateVideo(shot)"
              >
                {{ isVideoGenerated(shot) ? '视频完成' : isVideoGenerating(shot) ? '生成中' : '生成视频' }}
              </n-button>
            </div>
          </n-card>
        </section>
      </main>
    </template>
  </div>
</template>
