import { AIHUBMIX_IMAGE_MODEL } from '../stores/aiSettings'

export type AiImageAspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'
export type AiImageResolution = '1K' | '2K' | '4K'

export type GenerateAiImageInput = {
  apiKey: string
  appCode?: string
  prompt: string
  rawPrompt?: string
  style?: string
  aspectRatio?: AiImageAspectRatio
  resolution?: AiImageResolution
  model?: string
  source?: string
  referenceImages?: string[]
}

export type GeneratedAiImage = {
  imageDataUrl: string
  imageUrl?: string
  text: string
  model: string
  aspectRatio: string
  resolution: string
  storage?: {
    status: 'saved' | 'failed'
    message: string
    recordId?: string
    objectKey?: string
    bucket?: string
  }
}

export const AI_IMAGE_ASPECT_RATIO_OPTIONS: { label: string; value: AiImageAspectRatio }[] = [
  { label: '竖屏 9:16', value: '9:16' },
  { label: '角色 2:3', value: '2:3' },
  { label: '方图 1:1', value: '1:1' },
  { label: '横屏 16:9', value: '16:9' },
  { label: '宽银幕 21:9', value: '21:9' },
  { label: '横图 3:2', value: '3:2' },
  { label: '竖图 3:4', value: '3:4' },
  { label: '横图 4:3', value: '4:3' },
  { label: '竖图 4:5', value: '4:5' },
  { label: '横图 5:4', value: '5:4' },
]

export const AI_IMAGE_RESOLUTION_OPTIONS: { label: string; value: AiImageResolution }[] = [
  { label: '1K 标准', value: '1K' },
  { label: '2K 高清', value: '2K' },
  { label: '4K 超清', value: '4K' },
]

export async function generateAiImage(input: GenerateAiImageInput): Promise<GeneratedAiImage> {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中生成图片。')
  }

  return panelForge.aihubmix.generateImage({
    apiKey: input.apiKey,
    appCode: input.appCode,
    model: input.model ?? AIHUBMIX_IMAGE_MODEL,
    prompt: input.prompt,
    rawPrompt: input.rawPrompt,
    style: input.style,
    aspectRatio: input.aspectRatio ?? '9:16',
    resolution: input.resolution ?? '1K',
    source: input.source,
    referenceImages: input.referenceImages,
  })
}
