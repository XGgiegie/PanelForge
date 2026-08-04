<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NForm,
  NFormItem,
  NImage,
  NInput,
  NSelect,
  NSpace,
  NText,
} from 'naive-ui'

import {
  AI_IMAGE_ASPECT_RATIO_OPTIONS,
  AI_IMAGE_RESOLUTION_OPTIONS,
  generateAiImage,
  type AiImageAspectRatio,
  type AiImageResolution,
  type GeneratedAiImage,
} from '../services/aiImageGeneration'
import { openAiDrawingHistoryWindow } from '../services/aiImageHistory'
import { useAiSettingsStore } from '../stores/aiSettings'

const aiSettings = useAiSettingsStore()
const prompt = ref('')
const style = ref('精致2D漫剧')
const ratio = ref<AiImageAspectRatio>('9:16')
const resolution = ref<AiImageResolution>('1K')
const generatedImage = ref<GeneratedAiImage | null>(null)
const isGenerating = ref(false)
const isOpeningHistory = ref(false)
const generationError = ref('')
const historyError = ref('')

const styleOptions = [
  { label: '精致2D漫剧', value: '精致2D漫剧' },
  { label: '角色定妆图', value: '角色定妆图' },
  { label: '电影分镜', value: '电影分镜' },
  { label: '场景概念图', value: '场景概念图' },
]

const canGenerate = computed(() => aiSettings.canUseAiHubMix && prompt.value.trim().length > 0 && !isGenerating.value)
const resultImageSrc = computed(() => generatedImage.value?.imageUrl || generatedImage.value?.imageDataUrl || '')
const storageAlertType = computed(() => (generatedImage.value?.storage?.status === 'saved' ? 'success' : 'warning'))

function createDrawingPrompt() {
  return [
    `画风：${style.value}`,
    `输出规格：${ratio.value}，${resolution.value}`,
    '目标：生成可用于 AI 漫剧生产的视觉资产。',
    '要求：精致2D，构图清晰，主体突出，光影干净，画面细腻，无 LOGO，无水印，无无关文字。',
    '',
    prompt.value.trim(),
  ].join('\n')
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '图片生成失败，请稍后重试。'
}

async function openHistoryWindow() {
  isOpeningHistory.value = true
  historyError.value = ''

  try {
    await openAiDrawingHistoryWindow()
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '生成记录窗口打开失败。'
  } finally {
    isOpeningHistory.value = false
  }
}

async function generateImage() {
  if (!canGenerate.value) {
    return
  }

  isGenerating.value = true
  generationError.value = ''

  try {
    generatedImage.value = await generateAiImage({
      apiKey: aiSettings.aihubmixApiKey,
      appCode: aiSettings.aihubmixAppCode,
      prompt: createDrawingPrompt(),
      rawPrompt: prompt.value.trim(),
      style: style.value,
      aspectRatio: ratio.value,
      resolution: resolution.value,
      model: aiSettings.imageModel,
      source: 'ai-drawing',
    })
  } catch (error) {
    generationError.value = getErrorMessage(error)
  } finally {
    isGenerating.value = false
  }
}

onMounted(() => {
  void aiSettings.loadProviderDefaults()
})
</script>

<template>
  <n-space vertical size="large" class="tool-view ai-drawing-view">
    <section class="view-title">
      <div>
        <n-text depth="3">基于小说内容生成视觉资产</n-text>
        <h2>AI绘图</h2>
      </div>
      <n-button secondary :loading="isOpeningHistory" @click="openHistoryWindow">
        生成记录
      </n-button>
    </section>

    <n-alert v-if="!aiSettings.canUseAiHubMix" type="warning" :show-icon="false">
      请先在设置中配置 AIHubMix Key 和 APP-Code。
    </n-alert>

    <n-alert v-if="historyError" type="error" :show-icon="false">
      {{ historyError }}
    </n-alert>

    <div class="ai-drawing-workbench">
      <n-card title="操作栏" class="ai-drawing-side-card">
        <n-form label-placement="top">
          <n-form-item label="画面描述">
            <n-input
              v-model:value="prompt"
              type="textarea"
              placeholder="输入角色、场景、镜头、情绪等画面描述"
              :autosize="{ minRows: 8, maxRows: 14 }"
            />
          </n-form-item>
          <div class="ai-drawing-option-row">
            <n-form-item label="画风">
              <n-select v-model:value="style" :options="styleOptions" />
            </n-form-item>
            <n-form-item label="画幅">
              <n-select v-model:value="ratio" :options="AI_IMAGE_ASPECT_RATIO_OPTIONS" />
            </n-form-item>
            <n-form-item label="分辨率">
              <n-select v-model:value="resolution" :options="AI_IMAGE_RESOLUTION_OPTIONS" />
            </n-form-item>
          </div>
        </n-form>

        <n-button
          block
          type="primary"
          size="large"
          :loading="isGenerating"
          :disabled="!canGenerate"
          @click="generateImage"
        >
          生成图片
        </n-button>

        <n-text class="ai-drawing-note" depth="3">
          生成成功后会自动保存到 MinIO，并进入生成记录。
        </n-text>
      </n-card>

      <n-card title="生成结果" class="ai-drawing-result-card">
        <template #header-extra>
          <n-button
            v-if="generatedImage?.imageUrl"
            tag="a"
            :href="generatedImage.imageUrl"
            target="_blank"
            size="small"
            secondary
          >
            打开原图
          </n-button>
        </template>

        <div class="ai-drawing-preview">
          <n-image
            v-if="resultImageSrc"
            :src="resultImageSrc"
            :alt="prompt || 'AI 生成图片'"
            object-fit="cover"
          />
          <div v-else class="ai-drawing-empty">
            <strong>{{ isGenerating ? '图片生成中' : '等待生成' }}</strong>
            <span>{{ aiSettings.imageModel }} · {{ ratio }} · {{ resolution }}</span>
          </div>
        </div>

        <n-alert v-if="generationError" class="ai-drawing-message" type="error" :show-icon="false">
          {{ generationError }}
        </n-alert>

        <n-alert
          v-if="generatedImage?.storage"
          class="ai-drawing-message"
          :type="storageAlertType"
          :show-icon="false"
        >
          {{ generatedImage.storage.message }}
        </n-alert>

        <n-text v-if="generatedImage?.text" class="ai-drawing-message" depth="3">
          {{ generatedImage.text }}
        </n-text>
      </n-card>
    </div>
  </n-space>
</template>
