import { defineStore } from 'pinia'

const AI_SETTINGS_STORAGE_KEY = 'panelforge:ai-settings'

export type AiModelCapability = 'analysis' | 'storyboard' | 'image' | 'video' | 'voice'

export type ManagedAiModel = {
  id: string
  name: string
  provider: string
  model: string
  capability: AiModelCapability
  enabled: boolean
  note: string
}

export type DefaultAiModelIds = Record<AiModelCapability, string>

type StoredAiSettings = {
  aihubmixApiKey?: string
  defaultModelIds?: Partial<DefaultAiModelIds>
  managedModels?: ManagedAiModel[]
}

export const DEFAULT_AI_MODELS: ManagedAiModel[] = [
  {
    id: 'analysis-gpt-55',
    name: '章节分析',
    provider: 'AIHubMix',
    model: 'gpt-5.5',
    capability: 'analysis',
    enabled: true,
    note: '用于理解正文、提取人物、矛盾和章节节奏。',
  },
  {
    id: 'storyboard-gpt-55',
    name: '分镜拆解',
    provider: 'AIHubMix',
    model: 'gpt-5.5',
    capability: 'storyboard',
    enabled: true,
    note: '把单章分析结果拆成可生成的分镜节点。',
  },
  {
    id: 'first-frame-image',
    name: '首帧绘图',
    provider: '待接入',
    model: 'image-model',
    capability: 'image',
    enabled: false,
    note: '用于角色资产、场景资产和分镜首帧图。',
  },
  {
    id: 'seedance-20-video',
    name: 'Seedance 视频',
    provider: 'Seedance',
    model: 'seedance-2.0',
    capability: 'video',
    enabled: true,
    note: '基于首帧图和视频提示词生成单分镜视频。',
  },
  {
    id: 'voiceover-model',
    name: '配音模型',
    provider: '待接入',
    model: 'voice-model',
    capability: 'voice',
    enabled: false,
    note: '后续用于旁白、对白和角色声线。',
  },
]

export const DEFAULT_MODEL_IDS: DefaultAiModelIds = {
  analysis: 'analysis-gpt-55',
  storyboard: 'storyboard-gpt-55',
  image: 'first-frame-image',
  video: 'seedance-20-video',
  voice: 'voiceover-model',
}

function cloneDefaultModels() {
  return DEFAULT_AI_MODELS.map((model) => ({ ...model }))
}

function createDefaultModelIds(settings?: Partial<DefaultAiModelIds>): DefaultAiModelIds {
  return {
    ...DEFAULT_MODEL_IDS,
    ...(settings ?? {}),
  }
}

function normalizeManagedModels(models?: ManagedAiModel[]) {
  if (!Array.isArray(models) || models.length === 0) {
    return cloneDefaultModels()
  }

  const validCapabilities: AiModelCapability[] = ['analysis', 'storyboard', 'image', 'video', 'voice']

  return models
    .map((model) => ({
      id: String(model.id ?? '').trim(),
      name: String(model.name ?? '').trim(),
      provider: String(model.provider ?? '').trim(),
      model: String(model.model ?? '').trim(),
      capability: validCapabilities.includes(model.capability) ? model.capability : 'analysis',
      enabled: Boolean(model.enabled),
      note: String(model.note ?? '').trim(),
    }))
    .filter((model) => model.id && model.name && model.model)
}

function readStoredSettings() {
  if (typeof localStorage === 'undefined') {
    return {
      aihubmixApiKey: '',
      managedModels: cloneDefaultModels(),
      defaultModelIds: createDefaultModelIds(),
    }
  }

  try {
    const rawValue = localStorage.getItem(AI_SETTINGS_STORAGE_KEY)
    const settings = rawValue ? (JSON.parse(rawValue) as StoredAiSettings) : {}

    return {
      aihubmixApiKey: settings.aihubmixApiKey ?? '',
      managedModels: normalizeManagedModels(settings.managedModels),
      defaultModelIds: createDefaultModelIds(settings.defaultModelIds),
    }
  } catch {
    return {
      aihubmixApiKey: '',
      managedModels: cloneDefaultModels(),
      defaultModelIds: createDefaultModelIds(),
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
    managedModels: cloneDefaultModels(),
    defaultModelIds: createDefaultModelIds(),
    isLoaded: false,
  }),
  getters: {
    hasApiKey: (state) => state.aihubmixApiKey.trim().length > 0,
    getModelByCapability: (state) => (capability: AiModelCapability) => {
      const defaultId = state.defaultModelIds[capability]

      return (
        state.managedModels.find((model) => model.id === defaultId && model.enabled) ??
        state.managedModels.find((model) => model.capability === capability && model.enabled) ??
        null
      )
    },
  },
  actions: {
    writeSettings() {
      writeStoredSettings({
        aihubmixApiKey: this.aihubmixApiKey,
        managedModels: this.managedModels,
        defaultModelIds: this.defaultModelIds,
      })
    },
    loadSettings() {
      if (this.isLoaded) {
        return
      }

      const settings = readStoredSettings()
      this.aihubmixApiKey = settings.aihubmixApiKey
      this.managedModels = settings.managedModels
      this.defaultModelIds = settings.defaultModelIds
      this.isLoaded = true
    },
    saveAihubmixApiKey(value: string) {
      this.aihubmixApiKey = value.trim()
      this.isLoaded = true
      this.writeSettings()
    },
    clearAihubmixApiKey() {
      this.aihubmixApiKey = ''
      this.isLoaded = true
      this.writeSettings()
    },
    saveModelSettings(models: ManagedAiModel[], defaultModelIds: DefaultAiModelIds) {
      this.managedModels = normalizeManagedModels(models)
      this.defaultModelIds = createDefaultModelIds(defaultModelIds)
      this.isLoaded = true
      this.writeSettings()
    },
    resetModelSettings() {
      this.managedModels = cloneDefaultModels()
      this.defaultModelIds = createDefaultModelIds()
      this.isLoaded = true
      this.writeSettings()
    },
  },
})
