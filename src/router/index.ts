import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/scripts',
  },
  {
    path: '/scripts',
    name: 'script-library',
    component: () => import('../views/HomeView.vue'),
    meta: {
      title: '剧本库',
    },
  },
  {
    path: '/scripts/:scriptId',
    name: 'script-reader',
    component: () => import('../views/ScriptReaderView.vue'),
    meta: {
      activeMenu: 'script-library',
      level: 2,
      title: '阅读',
    },
  },
  {
    path: '/scripts/:scriptId/outline',
    name: 'script-outline',
    component: () => import('../views/ScriptOutlineView.vue'),
    meta: {
      activeMenu: 'script-library',
      level: 2,
      title: '创作大纲',
    },
  },
  {
    path: '/scripts/:scriptId/chapters/:chapterIndex/canvas',
    name: 'chapter-canvas',
    component: () => import('../views/ChapterCanvasWindowView.vue'),
    meta: {
      activeMenu: 'script-library',
      canvasWindow: true,
      level: 2,
      title: '分镜画布',
    },
  },
  {
    path: '/scripts/:scriptId/chapters/:chapterIndex/source',
    name: 'chapter-source',
    component: () => import('../views/ChapterSourceWindowView.vue'),
    meta: {
      activeMenu: 'script-library',
      level: 2,
      sourceWindow: true,
      title: '章节正文',
    },
  },
  {
    path: '/ai-drawing',
    name: 'ai-drawing',
    component: () => import('../views/AIDrawingView.vue'),
    meta: {
      title: 'AI绘图',
    },
  },
  {
    path: '/assets',
    name: 'asset-library',
    component: () => import('../views/AssetLibraryView.vue'),
    meta: {
      title: '资产库',
    },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
    meta: {
      title: '设置',
    },
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
