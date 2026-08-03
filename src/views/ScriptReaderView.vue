<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NEmpty, NText } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import { renderMarkdown } from '../services/markdown'
import { useAiSettingsStore } from '../stores/aiSettings'
import { useCharacterAssetsStore } from '../stores/characterAssets'
import { createChapterAnalysisKey, useChapterAnalysisStore } from '../stores/chapterAnalysis'
import { useStoryboardDraftStore } from '../stores/storyboardDraft'
import {
  getCreativeBriefOutline,
  getNovelChapterText,
  useNovelLibraryStore,
} from '../stores/novelLibrary'

const route = useRoute()
const router = useRouter()
const library = useNovelLibraryStore()
const aiSettings = useAiSettingsStore()
const characterAssets = useCharacterAssetsStore()
const chapterAnalysis = useChapterAnalysisStore()
const storyboardDraft = useStoryboardDraftStore()
const readerPage = ref<HTMLElement | null>(null)
const isTocCollapsed = ref(false)
const selectedAnalysisRecordId = ref('')

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
const analysisRecords = computed(() => (analysisKey.value ? chapterAnalysis.getRecords(analysisKey.value) : []))
const latestAnalysisRecord = computed(() => analysisRecords.value[0] ?? null)
const selectedAnalysisRecord = computed(() => {
  if (selectedAnalysisRecordId.value) {
    return analysisRecords.value.find((record) => record.id === selectedAnalysisRecordId.value) ?? latestAnalysisRecord.value
  }

  return latestAnalysisRecord.value
})
const adoptedAnalysisRecordId = computed(() => (analysisKey.value ? chapterAnalysis.getAdoptedRecordId(analysisKey.value) : ''))
const isSelectedAnalysisAdopted = computed(() => {
  return Boolean(selectedAnalysisRecord.value && selectedAnalysisRecord.value.id === adoptedAnalysisRecordId.value)
})
const analyzedChapterIds = computed(() => {
  const novelId = novel.value?.id

  if (!novelId) {
    return new Set<string>()
  }

  return new Set(
    Object.values(chapterAnalysis.records)
      .flat()
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
const analysisButtonText = computed(() => (latestAnalysisRecord.value ? '重新分析' : 'AI分析'))
const selectedAnalysisHtml = computed(() =>
  selectedAnalysisRecord.value ? renderMarkdown(selectedAnalysisRecord.value.result) : '',
)
const storyboardRecord = computed(() => (analysisKey.value ? storyboardDraft.getDraft(analysisKey.value) : null))
const isGeneratingStoryboard = computed(() => storyboardDraft.loadingKey === analysisKey.value)
const storyboardError = computed(() => {
  if (!analysisKey.value || storyboardDraft.errorKey !== analysisKey.value) {
    return ''
  }

  return storyboardDraft.error
})
const novelCharacterAssets = computed(() => {
  if (!novel.value) {
    return []
  }

  return characterAssets.getCharactersByNovelId(novel.value.id)
})
const isStoryboardBasedOnAdoptedAnalysis = computed(() => {
  return Boolean(storyboardRecord.value && storyboardRecord.value.analysisRecordId === adoptedAnalysisRecordId.value)
})
const hasCreativeOutline = computed(() => {
  return getCreativeBriefOutline(novel.value?.creativeBrief).trim().length > 0
})

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

function backToShelf() {
  router.push({ name: 'script-library' })
}

function openSettings() {
  router.push({ name: 'settings' })
}

function openOutlinePage() {
  if (!novel.value) {
    return
  }

  router.push({ name: 'script-outline', params: { scriptId: novel.value.id } })
}

function openCharactersPage() {
  if (!novel.value) {
    return
  }

  router.push({ name: 'script-characters', params: { scriptId: novel.value.id } })
}

function openCanvasWindow() {
  if (!novel.value || !selectedChapter.value) {
    return
  }

  const canvasRoute = router.resolve({
    name: 'chapter-canvas',
    params: {
      scriptId: novel.value.id,
      chapterIndex: String(selectedChapter.value.index),
    },
  })
  const routeHash = canvasRoute.href.startsWith('#') ? canvasRoute.href : `#${canvasRoute.href}`
  const title = `分镜画布 · ${selectedChapter.value.title}`

  if (window.panelForge?.windows?.openChapterCanvasWindow) {
    void window.panelForge.windows.openChapterCanvasWindow({
      routeHash,
      title,
    })
    return
  }

  window.open(routeHash, `chapter-canvas-${novel.value.id}-${selectedChapter.value.index}`, 'width=1280,height=820')
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

function toggleToc() {
  isTocCollapsed.value = !isTocCollapsed.value
}

function openSourceWindow() {
  if (!novel.value || !selectedChapter.value) {
    return
  }

  const sourceRoute = router.resolve({
    name: 'chapter-source',
    params: {
      scriptId: novel.value.id,
      chapterIndex: String(selectedChapter.value.index),
    },
  })
  const routeHash = sourceRoute.href.startsWith('#') ? sourceRoute.href : `#${sourceRoute.href}`
  const title = `正文 · ${selectedChapter.value.title}`

  if (window.panelForge?.windows?.openChapterSourceWindow) {
    void window.panelForge.windows.openChapterSourceWindow({
      routeHash,
      title,
    })
    return
  }

  window.open(routeHash, `chapter-source-${novel.value.id}-${selectedChapter.value.index}`, 'width=760,height=900')
}

async function analyzeSelectedChapter() {
  if (!novel.value || !selectedChapter.value || isAnalyzing.value) {
    return
  }

  if (!aiSettings.hasApiKey) {
    return
  }

  try {
    const record = await chapterAnalysis.analyzeChapter({
      apiKey: aiSettings.aihubmixApiKey,
      novel: novel.value,
      chapter: selectedChapter.value,
      chapterText: chapterText.value,
    })
    selectedAnalysisRecordId.value = record.id
  } catch {
    // The store keeps the active chapter error and any previous cached result.
  }
}

async function generateStoryboardDraft() {
  if (!novel.value || !selectedChapter.value || !analysisKey.value || !selectedAnalysisRecord.value) {
    return
  }

  if (!aiSettings.hasApiKey) {
    return
  }

  if (!isSelectedAnalysisAdopted.value) {
    chapterAnalysis.adoptRecord(analysisKey.value, selectedAnalysisRecord.value.id)
  }

  try {
    await storyboardDraft.generateDraft({
      apiKey: aiSettings.aihubmixApiKey,
      key: analysisKey.value,
      novel: novel.value,
      chapter: selectedChapter.value,
      chapterText: chapterText.value,
      analysisRecord: selectedAnalysisRecord.value,
      characterReferences: novelCharacterAssets.value.map((character) => ({
        name: character.name,
        description: character.description,
      })),
    })
  } catch {
    // The store keeps generation errors for the active chapter.
  }
}

onMounted(() => {
  library.loadLibrary()
  characterAssets.loadAssets()
  aiSettings.loadSettings()
  chapterAnalysis.loadRecords()
  storyboardDraft.loadDrafts()
})

watch(
  () => novel.value?.id,
  () => {
    if (!novel.value) {
      return
    }

    library.selectNovel(novel.value.id)
  },
  { immediate: true },
)

watch(
  () => selectedChapter.value?.id,
  () => {
    chapterAnalysis.clearError(analysisKey.value)
    storyboardDraft.clearError(analysisKey.value)
    selectedAnalysisRecordId.value = ''
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

    <section v-else class="reader-shell" :class="{ 'reader-shell--toc-hidden': isTocCollapsed }">
      <aside v-if="!isTocCollapsed" class="reader-toc">
        <div class="reader-toc-head">
          <div class="reader-toc-actions">
            <n-button text class="reader-toc-toggle" @click="toggleToc">
              隐藏目录
            </n-button>
          </div>
          <div class="reader-book-title">
            <strong>{{ novel.title }}</strong>
            <span>{{ novel.fileName }}</span>
          </div>
        </div>

        <nav v-if="!isTocCollapsed" class="reader-chapter-list" aria-label="章节列表">
          <button
            v-for="chapter in chapters"
            :key="chapter.id"
            class="reader-chapter-button"
            :class="{ 'reader-chapter-button--active': chapter.id === selectedChapter?.id }"
            type="button"
            @click.stop="openChapter(chapter.index)"
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

      <article
        ref="readerPage"
        class="reader-page"
      >
        <template v-if="selectedChapter">
          <header class="reader-head">
            <div class="reader-head-row">
              <div class="reader-head-leading">
                <n-button size="small" secondary @click="backToShelf">返回</n-button>
                <n-button v-if="isTocCollapsed" size="small" secondary @click="toggleToc">目录</n-button>
                <n-text depth="3">{{ selectedChapter.index }} / {{ chapters.length }}</n-text>
              </div>
              <div class="reader-head-actions">
                <n-button size="small" secondary @click="openOutlinePage">大纲</n-button>
                <n-button size="small" secondary @click="openCharactersPage">角色资产</n-button>
                <n-button size="small" secondary @click="openSourceWindow">打开正文窗口</n-button>
                <n-button size="small" type="primary" :loading="isAnalyzing" @click="analyzeSelectedChapter">
                  {{ analysisButtonText }}
                </n-button>
              </div>
            </div>
            <h2>{{ selectedChapter.title }}</h2>
          </header>

          <section class="reader-workspace">
            <section class="reader-ai-panel">
                <div class="reader-ai-head">
                  <div>
                    <strong>分析记录</strong>
                    <n-text v-if="selectedAnalysisRecord" depth="3">
                      共 {{ analysisRecords.length }} 次 · 当前 {{ formatDateTime(selectedAnalysisRecord.updatedAt) }}
                    </n-text>
                    <n-text v-else depth="3">模型 gpt-5.5</n-text>
                  </div>
                  <n-button size="small" :disabled="isAnalyzing" @click="openSettings">设置 Key</n-button>
                </div>

                <n-alert v-if="!aiSettings.hasApiKey" type="warning" :show-icon="false">
                  请先在设置中填写并验证 AIHubMix Key。
                </n-alert>

                <n-alert v-if="!hasCreativeOutline" type="warning" :show-icon="false">
                  大纲为空。建议先补充大纲，再做章节分析，后续分镜和本章成片会更稳定。
                </n-alert>

                <n-alert v-if="analysisError" type="error" :show-icon="false">
                  {{ analysisError }}
                </n-alert>

                <n-alert v-if="isAnalyzing" type="info" :show-icon="false">
                  {{ latestAnalysisRecord ? '正在生成新的历史记录，旧记录会继续保留。' : '正在分析本章，完成后会自动保存为历史记录。' }}
                </n-alert>

                <div v-if="analysisRecords.length > 0" class="reader-analysis-history">
                  <button
                    v-for="(record, index) in analysisRecords"
                    :key="record.id"
                    class="reader-analysis-history-item"
                    :class="{ 'reader-analysis-history-item--active': record.id === selectedAnalysisRecord?.id }"
                    type="button"
                    @click="selectedAnalysisRecordId = record.id"
                  >
                    <strong>
                      {{ index === 0 ? '最新' : `第 ${analysisRecords.length - index} 次` }}
                      <em v-if="record.id === adoptedAnalysisRecordId">已采纳</em>
                    </strong>
                    <span>{{ formatDateTime(record.updatedAt) }}</span>
                  </button>
                </div>

                <div v-if="selectedAnalysisRecord" class="reader-analysis-actions">
                  <n-button
                    size="small"
                    type="primary"
                    :loading="isGeneratingStoryboard"
                    :disabled="isGeneratingStoryboard"
                    @click="generateStoryboardDraft"
                  >
                    生成分镜
                  </n-button>
                  <n-button
                    v-if="storyboardRecord"
                    size="small"
                    secondary
                    type="primary"
                    @click="openCanvasWindow"
                  >
                    打开无限画布
                  </n-button>
                </div>

                <n-alert v-if="storyboardError" type="error" :show-icon="false">
                  {{ storyboardError }}
                </n-alert>

                <n-alert
                  v-if="storyboardRecord && !isStoryboardBasedOnAdoptedAnalysis"
                  type="warning"
                  :show-icon="false"
                >
                  当前分镜基于旧分析生成，重新生成后会更新。
                </n-alert>

                <div v-if="selectedAnalysisRecord" class="reader-ai-result">
                  <div class="reader-markdown" v-html="selectedAnalysisHtml" />
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

                <section v-if="storyboardRecord" class="reader-storyboard-panel">
                  <div class="reader-storyboard-head">
                    <strong>本章分镜</strong>
                    <n-text depth="3">
                      {{ storyboardRecord.shots.length }} 个镜头 · {{ formatDateTime(storyboardRecord.updatedAt) }}
                    </n-text>
                  </div>

                  <article v-for="shot in storyboardRecord.shots" :key="shot.id" class="reader-storyboard-card">
                    <div class="reader-storyboard-card-head">
                      <strong>{{ shot.title }}</strong>
                      <span>{{ shot.durationSeconds }}s</span>
                    </div>
                    <p v-if="shot.scene">{{ shot.scene }}</p>
                    <dl>
                      <template v-if="shot.camera">
                        <dt>镜头</dt>
                        <dd>{{ shot.camera }}</dd>
                      </template>
                      <template v-if="shot.characters.length">
                        <dt>角色</dt>
                        <dd>{{ shot.characters.join('、') }}</dd>
                      </template>
                      <template v-if="shot.action">
                        <dt>动作</dt>
                        <dd>{{ shot.action }}</dd>
                      </template>
                      <template v-if="shot.dialogue">
                        <dt>对白</dt>
                        <dd>{{ shot.dialogue }}</dd>
                      </template>
                      <template v-if="shot.narration">
                        <dt>旁白</dt>
                        <dd>{{ shot.narration }}</dd>
                      </template>
                      <template v-if="shot.imagePrompt">
                        <dt>画面</dt>
                        <dd>{{ shot.imagePrompt }}</dd>
                      </template>
                    </dl>
                  </article>

                  <n-button type="primary" secondary block @click="openCanvasWindow">打开无限画布</n-button>
                </section>
            </section>
          </section>

        </template>

        <n-empty v-else description="暂无章节" />
      </article>
    </section>
  </div>
</template>
