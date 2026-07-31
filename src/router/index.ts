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
      title: '阅读',
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