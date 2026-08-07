import { AIHUBMIX_VIDEO_MODEL } from '../stores/aiSettings'

export type AiVideoModel =
  | 'doubao-seedance-2-0-260128'
  | 'doubao-seedance-2-0-fast-260128'
  | 'doubao-seedance-2-0-mini-260615'
export type AiVideoRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4' | '21:9'
export type AiVideoResolution = '480p' | '720p'

export const AI_VIDEO_MODEL_OPTIONS: { label: string; value: AiVideoModel }[] = [
  { label: 'Seedance 2.0 标准（260128）', value: 'doubao-seedance-2-0-260128' },
  { label: 'Seedance 2.0 Fast（260128）', value: 'doubao-seedance-2-0-fast-260128' },
  { label: 'Seedance 2.0 Mini（260615）', value: 'doubao-seedance-2-0-mini-260615' },
]

export const AI_VIDEO_RATIO_OPTIONS: { label: string; value: AiVideoRatio }[] = [
  { label: '竖屏 9:16', value: '9:16' },
  { label: '横屏 16:9', value: '16:9' },
  { label: '方形 1:1', value: '1:1' },
  { label: '横屏 4:3', value: '4:3' },
  { label: '竖屏 3:4', value: '3:4' },
  { label: '超宽屏 21:9', value: '21:9' },
]

export const AI_VIDEO_RESOLUTION_OPTIONS: { label: string; value: AiVideoResolution }[] = [
  { label: '720P 高清（默认）', value: '720p' },
  { label: '480P 标准', value: '480p' },
]

export type AiVideoReferenceType = 'image_url' | 'video_url' | 'audio_url'

export type AiVideoReferenceContent = {
  type: AiVideoReferenceType
  image_url?: { url: string }
  video_url?: { url: string }
  audio_url?: { url: string }
  role?: 'reference_image' | 'reference_video' | 'reference_audio'
}

export type GenerateAiVideoInput = {
  apiKey: string
  appCode?: string
  model?: string
  prompt: string
  firstFrameImageUrl?: string
  content?: AiVideoReferenceContent[]
  ratio?: AiVideoRatio
  resolution?: AiVideoResolution
  duration?: number
  watermark?: boolean
}

export type GeneratedAiVideo = {
  videoUrl: string
  taskId: string
  status: string
  model: string
  ratio: string
  resolution: string
  duration: number
  rawResponse: string
}

export type AiVideoTaskStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'not_found'

export type AiVideoTask = {
  found: boolean
  taskId: string
  model: string
  status: AiVideoTaskStatus
  videoUrl: string
  errorMessage: string
  createdAt: string
  completedAt: string
  expiresAt: string
  rawResponse: string
}

export async function generateAiVideo(input: GenerateAiVideoInput): Promise<GeneratedAiVideo> {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中生成视频。')
  }

  return panelForge.aihubmix.generateVideo({
    apiKey: input.apiKey,
    appCode: input.appCode,
    model: input.model ?? AIHUBMIX_VIDEO_MODEL,
    prompt: input.prompt,
    firstFrameImageUrl: input.firstFrameImageUrl,
    content: input.content,
    ratio: input.ratio ?? '9:16',
    resolution: input.resolution ?? '720p',
    duration: input.duration ?? 6,
    watermark: input.watermark ?? false,
  })
}

export async function getAiVideoTasks(input: {
  apiKey: string
  appCode?: string
  tasks: Array<{
    taskId: string
    model: string
  }>
}): Promise<AiVideoTask[]> {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中查询视频任务。')
  }

  const response = await panelForge.aihubmix.getVideoTasks({
    apiKey: input.apiKey,
    appCode: input.appCode,
    tasks: input.tasks,
  })

  return response.tasks
}
