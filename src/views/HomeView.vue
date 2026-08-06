<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItemGi,
  NGrid,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NText,
} from 'naive-ui'
import { useRouter } from 'vue-router'

import {
  createNovelImportInputsFromFiles,
  type NovelImportInput,
  useNovelLibraryStore,
} from '../stores/novelLibrary'
import { openCharacterWorkspaceWindow } from '../services/characterWorkspaceWindow'

const router = useRouter()
const library = useNovelLibraryStore()
const novelInput = ref<HTMLInputElement | null>(null)
const searchValue = ref('')
const isImporting = ref(false)
const importError = ref('')
const isNovelFoundationOpen = ref(false)
const pendingNovelImports = ref<(NovelImportInput & { genre: string; premise: string })[]>([])

const genreOptions = [
  { label: '都市', value: '都市' },
  { label: '古代', value: '古代' },
  { label: '玄幻', value: '玄幻' },
  { label: '仙侠', value: '仙侠' },
  { label: '科幻', value: '科幻' },
  { label: '悬疑', value: '悬疑' },
  { label: '校园', value: '校园' },
  { label: '末世', value: '末世' },
  { label: '其他', value: '其他' },
]

const filteredNovels = computed(() => {
  const keyword = searchValue.value.trim().toLowerCase()

  if (!keyword) {
    return library.novels
  }

  return library.novels.filter((novel) => {
    return [novel.title, novel.fileName].some((item) => item.toLowerCase().includes(keyword))
  })
})

function formatDate(value: string) {
  return new Date(value).toLocaleDateString()
}

function openNovelPicker() {
  if (isImporting.value) {
    return
  }

  novelInput.value?.click()
}

function openReader(id: string) {
  library.selectNovel(id)
  router.push({ name: 'script-reader', params: { scriptId: id } })
}

async function handleNovelFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])

  if (files.length === 0) {
    return
  }

  importError.value = ''
  isImporting.value = true

  try {
    const novels = await createNovelImportInputsFromFiles(files)
    pendingNovelImports.value = novels.map((novel) => ({
      ...novel,
      genre: '',
      premise: '',
    }))
    isNovelFoundationOpen.value = true
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '导入失败，请确认文件格式。'
  } finally {
    isImporting.value = false
    input.value = ''
  }
}

function cancelNovelFoundation() {
  isNovelFoundationOpen.value = false
  pendingNovelImports.value = []
  importError.value = ''
}

async function confirmNovelFoundation() {
  const missingGenre = pendingNovelImports.value.find((novel) => !novel.genre.trim())

  if (missingGenre) {
    importError.value = `请为《${missingGenre.title?.trim() || missingGenre.fileName}》选择题材。`
    return
  }

  importError.value = ''
  isImporting.value = true

  try {
    await library.importNovels(pendingNovelImports.value)
    isNovelFoundationOpen.value = false
    pendingNovelImports.value = []

    if (library.selectedNovelId) {
      const importedNovel = library.novels.find((novel) => novel.id === library.selectedNovelId)

      openCharacterWorkspaceWindow(router, {
        scriptId: library.selectedNovelId,
        title: `角色工作台 · ${importedNovel?.title ?? '新剧本'}`,
      })
    }
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '导入失败，请稍后重试。'
  } finally {
    isImporting.value = false
  }
}

onMounted(() => {
  library.loadLibrary()
})
</script>

<template>
  <div class="script-library-view">
    <n-card class="bookshelf-card">
      <n-space vertical size="large">
        <div class="bookshelf-head">
          <div class="bookshelf-title">
            <h2>项目看板</h2>
            <span>{{ library.novels.length }} 个剧本</span>
          </div>

          <div class="bookshelf-toolbar">
            <n-input v-model:value="searchValue" clearable placeholder="搜索剧本或文件名" />
            <input
              ref="novelInput"
              class="file-input"
              type="file"
              multiple
              accept=".txt,.md,.text,.epub,application/epub+zip"
              @change="handleNovelFileChange"
            />
            <n-button type="primary" :loading="isImporting" :disabled="isImporting" @click="openNovelPicker">
              导入剧本
            </n-button>
          </div>
        </div>

        <n-alert v-if="importError && !isNovelFoundationOpen" type="error" :show-icon="false">
          {{ importError }}
        </n-alert>

        <n-empty v-if="library.isLoaded && library.novels.length === 0" description="书架还是空的">
          <template #extra>
            <n-button type="primary" :loading="isImporting" :disabled="isImporting" @click="openNovelPicker">
              导入剧本
            </n-button>
          </template>
        </n-empty>

        <n-empty v-else-if="filteredNovels.length === 0" description="没有匹配的剧本" />

        <div v-else class="bookshelf-grid">
          <n-card
            v-for="novel in filteredNovels"
            :key="novel.id"
            class="book-card"
            size="small"
            @click="openReader(novel.id)"
          >
            <div class="book-card-content">
              <div class="book-cover">
                <span>{{ novel.title.slice(0, 2) }}</span>
              </div>

              <div class="book-info">
                <strong>{{ novel.title }}</strong>
                <span>{{ novel.fileName }}</span>
              </div>

              <div class="book-actions" @click.stop>
                <n-text depth="3">{{ formatDate(novel.importedAt) }}</n-text>
                <n-popconfirm @positive-click="library.removeNovel(novel.id)">
                  <template #trigger>
                    <n-button size="tiny" text>移出</n-button>
                  </template>
                  移出《{{ novel.title }}》？
                </n-popconfirm>
              </div>
            </div>
          </n-card>
        </div>
      </n-space>
    </n-card>

    <n-modal
      v-model:show="isNovelFoundationOpen"
      preset="card"
      title="补充作品设定"
      style="width: min(680px, calc(100vw - 32px));"
      :mask-closable="!isImporting"
      :closable="!isImporting"
      @close="cancelNovelFoundation"
    >
      <n-space vertical size="large">
        <n-text depth="3">题材会用于角色、分镜首帧和视频的视觉与叙事提示词。</n-text>
        <n-alert v-if="importError" type="error" :show-icon="false">{{ importError }}</n-alert>

        <n-form label-placement="top">
          <div v-for="novel in pendingNovelImports" :key="novel.fileName" class="novel-foundation-entry">
            <strong>{{ novel.title?.trim() || novel.fileName }}</strong>
            <n-grid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="0">
              <n-form-item-gi label="题材" :show-feedback="false">
                <n-select v-model:value="novel.genre" :options="genreOptions" placeholder="请选择题材" />
              </n-form-item-gi>
              <n-form-item-gi label="世界与时代前提" :show-feedback="false">
                <n-input
                  v-model:value="novel.premise"
                  type="textarea"
                  placeholder="如：当代上海、架空王朝、近未来火星殖民地"
                  :autosize="{ minRows: 1, maxRows: 3 }"
                />
              </n-form-item-gi>
            </n-grid>
          </div>
        </n-form>
      </n-space>

      <template #footer>
        <n-space justify="end">
          <n-button :disabled="isImporting" @click="cancelNovelFoundation">取消</n-button>
          <n-button type="primary" :loading="isImporting" @click="confirmNovelFoundation">创建作品</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
