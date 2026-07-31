<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NEmpty, NTabPane, NTabs, NText } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import { useAiSettingsStore } from '../stores/aiSettings'
import { createChapterAnalysisKey, useChapterAnalysisStore } from '../stores/chapterAnalysis'
import { getNovelChapterText, useNovelLibraryStore } from '../stores/novelLibrary'

type ReaderMode = 'content' | 'analysis'

const route = useRoute()
const router = useRouter()
const library = useNovelLibraryStore()
const aiSettings = useAiSettingsStore()
const chapterAnalysis = useChapterAnalysisStore()
const readerPage = ref<HTMLElement | null>(null)
const readerMode = ref<ReaderMode>('content')

const scriptId = computed(() => String(route.params.scriptId ?? ''))
const novel = computed(() => library.novels.find((item) => item.id === scriptId.value) ?? null)
const chapters = computed(() => novel.value?.chapters ?? [])
const requestedChapterIndex = computed(() => {
  const rawValue = Array.isArray(route.query.chapter) ? route.query.chapter[0] : route.query.chapter
  const value = Number(rawValue ?? 1)

  return Number.isFinite(value) && value > 0 ? value : 1
})
const selectedChapter = computed(() => {
  return chapters.value.find((chapter) => chapter.index === requestedChapterIndex.value) ?? chapters.value[0] ?? null
})
const selectedChapterPosition = computed(() => {
  const chapter = selectedChapter.value

  if (!chapter) {
    return -1
  }

  return chapters.value.findIndex((item) => item.id === chapter.id)
})
const previousChapter = computed(() => chapters.value[selectedChapterPosition.value - 1] ?? null)
const nextChapter = computed(() => chapters.value[selectedChapterPosition.value + 1] ?? null)
const chapterText = computed(() => {
  if (!novel.value || !selectedChapter.value) {
    return ''
  }

  return getNovelChapterText(novel.value, selectedChapter.value)
})
const analysisKey = computed(() => {
  if (!novel.value || !selectedChapter.value) {
    return ''
  }

  return createChapterAnalysisKey(novel.value.id, selectedChapter.value.id)
})
const analysisRecord = computed(() => (analysisKey.value ? chapterAnalysis.getRecord(analysisKey.value) : null))
const analyzedChapterIds = computed(() => {
  const novelId = novel.value?.id

  if (!novelId) {
    return new Set<string>()
  }

  return new Set(
    Object.values(chapterAnalysis.records)
      .filter((record) => record.novelId === novelId)
      .map((record) => record.chapterId),
  )
})
const isAnalyzing = computed(() => chapterAnalysis.loadingKey === analysisKey.value)
const analysisError = computed(() => {
  if (!analysisKey.value || chapterAnalysis.errorKey !== analysisKey.value) {
    return ''
  }

  return chapterAnalysis.error
})
const analysisButtonText = computed(() => (analysisRecord.value ? '重新分析' : 'AI分析'))

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

function backToShelf() {
  router.push({ name: 'script-library' })
}

function openSettings() {
  router.push({ name: 'settings' })
}

function openChapter(index: number) {
  if (!novel.value) {
    return
  }

  router.replace({
    name: 'script-reader',
    params: { scriptId: novel.value.id },
    query: { chapter: String(index) },
  })
}

async function analyzeSelectedChapter() {
  if (!novel.value || !selectedChapter.value || isAnalyzing.value) {
    return
  }

  if (!aiSettings.hasApiKey) {
    openSettings()
    return
  }

  readerMode.value = 'analysis'

  try {
    await chapterAnalysis.analyzeChapter({
      apiKey: aiSettings.aihubmixApiKey,
      novel: novel.value,
      chapter: selectedChapter.value,
      chapterText: chapterText.value,
    })
  } catch {
    // The store keeps the active chapter error and any previous cached result.
  }
}

onMounted(() => {
  library.loadLibrary()
  aiSettings.loadSettings()
  chapterAnalysis.loadRecords()
})

watch(
  novel,
  (value) => {
    if (value) {
      library.selectNovel(value.id)
    }
  },
  { immediate: true },
)

watch(
  () => selectedChapter.value?.id,
  () => {
    chapterAnalysis.clearError(analysisKey.value)
    readerPage.value?.scrollTo({ top: 0 })
  },
)
</script>

<template>
  <div class="reader-view">
    <div v-if="library.isLoading" class="reader-empty-state">
      <n-empty description="正在加载剧本" />
    </div>

    <div v-else-if="!novel" class="reader-empty-state">
      <n-empty description="剧本不存在或已移出">
        <template #extra>
          <n-button @click="backToShelf">返回</n-button>
        </template>
      </n-empty>
    </div>

    <section v-else class="reader-shell">
      <aside class="reader-toc">
        <div class="reader-toc-head">
          <n-button text class="reader-back" @click="backToShelf">返回</n-button>
          <div class="reader-book-title">
            <strong>{{ novel.title }}</strong>
            <span>{{ novel.fileName }}</span>
          </div>
        </div>

        <nav class="reader-chapter-list" aria-label="章节列表">
          <button
            v-for="chapter in chapters"
            :key="chapter.id"
            class="reader-chapter-button"
            :class="{ 'reader-chapter-button--active': chapter.id === selectedChapter?.id }"
            type="button"
            @click="openChapter(chapter.index)"
          >
            <span>{{ chapter.index }}</span>
            <strong>{{ chapter.title }}</strong>
            <i
              v-if="analyzedChapterIds.has(chapter.id)"
              class="reader-chapter-result-dot"
              title="已有分析结果"
              aria-label="已有分析结果"
            />
          </button>
        </nav>
      </aside>

      <article ref="readerPage" class="reader-page">
        <template v-if="selectedChapter">
          <header class="reader-head">
            <div class="reader-head-row">
              <n-text depth="3">{{ selectedChapter.index }} / {{ chapters.length }}</n-text>
              <n-button size="small" type="primary" :loading="isAnalyzing" @click="analyzeSelectedChapter">
                {{ analysisButtonText }}
              </n-button>
            </div>
            <h2>{{ selectedChapter.title }}</h2>
          </header>

          <n-tabs v-model:value="readerMode" type="line" animated class="reader-content-tabs">
            <n-tab-pane name="content" tab="正文">
              <div class="reader-body">{{ chapterText }}</div>
            </n-tab-pane>

            <n-tab-pane name="analysis">
              <template #tab>
                <span class="reader-analysis-tab-label">
                  AI分析
                  <i v-if="analysisRecord" class="reader-tab-result-dot" aria-hidden="true" />
                </span>
              </template>

              <section class="reader-ai-panel">
                <div class="reader-ai-head">
                  <div>
                    <strong>分析结果</strong>
                    <n-text v-if="analysisRecord" depth="3">
                      已暂存于本机 · {{ formatDateTime(analysisRecord.updatedAt) }}
                    </n-text>
                    <n-text v-else depth="3">模型 gpt-5.5</n-text>
                  </div>
                  <n-button size="small" :disabled="isAnalyzing" @click="openSettings">设置 Key</n-button>
                </div>

                <n-alert v-if="!aiSettings.hasApiKey" type="warning" :show-icon="false">
                  请先在设置中填写并验证 AIHubMix Key。
                </n-alert>

                <n-alert v-if="analysisError" type="error" :show-icon="false">
                  {{ analysisError }}
                </n-alert>

                <n-alert v-if="isAnalyzing" type="info" :show-icon="false">
                  {{ analysisRecord ? '正在重新分析，现有暂存结果会保留到新结果完成。' : '正在分析本章，完成后会自动暂存。' }}
                </n-alert>

                <div v-if="analysisRecord" class="reader-ai-result">
                  <div>{{ analysisRecord.result }}</div>
                </div>

                <div v-else-if="!isAnalyzing" class="reader-analysis-empty">
                  <n-empty :description="analysisError ? '本次分析未完成' : '当前章节还没有分析结果'">
                    <template #extra>
                      <n-button v-if="aiSettings.hasApiKey" type="primary" @click="analyzeSelectedChapter">
                        开始分析
                      </n-button>
                      <n-button v-else @click="openSettings">填写 Key</n-button>
                    </template>
                  </n-empty>
                </div>
              </section>
            </n-tab-pane>
          </n-tabs>

          <footer class="reader-nav">
            <n-button :disabled="!previousChapter" @click="previousChapter && openChapter(previousChapter.index)">
              上一章
            </n-button>
            <n-button :disabled="!nextChapter" @click="nextChapter && openChapter(nextChapter.index)">
              下一章
            </n-button>
          </footer>
        </template>

        <n-empty v-else description="暂无章节" />
      </article>
    </section>
  </div>
</template>