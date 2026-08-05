import characterImagePromptSpec from '../../prompts/character-image-prompt.md?raw'

import type { NovelCharacterProfile } from '../stores/novelLibrary'

function createAgeText(age: number | null) {
  return age === null ? '年龄感由外观特征和身份自然呈现' : `${age}岁左右的年龄感`
}

export function getCharacterImagePromptSpec() {
  return characterImagePromptSpec.trim()
}

export function createCharacterImagePrompt(profile: NovelCharacterProfile, referenceImageCount = 0, visualDirection = '') {
  const lines = [
    getCharacterImagePromptSpec(),
    '【角色名称】',
    profile.name.trim() || '未命名角色',
    '【角色定位】',
    `${profile.role}，剧情重要度 ${profile.importance}/5，${profile.gender || '性别未知'}，${createAgeText(profile.age)}`,
    '【性格表现】',
    `外向度 ${profile.traits.extroversion}/100，理性度 ${profile.traits.rationality}/100，善良度 ${profile.traits.kindness}/100，果断度 ${profile.traits.decisiveness}/100，戒备度 ${profile.traits.guardedness}/100。将这些性格转化为眼神、表情、站姿和服装气质。`,
    profile.goal.trim() ? `【核心目标】\n${profile.goal.trim()}` : '',
    profile.relationship.trim() ? `【人物关系】\n${profile.relationship.trim()}` : '',
    profile.appearance.trim()
      ? `【外观特征】\n${profile.appearance.trim()}`
      : '【外观特征】\n根据角色定位和性格生成辨识度高、适合漫剧连续使用的发型、服装与配饰。',
    referenceImageCount > 0
      ? `【参考图片】\n已提供 ${referenceImageCount} 张参考图。优先保持其中与角色相关的脸型、发型、服装、配饰和画风特征；不要直接拼贴参考图，也不要引入无关人物。`
      : '',
    visualDirection.trim() ? `【本次画面要求】\n${visualDirection.trim()}` : '',
    '【构图】',
    '全身角色立绘式单人画面。头顶到脚底完整入画，双脚、鞋履、完整服装和自然站姿必须可见；禁止头像、半身、特写或任何肢体裁切。中性纯色或轻度虚化背景，便于后续分镜和视频生成直接引用。',
  ]

  return lines.filter(Boolean).join('\n\n')
}
