<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLayout,
  NLayoutContent,
  NLayoutSider,
  NMenu,
  NMessageProvider,
  type MenuOption,
} from 'naive-ui'
import { RouterView, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const viewportWidth = ref(window.innerWidth)

const isReaderRoute = computed(() => route.name === 'script-reader')
const shouldHideSidebar = computed(() => route.meta.level === 2)
const sidebarWidth = computed(() => {
  if (viewportWidth.value <= 560) return 100
  if (viewportWidth.value <= 760) return 140
  return 220
})
const isPlainWindowRoute = computed(
  () => route.meta.sourceWindow === true || route.meta.canvasWindow === true || route.meta.characterWindow === true,
)

const activeMenuKey = computed(() => {
  return String(route.meta.activeMenu ?? route.name ?? 'script-library')
})

const menuOptions: MenuOption[] = [
  {
    label: '剧本库',
    key: 'script-library',
  },
  {
    label: '资产库',
    key: 'asset-library',
  },
  {
    label: '设置',
    key: 'settings',
  },
]

const routeNameByMenuKey: Record<string, string> = {
  'script-library': 'script-library',
  'asset-library': 'asset-library',
  settings: 'settings',
}

function handleMenuUpdate(key: string | number) {
  const routeName = routeNameByMenuKey[String(key)]

  if (routeName && route.name !== routeName) {
    router.push({ name: routeName })
  }
}

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => window.addEventListener('resize', updateViewportWidth))
onUnmounted(() => window.removeEventListener('resize', updateViewportWidth))
</script>

<template>
  <n-config-provider>
    <n-message-provider>
      <n-dialog-provider>
        <n-layout class="app-shell" :has-sider="!shouldHideSidebar">
          <n-layout-sider
            v-if="!shouldHideSidebar"
            class="app-sidebar"
            bordered
            :width="sidebarWidth"
          >
            <n-menu
              class="side-menu"
              :value="activeMenuKey"
              :options="menuOptions"
              @update:value="handleMenuUpdate"
            />
          </n-layout-sider>

          <n-layout-content
            class="app-content"
            :class="{
              'app-content--reader': isReaderRoute,
              'app-content--source-window': isPlainWindowRoute,
            }"
          >
            <RouterView />
          </n-layout-content>
        </n-layout>

        <n-global-style />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
