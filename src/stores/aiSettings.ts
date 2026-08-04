import { defineStore } from 'pinia'

const AI_SETTINGS_STORAGE_KEY = 'panelforge:ai-settings'

export const AIHUBMIX_TEXT_MODEL = 'gpt-5.5'
export const AIHUBMIX_IMAGE_MODEL = 'gemini-3-pro-image'
export const AIHUBMIX_VIDEO_MODEL = 'doubao-seedance-2-0-260128'

export type AiModelStatus = 'available' | 'planned'

export type AiModelCapability = {
  id: string
  title: string
  provider: string
  model: string
  status: AiModelStatus
  desc: string
}

type StoredAiSettings = {
  aihubmixApiKey?: string
  aihubmixAppCode?: string
}

type AiHubMixDefaultConfig = {
  apiKey?: string
  appCode?: string
  textModel?: string
  imageModel?: string
  videoModel?: string
}

export const AI_MODEL_CAPABILITIES: AiModelCapability[] = [
  {
    id: 'text',
    title: '文本模型',
    provider: 'AIHubMix',
    model: AIHUBMIX_TEXT_MODEL,
    status: 'available',
    desc: '用于章节分析、角色理解和分镜拆解。',
  },
  {
    id: 'image',
    title: '绘图模型',
    provider: 'AIHubMix',
    model: AIHUBMIX_IMAGE_MODEL,
    status: 'available',
    desc: '用于角色资产、场景资产和分镜首帧图。',
  },
  {
    id: 'video',
    title: '视频模型',
    provider: 'AIHubMix',
    model: AIHUBMIX_VIDEO_MODEL,
    status: 'available',
    desc: '用于首帧图到单分镜视频。',
  },
  {
    id: 'voice',
    title: '配音模型',
    provider: '待接入',
    model: '未配置',
    status: 'planned',
    desc: '后续用于旁白、对白和角色声线。',
  },
]

function readStoredSettings(): StoredAiSettings {
  if (typeof localStorage === 'undefined') {
    return {
      aihubmixApiKey: '',
      aihubmixAppCode: '',
    }
  }

  try {
    const rawValue = localStorage.getItem(AI_SETTINGS_STORAGE_KEY)
    const settings = rawValue ? (JSON.parse(rawValue) as StoredAiSettings) : {}

    return {
      aihubmixApiKey: settings.aihubmixApiKey ?? '',
      aihubmixAppCode: settings.aihubmixAppCode ?? '',
    }
  } catch {
    return {
      aihubmixApiKey: '',
      aihubmixAppCode: '',
    }
  }
}

function writeStoredSettings(settings: StoredAiSettings) {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export const useAiSettingsStore = defineStore('aiSettings', {
  state: () => ({
    aihubmixApiKey: '',
    aihubmixAppCode: '',
    textModel: AIHUBMIX_TEXT_MODEL,
    imageModel: AIHUBMIX_IMAGE_MODEL,
    videoModel: AIHUBMIX_VIDEO_MODEL,
    isLoaded: false,
    isProviderDefaultLoaded: false,
  }),
  getters: {
    hasApiKey: (state) => state.aihubmixApiKey.trim().length > 0,
    hasAppCode: (state) => state.aihubmixAppCode.trim().length > 0,
    canUseAiHubMix: (state) => state.aihubmixApiKey.trim().length > 0 && state.aihubmixAppCode.trim().length > 0,
  },
  actions: {
    loadSettings() {
      if (this.isLoaded) {
        return
      }

      const settings = readStoredSettings()
      this.aihubmixApiKey = settings.aihubmixApiKey?.trim() ?? ''
      this.aihubmixAppCode = settings.aihubmixAppCode?.trim() ?? ''
      this.isLoaded = true
    },
    async loadProviderDefaults() {
      this.loadSettings()

      if (this.isProviderDefaultLoaded) {
        return
      }

      try {
        const defaults = (await window.panelForge?.aihubmix.getDefaultConfig()) as AiHubMixDefaultConfig | undefined

        if (!this.aihubmixApiKey && defaults?.apiKey) {
          this.aihubmixApiKey = defaults.apiKey.trim()
        }

        if (!this.aihubmixAppCode && defaults?.appCode) {
          this.aihubmixAppCode = defaults.appCode.trim()
        }

        this.textModel = defaults?.textModel?.trim() || AIHUBMIX_TEXT_MODEL
        this.imageModel = defaults?.imageModel?.trim() || AIHUBMIX_IMAGE_MODEL
        this.videoModel = defaults?.videoModel?.trim() || AIHUBMIX_VIDEO_MODEL
      } finally {
        this.isProviderDefaultLoaded = true
      }
    },
    saveAihubmixSettings(apiKey: string, appCode: string) {
      this.aihubmixApiKey = apiKey.trim()
      this.aihubmixAppCode = appCode.trim()
      this.isLoaded = true
      writeStoredSettings({
        aihubmixApiKey: this.aihubmixApiKey,
        aihubmixAppCode: this.aihubmixAppCode,
      })
    },
    clearAihubmixSettings() {
      this.aihubmixApiKey = ''
      this.aihubmixAppCode = ''
      this.isLoaded = true
      writeStoredSettings({
        aihubmixApiKey: '',
        aihubmixAppCode: '',
      })
    },
  },
})
