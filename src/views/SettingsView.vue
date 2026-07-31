<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NInput, NSpace, NText } from 'naive-ui'

import { useAiSettingsStore } from '../stores/aiSettings'

type ValidationStatus = 'idle' | 'checking' | 'valid' | 'error'

const aiSettings = useAiSettingsStore()
const draftKey = ref('')
const savedMessage = ref('')
const validationStatus = ref<ValidationStatus>('idle')
const validationMessage = ref('')

const hasSavedKey = computed(() => aiSettings.hasApiKey)
const isValidating = computed(() => validationStatus.value === 'checking')
const canValidateKey = computed(() => draftKey.value.trim().length > 0 && !isValidating.value)
const validationAlertType = computed(() => validationStatus.value === 'valid' ? 'success' as const : 'error' as const)

function saveKey() {
  aiSettings.saveAihubmixApiKey(draftKey.value)
  savedMessage.value = aiSettings.hasApiKey ? 'AIHubMix Key 已保存' : 'AIHubMix Key 已清空'
}

function clearKey() {
  draftKey.value = ''
  aiSettings.clearAihubmixApiKey()
  savedMessage.value = 'AIHubMix Key 已清空'
}

function getValidationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'AIHubMix Key 验证失败，请稍后重试。'

  return message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

async function validateKey() {
  const apiKey = draftKey.value.trim()

  if (!apiKey) {
    validationStatus.value = 'error'
    validationMessage.value = '请先填写 AIHubMix Key。'
    return
  }

  if (!window.panelForge?.aihubmix) {
    validationStatus.value = 'error'
    validationMessage.value = '请在 Electron 客户端中验证 Key。'
    return
  }

  savedMessage.value = ''
  validationStatus.value = 'checking'
  validationMessage.value = ''

  try {
    await window.panelForge.aihubmix.validateKey(apiKey)
    validationStatus.value = 'valid'
    validationMessage.value = 'Key 有效，gpt-5.5 调用测试已通过。'
  } catch (error) {
    validationStatus.value = 'error'
    validationMessage.value = getValidationErrorMessage(error)
  }
}

watch(draftKey, () => {
  validationStatus.value = 'idle'
  validationMessage.value = ''
})

onMounted(() => {
  aiSettings.loadSettings()
  draftKey.value = aiSettings.aihubmixApiKey
})
</script>

<template>
  <div class="settings-view">
    <n-card class="settings-card">
      <n-space vertical size="large">
        <div class="settings-section-head">
          <strong>AIHubMix</strong>
          <n-text depth="3">章节 AI 分析使用 gpt-5.5</n-text>
        </div>

        <n-input
          v-model:value="draftKey"
          type="password"
          show-password-on="click"
          clearable
          placeholder="填写 AIHubMix API Key"
        />

        <div class="settings-actions">
          <n-button
            :loading="isValidating"
            :disabled="!canValidateKey"
            @click="validateKey"
          >
            验证 Key
          </n-button>
          <n-button type="primary" @click="saveKey">保存</n-button>
          <n-button :disabled="!hasSavedKey && !draftKey" @click="clearKey">清空</n-button>
        </div>

        <n-alert
          v-if="validationMessage"
          :type="validationAlertType"
          :show-icon="false"
        >
          {{ validationMessage }}
        </n-alert>

        <n-alert v-if="savedMessage" type="success" :show-icon="false">
          {{ savedMessage }}
        </n-alert>

        <n-text depth="3">Key 保存在本机，用于调用 https://aihubmix.com/v1。</n-text>
      </n-space>
    </n-card>
  </div>
</template>