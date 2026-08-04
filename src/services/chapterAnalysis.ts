import chapterAnalysisPrompt from '../../prompts/chapter-analysis.md?raw'

import { getCreativeBriefOutline } from '../stores/novelLibrary'
import type { NovelChapter, NovelCreativeBrief, NovelItem } from '../stores/novelLibrary'

export const CHAPTER_ANALYSIS_MODEL = 'gpt-5.5'

const MAX_CHAPTER_ANALYSIS_CHARS = 60000

type ChapterAnalysisInput = {
  apiKey: string
  appCode?: string
  novel: NovelItem
  chapter: NovelChapter
  chapterText: string
  creativeBrief?: NovelCreativeBrief
}

function createCreativeBriefPrompt(brief?: NovelCreativeBrief) {
  const outline = getCreativeBriefOutline(brief)

  if (!outline) {
    return ''
  }

  return [
    '剧本大纲与创作说明：',
    '以下内容来自创作者在导入剧本后主动填写，请作为章节分析和漫剧化判断的重要参考。若大纲与正文信息冲突，请指出冲突，不要直接覆盖正文事实。',
    outline,
  ].join('\n')
}

function createChapterAnalysisUserPrompt(input: ChapterAnalysisInput) {
  const chapterText =
    input.chapterText.length > MAX_CHAPTER_ANALYSIS_CHARS
      ? `${input.chapterText.slice(0, MAX_CHAPTER_ANALYSIS_CHARS)}\n\n[本章内容过长，以上为截断后的分析文本。]`
      : input.chapterText

  const creativeBriefPrompt = createCreativeBriefPrompt(input.creativeBrief ?? input.novel.creativeBrief)

  return [
    [`剧本名称：${input.novel.title}`, `章节序号：${input.chapter.index}`, `章节标题：${input.chapter.title}`].join('\n'),
    creativeBriefPrompt,
    ['章节正文：', chapterText].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function requestChapterAnalysis(input: ChapterAnalysisInput) {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中使用 AI 分析。')
  }

  const response = await panelForge.aihubmix.chatCompletion({
    apiKey: input.apiKey,
    appCode: input.appCode,
    model: CHAPTER_ANALYSIS_MODEL,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: chapterAnalysisPrompt.trim(),
      },
      {
        role: 'user',
        content: createChapterAnalysisUserPrompt(input),
      },
    ],
  })

  return response.content.trim()
}
