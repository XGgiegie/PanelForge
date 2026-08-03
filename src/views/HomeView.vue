<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NEmpty, NInput, NPopconfirm, NSpace, NText } from 'naive-ui'
import { useRouter } from 'vue-router'

import { createNovelImportInputsFromFiles, useNovelLibraryStore } from '../stores/novelLibrary'

const router = useRouter()
const library = useNovelLibraryStore()
const novelInput = ref<HTMLInputElement | null>(null)
const searchValue = ref('')
const isImporting = ref(false)
const importError = ref('')

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
    await library.importNovels(novels)

    if (library.selectedNovelId) {
      router.push({
        name: 'script-outline',
        params: { scriptId: library.selectedNovelId },
      })
    }
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '导入失败，请确认文件格式。'
  } finally {
    isImporting.value = false
    input.value = ''
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

        <n-alert v-if="importError" type="error" :show-icon="false">
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
  </div>
</template>
