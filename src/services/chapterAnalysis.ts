import chapterAnalysisPrompt from '../../prompts/chapter-analysis.md?raw'

import type { NovelChapter, NovelItem } from '../stores/novelLibrary'

export const CHAPTER_ANALYSIS_MODEL = 'gpt-5.5'

const MAX_CHAPTER_ANALYSIS_CHARS = 60000

type ChapterAnalysisInput = {
  apiKey: string
  novel: NovelItem
  chapter: NovelChapter
  chapterText: string
}

function createChapterAnalysisUserPrompt(input: ChapterAnalysisInput) {
  const chapterText =
    input.chapterText.length > MAX_CHAPTER_ANALYSIS_CHARS
      ? `${input.chapterText.slice(0, MAX_CHAPTER_ANALYSIS_CHARS)}\n\n[本章内容过长，以上为截断后的分析文本。]`
      : input.chapterText

  return [
    `剧本名称：${input.novel.title}`,
    `章节序号：${input.chapter.index}`,
    `章节标题：${input.chapter.title}`,
    '',
    '章节正文：',
    chapterText,
  ].join('\n')
}

export async function requestChapterAnalysis(input: ChapterAnalysisInput) {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中使用 AI 分析。')
  }

  const response = await panelForge.aihubmix.chatCompletion({
    apiKey: input.apiKey,
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