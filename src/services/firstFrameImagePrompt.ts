import firstFrameImagePromptSpec from '../../prompts/first-frame-image-prompt.md?raw'
import { getVisualStylePromptSpec } from './visualStylePrompt'

export type FirstFrameImagePromptInput = {
  novelFoundation?: string
  scene: string
  firstFrameDescription: string
  characters: string
  narration: string
  camera: string
  extra: string
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function compactBlock(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .join('；')
}

export function getFirstFrameImagePromptSpec() {
  return firstFrameImagePromptSpec.trim()
}

export function createFirstFrameImagePrompt(input: FirstFrameImagePromptInput) {
  const novelFoundation = compactBlock(input.novelFoundation ?? '')
  const scene = cleanLine(input.scene)
  const firstFrameDescription = cleanLine(input.firstFrameDescription)
  const characters = compactBlock(input.characters)
  const narration = cleanLine(input.narration)
  const camera = cleanLine(input.camera)
  const extra = compactBlock(input.extra)

  const sections: string[][] = [
    [`【画面类型】`, `半写实电影感 AI 漫剧首帧图，竖屏 9:16，按真实摄影逻辑构图与打光，单张不透明画面，精细干净，可作为后续视频第一帧。`],
    novelFoundation ? [`【作品基础设定】`, novelFoundation] : [],
    [`【首帧画面】`, firstFrameDescription || scene],
    scene && scene !== firstFrameDescription ? [`【分镜上下文】`, scene] : [],
    characters
      ? [`【角色与一致性】`, `${characters}。角色脸型、发型、服装、体态和气质需要清晰稳定。`]
      : [],
    [`【镜头与构图】`, camera || `主体明确，人物位置清楚，背景有层次，画面重心稳定。`],
    narration ? [`【旁白 / 对白参考】`, narration] : [],
    [`【美术风格】`, `半写实东方影视美术，真实人物比例、自然摄影镜头、可信空间透视与真实材质，精致人物骨相，皮肤通透、发丝细腻，柔和侧光、自然阴影、轻薄空气雾和浅景深营造克制梦幻氛围，构图干净，色彩统一，人物表情清晰。`],
    extra ? [`【补充要求】`, extra] : [],
    [
      `【负向约束】`,
      `不要 logo，不要水印，不要无关文字，不要字幕，不要强烈动画感，不要卡通脸，不要平面赛璐璐，不要纯线稿，不要 Q 版，不要廉价游戏 CG，不要塑料肌，不要蜡像脸，不要发光轮廓，不要透明底，不要九宫格，不要分屏，不要脸部崩坏，不要多余肢体。`,
    ],
  ]

  const structuredPrompt = sections
    .filter((section) => section.length > 0)
    .map(([heading, content]) => `${heading}\n${content}`)
    .join('\n\n')

  return [getVisualStylePromptSpec(), getFirstFrameImagePromptSpec(), structuredPrompt].join('\n\n')
}
