import { BrowserWindow, ipcMain } from 'electron'
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo,
} from 'electron-updater'


type UpdateState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

type UpdateStatus = {
  state: UpdateState
  message: string
  checkedAt?: string
  feedUrl?: string
  info?: {
    version: string
    releaseName?: string
    releaseDate?: string
  }
  progress?: {
    percent: number
    transferred: number
    total: number
    bytesPerSecond: number
  }
  error?: string
  canCheck: boolean
  canDownload: boolean
  canInstall: boolean
}

type UpdaterOptions = {
  isDev: boolean
  autoCheckDelayMs?: number
}

let isConfigured = false
let areEventsRegistered = false
let status: UpdateStatus = {
  state: 'idle',
  message: '自动更新待初始化',
  canCheck: false,
  canDownload: false,
  canInstall: false,
}

function getFeedUrl() {
  return process.env['PANELFORGE_UPDATE_URL']?.trim() ?? ''
}

function getNow() {
  return new Date().toISOString()
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getUpdateInfo(info?: UpdateInfo | UpdateDownloadedEvent) {
  if (!info) {
    return undefined
  }

  return {
    version: info.version,
    releaseName: typeof info.releaseName === 'string' ? info.releaseName : undefined,
    releaseDate: info.releaseDate,
  }
}

function getProgressInfo(info: ProgressInfo) {
  return {
    percent: Math.round(info.percent * 10) / 10,
    transferred: info.transferred,
    total: info.total,
    bytesPerSecond: info.bytesPerSecond,
  }
}

function emitStatus() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('update:status', status)
  }
}

function setStatus(nextStatus: Partial<UpdateStatus>) {
  status = {
    ...status,
    ...nextStatus,
  }

  emitStatus()
}

function setDisabledStatus(message: string) {
  isConfigured = false
  setStatus({
    state: 'disabled',
    message,
    feedUrl: undefined,
    info: undefined,
    progress: undefined,
    error: undefined,
    canCheck: false,
    canDownload: false,
    canInstall: false,
  })
}

function registerUpdaterEvents() {
  if (areEventsRegistered) {
    return
  }

  areEventsRegistered = true

  autoUpdater.on('checking-for-update', () => {
    setStatus({
      state: 'checking',
      message: '正在检查更新',
      checkedAt: getNow(),
      progress: undefined,
      error: undefined,
      canCheck: false,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('update-available', (info) => {
    setStatus({
      state: 'available',
      message: `发现新版本 ${info.version}`,
      checkedAt: getNow(),
      info: getUpdateInfo(info),
      progress: undefined,
      error: undefined,
      canCheck: true,
      canDownload: true,
      canInstall: false,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    setStatus({
      state: 'not-available',
      message: '当前已是最新版本',
      checkedAt: getNow(),
      info: getUpdateInfo(info),
      progress: undefined,
      error: undefined,
      canCheck: true,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('download-progress', (info) => {
    setStatus({
      state: 'downloading',
      message: `正在下载更新 ${Math.round(info.percent)}%`,
      progress: getProgressInfo(info),
      error: undefined,
      canCheck: false,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('update-downloaded', (event) => {
    setStatus({
      state: 'downloaded',
      message: '更新已下载，重启后安装',
      info: getUpdateInfo(event),
      progress: undefined,
      error: undefined,
      canCheck: true,
      canDownload: false,
      canInstall: true,
    })
  })

  autoUpdater.on('update-cancelled', (info) => {
    setStatus({
      state: 'idle',
      message: '更新下载已取消',
      info: getUpdateInfo(info),
      progress: undefined,
      error: undefined,
      canCheck: true,
      canDownload: true,
      canInstall: false,
    })
  })

  autoUpdater.on('error', (error) => {
    setStatus({
      state: 'error',
      message: '更新检查失败',
      progress: undefined,
      error: getErrorMessage(error),
      canCheck: isConfigured,
      canDownload: false,
      canInstall: false,
    })
  })
}

export function registerAutoUpdaterIpc() {
  ipcMain.handle('update:get-status', () => status)

  ipcMain.handle('update:check', async () => {
    if (!isConfigured) {
      return status
    }

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      setStatus({
        state: 'error',
        message: '更新检查失败',
        error: getErrorMessage(error),
        canCheck: true,
        canDownload: false,
        canInstall: false,
      })
    }

    return status
  })

  ipcMain.handle('update:download', async () => {
    if (!isConfigured) {
      return status
    }

    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      setStatus({
        state: 'error',
        message: '更新下载失败',
        error: getErrorMessage(error),
        canCheck: true,
        canDownload: true,
        canInstall: false,
      })
    }

    return status
  })

  ipcMain.handle('update:quit-and-install', () => {
    if (status.state === 'downloaded') {
      autoUpdater.quitAndInstall(false, true)
    }

    return status
  })
}

export function initializeAutoUpdater(options: UpdaterOptions) {
  registerUpdaterEvents()
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  if (options.isDev) {
    setDisabledStatus('开发模式下已启用 Vite 热刷新，自动更新仅在打包后启用')
    return
  }

  const feedUrl = getFeedUrl()
  isConfigured = true

  if (feedUrl) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: feedUrl,
    })
  }

  setStatus({
    state: 'idle',
    message: feedUrl ? '自动更新已就绪，使用运行时更新源' : '自动更新已就绪，使用打包配置中的更新源',
    feedUrl: feedUrl || undefined,
    error: undefined,
    canCheck: true,
    canDownload: false,
    canInstall: false,
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error: unknown) => {
      setStatus({
        state: 'error',
        message: '启动时检查更新失败',
        error: getErrorMessage(error),
        canCheck: true,
        canDownload: false,
        canInstall: false,
      })
    })
  }, options.autoCheckDelayMs ?? 3000)
}