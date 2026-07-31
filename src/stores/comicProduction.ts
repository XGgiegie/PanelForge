import { defineStore } from 'pinia'

export type ComicStepKey =
  | 'source'
  | 'breakdown'
  | 'character'
  | 'storyboard'
  | 'image'
  | 'style'
  | 'voice'
  | 'subtitle'
  | 'compose'
  | 'export'

export type ComicStepStatus = 'waiting' | 'active' | 'done'

export type ComicStep = {
  key: ComicStepKey
  title: string
  module: string
  owner: string
  output: string
}

export type NovelChapter = {
  id: string
  index: number
  title: string
  wordCount: number
  preview: string
  status: '已提取' | '待确认' | '待拆解'
}

export type StoryBeat = {
  id: string
  episode: string
  title: string
  conflict: string
  emotionalTone: string
  status: '待拆解' | '已拆解' | '待复核'
}

export type CharacterProfile = {
  id: string
  name: string
  role: string
  visual: string
  voice: string
  status: '待生成' | '设定中' | '已锁定'
}

export type StoryboardShot = {
  id: string
  scene: string
  shot: string
  camera: string
  prompt: string
  duration: string
  status: '待生成' | '绘图中' | '已出图' | '待重绘'
}

export type ImageAsset = {
  id: string
  title: string
  linkedShot: string
  style: string
  status: '待生成' | '已生成' | '统一中' | '已统一'
}

export type AudioTask = {
  id: string
  target: string
  voice: string
  duration: string
  status: '待生成' | '生成中' | '已完成'
}

export type ExportTask = {
  id: string
  target: string
  format: string
  status: '待合成' | '合成中' | '可导出'
}

const productionSteps: ComicStep[] = [
  {
    key: 'source',
    title: '剧本提取',
    module: '剧本提取',
    owner: '文本处理',
    output: '章节列表与剧本草稿',
  },
  {
    key: 'breakdown',
    title: 'AI拆解剧情',
    module: '剧情分析',
    owner: '剧情引擎',
    output: '集数、场次、冲突点',
  },
  {
    key: 'character',
    title: '生成角色设定',
    module: '角色工坊',
    owner: '角色引擎',
    output: '角色卡与视觉锚点',
  },
  {
    key: 'storyboard',
    title: '生成分镜脚本',
    module: '分镜台',
    owner: '导演引擎',
    output: '镜头脚本与画面提示词',
  },
  {
    key: 'image',
    title: '生成图片',
    module: '画面生成',
    owner: '绘图引擎',
    output: '分镜画面资产',
  },
  {
    key: 'style',
    title: '图片统一角色风格',
    module: '风格统一',
    owner: '一致性引擎',
    output: '统一角色与画风的画面',
  },
  {
    key: 'voice',
    title: '生成配音',
    module: '声音工坊',
    owner: '配音引擎',
    output: '旁白与角色音轨',
  },
  {
    key: 'subtitle',
    title: '字幕生成',
    module: '字幕轨',
    owner: '字幕引擎',
    output: '字幕文本与时间轴',
  },
  {
    key: 'compose',
    title: '视频合成',
    module: '合成台',
    owner: '剪辑引擎',
    output: '预览视频',
  },
  {
    key: 'export',
    title: '导出漫剧',
    module: '导出中心',
    owner: '发布引擎',
    output: '成片与项目包',
  },
]

function createInitialStepStatuses() {
  return productionSteps.reduce<Record<ComicStepKey, ComicStepStatus>>((statuses, step, index) => {
    statuses[step.key] = index === 0 ? 'active' : 'waiting'
    return statuses
  }, {} as Record<ComicStepKey, ComicStepStatus>)
}

function countText(text: string) {
  return text.replace(/\s/g, '').length
}

function createPreview(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 90) || '等待章节正文'
}

function createChapterId(index: number) {
  return `CH${String(index).padStart(3, '0')}`
}

function extractNovelChapters(text: string): NovelChapter[] {
  const normalizedText = text.replace(/\r\n/g, '\n').trim()

  if (!normalizedText) {
    return []
  }

  const chapterHeadingPattern = /^\s*((?:第[零一二三四五六七八九十百千万\d]+[章节卷集回])[^\n]{0,42}|(?:Chapter\s+\d+)[^\n]{0,42}|(?:\d{1,4}[、.．]\s*)[^\n]{1,42})\s*$/gim
  const matches = [...normalizedText.matchAll(chapterHeadingPattern)]

  if (matches.length === 0) {
    return [
      {
        id: createChapterId(1),
        index: 1,
        title: '全文',
        wordCount: countText(normalizedText),
        preview: createPreview(normalizedText),
        status: '已提取',
      },
    ]
  }

  const chapters: NovelChapter[] = []
  const firstHeadingIndex = matches[0].index ?? 0
  const preface = normalizedText.slice(0, firstHeadingIndex).trim()

  if (countText(preface) > 0) {
    chapters.push({
      id: createChapterId(chapters.length + 1),
      index: chapters.length + 1,
      title: '序章',
      wordCount: countText(preface),
      preview: createPreview(preface),
      status: '已提取',
    })
  }

  matches.forEach((match, matchIndex) => {
    const title = (match[1] ?? `第 ${matchIndex + 1} 章`).trim()
    const contentStart = (match.index ?? 0) + match[0].length
    const nextMatch = matches[matchIndex + 1]
    const contentEnd = nextMatch?.index ?? normalizedText.length
    const content = normalizedText.slice(contentStart, contentEnd).trim()

    chapters.push({
      id: createChapterId(chapters.length + 1),
      index: chapters.length + 1,
      title,
      wordCount: countText(content),
      preview: createPreview(content),
      status: '已提取',
    })
  })

  return chapters
}

const defaultStoryBeats: StoryBeat[] = [
  {
    id: 'B01',
    episode: '第 1 集',
    title: '开场钩子',
    conflict: '主角卷入关键事件，身份与目标被快速抛出。',
    emotionalTone: '紧张 / 悬疑',
    status: '待拆解',
  },
  {
    id: 'B02',
    episode: '第 1 集',
    title: '关系建立',
    conflict: '核心角色第一次对峙，埋下后续反转。',
    emotionalTone: '克制 / 暗流',
    status: '待拆解',
  },
  {
    id: 'B03',
    episode: '第 2 集',
    title: '选择代价',
    conflict: '主角做出选择，外部压力升级。',
    emotionalTone: '压迫 / 爆发',
    status: '待拆解',
  },
]

function createStoryBeatsFromChapters(chapters: NovelChapter[]): StoryBeat[] {
  if (chapters.length === 0) {
    return defaultStoryBeats.map((item) => ({ ...item }))
  }

  return chapters.slice(0, 12).map((chapter, index) => ({
    id: `B${String(index + 1).padStart(2, '0')}`,
    episode: `第 ${index + 1} 集`,
    title: chapter.title,
    conflict: chapter.preview,
    emotionalTone: '待 AI 分析',
    status: '已拆解',
  }))
}

export const useComicProductionStore = defineStore('comicProduction', {
  state: () => ({
    projectTitle: '未命名漫剧项目',
    sourceType: 'novel' as 'novel' | 'script',
    targetStyle: '黑白漫画',
    episodeCount: 12,
    shotDuration: 6,
    novelFileName: '',
    sourceText: '',
    draftSavedAt: '',
    lastExtractionAt: '',
    activeStepIndex: 0,
    steps: productionSteps,
    stepStatuses: createInitialStepStatuses(),
    extractedChapters: [] as NovelChapter[],
    storyBeats: defaultStoryBeats.map((item) => ({ ...item })) as StoryBeat[],
    characters: [
      {
        id: 'C01',
        name: '女主',
        role: '核心主角',
        visual: '黑白漫画高对比轮廓，利落短外套，固定发型与标志配饰。',
        voice: '沉稳女声，低情绪起伏，关键句加强压迫感。',
        status: '待生成',
      },
      {
        id: 'C02',
        name: '男主',
        role: '关键盟友',
        visual: '黑白线稿，商务休闲，轮廓干净，表情克制。',
        voice: '青年男声，温和但带保留。',
        status: '待生成',
      },
      {
        id: 'C03',
        name: '反派',
        role: '主要阻力',
        visual: '深色长风衣，冷光眼镜，压迫性站姿。',
        voice: '成熟男声，语速慢，尾音压低。',
        status: '待生成',
      },
    ] as CharacterProfile[],
    storyboardShots: [
      {
        id: 'S01',
        scene: '雨夜街口',
        shot: '近景',
        camera: '低机位推进',
        prompt: '黑白漫画线稿，主角站在雨幕中，手中握着关键证据，背景人群虚化。',
        duration: '6s',
        status: '待生成',
      },
      {
        id: 'S02',
        scene: '地下车库',
        shot: '中景',
        camera: '横移跟拍',
        prompt: '黑白高反差，两名角色隔车对话，顶光切割面部阴影。',
        duration: '7s',
        status: '待生成',
      },
      {
        id: 'S03',
        scene: '办公室',
        shot: '特写',
        camera: '快速切入',
        prompt: '反派合上文件夹，玻璃反射中出现主角身影，墨色阴影。',
        duration: '5s',
        status: '待生成',
      },
    ] as StoryboardShot[],
    imageAssets: [
      {
        id: 'I01',
        title: '雨夜街口主视觉',
        linkedShot: 'S01',
        style: '黑白漫画 / 高反差',
        status: '待生成',
      },
      {
        id: 'I02',
        title: '地下车库对峙',
        linkedShot: 'S02',
        style: '黑白电影感 / 低灰阶',
        status: '待生成',
      },
      {
        id: 'I03',
        title: '办公室反转特写',
        linkedShot: 'S03',
        style: '硬光阴影 / 细节特写',
        status: '待生成',
      },
    ] as ImageAsset[],
    audioTasks: [
      {
        id: 'A01',
        target: '旁白轨',
        voice: '悬疑叙事女声',
        duration: '00:48',
        status: '待生成',
      },
      {
        id: 'A02',
        target: '角色对白',
        voice: '女主 / 男主 / 反派',
        duration: '01:24',
        status: '待生成',
      },
      {
        id: 'A03',
        target: '字幕时间轴',
        voice: '跟随对白自动对齐',
        duration: '01:24',
        status: '待生成',
      },
    ] as AudioTask[],
    exportTasks: [
      {
        id: 'E01',
        target: '竖屏漫剧成片',
        format: 'MP4 / 1080x1920',
        status: '待合成',
      },
      {
        id: 'E02',
        target: '横屏审核版',
        format: 'MP4 / 1920x1080',
        status: '待合成',
      },
      {
        id: 'E03',
        target: '项目素材包',
        format: 'ZIP / 图片、音频、字幕',
        status: '待合成',
      },
    ] as ExportTask[],
  }),
  getters: {
    currentStep: (state) => state.steps[state.activeStepIndex],
    completedStepCount: (state) => Object.values(state.stepStatuses).filter((status) => status === 'done').length,
    progressPercentage(): number {
      return Math.round((this.completedStepCount / this.steps.length) * 100)
    },
    sourceLength: (state) => countText(state.sourceText),
    chapterCount: (state) => state.extractedChapters.length,
    extractedWordCount: (state) => state.extractedChapters.reduce((total, chapter) => total + chapter.wordCount, 0),
    moduleCount: (state) => state.steps.length,
    lockedCharacterCount: (state) => state.characters.filter((item) => item.status === '已锁定').length,
    readyImageCount: (state) => state.imageAssets.filter((item) => item.status === '已统一').length,
  },
  actions: {
    setProjectTitle(value: string) {
      this.projectTitle = value.trim() || '未命名漫剧项目'
    },
    setSourceType(value: 'novel' | 'script') {
      this.sourceType = value
    },
    setTargetStyle(value: string) {
      this.targetStyle = value.trim() || '黑白漫画'
    },
    setEpisodeCount(value: number | null) {
      this.episodeCount = Math.max(1, Math.min(120, value ?? 1))
    },
    setShotDuration(value: number | null) {
      this.shotDuration = Math.max(3, Math.min(30, value ?? 6))
    },
    setNovelFileName(value: string) {
      this.novelFileName = value.trim()
    },
    setSourceText(value: string) {
      this.sourceText = value
    },
    saveDraft() {
      this.draftSavedAt = new Date().toISOString()
    },
    extractChapters() {
      this.extractedChapters = extractNovelChapters(this.sourceText)
      this.lastExtractionAt = this.extractedChapters.length > 0 ? new Date().toISOString() : ''
    },
    startWorkflow() {
      if (this.sourceLength === 0) {
        return
      }

      if (this.chapterCount === 0) {
        this.extractChapters()
      }

      if (this.chapterCount === 0) {
        return
      }

      this.stepStatuses.source = 'done'
      this.activeStepIndex = 1
      this.stepStatuses.breakdown = 'active'
      this.storyBeats = createStoryBeatsFromChapters(this.extractedChapters)
    },
    advanceCurrentStep() {
      const current = this.currentStep

      if (!current || (current.key === 'source' && this.chapterCount === 0)) {
        return
      }

      this.stepStatuses[current.key] = 'done'

      if (current.key === 'breakdown') {
        this.storyBeats = createStoryBeatsFromChapters(this.extractedChapters)
      }

      if (current.key === 'character') {
        this.characters = this.characters.map((item) => ({ ...item, status: '已锁定' }))
      }

      if (current.key === 'storyboard') {
        this.storyboardShots = this.storyboardShots.map((item) => ({ ...item, status: '待生成' }))
      }

      if (current.key === 'image') {
        this.imageAssets = this.imageAssets.map((item) => ({ ...item, status: '已生成' }))
        this.storyboardShots = this.storyboardShots.map((item) => ({ ...item, status: '已出图' }))
      }

      if (current.key === 'style') {
        this.imageAssets = this.imageAssets.map((item) => ({ ...item, status: '已统一' }))
      }

      if (current.key === 'voice' || current.key === 'subtitle') {
        this.audioTasks = this.audioTasks.map((item) => ({ ...item, status: '已完成' }))
      }

      if (current.key === 'compose') {
        this.exportTasks = this.exportTasks.map((item) => ({ ...item, status: '可导出' }))
      }

      const nextIndex = this.activeStepIndex + 1

      if (nextIndex < this.steps.length) {
        this.activeStepIndex = nextIndex
        const next = this.steps[nextIndex]
        if (this.stepStatuses[next.key] !== 'done') {
          this.stepStatuses[next.key] = 'active'
        }
      }
    },
    resetWorkflow() {
      this.activeStepIndex = 0
      this.stepStatuses = createInitialStepStatuses()
      this.draftSavedAt = ''
      this.lastExtractionAt = ''
      this.extractedChapters = []
      this.storyBeats = defaultStoryBeats.map((item) => ({ ...item }))
      this.characters = this.characters.map((item) => ({ ...item, status: '待生成' }))
      this.storyboardShots = this.storyboardShots.map((item) => ({ ...item, status: '待生成' }))
      this.imageAssets = this.imageAssets.map((item) => ({ ...item, status: '待生成' }))
      this.audioTasks = this.audioTasks.map((item) => ({ ...item, status: '待生成' }))
      this.exportTasks = this.exportTasks.map((item) => ({ ...item, status: '待合成' }))
    },
  },
})