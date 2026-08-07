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
  resolution?: string
  duration?: number
  watermark?: boolean
}

type PanelForgeAiHubMixVideoGenerationResponse = {
  videoUrl: string
  taskId: string
  status: string
  model: string
  ratio: string
  resolution: string
  duration: number
  rawResponse: string
}

type PanelForgeAiHubMixVideoTaskRequest = {
  apiKey: string
  appCode?: string
  tasks: Array<{
    taskId: string
    model: string
  }>
}

type PanelForgeAiHubMixVideoTaskResponse = {
  found: boolean
  taskId: string
  model: string
  status: 'pending' | 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'not_found'
  videoUrl: string
  errorMessage: string
  createdAt: string
  completedAt: string
  expiresAt: string
  rawResponse: string
}

type PanelForgeAiHubMixVideoTasksResponse = {
  tasks: PanelForgeAiHubMixVideoTaskResponse[]
}

type PanelForgeAiHubMixCallLogRequest = {
  apiKey: string
  appCode?: string
  p?: number
  tokenName?: string
  modelName?: string
  status?: number
  startTimestamp?: number
  endTimestamp?: number
}

type PanelForgeAiHubMixCallLogItem = {
  id: string
  createdAt: number
  tokenName: string
  modelName: string
  status: number | null
  quota: number | null
  costUsd: number | null
  promptTokens: number | null
  completionTokens: number | null
  useTime: number | null
  requestPath: string
}

type PanelForgeAiHubMixCallLogResponse = {
  items: PanelForgeAiHubMixCallLogItem[]
  total: number
  page: number
  pageSize: number
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
    getVideoTasks: (
      request: PanelForgeAiHubMixVideoTaskRequest,
    ) => Promise<PanelForgeAiHubMixVideoTasksResponse>
    getCallLogs: (request: PanelForgeAiHubMixCallLogRequest) => Promise<PanelForgeAiHubMixCallLogResponse>
  }
  aiLogs: {
    list: (limit?: number) => Promise<PanelForgeAiRequestLog[]>
    clear: () => Promise<void>
  }
  contentStorage: {
    listNovels: () => Promise<unknown[]>
    seedNovels: (records: unknown[]) => Promise<void>
    upsertNovel: (record: unknown) => Promise<void>
    deleteNovel: (recordId: string) => Promise<void>
    loadWorkflowState: (stateKey: string) => Promise<unknown | null>
    saveWorkflowState: (stateKey: string, state: unknown) => Promise<void>
    listCharacterContent: () => Promise<PanelForgeCharacterContentSnapshot>
    archiveCharacterProfile: (
      request: PanelForgeArchiveCharacterProfileRequest,
    ) => Promise<PanelForgeCharacterContentSnapshot>
    restoreCharacterProfile: (
      request: PanelForgeRestoreCharacterProfileRequest,
    ) => Promise<PanelForgeCharacterContentSnapshot>
    seedCharacterContent: (snapshot: PanelForgeCharacterContentSnapshot) => Promise<void>
    upsertCharacterAsset: (record: unknown) => Promise<void>
    upsertCharacterImageGeneration: (record: unknown) => Promise<void>
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
