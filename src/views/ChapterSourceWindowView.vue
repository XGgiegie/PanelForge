<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NButton, NEmpty, NText } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import { getNovelChapterText, useNovelLibraryStore } from '../stores/novelLibrary'

const route = useRoute()
const router = useRouter()
const library = useNovelLibraryStore()

const scriptId = computed(() => String(route.params.scriptId ?? ''))
const chapterIndex = computed(() => {
  const value = Number(route.params.chapterIndex ?? 1)

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1
})
const novel = computed(() => library.novels.find((item) => item.id === scriptId.value) ?? null)
const chapters = computed(() => novel.value?.chapters ?? [])
const chapter = computed(() => {
  return chapters.value.find((item) => item.index === chapterIndex.value) ?? chapters.value[0] ?? null
})
const chapterPosition = computed(() => {
  if (!chapter.value) {
    return -1
  }

  return chapters.value.findIndex((item) => item.id === chapter.value?.id)
})
const previousChapter = computed(() => chapters.value[chapterPosition.value - 1] ?? null)
const nextChapter = computed(() => chapters.value[chapterPosition.value + 1] ?? null)
const chapterText = computed(() => {
  if (!novel.value || !chapter.value) {
    return ''
  }

  return getNovelChapterText(novel.value, chapter.value)
})

function openChapter(index: number) {
  if (!novel.value) {
    return
  }

  router.replace({
    name: 'chapter-source',
    params: {
      scriptId: novel.value.id,
      chapterIndex: String(index),
    },
  })
}

function closeWindow() {
  window.close()
}

onMounted(() => {
  library.loadLibrary()
})
</script>

<template>
  <div class="chapter-source-window-view">
    <div v-if="library.isLoading" class="chapter-source-empty">
      <n-empty description="正在加载正文" />
    </div>

    <div v-else-if="!novel || !chapter" class="chapter-source-empty">
      <n-empty description="正文不存在或剧本已移出">
        <template #extra>
          <n-button @click="closeWindow">关闭窗口</n-button>
        </template>
      </n-empty>
    </div>

    <template v-else>
      <header class="chapter-source-head">
        <div>
          <n-text depth="3">{{ novel.title }}</n-text>
          <h2>{{ chapter.title }}</h2>
        </div>
        <n-button size="small" @click="closeWindow">关闭</n-button>
      </header>

      <section class="chapter-source-meta">
        <n-text depth="3">
          第 {{ chapter.index }} / {{ chapters.length }} 章 · {{ chapter.wordCount }} 字
        </n-text>
      </section>

      <main class="chapter-source-body">
        {{ chapterText }}
      </main>

      <footer class="chapter-source-footer">
        <div class="chapter-source-footer-actions">
          <n-button :disabled="!previousChapter" @click="previousChapter && openChapter(previousChapter.index)">
            上一章
          </n-button>
          <n-button :disabled="!nextChapter" @click="nextChapter && openChapter(nextChapter.index)">
            下一章
          </n-button>
        </div>
      </footer>
    </template>
  </div>
</template>
