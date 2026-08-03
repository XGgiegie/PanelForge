import { app, BrowserWindow, ipcMain, Menu, net } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { initializeAutoUpdater, registerAutoUpdaterIpc } from './updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null
let sourceWindow: BrowserWindow | null = null
let canvasWindow: BrowserWindow | null = null

type AiHubMixChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type AiHubMixChatCompletionRequest = {
  apiKey?: string
  model?: string
  messages?: AiHubMixChatMessage[]
  temperature?: number
}

type AiHubMixChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

type AiHubMixKeyValidationRequest = {
  apiKey?: string
}

type OpenChapterSourceWindowRequest = {
  routeHash?: string
  title?: string
}

type OpenChapterCanvasWindowRequest = {
  routeHash?: string
  title?: string
}

type AiHubMixKeyValidationResponse = {
  valid: true
  model: 'gpt-5.5'
}

function getAiHubMixErrorMessage(status: number, responseText: string, data: AiHubMixChatCompletionResponse | null) {
  return data?.error?.message || responseText || `AIHubMix 请求失败（HTTP ${status}）`
}

function normalizeChapterSourceRouteHash(routeHash?: string) {
  const rawRouteHash = routeHash?.trim() ?? ''
  const routePath = rawRouteHash.startsWith('#') ? rawRouteHash.slice(1) : rawRouteHash

  if (!/^\/scripts\/[^/]+\/chapters\/[1-9]\d*\/source$/.test(routePath)) {
    throw new Error('无效的正文窗口路由。')
  }

  return routePath
}

function normalizeChapterCanvasRouteHash(routeHash?: string) {
  const rawRouteHash = routeHash?.trim() ?? ''
  const routePath = rawRouteHash.startsWith('#') ? rawRouteHash.slice(1) : rawRouteHash

  if (!/^\/scripts\/[^/]+\/chapters\/[1-9]\d*\/canvas$/.test(routePath)) {
    throw new Error('无效的画布窗口路由。')
  }

  return routePath
}

function loadRendererRoute(targetWindow: BrowserWindow, routePath: string) {
  if (VITE_DEV_SERVER_URL) {
    const url = new URL(VITE_DEV_SERVER_URL)
    url.hash = routePath
    targetWindow.loadURL(url.toString())
    return
  }

  targetWindow.loadFile(path.join(RENDERER_DIST, 'index.html'), {
    hash: routePath,
  })
}

function openChapterSourceWindow(payload: OpenChapterSourceWindowRequest = {}) {
  const routePath = normalizeChapterSourceRouteHash(payload.routeHash)
  const title = payload.title?.trim() || '章节正文'

  if (sourceWindow && !sourceWindow.isDestroyed()) {
    sourceWindow.setTitle(title)
    loadRendererRoute(sourceWindow, routePath)
    sourceWindow.show()
    sourceWindow.focus()
    return
  }

  sourceWindow = new BrowserWindow({
    width: 880,
    height: 760,
    minWidth: 640,
    minHeight: 520,
    title,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  sourceWindow.on('closed', () => {
    sourceWindow = null
  })

  loadRendererRoute(sourceWindow, routePath)
  sourceWindow.focus()
}

function openChapterCanvasWindow(payload: OpenChapterCanvasWindowRequest = {}) {
  const routePath = normalizeChapterCanvasRouteHash(payload.routeHash)
  const title = payload.title?.trim() || '分镜画布'

  if (canvasWindow && !canvasWindow.isDestroyed()) {
    canvasWindow.setTitle(title)
    loadRendererRoute(canvasWindow, routePath)
    canvasWindow.show()
    canvasWindow.focus()
    return
  }

  canvasWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title,
    backgroundColor: '#f7f7f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  canvasWindow.on('closed', () => {
    canvasWindow = null
  })

  loadRendererRoute(canvasWindow, routePath)
  canvasWindow.focus()
}

async function requestAiHubMixChatCompletion(payload: AiHubMixChatCompletionRequest) {
  const apiKey = payload.apiKey?.trim()

  if (!apiKey) {
    throw new Error('请先在设置中填写 AIHubMix Key。')
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    throw new Error('缺少 AI 分析消息内容。')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)

  try {
    const response = await net.fetch('https://aihubmix.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: payload.model?.trim() || 'gpt-5.5',
        messages: payload.messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
      }),
      signal: controller.signal,
    })
    const responseText = await response.text()
    let data: AiHubMixChatCompletionResponse | null = null

    try {
      data = JSON.parse(responseText) as AiHubMixChatCompletionResponse
    } catch {
      data = null
    }

    if (!response.ok) {
      throw new Error(getAiHubMixErrorMessage(response.status, responseText, data))
    }

    const content = data?.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('AIHubMix 没有返回可用的分析内容。')
    }

    return {
      content,
      model: payload.model?.trim() || 'gpt-5.5',
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AIHubMix 请求超时，请稍后重试。')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function validateAiHubMixKey(payload: AiHubMixKeyValidationRequest): Promise<AiHubMixKeyValidationResponse> {
  const apiKey = payload.apiKey?.trim()

  if (!apiKey) {
    throw new Error('请先填写 AIHubMix Key。')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await net.fetch('https://aihubmix.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.5',
        messages: [
          {
            role: 'user',
            content: 'Reply with OK only.',
          },
        ],
        temperature: 0,
      }),
      signal: controller.signal,
    })
    const responseText = await response.text()
    let data: AiHubMixChatCompletionResponse | null = null

    try {
      data = JSON.parse(responseText) as AiHubMixChatCompletionResponse
    } catch {
      data = null
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('AIHubMix Key 无效、已失效或没有访问权限。')
      }

      if (response.status === 402) {
        throw new Error('AIHubMix 已识别该 Key，但当前账户余额不足。')
      }

      if (response.status === 429) {
        throw new Error('AIHubMix 已识别该 Key，但请求过于频繁，请稍后再试。')
      }

      const serviceMessage = getAiHubMixErrorMessage(response.status, responseText, data)
      throw new Error(`gpt-5.5 验证请求失败：${serviceMessage}`)
    }

    return {
      valid: true,
      model: 'gpt-5.5',
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AIHubMix 验证请求超时，请检查网络后重试。')
    }

    if (error instanceof TypeError) {
      throw new Error('无法连接 AIHubMix，请检查网络后重试。')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}
function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: 'PanelForge',
    backgroundColor: '#f6f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  ipcMain.handle('app:ping', () => ({
    status: 'ok',
    at: new Date().toISOString(),
  }))

  ipcMain.handle('window:open-chapter-source', (_event, payload: OpenChapterSourceWindowRequest) => {
    openChapterSourceWindow(payload)

    return {
      opened: true,
    }
  })

  ipcMain.handle('window:open-chapter-canvas', (_event, payload: OpenChapterCanvasWindowRequest) => {
    openChapterCanvasWindow(payload)

    return {
      opened: true,
    }
  })

  ipcMain.handle('aihubmix:validate-key', (_event, payload: AiHubMixKeyValidationRequest) => {
    return validateAiHubMixKey(payload)
  })

  ipcMain.handle('aihubmix:chat-completion', (_event, payload: AiHubMixChatCompletionRequest) => {
    return requestAiHubMixChatCompletion(payload)
  })

  registerAutoUpdaterIpc()
  createWindow()
  initializeAutoUpdater({ isDev: Boolean(VITE_DEV_SERVER_URL) })
})
