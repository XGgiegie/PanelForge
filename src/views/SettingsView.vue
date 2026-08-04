<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NDivider, NInput, NSelect, NSpace, NSwitch, NTag, NText } from 'naive-ui'

import {
  DEFAULT_MODEL_IDS,
  useAiSettingsStore,
  type AiModelCapability,
  type DefaultAiModelIds,
  type ManagedAiModel,
} from '../stores/aiSettings'

type ValidationStatus = 'idle' | 'checking' | 'valid' | 'error'

const aiSettings = useAiSettingsStore()
const draftKey = ref('')
const draftModels = ref<ManagedAiModel[]>([])
const draftDefaultModelIds = ref<DefaultAiModelIds>({ ...DEFAULT_MODEL_IDS })
const savedMessage = ref('')
const modelSavedMessage = ref('')
const validationStatus = ref<ValidationStatus>('idle')
const validationMessage = ref('')

const hasSavedKey = computed(() => aiSettings.hasApiKey)
const isValidating = computed(() => validationStatus.value === 'checking')
const canValidateKey = computed(() => draftKey.value.trim().length > 0 && !isValidating.value)
const validationAlertType = computed(() => validationStatus.value === 'valid' ? 'success' as const : 'error' as const)
const enabledModelCount = computed(() => draftModels.value.filter((model) => model.enabled).length)
const hasInvalidModel = computed(() =>
  draftModels.value.some((model) => !model.name.trim() || !model.provider.trim() || !model.model.trim()),
)
const analysisModelLabel = computed(() => {
  const model = draftModels.value.find((item) => item.id === draftDefaultModelIds.value.analysis)

  return model ? `${model.provider} / ${model.model}` : '未选择'
})

const capabilityOptions: { label: string; value: AiModelCapability }[] = [
  { label: '章节分析', value: 'analysis' },
  { label: '分镜拆解', value: 'storyboard' },
  { label: '首帧绘图', value: 'image' },
  { label: '视频生成', value: 'video' },
  { label: '配音', value: 'voice' },
]

const modelPurposeCards: { capability: AiModelCapability; title: string; desc: string }[] = [
  {
    capability: 'analysis',
    title: '章节分析',
    desc: '理解小说正文，提取角色、冲突和章节节奏。',
  },
  {
    capability: 'storyboard',
    title: '分镜拆解',
    desc: '把章节分析变成画布里的分镜节点。',
  },
  {
    capability: 'image',
    title: '首帧绘图',
    desc: '生成角色资产、场景资产和分镜首帧图。',
  },
  {
    capability: 'video',
    title: '视频生成',
    desc: '基于首帧图和视频提示词生成单分镜视频。',
  },
  {
    capability: 'voice',
    title: '配音',
    desc: '后续用于旁白、对白和角色声线。',
  },
]

const capabilityLabels: Record<AiModelCapability, string> = {
  analysis: '章节分析',
  storyboard: '分镜拆解',
  image: '首帧绘图',
  video: '视频生成',
  voice: '配音',
}

function cloneModels(models: ManagedAiModel[]) {
  return models.map((model) => ({ ...model }))
}

function syncModelDrafts() {
  draftModels.value = cloneModels(aiSettings.managedModels)
  draftDefaultModelIds.value = { ...aiSettings.defaultModelIds }
}

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
    validationMessage.value = 'Key 有效，模型调用测试已通过。'
  } catch (error) {
    validationStatus.value = 'error'
    validationMessage.value = getValidationErrorMessage(error)
  }
}

watch(draftKey, () => {
  validationStatus.value = 'idle'
  validationMessage.value = ''
})

function getModelOptions(capability: AiModelCapability) {
  return draftModels.value
    .filter((model) => model.capability === capability)
    .map((model) => ({
      label: `${model.name} · ${model.provider} / ${model.model}${model.enabled ? '' : '（停用）'}`,
      value: model.id,
      disabled: !model.enabled,
    }))
}

function createModelId() {
  return `custom-model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function addModel() {
  draftModels.value.unshift({
    id: createModelId(),
    name: '自定义模型',
    provider: 'AIHubMix',
    model: '',
    capability: 'image',
    enabled: true,
    note: '',
  })
  modelSavedMessage.value = ''
}

function removeModel(id: string) {
  draftModels.value = draftModels.value.filter((model) => model.id !== id)

  modelPurposeCards.forEach((purpose) => {
    if (draftDefaultModelIds.value[purpose.capability] === id) {
      draftDefaultModelIds.value[purpose.capability] =
        draftModels.value.find((model) => model.capability === purpose.capability)?.id ?? DEFAULT_MODEL_IDS[purpose.capability]
    }
  })

  modelSavedMessage.value = ''
}

function saveModelSettings() {
  if (hasInvalidModel.value) {
    modelSavedMessage.value = ''
    return
  }

  aiSettings.saveModelSettings(draftModels.value, draftDefaultModelIds.value)
  syncModelDrafts()
  modelSavedMessage.value = '模型配置已保存'
}

function resetModelSettings() {
  aiSettings.resetModelSettings()
  syncModelDrafts()
  modelSavedMessage.value = '模型配置已恢复默认'
}

onMounted(() => {
  aiSettings.loadSettings()
  draftKey.value = aiSettings.aihubmixApiKey
  syncModelDrafts()
})
</script>

<template>
  <div class="settings-view">
    <n-card class="settings-card">
      <n-space vertical size="large">
        <div class="settings-section-head">
          <strong>AIHubMix</strong>
          <n-text depth="3">当前章节分析默认模型：{{ analysisModelLabel }}</n-text>
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

    <n-card class="settings-card settings-model-card">
      <n-space vertical size="large">
        <div class="settings-section-head settings-section-head--row">
          <div>
            <strong>模型管理</strong>
            <n-text depth="3">先确定每个生产步骤默认用哪个模型。</n-text>
          </div>
          <n-tag size="small">{{ enabledModelCount }} 个已启用</n-tag>
        </div>

        <div class="settings-model-purpose-grid">
          <n-card
            v-for="purpose in modelPurposeCards"
            :key="purpose.capability"
            class="settings-model-purpose-card"
            size="small"
          >
            <div class="settings-model-purpose-head">
              <strong>{{ purpose.title }}</strong>
              <n-tag size="small">{{ capabilityLabels[purpose.capability] }}</n-tag>
            </div>
            <p>{{ purpose.desc }}</p>
            <n-select
              v-model:value="draftDefaultModelIds[purpose.capability]"
              :options="getModelOptions(purpose.capability)"
              placeholder="选择默认模型"
            />
          </n-card>
        </div>

        <n-divider />

        <div class="settings-model-list-head">
          <div class="settings-section-head">
            <strong>模型列表</strong>
            <n-text depth="3">模型 ID 先按平台真实名称填写，后续接接口时直接复用。</n-text>
          </div>
          <n-button type="primary" @click="addModel">新增模型</n-button>
        </div>

        <div class="settings-model-list">
          <n-card
            v-for="model in draftModels"
            :key="model.id"
            class="settings-model-item"
            size="small"
          >
            <div class="settings-model-item-grid">
              <label>
                <span>名称</span>
                <n-input v-model:value="model.name" placeholder="例如：首帧绘图" />
              </label>
              <label>
                <span>平台</span>
                <n-input v-model:value="model.provider" placeholder="例如：AIHubMix / Seedance" />
              </label>
              <label>
                <span>模型 ID</span>
                <n-input v-model:value="model.model" placeholder="例如：gpt-5.5 / seedance-2.0" />
              </label>
              <label>
                <span>用途</span>
                <n-select v-model:value="model.capability" :options="capabilityOptions" />
              </label>
            </div>

            <label class="settings-model-note">
              <span>备注</span>
              <n-input v-model:value="model.note" type="textarea" placeholder="这个模型适合做什么" :autosize="{ minRows: 2, maxRows: 4 }" />
            </label>

            <div class="settings-model-item-actions">
              <div class="settings-model-switch">
                <n-switch v-model:value="model.enabled" />
                <span>{{ model.enabled ? '启用' : '停用' }}</span>
              </div>
              <n-button quaternary type="error" @click="removeModel(model.id)">删除</n-button>
            </div>
          </n-card>
        </div>

        <div class="settings-actions">
          <n-button type="primary" :disabled="hasInvalidModel" @click="saveModelSettings">保存模型配置</n-button>
          <n-button @click="resetModelSettings">恢复默认</n-button>
        </div>

        <n-alert v-if="hasInvalidModel" type="warning" :show-icon="false">
          请补全模型名称、平台和模型 ID 后再保存。
        </n-alert>

        <n-alert v-if="modelSavedMessage" type="success" :show-icon="false">
          {{ modelSavedMessage }}
        </n-alert>
      </n-space>
    </n-card>
  </div>
</template>
