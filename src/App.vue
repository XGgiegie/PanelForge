<script setup lang="ts">
import { computed, h } from 'vue'
import {
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLayout,
  NLayoutContent,
  NLayoutSider,
  NMenu,
  NMessageProvider,
  type GlobalThemeOverrides,
  type MenuOption,
} from 'naive-ui'
import { RouterView, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const isReaderRoute = computed(() => route.name === 'script-reader')

const activeMenuKey = computed(() => {
  if (isReaderRoute.value) {
    return 'script-library'
  }

  return String(route.name ?? 'script-library')
})

const themeOverrides: GlobalThemeOverrides = {
  common: {
    bodyColor: '#f6f7fb',
    baseColor: '#ffffff',
    cardColor: '#ffffff',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    inputColor: '#ffffff',
    tableColor: '#ffffff',
    textColorBase: '#202432',
    textColor1: '#202432',
    textColor2: '#606879',
    textColor3: '#9299a8',
    borderColor: '#dfe3ec',
    dividerColor: '#e7e9f0',
    primaryColor: '#6f63c5',
    primaryColorHover: '#7d71d1',
    primaryColorPressed: '#5c51aa',
    primaryColorSuppl: '#766acb',
    infoColor: '#5276ad',
    infoColorHover: '#6688bb',
    infoColorPressed: '#466597',
    successColor: '#4e8c70',
    successColorHover: '#62a084',
    successColorPressed: '#3f765d',
    warningColor: '#b8782d',
    warningColorHover: '#c98a42',
    warningColorPressed: '#9e6421',
    errorColor: '#b95c72',
    errorColorHover: '#c97184',
    errorColorPressed: '#9f4b60',
    borderRadius: '7px',
  },
  Button: {
    borderRadiusSmall: '6px',
    borderRadiusMedium: '7px',
    borderRadiusLarge: '7px',
    textColorPrimary: '#ffffff',
    textColorHoverPrimary: '#ffffff',
    textColorPressedPrimary: '#ffffff',
  },
  Card: {
    borderRadius: '8px',
    color: '#ffffff',
    colorEmbedded: '#fbfcfe',
    borderColor: '#dfe3ec',
    titleTextColor: '#202432',
  },
  Input: {
    color: '#ffffff',
    colorFocus: '#ffffff',
    border: '1px solid #dfe3ec',
    borderHover: '1px solid #c3c8d4',
    borderFocus: '1px solid #6f63c5',
  },
  Menu: {
    itemBorderRadius: '6px',
    itemTextColor: '#656d7d',
    itemTextColorHover: '#252a36',
    itemTextColorActive: '#39344f',
    itemTextColorActiveHover: '#39344f',
    itemIconColor: '#788091',
    itemIconColorHover: '#665bad',
    itemIconColorActive: '#665bad',
    itemIconColorActiveHover: '#5c519f',
    itemColorHover: '#f1f2f6',
    itemColorActive: '#eceaf6',
    itemColorActiveHover: '#e7e4f3',
  },
  Tag: {
    borderRadius: '6px',
  },
}
const menuOptions: MenuOption[] = [
  {
    label: '剧本库',
    key: 'script-library',
    icon: () => h('span', { class: 'menu-icon' }, '剧'),
  },
  {
    label: 'AI绘图',
    key: 'ai-drawing',
    icon: () => h('span', { class: 'menu-icon' }, '绘'),
  },
  {
    label: '资产库',
    key: 'asset-library',
    icon: () => h('span', { class: 'menu-icon' }, '资'),
  },
  {
    label: '设置',
    key: 'settings',
    icon: () => h('span', { class: 'menu-icon' }, '设'),
  },
]

const routeNameByMenuKey: Record<string, string> = {
  'script-library': 'script-library',
  'ai-drawing': 'ai-drawing',
  'asset-library': 'asset-library',
  settings: 'settings',
}

function handleMenuUpdate(key: string | number) {
  const routeName = routeNameByMenuKey[String(key)]

  if (routeName && route.name !== routeName) {
    router.push({ name: routeName })
  }
}
</script>

<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-layout class="app-shell" has-sider>
          <n-layout-sider class="app-sidebar" bordered :width="220">
            <div class="app-brand sidebar-brand">
              <span class="brand-mark">PF</span>
              <div class="brand-copy">
                <strong>PanelForge</strong>
                <span>AI 漫剧平台</span>
              </div>
            </div>

            <n-menu
              class="side-menu"
              :value="activeMenuKey"
              :options="menuOptions"
              @update:value="handleMenuUpdate"
            />
          </n-layout-sider>

          <n-layout-content class="app-content" :class="{ 'app-content--reader': isReaderRoute }">
            <RouterView />
          </n-layout-content>
        </n-layout>

        <n-global-style />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>