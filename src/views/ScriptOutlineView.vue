<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NCard, NEmpty, NInput, NSpace, NTabPane, NTabs, NText } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import { renderMarkdown } from '../services/markdown'
import {
  createCreativeBriefFromOutline,
  getCreativeBriefOutline,
  useNovelLibraryStore,
} from '../stores/novelLibrary'

const route = useRoute()
const router = useRouter()
const library = useNovelLibraryStore()

const mode = ref('write')
const outlineDraft = ref('')
const isSaving = ref(false)
const savedMessage = ref('')

const scriptId = computed(() => String(route.params.scriptId ?? ''))
const novel = computed(() => library.novels.find((item) => item.id === scriptId.value) ?? null)
const savedOutline = computed(() => getCreativeBriefOutline(novel.value?.creativeBrief))
const hasChanges = computed(() => outlineDraft.value.trim() !== savedOutline.value)
const previewHtml = computed(() => renderMarkdown(outlineDraft.value))

function syncDraft() {
  outlineDraft.value = savedOutline.value
  savedMessage.value = ''
}

function backToReader() {
  if (!novel.value) {
    router.push({ name: 'script-library' })
    return
  }

  router.push({ name: 'script-reader', params: { scriptId: novel.value.id } })
}

async function saveOutline() {
  if (!novel.value || isSaving.value) {
    return
  }

  isSaving.value = true

  try {
    await library.updateCreativeBrief(novel.value.id, createCreativeBriefFromOutline(outlineDraft.value))
    savedMessage.value = outlineDraft.value.trim() ? '大纲已保存' : '大纲已清空'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  library.loadLibrary()
})

watch(
  () => novel.value?.id,
  () => {
    if (novel.value) {
      library.selectNovel(novel.value.id)
      syncDraft()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="outline-view">
    <div v-if="library.isLoading" class="reader-empty-state">
      <n-empty description="正在加载剧本" />
    </div>

    <div v-else-if="!novel" class="reader-empty-state">
      <n-empty description="剧本不存在或已移出">
        <template #extra>
          <n-button @click="backToReader">返回剧本库</n-button>
        </template>
      </n-empty>
    </div>

    <n-space v-else vertical size="large">
      <section class="view-title">
        <div>
          <n-text depth="3">{{ novel.title }}</n-text>
          <h2>创作大纲</h2>
        </div>
        <n-space>
          <n-button @click="backToReader">返回阅读</n-button>
          <n-button type="primary" :loading="isSaving" :disabled="!hasChanges || isSaving" @click="saveOutline">
            保存
          </n-button>
        </n-space>
      </section>

      <n-card class="outline-editor-card">
        <n-tabs v-model:value="mode" type="line" animated>
          <n-tab-pane name="write" tab="Markdown">
            <n-input
              v-model:value="outlineDraft"
              class="outline-editor"
              type="textarea"
              placeholder="用 Markdown 写故事主线、世界观、主要角色、人物关系、核心冲突和改编重点"
              :autosize="{ minRows: 18, maxRows: 28 }"
            />
          </n-tab-pane>

          <n-tab-pane name="preview" tab="预览">
            <div v-if="outlineDraft.trim()" class="outline-preview reader-markdown" v-html="previewHtml" />
            <n-empty v-else description="暂无大纲内容" />
          </n-tab-pane>
        </n-tabs>

        <div class="outline-editor-footer">
          <n-text v-if="savedMessage" depth="3">{{ savedMessage }}</n-text>
          <n-text v-else depth="3">Markdown 内容会参与后续 AI 分析和分镜生成。</n-text>
        </div>
      </n-card>
    </n-space>
  </div>
</template>
