<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NButton,
  NCard,
  NEmpty,
  NGrid,
  NGridItem,
  NImage,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NStatistic,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import { useRouter } from 'vue-router'

import { openCharacterWorkspaceWindow } from '../services/characterWorkspaceWindow'
import {
  type CharacterAsset,
  type CharacterImageGenerationRecord,
  normalizeCharacterName,
  useCharacterAssetsStore,
} from '../stores/characterAssets'
import { useNovelLibraryStore } from '../stores/novelLibrary'

type CharacterAssetLibraryItem = {
  id: string
  novelId: string
  profileId: string
  characterName: string
  imageDataUrl: string
  sourceLabel: string
  status: 'active' | 'generating' | 'failed' | 'archived'
  statusLabel: string
  updatedAt: string
  detail: string
}

const router = useRouter()
const message = useMessage()
const library = useNovelLibraryStore()
const characterAssets = useCharacterAssetsStore()
const statusFilter = ref<'all' | 'active' | 'archived'>('all')
const novelFilter = ref('all')
const searchText = ref('')
const restoringProfileIds = ref<string[]>([])

const novelById = computed(() => new Map(library.novels.map((novel) => [novel.id, novel])))
const novelOptions = computed(() => [
  { label: '全部小说', value: 'all' },
  ...library.novels.map((novel) => ({ label: novel.title, value: novel.id })),
])

const characterAssetItems = computed<CharacterAssetLibraryItem[]>(() => {
  const generationById = new Map(characterAssets.imageGenerations.map((record) => [record.id, record]))
  const primaryAssetByGenerationId = new Map(
    characterAssets.characters
      .filter((asset) => asset.kind !== 'reference' && asset.generationId)
      .map((asset) => [asset.generationId as string, asset]),
  )
  const generationItems = characterAssets.imageGenerations.map((record) =>
    createGenerationLibraryItem(record, primaryAssetByGenerationId.get(record.id)),
  )
  const standaloneItems = characterAssets.characters
    .filter((asset) => !asset.generationId || !generationById.has(asset.generationId))
    .map(createStoredAssetLibraryItem)

  return [...generationItems, ...standaloneItems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
})

const visibleCharacterAssetItems = computed(() => {
  const keyword = normalizeCharacterName(searchText.value)

  return characterAssetItems.value.filter((item) => {
    const matchesNovel = novelFilter.value === 'all' || item.novelId === novelFilter.value
    const matchesStatus =
      statusFilter.value === 'all' ||
      (statusFilter.value === 'archived' ? item.status === 'archived' : item.status !== 'archived')
    const matchesKeyword =
      !keyword ||
      normalizeCharacterName(item.characterName).includes(keyword) ||
      normalizeCharacterName(novelById.value.get(item.novelId)?.title ?? '').includes(keyword)

    return matchesNovel && matchesStatus && matchesKeyword
  })
})

const activeAssetCount = computed(() => characterAssetItems.value.filter((item) => item.status !== 'archived').length)
const archivedAssetCount = computed(() => characterAssetItems.value.filter((item) => item.status === 'archived').length)
const characterCount = computed(
  () =>
    new Set(
      characterAssetItems.value
        .filter((item) => item.status !== 'archived')
        .map((item) => item.profileId || `${item.novelId}:${normalizeCharacterName(item.characterName)}`),
    ).size,
)

function createGenerationLibraryItem(
  record: CharacterImageGenerationRecord,
  primaryAsset?: CharacterAsset,
): CharacterAssetLibraryItem {
  const archived = Boolean(record.deletedAt || primaryAsset?.deletedAt)
  const isPrimary = Boolean(primaryAsset)
  const status = archived ? 'archived' : record.status === 'failed' ? 'failed' : record.status === 'generating' ? 'generating' : 'active'

  return {
    id: `generation:${record.id}`,
    novelId: record.novelId,
    profileId: record.profileId,
    characterName: record.characterName,
    imageDataUrl: record.imageDataUrl ?? '',
    sourceLabel: isPrimary
      ? archived
        ? '原主形象'
        : '主形象'
      : record.source === 'upload'
        ? '上传候选'
        : 'AI 候选',
    status,
    statusLabel: archived
      ? '已归档'
      : record.status === 'failed'
        ? '生成失败'
        : record.status === 'generating'
          ? '生成中'
          : '可用',
    updatedAt: record.updatedAt,
    detail: record.errorMessage || [record.aspectRatio, record.resolution].filter(Boolean).join(' · ') || '角色形象记录',
  }
}

function createStoredAssetLibraryItem(asset: CharacterAsset): CharacterAssetLibraryItem {
  const archived = Boolean(asset.deletedAt)

  return {
    id: `asset:${asset.id}`,
    novelId: asset.novelId,
    profileId: asset.profileId ?? '',
    characterName: asset.name,
    imageDataUrl: asset.referenceImageDataUrl,
    sourceLabel: asset.kind === 'reference' ? '生成参考图' : archived ? '原主形象' : '主形象',
    status: archived ? 'archived' : 'active',
    statusLabel: archived ? '已归档' : '可用',
    updatedAt: asset.updatedAt,
    detail: asset.description || asset.fileName || '角色图片',
  }
}

function getStatusTagType(status: CharacterAssetLibraryItem['status']) {
  if (status === 'active') return 'success'
  if (status === 'generating') return 'warning'
  if (status === 'failed') return 'error'
  return 'default'
}

function formatAssetTime(value: string) {
  return new Date(value).toLocaleString()
}

function openCharacter(item: CharacterAssetLibraryItem) {
  const novel = novelById.value.get(item.novelId)

  if (!novel || item.status === 'archived') {
    return
  }

  openCharacterWorkspaceWindow(router, {
    scriptId: novel.id,
    title: `角色工作台 · ${novel.title}`,
  })
}

async function restoreCharacter(item: CharacterAssetLibraryItem) {
  const novel = novelById.value.get(item.novelId)

  if (!novel || !item.profileId || restoringProfileIds.value.includes(item.profileId)) {
    return
  }

  restoringProfileIds.value = [...restoringProfileIds.value, item.profileId]

  try {
    const result = await library.restoreCharacterProfile(item.novelId, item.profileId)

    if (!result) {
      throw new Error('没有找到可恢复的角色记录。')
    }

    await characterAssets.restoreCharacterProfileAssets({
      novelId: item.novelId,
      profileId: item.profileId,
      characterName: item.characterName,
      restoredAt: new Date().toISOString(),
      snapshot: result.characterContent,
    })
    message.success(`${item.characterName} 已恢复到《${novel.title}》`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '恢复角色失败。')
  } finally {
    restoringProfileIds.value = restoringProfileIds.value.filter((profileId) => profileId !== item.profileId)
  }
}

onMounted(() => {
  void library.loadLibrary()
  void characterAssets.loadAssets()
})
</script>

<template>
  <n-space vertical size="large" class="tool-view asset-library-view">
    <section class="view-title">
      <div>
        <n-text depth="3">小说创作过程中沉淀的可追踪素材</n-text>
        <h2>资产库</h2>
      </div>
    </section>

    <n-grid cols="2 m:4" responsive="screen" :x-gap="12" :y-gap="12">
      <n-grid-item>
        <n-card size="small">
          <n-statistic label="全部角色资产" :value="characterAssetItems.length" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card size="small">
          <n-statistic label="当前角色" :value="characterCount" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card size="small">
          <n-statistic label="使用中资产" :value="activeAssetCount" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card size="small">
          <n-statistic label="已归档" :value="archivedAssetCount" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <section class="character-asset-library-section">
      <div class="character-asset-library-head">
        <div>
          <h3>全部角色资产</h3>
          <n-text depth="3">主形象、参考图、生成候选与失败记录</n-text>
        </div>
        <n-space class="character-asset-library-filters" align="center" :wrap="true">
          <n-input
            v-model:value="searchText"
            class="character-asset-filter-control"
            clearable
            placeholder="搜索角色或小说"
          />
          <n-select v-model:value="novelFilter" class="character-asset-filter-control" :options="novelOptions" />
          <n-radio-group v-model:value="statusFilter" size="small">
            <n-radio-button value="all">全部</n-radio-button>
            <n-radio-button value="active">使用中</n-radio-button>
            <n-radio-button value="archived">已归档</n-radio-button>
          </n-radio-group>
        </n-space>
      </div>

      <n-grid v-if="visibleCharacterAssetItems.length" cols="1 s:2 m:3 l:4" responsive="screen" :x-gap="12" :y-gap="12">
        <n-grid-item v-for="item in visibleCharacterAssetItems" :key="item.id">
          <n-card
            class="character-asset-library-card"
            :class="{ 'character-asset-library-card--archived': item.status === 'archived' }"
            size="small"
            :content-style="{ padding: '0' }"
          >
            <div class="character-asset-library-preview">
              <n-image
                v-if="item.imageDataUrl"
                class="character-asset-preview-image"
                :src="item.imageDataUrl"
                :alt="`${item.characterName}${item.sourceLabel}`"
                width="100%"
                height="100%"
                object-fit="contain"
                lazy
              />
              <n-empty v-else size="small" :description="item.statusLabel" />
            </div>
            <div class="character-asset-library-meta">
              <n-space align="center" justify="space-between" :wrap="false">
                <strong>{{ item.characterName || '未命名角色' }}</strong>
                <n-tag size="small" :type="getStatusTagType(item.status)">{{ item.statusLabel }}</n-tag>
              </n-space>
              <n-space size="small">
                <n-tag size="small" :bordered="false">{{ item.sourceLabel }}</n-tag>
                <n-text depth="3">{{ novelById.get(item.novelId)?.title || '原小说已移除' }}</n-text>
              </n-space>
              <n-text class="character-asset-library-detail" depth="3">{{ item.detail }}</n-text>
              <n-space align="center" justify="space-between" :wrap="false">
                <n-text depth="3">{{ formatAssetTime(item.updatedAt) }}</n-text>
                <n-button v-if="item.status !== 'archived'" text type="primary" @click="openCharacter(item)">
                  打开角色
                </n-button>
                <n-button
                  v-else-if="item.profileId && novelById.has(item.novelId)"
                  text
                  type="primary"
                  :loading="restoringProfileIds.includes(item.profileId)"
                  @click="restoreCharacter(item)"
                >
                  恢复到小说
                </n-button>
              </n-space>
            </div>
          </n-card>
        </n-grid-item>
      </n-grid>

      <n-empty v-else description="没有符合条件的角色资产" />
    </section>
  </n-space>
</template>

<style scoped>
.asset-library-view {
  padding-bottom: 24px;
}

.character-asset-library-section {
  display: grid;
  gap: 14px;
}

.character-asset-library-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.character-asset-library-head h3 {
  margin: 0 0 4px;
  font-size: 18px;
}

.character-asset-filter-control {
  width: 200px;
}

.character-asset-library-card {
  height: 100%;
  overflow: hidden;
}

.character-asset-library-card--archived {
  background: #f7f7f7;
}

.character-asset-library-preview {
  display: grid;
  height: 260px;
  place-items: center;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
  background: #f5f6f6;
}

.character-asset-preview-image {
  display: block;
  width: 100%;
  height: 100%;
}

.character-asset-library-meta {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.character-asset-library-meta strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-asset-library-detail {
  min-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .character-asset-library-head {
    align-items: stretch;
    flex-direction: column;
  }

  .character-asset-filter-control {
    width: min(100%, 260px);
  }
}
</style>
