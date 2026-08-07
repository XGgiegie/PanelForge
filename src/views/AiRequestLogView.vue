<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NForm,
  NFormItemGi,
  NGrid,
  NInput,
  NInputNumber,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NList,
  NListItem,
  NModal,
  NPagination,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  NText,
  NThing,
} from 'naive-ui'
import { useRouter } from 'vue-router'
import { useAiSettingsStore } from '../stores/aiSettings'

const router = useRouter()
const aiSettings = useAiSettingsStore()
const logs = ref<PanelForgeAiRequestLog[]>([])
const selectedLog = ref<PanelForgeAiRequestLog | null>(null)
const selectedRequestType = ref('all')
const isLoading = ref(false)
const errorMessage = ref('')
const copyMessage = ref('')
const remoteLogs = ref<PanelForgeAiHubMixCallLogItem[]>([])
const remoteLogTotal = ref(0)
const remoteLogPageSize = ref(20)
const remoteLogPage = ref(0)
const remoteLogTokenName = ref('')
const remoteLogModelName = ref('')
const remoteLogStatus = ref<number | null>(null)
const remoteLogDateRange = ref<[number, number] | null>(getDefaultRemoteLogDateRange())
const isRemoteLogLoading = ref(false)
const remoteLogError = ref('')
const hasLoadedRemoteLogs = ref(false)

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
const remoteLogPageCount = computed(() => Math.max(1, Math.ceil(remoteLogTotal.value / remoteLogPageSize.value)))

function getDefaultRemoteLogDateRange(): [number, number] {
  const end = Date.now()

  return [end - 7 * 24 * 60 * 60 * 1000, end]
}

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

function formatRemoteLogTime(timestamp: number) {
  if (!timestamp) {
    return '未知时间'
  }

  return formatTime(new Date(timestamp * 1000).toISOString())
}

function formatRemoteLogNumber(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
}

function formatRemoteLogDuration(value: number | null) {
  return value === null ? '' : `${value.toFixed(value < 10 ? 1 : 0)} 秒`
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

async function loadRemoteLogs(resetPage = false) {
  if (!window.panelForge?.aihubmix) {
    remoteLogError.value = '请在 Electron 客户端中查询 AIHubMix 调用日志。'
    return
  }

  aiSettings.loadSettings()

  if (!aiSettings.hasApiKey) {
    remoteLogError.value = '请先在设置中填写 AIHubMix Key。'
    return
  }

  if (resetPage) {
    remoteLogPage.value = 0
  }

  const [startTime, endTime] = remoteLogDateRange.value ?? getDefaultRemoteLogDateRange()
  isRemoteLogLoading.value = true
  remoteLogError.value = ''

  try {
    const result = await window.panelForge.aihubmix.getCallLogs({
      apiKey: aiSettings.aihubmixApiKey,
      appCode: aiSettings.aihubmixAppCode,
      p: remoteLogPage.value,
      tokenName: remoteLogTokenName.value,
      modelName: remoteLogModelName.value,
      status: remoteLogStatus.value ?? undefined,
      startTimestamp: Math.floor(startTime / 1000),
      endTimestamp: Math.floor(endTime / 1000),
    })
    remoteLogs.value = result.items
    remoteLogTotal.value = result.total
    remoteLogPageSize.value = result.pageSize
    remoteLogPage.value = result.page
    hasLoadedRemoteLogs.value = true
  } catch (error) {
    remoteLogError.value = error instanceof Error ? error.message : '加载 AIHubMix 调用日志失败。'
  } finally {
    isRemoteLogLoading.value = false
  }
}

async function changeRemoteLogPage(page: number) {
  remoteLogPage.value = page - 1
  await loadRemoteLogs()
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
  aiSettings.loadSettings()
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

        <n-card class="ai-request-log-remote-card" size="small" title="AIHubMix 调用明细">
          <n-space vertical size="medium">
            <n-text depth="3">按业务 Key、模型、状态与时间范围查询实际扣费记录；页码会自动转换为接口的 p 参数。</n-text>
            <n-form label-placement="top">
              <n-grid cols="1 m:8" responsive="screen" :x-gap="12" :y-gap="0">
                <n-form-item-gi span="1 m:4" label="时间范围">
                  <n-date-picker v-model:value="remoteLogDateRange" type="datetimerange" clearable />
                </n-form-item-gi>
                <n-form-item-gi span="1 m:2" label="业务 Key">
                  <n-input v-model:value="remoteLogTokenName" clearable placeholder="token_name" />
                </n-form-item-gi>
                <n-form-item-gi span="1 m:2" label="模型">
                  <n-input v-model:value="remoteLogModelName" clearable placeholder="model_name" />
                </n-form-item-gi>
                <n-form-item-gi span="1 m:2" label="状态">
                  <n-input-number v-model:value="remoteLogStatus" clearable :show-button="false" placeholder="status" />
                </n-form-item-gi>
                <n-form-item-gi span="1 m:6" label=" ">
                  <n-space justify="end">
                    <n-button type="primary" :loading="isRemoteLogLoading" @click="loadRemoteLogs(true)">查询明细</n-button>
                  </n-space>
                </n-form-item-gi>
              </n-grid>
            </n-form>

            <n-alert v-if="remoteLogError" type="error" :show-icon="false">{{ remoteLogError }}</n-alert>

            <n-spin :show="isRemoteLogLoading">
              <n-list v-if="remoteLogs.length" bordered class="ai-request-log-list">
                <n-list-item v-for="item in remoteLogs" :key="item.id" class="ai-request-log-item">
                  <n-thing :title="item.modelName || '未提供模型'" :description="formatRemoteLogTime(item.createdAt)">
                    <template #header-extra>
                      <n-tag size="small">{{ item.status === null ? '未提供状态' : `状态 ${item.status}` }}</n-tag>
                    </template>
                    <template #description>
                      <n-space align="center" size="small" :wrap="true">
                        <n-text depth="3">业务 Key：{{ item.tokenName || '未提供' }}</n-text>
                        <n-text depth="3">额度：{{ formatRemoteLogNumber(item.quota) }}</n-text>
                        <n-text v-if="item.promptTokens !== null || item.completionTokens !== null" depth="3">
                          Token：{{ formatRemoteLogNumber(item.promptTokens) }} / {{ formatRemoteLogNumber(item.completionTokens) }}
                        </n-text>
                        <n-text v-if="item.useTime !== null" depth="3">耗时：{{ formatRemoteLogDuration(item.useTime) }}</n-text>
                        <n-text v-if="item.requestPath" depth="3">{{ item.requestPath }}</n-text>
                      </n-space>
                    </template>
                  </n-thing>
                </n-list-item>
              </n-list>
              <n-empty v-else-if="hasLoadedRemoteLogs" size="small" description="这个条件下没有调用记录" />
              <n-empty v-else size="small" description="设置条件后查询 AIHubMix 调用明细" />
            </n-spin>

            <n-space v-if="remoteLogTotal > remoteLogPageSize" justify="end">
              <n-pagination
                :page="remoteLogPage + 1"
                :page-count="remoteLogPageCount"
                :disabled="isRemoteLogLoading"
                @update:page="changeRemoteLogPage"
              />
            </n-space>
          </n-space>
        </n-card>

        <n-spin v-if="!errorMessage" :show="isLoading">
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
