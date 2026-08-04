export type AiImageHistoryRecord = PanelForgeAiImageRecord

export async function openAiDrawingHistoryWindow() {
  const panelForge = window.panelForge

  if (!panelForge?.windows) {
    throw new Error('请在 Electron 客户端中打开生成记录。')
  }

  return panelForge.windows.openAiDrawingHistoryWindow({
    routeHash: '/ai-drawing/history',
    title: '生成记录',
  })
}

export async function listAiImageHistory() {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中查看生成记录。')
  }

  return panelForge.aihubmix.listImageRecords()
}

export async function deleteAiImageHistoryRecord(recordId: string) {
  const panelForge = window.panelForge

  if (!panelForge?.aihubmix) {
    throw new Error('请在 Electron 客户端中管理生成记录。')
  }

  return panelForge.aihubmix.deleteImageRecord(recordId)
}
