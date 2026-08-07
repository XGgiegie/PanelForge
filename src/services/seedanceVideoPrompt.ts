import seedanceVideoPromptSpec from '../../prompts/seedance-video-prompt.md?raw'
import { getVisualStylePromptSpec } from './visualStylePrompt'

export type SeedanceVideoPromptInput = {
  novelFoundation?: string
  title: string
  scene: string
  firstFrame: string
  characters: string
  narration: string
  camera: string
  extra: string
  durationSeconds: number
}

const SEEDANCE_VIDEO_MODEL_NAME = 'Seedance 2.0'
const SEEDANCE_VIDEO_RATIO = '9:16'

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

export function getSeedanceVideoModelName() {
  return SEEDANCE_VIDEO_MODEL_NAME
}

export function getSeedanceVideoPromptSpec() {
  return seedanceVideoPromptSpec.trim()
}

export function createSeedanceVideoPrompt(input: SeedanceVideoPromptInput) {
  const novelFoundation = compactBlock(input.novelFoundation ?? '')
  const title = cleanLine(input.title)
  const scene = cleanLine(input.scene)
  const firstFrame = cleanLine(input.firstFrame)
  const characters = compactBlock(input.characters)
  const narration = cleanLine(input.narration)
  const camera = cleanLine(input.camera)
  const extra = compactBlock(input.extra)

  const sections: string[][] = [
    [`【模型】`, `${SEEDANCE_VIDEO_MODEL_NAME}，竖屏 ${SEEDANCE_VIDEO_RATIO}，${input.durationSeconds}s，单分镜漫剧视频。`],
    novelFoundation ? [`【作品基础设定】`, novelFoundation] : [],
    [`【生成依据】`, `参考第一步分镜文本的剧情语义，并以第二步已生成首帧图作为视觉锚点。`],
    [`【首帧承接】`, `严格以已生成首帧作为第一帧和视觉基准，延续首帧的角色外观、服装、发型、场景、光影和构图。不要突然换脸、换装或切换场景。`],
    [`【分镜主题】`, title || scene],
    [`【画面主体】`, firstFrame || scene],
    characters
      ? [`【角色一致性】`, `${characters}。角色脸型、五官、发型、服装、体态需要在整段视频中保持稳定。`]
      : [],
    narration
      ? [`【旁白 / 对白】`, `${narration}。如需要口型或表情变化，动作要自然克制，不要夸张变形。`]
      : [],
    [`【镜头运动】`, camera || `轻微推近，保持主体清晰，镜头稳定，节奏自然。`],
    [`【情绪与动作】`, `围绕当前分镜制造清晰情绪变化，人物动作幅度适中，表情有细节；发丝、衣料、雾气和环境光随动作自然变化，画面有电影感张力但不要混乱。`],
    [`【美术风格】`, `半写实电影感 AI 漫剧质感，真实人物比例与可信材质，柔和电影主辅光、自然阴影、轻薄空气雾、空气透视和浅景深，梦幻感保持低强度，主体突出，色彩统一，画面清晰细腻。`],
    extra ? [`【补充要求】`, extra] : [],
    [
      `【负向约束】`,
      `不要 logo，不要水印，不要无关文字，不要字幕乱入，不要平面赛璐璐，不要廉价游戏 CG，不要塑料人偶感，不要多余肢体，不要脸部变形，不要角色换脸，不要服装突然变化，不要材质或光影跳变，不要画面闪烁，不要低清晰度，不要复杂转场。`,
    ],
  ]

  const structuredPrompt = sections
    .filter((section) => section.length > 0)
    .map(([heading, content]) => `${heading}\n${content}`)
    .join('\n\n')

  return [getVisualStylePromptSpec(), getSeedanceVideoPromptSpec(), structuredPrompt].join('\n\n')
}
