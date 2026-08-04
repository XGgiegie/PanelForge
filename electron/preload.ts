import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

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

type PanelForgeAiImageRecord = {
  id: string
  prompt: string
  rawPrompt: string
  style: string
  source: string
  model: string
  aspectRatio: string
  resolution: string
  text: string
  bucket: string
  objectKey: string
  imageUrl: string
  mimeType: string
  size: number
  createdAt: string
}

type PanelForgeOpenChapterSourceWindowRequest = {
  routeHash: string
  title?: string
}

type PanelForgeOpenChapterCanvasWindowRequest = {
  routeHash: string
  title?: string
}

type PanelForgeOpenAiDrawingHistoryWindowRequest = {
  routeHash?: string
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

const panelForgeApi = {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  platform: process.platform,
  ping: () => ipcRenderer.invoke('app:ping') as Promise<PanelForgePingResponse>,
  windows: {
    openChapterSourceWindow: (request: PanelForgeOpenChapterSourceWindowRequest) =>
      ipcRenderer.invoke('window:open-chapter-source', request) as Promise<{ opened: true }>,
    openChapterCanvasWindow: (request: PanelForgeOpenChapterCanvasWindowRequest) =>
      ipcRenderer.invoke('window:open-chapter-canvas', request) as Promise<{ opened: true }>,
    openAiDrawingHistoryWindow: (request: PanelForgeOpenAiDrawingHistoryWindowRequest = {}) =>
      ipcRenderer.invoke('window:open-ai-drawing-history', request) as Promise<{ opened: true }>,
  },
  aihubmix: {
    getDefaultConfig: () =>
      ipcRenderer.invoke('aihubmix:get-default-config') as Promise<PanelForgeAiHubMixDefaultConfigResponse>,
    validateKey: (apiKey: string, appCode?: string) =>
      ipcRenderer.invoke('aihubmix:validate-key', { apiKey, appCode }) as Promise<PanelForgeAiHubMixKeyValidationResponse>,
    chatCompletion: (request: PanelForgeAiHubMixChatCompletionRequest) =>
      ipcRenderer.invoke('aihubmix:chat-completion', request) as Promise<PanelForgeAiHubMixChatCompletionResponse>,
    generateImage: (request: PanelForgeAiHubMixImageGenerationRequest) =>
      ipcRenderer.invoke('aihubmix:generate-image', request) as Promise<PanelForgeAiHubMixImageGenerationResponse>,
    listImageRecords: () =>
      ipcRenderer.invoke('aihubmix:list-image-records') as Promise<PanelForgeAiImageRecord[]>,
    deleteImageRecord: (recordId: string) =>
      ipcRenderer.invoke('aihubmix:delete-image-record', recordId) as Promise<{ deleted: boolean }>,
    generateVideo: (request: PanelForgeAiHubMixVideoGenerationRequest) =>
      ipcRenderer.invoke('aihubmix:generate-video', request) as Promise<PanelForgeAiHubMixVideoGenerationResponse>,
  },
  updater: {
    getStatus: () => ipcRenderer.invoke('update:get-status') as Promise<PanelForgeUpdateStatus>,
    check: () => ipcRenderer.invoke('update:check') as Promise<PanelForgeUpdateStatus>,
    download: () => ipcRenderer.invoke('update:download') as Promise<PanelForgeUpdateStatus>,
    quitAndInstall: () => ipcRenderer.invoke('update:quit-and-install') as Promise<PanelForgeUpdateStatus>,
    onStatus(listener: (status: PanelForgeUpdateStatus) => void) {
      const subscription = (_event: IpcRendererEvent, status: PanelForgeUpdateStatus) => listener(status)
      ipcRenderer.on('update:status', subscription)

      return () => {
        ipcRenderer.off('update:status', subscription)
      }
    },
  },
}

contextBridge.exposeInMainWorld('panelForge', panelForgeApi)

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...listenerArgs) => listener(event, ...listenerArgs))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})
