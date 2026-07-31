<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NEmpty, NInput, NText } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import { renderMarkdown } from '../services/markdown'
import { useAiSettingsStore } from '../stores/aiSettings'
import { createChapterAnalysisKey, useChapterAnalysisStore } from '../stores/chapterAnalysis'
import { useStoryboardDraftStore } from '../stores/storyboardDraft'
import {
  createCreativeBriefFromOutline,
  getCreativeBriefOutline,
  getNovelChapterText,
  useNovelLibraryStore,
} from '../stores/novelLibrary'

const route = useRoute()
const router = useRouter()
const library = useNovelLibraryStore()
const aiSettings = useAiSettingsStore()
const chapterAnalysis = useChapterAnalysisStore()
const storyboardDraft = useStoryboardDraftStore()
const readerPage = ref<HTMLElement | null>(null)
const isTocCollapsed = ref(false)
const isOutlineOpen = ref(false)
const outlineDraft = ref('')
const isSavingOutline = ref(false)
const outlineSavedMessage = ref('')
const selectedAnalysisRecordId = ref('')
let isSyncingOutlineDraft = false
let outlineAutoSaveTimer: number | null = null
let outlineSavePromise: Promise<void> | null = null

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
const creativeOutline = computed(() => getCreativeBriefOutline(novel.value?.creativeBrief))
const hasOutlineChanges = computed(() => outlineDraft.value.trim() !== creativeOutline.value)
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
const isStoryboardBasedOnAdoptedAnalysis = computed(() => {
  return Boolean(storyboardRecord.value && storyboardRecord.value.analysisRecordId === adoptedAnalysisRecordId.value)
})

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

async function backToShelf() {
  await flushOutlineSave()
  router.push({ name: 'script-library' })
}

function openSettings() {
  router.push({ name: 'settings' })
}

async function openChapter(index: number) {
  if (!novel.value) {
    return
  }

  await flushOutlineSave()

  router.replace({
    name: 'script-reader',
    params: { scriptId: novel.value.id },
    query: { chapter: String(index) },
  })
}

function toggleToc() {
  isTocCollapsed.value = !isTocCollapsed.value
}

function toggleOutline() {
  isOutlineOpen.value = !isOutlineOpen.value
}

function syncOutlineDraft() {
  isSyncingOutlineDraft = true
  outlineDraft.value = creativeOutline.value
  window.setTimeout(() => {
    isSyncingOutlineDraft = false
  })
}

function clearOutlineAutoSaveTimer() {
  if (!outlineAutoSaveTimer) {
    return
  }

  window.clearTimeout(outlineAutoSaveTimer)
  outlineAutoSaveTimer = null
}

function queueOutlineAutoSave() {
  if (isSyncingOutlineDraft || !novel.value || !hasOutlineChanges.value) {
    return
  }

  outlineSavedMessage.value = '大纲将在输入后自动保存'
  clearOutlineAutoSaveTimer()
  outlineAutoSaveTimer = window.setTimeout(() => {
    outlineAutoSaveTimer = null
    void saveOutline({ silent: true })
  }, 800)
}

async function saveOutline(options: { silent?: boolean } = {}) {
  if (outlineSavePromise) {
    await outlineSavePromise
  }

  if (!novel.value || !hasOutlineChanges.value) {
    return
  }

  clearOutlineAutoSaveTimer()
  const targetNovelId = novel.value.id
  const targetOutline = outlineDraft.value
  isSavingOutline.value = true

  const currentSavePromise = library
    .updateCreativeBrief(targetNovelId, createCreativeBriefFromOutline(targetOutline))
    .then(() => {
      outlineSavedMessage.value = targetOutline.trim()
        ? options.silent
          ? '大纲已自动保存'
          : '大纲已保存'
        : '大纲已清空'
    })

  outlineSavePromise = currentSavePromise

  try {
    await currentSavePromise
  } finally {
    if (outlineSavePromise === currentSavePromise) {
      outlineSavePromise = null
      isSavingOutline.value = false
    }
  }

  if (outlineDraft.value.trim() !== creativeOutline.value) {
    queueOutlineAutoSave()
  }
}

async function flushOutlineSave() {
  clearOutlineAutoSaveTimer()

  if (hasOutlineChanges.value) {
    await saveOutline({ silent: true })
  }
}

async function analyzeSelectedChapter() {
  if (!novel.value || !selectedChapter.value || isAnalyzing.value) {
    return
  }

  if (!aiSettings.hasApiKey) {
    openSettings()
    return
  }

  try {
    await flushOutlineSave()
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

function adoptSelectedAnalysis() {
  if (!analysisKey.value || !selectedAnalysisRecord.value) {
    return
  }

  chapterAnalysis.adoptRecord(analysisKey.value, selectedAnalysisRecord.value.id)
}

async function generateStoryboardDraft() {
  if (!novel.value || !selectedChapter.value || !analysisKey.value || !selectedAnalysisRecord.value) {
    return
  }

  if (!aiSettings.hasApiKey) {
    openSettings()
    return
  }

  if (!isSelectedAnalysisAdopted.value) {
    return
  }

  try {
    await flushOutlineSave()
    await storyboardDraft.generateDraft({
      apiKey: aiSettings.aihubmixApiKey,
      key: analysisKey.value,
      novel: novel.value,
      chapter: selectedChapter.value,
      analysisRecord: selectedAnalysisRecord.value,
    })
  } catch {
    // The store keeps generation errors for the active chapter.
  }
}

onMounted(() => {
  library.loadLibrary()
  aiSettings.loadSettings()
  chapterAnalysis.loadRecords()
  storyboardDraft.loadDrafts()
})

onBeforeUnmount(() => {
  void flushOutlineSave()
})

watch(
  () => novel.value?.id,
  () => {
    if (!novel.value) {
      return
    }

    library.selectNovel(novel.value.id)
    syncOutlineDraft()
    outlineSavedMessage.value = ''
    isOutlineOpen.value = route.query.outline === '1'
  },
  { immediate: true },
)

watch(outlineDraft, () => {
  queueOutlineAutoSave()
})

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

    <section v-else class="reader-shell" :class="{ 'reader-shell--toc-collapsed': isTocCollapsed }">
      <aside class="reader-toc">
        <div class="reader-toc-head">
          <div class="reader-toc-actions">
            <n-button text class="reader-back" @click="backToShelf">返回</n-button>
            <n-button text class="reader-toc-toggle" @click="toggleToc">
              {{ isTocCollapsed ? '目录' : '收起' }}
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

          <section class="reader-outline-panel" :class="{ 'reader-outline-panel--open': isOutlineOpen }">
            <button class="reader-outline-toggle" type="button" @click="toggleOutline">
              <span>
                <strong>大纲介绍</strong>
                <n-text depth="3">{{ creativeOutline ? '已保存，AI 分析会参考' : '上传完成后补充创作信息' }}</n-text>
              </span>
              <i>{{ isOutlineOpen ? '收起' : '展开' }}</i>
            </button>

            <div v-if="isOutlineOpen" class="reader-outline-editor">
              <n-input
                v-model:value="outlineDraft"
                type="textarea"
                :autosize="{ minRows: 5, maxRows: 10 }"
                placeholder="写下故事主线、世界观、主要角色、人物关系、核心冲突和改编重点"
                @blur="() => flushOutlineSave()"
              />
              <div class="reader-outline-actions">
                <n-text v-if="outlineSavedMessage" depth="3">{{ outlineSavedMessage }}</n-text>
                <n-button
                  size="small"
                  type="primary"
                  :loading="isSavingOutline"
                  :disabled="!hasOutlineChanges || isSavingOutline"
                  @click="() => saveOutline()"
                >
                  保存大纲
                </n-button>
              </div>
            </div>
          </section>

          <section class="reader-workspace">
            <section class="reader-content-panel">
              <div class="reader-panel-title">
                <strong>正文</strong>
              </div>
              <div class="reader-body">{{ chapterText }}</div>
            </section>

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
                    secondary
                    type="primary"
                    :disabled="isSelectedAnalysisAdopted"
                    @click="adoptSelectedAnalysis"
                  >
                    {{ isSelectedAnalysisAdopted ? '已采纳' : '采纳本次分析' }}
                  </n-button>
                  <n-button
                    size="small"
                    type="primary"
                    :loading="isGeneratingStoryboard"
                    :disabled="!isSelectedAnalysisAdopted || isGeneratingStoryboard"
                    @click="generateStoryboardDraft"
                  >
                    生成分镜草稿
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
                  当前分镜草稿基于旧采纳版本生成，重新生成后会更新。
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
                    <strong>分镜草稿</strong>
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
                </section>
            </section>
          </section>

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
