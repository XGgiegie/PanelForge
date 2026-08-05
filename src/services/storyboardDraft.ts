import storyboardDraftPrompt from '../../prompts/storyboard-draft.md?raw'

import { CHAPTER_ANALYSIS_MODEL } from './chapterAnalysis'
import type { ChapterAnalysisRecord } from '../stores/chapterAnalysis'
import { getCreativeBriefForPrompt } from '../stores/novelLibrary'
import type { NovelChapter, NovelItem } from '../stores/novelLibrary'

export type StoryboardDraftShot = {
  id: string
  title: string
  scene: string
  camera: string
  characters: string[]
  action: string
  dialogue: string
  narration: string
  imagePrompt: string
  durationSeconds: number
  notes: string
}

export type StoryboardDraftResult = {
  shots: StoryboardDraftShot[]
  rawResult: string
}

export type StoryboardCharacterReference = {
  name: string
  description?: string
}

type StoryboardDraftInput = {
  apiKey: string
  appCode?: string
  novel: NovelItem
  chapter: NovelChapter
  chapterText: string
  analysisRecord: ChapterAnalysisRecord
  characterReferences?: StoryboardCharacterReference[]
}

type RawStoryboardShot = Partial<Omit<StoryboardDraftShot, 'id' | 'characters' | 'durationSeconds'>> & {
  characters?: unknown
  durationSeconds?: unknown
}

type RawStoryboardDraft = {
  shots?: RawStoryboardShot[]
}

function createShotId(index: number) {
  return `shot-${String(index + 1).padStart(2, '0')}`
}

function extractJson(value: string) {
  const codeFenceMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i)

  if (codeFenceMatch?.[1]) {
    return codeFenceMatch[1].trim()
  }

  const startIndex = value.indexOf('{')
  const endIndex = value.lastIndexOf('}')

  if (startIndex >= 0 && endIndex > startIndex) {
    return value.slice(startIndex, endIndex + 1)
  }

  return value
}

function normalizeCharacters(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[、,，/]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeDuration(value: unknown) {
  const duration = Number(value)

  if (!Number.isFinite(duration)) {
    return 6
  }

  return Math.max(3, Math.min(18, Math.round(duration)))
}

function normalizeShot(shot: RawStoryboardShot, index: number): StoryboardDraftShot {
  return {
    id: createShotId(index),
    title: String(shot.title ?? `分镜 ${index + 1}`).trim() || `分镜 ${index + 1}`,
    scene: String(shot.scene ?? '').trim(),
    camera: String(shot.camera ?? '').trim(),
    characters: normalizeCharacters(shot.characters),
    action: String(shot.action ?? '').trim(),
    dialogue: String(shot.dialogue ?? '').trim(),
    narration: String(shot.narration ?? '').trim(),
    imagePrompt: String(shot.imagePrompt ?? '').trim(),
    durationSeconds: normalizeDuration(shot.durationSeconds),
    notes: String(shot.notes ?? '').trim(),
  }
}

function parseStoryboardDraftResult(value: string): StoryboardDraftResult {
  const parsed = JSON.parse(extractJson(value)) as RawStoryboardDraft
  const shots = (parsed.shots ?? []).map(normalizeShot).filter((shot) => shot.scene || shot.action || shot.imagePrompt)

  if (shots.length === 0) {
    throw new Error('分镜没有返回可用镜头。')
  }

  return {
    shots,
    rawResult: value,
  }
}

function createStoryboardDraftUserPrompt(input: StoryboardDraftInput) {
  const characterReferenceText = input.characterReferences?.length
    ? input.characterReferences
        .map((character) => {
          const description = character.description?.trim()

          return description ? `- ${character.name}：${description}` : `- ${character.name}`
        })
        .join('\n')
    : '暂无'

  return [
    `剧本名称：${input.novel.title}`,
    `章节序号：${input.chapter.index}`,
    `章节标题：${input.chapter.title}`,
    '',
    '角色设定：',
    getCreativeBriefForPrompt(input.novel.creativeBrief) || '未填写',
    '',
    '已上传角色资产：',
    characterReferenceText,
    '',
    '采纳的章节分析：',
    input.analysisRecord.result,
    '',
    '章节正文：',
    input.chapterText || '无正文',
  ].join('\n')
}

export async function requestStoryboardDraft(input: StoryboardDraftInput): Promise<StoryboardDraftResult> {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中生成分镜。')
  }

  const response = await panelForge.aihubmix.chatCompletion({
    apiKey: input.apiKey,
    appCode: input.appCode,
    model: CHAPTER_ANALYSIS_MODEL,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: storyboardDraftPrompt.trim(),
      },
      {
        role: 'user',
        content: createStoryboardDraftUserPrompt(input),
      },
    ],
  })

  try {
    return parseStoryboardDraftResult(response.content.trim())
  } catch (error) {
    throw error instanceof Error ? error : new Error('分镜返回格式无法解析。')
  }
}
