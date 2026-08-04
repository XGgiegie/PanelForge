<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NImage,
  NPopconfirm,
  NSpace,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'

import {
  deleteAiImageHistoryRecord,
  listAiImageHistory,
  type AiImageHistoryRecord,
} from '../services/aiImageHistory'

const message = useMessage()
const records = ref<AiImageHistoryRecord[]>([])
const isLoading = ref(false)
const loadingError = ref('')
const deletingRecordId = ref('')

const isEmpty = computed(() => !isLoading.value && records.value.length === 0)

function getRecordTitle(record: AiImageHistoryRecord) {
  return record.rawPrompt.split(/\r?\n/)[0]?.trim() || '未命名图片'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`
}

async function loadRecords() {
  isLoading.value = true
  loadingError.value = ''

  try {
    records.value = await listAiImageHistory()
  } catch (error) {
    loadingError.value = error instanceof Error ? error.message : '生成记录读取失败。'
  } finally {
    isLoading.value = false
  }
}

async function copyPrompt(record: AiImageHistoryRecord) {
  await navigator.clipboard.writeText(record.rawPrompt || record.prompt)
  message.success('提示词已复制')
}

async function deleteRecord(record: AiImageHistoryRecord) {
  deletingRecordId.value = record.id

  try {
    await deleteAiImageHistoryRecord(record.id)
    records.value = records.value.filter((item) => item.id !== record.id)
    message.success('记录已删除')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '记录删除失败')
  } finally {
    deletingRecordId.value = ''
  }
}

onMounted(() => {
  void loadRecords()
})
</script>

<template>
  <n-space vertical size="large" class="tool-view ai-drawing-history-view">
    <section class="view-title">
      <div>
        <n-text depth="3">MinIO 图片资产</n-text>
        <h2>生成记录</h2>
      </div>
      <n-button secondary :loading="isLoading" @click="loadRecords">刷新</n-button>
    </section>

    <n-alert type="info" :show-icon="false">
      这里展示 AI 绘图生成后保存到 MinIO 的图片，链接为临时签名地址。
    </n-alert>

    <n-alert v-if="loadingError" type="error" :show-icon="false">
      {{ loadingError }}
    </n-alert>

    <n-card v-if="isEmpty">
      <n-empty description="还没有生成记录" />
    </n-card>

    <div v-else class="ai-drawing-history-grid">
      <n-card v-for="record in records" :key="record.id" class="ai-drawing-history-card">
        <div class="ai-drawing-history-image">
          <n-image :src="record.imageUrl" :alt="getRecordTitle(record)" object-fit="cover" />
        </div>

        <div class="ai-drawing-history-info">
          <div class="ai-drawing-history-head">
            <strong>{{ getRecordTitle(record) }}</strong>
            <n-tag size="small" type="success">MinIO</n-tag>
          </div>

          <p>{{ record.rawPrompt || record.prompt }}</p>

          <div class="ai-drawing-history-meta">
            <span>{{ record.model }}</span>
            <span>{{ record.aspectRatio }}</span>
            <span>{{ record.resolution || '1K' }}</span>
            <span>{{ formatSize(record.size) }}</span>
            <span>{{ formatDate(record.createdAt) }}</span>
          </div>

          <div class="ai-drawing-history-actions">
            <n-button size="small" secondary @click="copyPrompt(record)">复制提示词</n-button>
            <n-button size="small" secondary tag="a" :href="record.imageUrl" target="_blank">打开原图</n-button>
            <n-popconfirm @positive-click="deleteRecord(record)">
              <template #trigger>
                <n-button
                  size="small"
                  tertiary
                  type="error"
                  :loading="deletingRecordId === record.id"
                >
                  删除
                </n-button>
              </template>
              删除后会同步清理 MinIO 图片对象。
            </n-popconfirm>
          </div>
        </div>
      </n-card>
    </div>
  </n-space>
</template>
