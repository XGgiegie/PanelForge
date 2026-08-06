<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NInput,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NList,
  NListItem,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  NText,
  NThing,
} from 'naive-ui'
import { useRouter } from 'vue-router'

const router = useRouter()
const logs = ref<PanelForgeAiRequestLog[]>([])
const selectedLog = ref<PanelForgeAiRequestLog | null>(null)
const selectedRequestType = ref('all')
const isLoading = ref(false)
const errorMessage = ref('')
const copyMessage = ref('')

const requestTypeOptions = [
  { label: '全部调用', value: 'all' },
  { label: '文本分析', value: 'chat-completion' },
  { label: '图片生成', value: 'image-generation' },
  { label: '视频生成', value: 'video-generation' },
  { label: '配置验证', value: 'configuration-validation' },
]

const filteredLogs = computed(() =>
  selectedRequestType.value === 'all'
    ? logs.value
    : logs.value.filter((log) => log.requestType === selectedRequestType.value),
)

function getRequestTypeLabel(requestType: string) {
  return requestTypeOptions.find((option) => option.value === requestType)?.label ?? requestType
}

function getStatusLabel(status: PanelForgeAiRequestLogStatus) {
  if (status === 'succeeded') return '成功'
  if (status === 'failed') return '失败'
  return '进行中'
}

function getStatusType(status: PanelForgeAiRequestLogStatus) {
  if (status === 'succeeded') return 'success' as const
  if (status === 'failed') return 'error' as const
  return 'warning' as const
}

function formatTime(value: string) {
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(date)
}

function formatDuration(durationMs: number | null) {
  return durationMs === null ? '等待完成' : `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)} 秒`
}

function formatJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

async function loadLogs() {
  if (!window.panelForge?.aiLogs) {
    errorMessage.value = '请在 Electron 客户端中查看 AI 调用日志。'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    logs.value = await window.panelForge.aiLogs.list(200)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载 AI 调用日志失败。'
  } finally {
    isLoading.value = false
  }
}

async function clearLogs() {
  if (!window.panelForge?.aiLogs) {
    return
  }

  try {
    await window.panelForge.aiLogs.clear()
    logs.value = []
    selectedLog.value = null
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '清空 AI 调用日志失败。'
  }
}

async function copySelectedRequest() {
  if (!selectedLog.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(formatJson(selectedLog.value.requestPayload))
    copyMessage.value = '请求参数已复制。'
  } catch {
    copyMessage.value = '复制失败，请直接在文本框中选择。'
  }
}

onMounted(() => {
  void loadLogs()
})
</script>

<template>
  <div class="ai-request-log-view">
    <n-layout class="ai-request-log-layout">
      <n-layout-header bordered class="ai-request-log-header">
        <n-space class="ai-request-log-header-content" align="center" justify="space-between">
          <div>
            <n-text depth="3">设置</n-text>
            <h2>AI 调用日志</h2>
          </div>
          <n-space align="center">
            <n-select v-model:value="selectedRequestType" class="ai-request-log-filter" :options="requestTypeOptions" />
            <n-button @click="loadLogs">刷新</n-button>
            <n-popconfirm positive-text="清空" negative-text="取消" @positive-click="clearLogs">
              <template #trigger>
                <n-button type="error" secondary :disabled="logs.length === 0">清空日志</n-button>
              </template>
              清空本机保存的全部 AI 调用记录？
            </n-popconfirm>
            <n-button @click="router.push({ name: 'settings' })">返回设置</n-button>
          </n-space>
        </n-space>
      </n-layout-header>

      <n-layout-content content-style="padding: 20px 24px 28px;">
        <n-alert v-if="errorMessage" type="error" :show-icon="false">{{ errorMessage }}</n-alert>

        <n-spin v-else :show="isLoading">
          <n-list v-if="filteredLogs.length" bordered hoverable clickable class="ai-request-log-list">
            <n-list-item v-for="log in filteredLogs" :key="log.id" class="ai-request-log-item" @click="selectedLog = log">
              <n-thing :title="getRequestTypeLabel(log.requestType)" :description="`${formatTime(log.createdAt)} · ${log.model || '未指定模型'}`">
                <template #header-extra>
                  <n-tag :type="getStatusType(log.status)" size="small">{{ getStatusLabel(log.status) }}</n-tag>
                </template>
                <template #description>
                  <n-space align="center" size="small">
                    <n-text depth="3">{{ log.endpoint }}</n-text>
                    <n-text depth="3">{{ formatDuration(log.durationMs) }}</n-text>
                  </n-space>
                </template>
              </n-thing>
              <template #suffix>
                <n-button text type="primary" @click.stop="selectedLog = log">查看参数</n-button>
              </template>
            </n-list-item>
          </n-list>

          <n-empty v-else description="尚无 AI 调用记录" />
        </n-spin>
      </n-layout-content>
    </n-layout>

    <n-modal
      :show="Boolean(selectedLog)"
      preset="card"
      :title="selectedLog ? `${getRequestTypeLabel(selectedLog.requestType)} · 请求详情` : '请求详情'"
      style="width: min(980px, calc(100vw - 48px));"
      @update:show="(show) => { if (!show) selectedLog = null }"
    >
      <n-space v-if="selectedLog" vertical size="large">
        <n-descriptions :column="3" label-placement="top" size="small">
          <n-descriptions-item label="状态">
            <n-tag :type="getStatusType(selectedLog.status)" size="small">{{ getStatusLabel(selectedLog.status) }}</n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="模型">{{ selectedLog.model || '未指定' }}</n-descriptions-item>
          <n-descriptions-item label="耗时">{{ formatDuration(selectedLog.durationMs) }}</n-descriptions-item>
          <n-descriptions-item label="请求时间" :span="2">{{ formatTime(selectedLog.createdAt) }}</n-descriptions-item>
          <n-descriptions-item label="接口">{{ selectedLog.endpoint }}</n-descriptions-item>
        </n-descriptions>

        <n-alert v-if="selectedLog.errorMessage" type="error" :show-icon="false">
          {{ selectedLog.errorMessage }}
        </n-alert>

        <n-space align="center" justify="space-between">
          <strong>最终请求参数</strong>
          <n-button size="small" secondary @click="copySelectedRequest">复制参数</n-button>
        </n-space>
        <n-alert v-if="copyMessage" type="success" :show-icon="false">{{ copyMessage }}</n-alert>
        <n-input
          :value="formatJson(selectedLog.requestPayload)"
          type="textarea"
          readonly
          :autosize="{ minRows: 16, maxRows: 24 }"
        />

        <template v-if="selectedLog.responseSummary">
          <strong>响应摘要</strong>
          <n-input
            :value="formatJson(selectedLog.responseSummary)"
            type="textarea"
            readonly
            :autosize="{ minRows: 4, maxRows: 10 }"
          />
        </template>
      </n-space>
    </n-modal>
  </div>
</template>
