/// <reference types="vite/client" />

type PanelForgeRuntimeVersions = {
  node: string
  chrome: string
  electron: string
}

type PanelForgePingResponse = {
  status: string
  at: string
}

type PanelForgeUpdateState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

type PanelForgeAiHubMixChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type PanelForgeAiHubMixChatCompletionRequest = {
  apiKey: string
  appCode?: string
  model: string
  messages: PanelForgeAiHubMixChatMessage[]
  temperature?: number
}

type PanelForgeAiHubMixChatCompletionResponse = {
  content: string
  model: string
}

type PanelForgeAiHubMixKeyValidationResponse = {
  valid: true
  model: 'gpt-5.5'
}

type PanelForgeAiHubMixDefaultConfigResponse = {
  apiKey: string
  appCode: string
  textModel: string
  imageModel: string
  videoModel: string
}

type PanelForgeAiHubMixImageGenerationRequest = {
  apiKey: string
  appCode?: string
  model?: string
  prompt: string
  rawPrompt?: string
  style?: string
  aspectRatio?: string
  resolution?: string
  source?: string
  referenceImages?: string[]
}

type PanelForgeAiImageStorageStatus = {
  status: 'saved' | 'failed'
  message: string
  recordId?: string
  objectKey?: string
  bucket?: string
}

type PanelForgeAiHubMixImageGenerationResponse = {
  imageDataUrl: string
  imageUrl?: string
  text: string
  model: string
  aspectRatio: string
  resolution: string
  storage?: PanelForgeAiImageStorageStatus
}

type PanelForgeAiHubMixVideoReferenceContent = {
  type: 'image_url' | 'video_url' | 'audio_url'
  image_url?: {
    url: string
  }
  video_url?: {
    url: string
  }
  audio_url?: {
    url: string
  }
  role?: 'reference_image' | 'reference_video' | 'reference_audio'
}

type PanelForgeAiHubMixVideoGenerationRequest = {
  apiKey: string
  appCode?: string
  model?: string
  prompt: string
  firstFrameImageUrl?: string
  content?: PanelForgeAiHubMixVideoReferenceContent[]
  ratio?: string
  duration?: number
  watermark?: boolean
}

type PanelForgeAiHubMixVideoGenerationResponse = {
  videoUrl: string
  taskId: string
  status: string
  model: string
  ratio: string
  duration: number
  rawResponse: string
}

type PanelForgeOpenChapterSourceWindowRequest = {
  routeHash: string
  title?: string
}

type PanelForgeOpenChapterCanvasWindowRequest = {
  routeHash: string
  title?: string
}

type PanelForgeOpenCharacterWorkspaceWindowRequest = {
  routeHash: string
  title?: string
}

type PanelForgeUpdateStatus = {
  state: PanelForgeUpdateState
  message: string
  checkedAt?: string
  feedUrl?: string
  info?: {
    version: string
    releaseName?: string
    releaseDate?: string
  }
  progress?: {
    percent: number
    transferred: number
    total: number
    bytesPerSecond: number
  }
  error?: string
  canCheck: boolean
  canDownload: boolean
  canInstall: boolean
}

type PanelForgeAPI = {
  versions: PanelForgeRuntimeVersions
  platform: string
  ping: () => Promise<PanelForgePingResponse>
  windows: {
    openChapterSourceWindow: (
      request: PanelForgeOpenChapterSourceWindowRequest,
    ) => Promise<{ opened: true }>
    openChapterCanvasWindow: (
      request: PanelForgeOpenChapterCanvasWindowRequest,
    ) => Promise<{ opened: true }>
    openCharacterWorkspaceWindow: (
      request: PanelForgeOpenCharacterWorkspaceWindowRequest,
    ) => Promise<{ opened: true }>
  }
  aihubmix: {
    getDefaultConfig: () => Promise<PanelForgeAiHubMixDefaultConfigResponse>
    validateKey: (apiKey: string, appCode?: string) => Promise<PanelForgeAiHubMixKeyValidationResponse>
    chatCompletion: (
      request: PanelForgeAiHubMixChatCompletionRequest,
    ) => Promise<PanelForgeAiHubMixChatCompletionResponse>
    generateImage: (
      request: PanelForgeAiHubMixImageGenerationRequest,
    ) => Promise<PanelForgeAiHubMixImageGenerationResponse>
    generateVideo: (
      request: PanelForgeAiHubMixVideoGenerationRequest,
    ) => Promise<PanelForgeAiHubMixVideoGenerationResponse>
  }
  updater: {
    getStatus: () => Promise<PanelForgeUpdateStatus>
    check: () => Promise<PanelForgeUpdateStatus>
    download: () => Promise<PanelForgeUpdateStatus>
    quitAndInstall: () => Promise<PanelForgeUpdateStatus>
    onStatus: (listener: (status: PanelForgeUpdateStatus) => void) => () => void
  }
}

interface Window {
  panelForge?: PanelForgeAPI
}
