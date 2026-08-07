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
  model: string
}

type PanelForgeAiRequestLogStatus = 'running' | 'succeeded' | 'failed'

type PanelForgeAiRequestLog = {
  id: string
  requestType: string
  status: PanelForgeAiRequestLogStatus
  model: string
  endpoint: string
  requestPayload: string
  responseSummary: string
  errorMessage: string
  durationMs: number | null
  createdAt: string
  completedAt: string
}

type PanelForgeCharacterContentSnapshot = {
  characterAssets: unknown[]
  characterImageGenerations: unknown[]
}

type PanelForgeArchiveCharacterProfileRequest = {
  novel: unknown
  novelId: string
  profileId: string
  characterName: string
  deletedAt: string
}

type PanelForgeRestoreCharacterProfileRequest = {
  novel: unknown
  novelId: string
  profileId: string
  characterName: string
  restoredAt: string
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
    openCharacterWorkspaceWindow: (request: PanelForgeOpenCharacterWorkspaceWindowRequest) =>
      ipcRenderer.invoke('window:open-character-workspace', request) as Promise<{ opened: true }>,
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
    generateVideo: (request: PanelForgeAiHubMixVideoGenerationRequest) =>
      ipcRenderer.invoke('aihubmix:generate-video', request) as Promise<PanelForgeAiHubMixVideoGenerationResponse>,
    getVideoTasks: (request: PanelForgeAiHubMixVideoTaskRequest) =>
      ipcRenderer.invoke('aihubmix:get-video-tasks', request) as Promise<PanelForgeAiHubMixVideoTasksResponse>,
    getCallLogs: (request: PanelForgeAiHubMixCallLogRequest) =>
      ipcRenderer.invoke('aihubmix:get-call-logs', request) as Promise<PanelForgeAiHubMixCallLogResponse>,
  },
  aiLogs: {
    list: (limit?: number) => ipcRenderer.invoke('ai-logs:list', limit) as Promise<PanelForgeAiRequestLog[]>,
    clear: () => ipcRenderer.invoke('ai-logs:clear') as Promise<void>,
  },
  contentStorage: {
    listNovels: () => ipcRenderer.invoke('content-storage:list-novels') as Promise<unknown[]>,
    seedNovels: (records: unknown[]) => ipcRenderer.invoke('content-storage:seed-novels', records) as Promise<void>,
    upsertNovel: (record: unknown) => ipcRenderer.invoke('content-storage:upsert-novel', record) as Promise<void>,
    deleteNovel: (recordId: string) => ipcRenderer.invoke('content-storage:delete-novel', recordId) as Promise<void>,
    loadWorkflowState: (stateKey: string) =>
      ipcRenderer.invoke('content-storage:load-workflow-state', stateKey) as Promise<unknown | null>,
    saveWorkflowState: (stateKey: string, state: unknown) =>
      ipcRenderer.invoke('content-storage:save-workflow-state', stateKey, state) as Promise<void>,
    listCharacterContent: () =>
      ipcRenderer.invoke('content-storage:list-character-content') as Promise<PanelForgeCharacterContentSnapshot>,
    archiveCharacterProfile: (request: PanelForgeArchiveCharacterProfileRequest) =>
      ipcRenderer.invoke('content-storage:archive-character-profile', request) as Promise<PanelForgeCharacterContentSnapshot>,
    restoreCharacterProfile: (request: PanelForgeRestoreCharacterProfileRequest) =>
      ipcRenderer.invoke('content-storage:restore-character-profile', request) as Promise<PanelForgeCharacterContentSnapshot>,
    seedCharacterContent: (snapshot: PanelForgeCharacterContentSnapshot) =>
      ipcRenderer.invoke('content-storage:seed-character-content', snapshot) as Promise<void>,
    upsertCharacterAsset: (record: unknown) =>
      ipcRenderer.invoke('content-storage:upsert-character-asset', record) as Promise<void>,
    upsertCharacterImageGeneration: (record: unknown) =>
      ipcRenderer.invoke('content-storage:upsert-character-image-generation', record) as Promise<void>,
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
