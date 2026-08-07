import visualStylePromptSpec from '../../prompts/visual-style-prompt.md?raw'

export function getVisualStylePromptSpec() {
  return visualStylePromptSpec.trim()
}

function replaceLegacyVisualStyle(value: string) {
  return value
    .replace(/半写实梦幻\s*3D/gi, '半写实电影感')
    .replace(/3D\s*AI\s*漫剧/gi, '半写实电影感 AI 漫剧')
    .replace(/3D\s*电影感/gi, '半写实电影感')
    .replace(/3D\s*真实/gi, '真实摄影逻辑')
    .replace(/高品质\s*CG\s*体积/gi, '自然空间体积感')
    .replace(/体积光/gi, '柔和电影光线')
    .replace(/2D\s*漫剧首帧图?/gi, '半写实电影感 AI 漫剧首帧图')
    .replace(/2D\s*漫剧/gi, '半写实电影感 AI 漫剧')
    .replace(/二次元\s*[\/／]\s*国漫短剧质感/g, '半写实电影感')
    .replace(/精致\s*2D\s*漫剧质感/gi, '精致半写实电影感')
    .replace(/国漫短剧质感/g, '半写实电影感')
    .replace(/不要\s*3D(?:\s*建模|\s*渲染)?[，,、。]?/gi, '')
    .replace(/不要\s*真人照片感[，,、。]?/g, '不要纯照片写实，')
    .replace(/不要\s*游戏\s*CG[，,、。]?/gi, '不要廉价游戏 CG，')
    .replace(/，{2,}/g, '，')
    .trim()
}

export function ensureVisualStylePrompt(value: string) {
  const prompt = replaceLegacyVisualStyle(value)
  const visualStyle = getVisualStylePromptSpec()

  return prompt.includes('# AI 漫剧统一视觉规范') ? prompt : [visualStyle, prompt].filter(Boolean).join('\n\n')
}
