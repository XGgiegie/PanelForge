import videoMotionPrompt from '../../prompts/video-motion-prompt.md?raw'
import { getVisualStylePromptSpec } from './visualStylePrompt'

export type GenerateVideoPromptInput = {
  apiKey: string
  appCode?: string
  model: string
  title: string
  scene: string
  firstFrame: string
  characters: string
  narration: string
  camera: string
  extra: string
  durationSeconds: number
}

function createVideoPromptUserMessage(input: GenerateVideoPromptInput) {
  return [
    `分镜：${input.title}`,
    `画面：${input.scene || '未填写'}`,
    `首帧提示词：${input.firstFrame || '未填写'}`,
    `角色：${input.characters || '未填写'}`,
    `旁白或对白：${input.narration || '无'}`,
    `镜头：${input.camera || '未填写'}`,
    `补充要求：${input.extra || '无'}`,
    `目标时长：${input.durationSeconds} 秒`,
  ].join('\n\n')
}

export async function generateVideoPromptWithAi(input: GenerateVideoPromptInput) {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中生成视频提示词。')
  }

  const response = await panelForge.aihubmix.chatCompletion({
    apiKey: input.apiKey,
    appCode: input.appCode,
    model: input.model,
    temperature: 0.35,
    messages: [
      {
        role: 'system',
        content: [videoMotionPrompt.trim(), getVisualStylePromptSpec()].join('\n\n'),
      },
      {
        role: 'user',
        content: createVideoPromptUserMessage(input),
      },
    ],
  })

  const prompt = response.content.trim()

  if (!prompt) {
    throw new Error('文本模型没有返回视频提示词。')
  }

  return prompt
}
