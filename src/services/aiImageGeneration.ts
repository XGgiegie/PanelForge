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

async function flattenImageToOpaqueBackground(imageDataUrl: string) {
  if (!imageDataUrl.startsWith('data:image/') || typeof document === 'undefined') {
    return imageDataUrl
  }

  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('生成图片无法加载。'))
    image.src = imageDataUrl
  })

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('生成图片尺寸无效。')
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('浏览器无法处理生成图片。')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)

  return canvas.toDataURL('image/png')
}

export async function generateAiImage(input: GenerateAiImageInput): Promise<GeneratedAiImage> {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中生成图片。')
  }

  const result = await panelForge.aihubmix.generateImage({
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

  return {
    ...result,
    imageDataUrl: await flattenImageToOpaqueBackground(result.imageDataUrl),
  }
}
