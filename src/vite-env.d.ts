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

type PanelForgeOpenChapterSourceWindowRequest = {
  routeHash: string
  title?: string
}

type PanelForgeOpenChapterCanvasWindowRequest = {
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
  }
  aihubmix: {
    validateKey: (apiKey: string) => Promise<PanelForgeAiHubMixKeyValidationResponse>
    chatCompletion: (
      request: PanelForgeAiHubMixChatCompletionRequest,
    ) => Promise<PanelForgeAiHubMixChatCompletionResponse>
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
