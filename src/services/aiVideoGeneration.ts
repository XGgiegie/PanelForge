import { AIHUBMIX_VIDEO_MODEL } from '../stores/aiSettings'

export type GenerateAiVideoInput = {
  apiKey: string
  appCode?: string
  model?: string
  prompt: string
  firstFrameImageUrl?: string
  ratio?: string
  duration?: number
}

export type GeneratedAiVideo = {
  videoUrl: string
  taskId: string
  status: string
  model: string
  ratio: string
  duration: number
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
    ratio: input.ratio ?? '9:16',
    duration: input.duration ?? 6,
    watermark: false,
  })
}
