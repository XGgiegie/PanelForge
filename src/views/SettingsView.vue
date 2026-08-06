<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NInput, NSpace, NTag, NText } from 'naive-ui'
import { useRouter } from 'vue-router'

import { AI_MODEL_CAPABILITIES, useAiSettingsStore, type AiModelStatus } from '../stores/aiSettings'

type ValidationStatus = 'idle' | 'checking' | 'valid' | 'error'

const aiSettings = useAiSettingsStore()
const router = useRouter()
const draftKey = ref('')
const draftAppCode = ref('')
const savedMessage = ref('')
const validationStatus = ref<ValidationStatus>('idle')
const validationMessage = ref('')

const hasSavedProvider = computed(() => aiSettings.hasApiKey || aiSettings.hasAppCode)
const isValidating = computed(() => validationStatus.value === 'checking')
const canValidateKey = computed(
  () => draftKey.value.trim().length > 0 && draftAppCode.value.trim().length > 0 && !isValidating.value,
)
const validationAlertType = computed(() => (validationStatus.value === 'valid' ? ('success' as const) : ('error' as const)))
const providerStatusText = computed(() => (aiSettings.canUseAiHubMix ? '已配置' : '待配置'))

function getModelStatusLabel(status: AiModelStatus) {
  return status === 'available' ? '已启用' : '待接入'
}

function getModelStatusType(status: AiModelStatus) {
  return status === 'available' ? 'success' : 'default'
}

function saveProviderSettings() {
  aiSettings.saveAihubmixSettings(draftKey.value, draftAppCode.value)
  savedMessage.value = aiSettings.canUseAiHubMix ? 'AIHubMix 配置已保存' : 'AIHubMix 配置已清空'
}

function clearProviderSettings() {
  draftKey.value = ''
  draftAppCode.value = ''
  aiSettings.clearAihubmixSettings()
  savedMessage.value = 'AIHubMix 配置已清空'
}

function openAiRequestLogs() {
  router.push({ name: 'ai-request-logs' })
}

function getValidationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'AIHubMix 配置验证失败，请稍后重试。'

  return message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

async function validateKey() {
  const apiKey = draftKey.value.trim()
  const appCode = draftAppCode.value.trim()

  if (!apiKey) {
    validationStatus.value = 'error'
    validationMessage.value = '请先填写 AIHubMix Key。'
    return
  }

  if (!appCode) {
    validationStatus.value = 'error'
    validationMessage.value = '请先填写 APP-Code。'
    return
  }

  if (!window.panelForge?.aihubmix) {
    validationStatus.value = 'error'
    validationMessage.value = '请在 Electron 客户端中验证配置。'
    return
  }

  savedMessage.value = ''
  validationStatus.value = 'checking'
  validationMessage.value = ''

  try {
    await window.panelForge.aihubmix.validateKey(apiKey, appCode)
    validationStatus.value = 'valid'
    validationMessage.value = '配置有效，gpt-5.5 调用测试已通过。'
  } catch (error) {
    validationStatus.value = 'error'
    validationMessage.value = getValidationErrorMessage(error)
  }
}

watch([draftKey, draftAppCode], () => {
  validationStatus.value = 'idle'
  validationMessage.value = ''
})

onMounted(async () => {
  await aiSettings.loadProviderDefaults()
  draftKey.value = aiSettings.aihubmixApiKey
  draftAppCode.value = aiSettings.aihubmixAppCode
})
</script>

<template>
  <div class="settings-view">
    <n-card class="settings-card">
      <n-space vertical size="large">
        <div class="settings-section-head settings-section-head--row">
          <div>
            <strong>AIHubMix</strong>
            <n-text depth="3">文本模型固定使用 {{ aiSettings.textModel }}</n-text>
          </div>
          <n-tag size="small" :type="aiSettings.canUseAiHubMix ? 'success' : 'warning'">{{ providerStatusText }}</n-tag>
        </div>

        <div class="settings-provider-grid">
          <label>
            <span>API Key</span>
            <n-input
              v-model:value="draftKey"
              type="password"
              show-password-on="click"
              clearable
              placeholder="填写 AIHubMix API Key"
            />
          </label>
          <label>
            <span>APP-Code</span>
            <n-input v-model:value="draftAppCode" clearable placeholder="填写供应商 APP-Code" />
          </label>
        </div>

        <div class="settings-actions">
          <n-button :loading="isValidating" :disabled="!canValidateKey" @click="validateKey">验证配置</n-button>
          <n-button type="primary" @click="saveProviderSettings">保存</n-button>
          <n-button :disabled="!hasSavedProvider && !draftKey && !draftAppCode" @click="clearProviderSettings">清空</n-button>
          <n-button secondary @click="openAiRequestLogs">AI 调用日志</n-button>
        </div>

        <n-alert v-if="validationMessage" :type="validationAlertType" :show-icon="false">
          {{ validationMessage }}
        </n-alert>

        <n-alert v-if="savedMessage" type="success" :show-icon="false">
          {{ savedMessage }}
        </n-alert>

        <n-text depth="3">配置保存在本机；如果本机没有保存值，会读取项目根目录的 .env 默认值。</n-text>
      </n-space>
    </n-card>

    <n-card class="settings-card settings-model-card">
      <n-space vertical size="large">
        <div class="settings-section-head">
          <strong>模型管理</strong>
          <n-text depth="3">先只展示当前真实可用模型，避免把不可用能力暴露给用户。</n-text>
        </div>

        <div class="settings-model-purpose-grid">
          <n-card
            v-for="item in AI_MODEL_CAPABILITIES"
            :key="item.id"
            class="settings-model-purpose-card"
            size="small"
          >
            <div class="settings-model-purpose-head">
              <strong>{{ item.title }}</strong>
              <n-tag size="small" :type="getModelStatusType(item.status)">
                {{ getModelStatusLabel(item.status) }}
              </n-tag>
            </div>
            <div class="settings-model-current">
              <span>{{ item.provider }}</span>
              <strong>{{ item.model }}</strong>
            </div>
            <p>{{ item.desc }}</p>
          </n-card>
        </div>

        <n-alert type="info" :show-icon="false">
          当前已接入 AIHubMix 文本、图像和 Seedance 视频模型；配音等接口后续再开放配置。
        </n-alert>
      </n-space>
    </n-card>
  </div>
</template>
