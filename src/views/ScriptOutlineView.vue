<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDrawer,
  NDrawerContent,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NForm,
  NFormItem,
  NFormItemGi,
  NGrid,
  NGridItem,
  NImage,
  NImageGroup,
  NInput,
  NInputNumber,
  NLayout,
  NLayoutContent,
  NLayoutFooter,
  NLayoutHeader,
  NLayoutSider,
  NList,
  NListItem,
  NModal,
  NPopconfirm,
  NSelect,
  NSlider,
  NSpace,
  NTag,
  NText,
  NThing,
  NTooltip,
} from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import {
  AI_IMAGE_RESOLUTION_OPTIONS,
  generateAiImage,
  type AiImageAspectRatio,
  type AiImageResolution,
} from '../services/aiImageGeneration'
import { createCharacterImagePrompt } from '../services/characterImagePrompt'
import { useAiSettingsStore } from '../stores/aiSettings'
import {
  normalizeCharacterName,
  type CharacterImageGenerationRecord,
  useCharacterAssetsStore,
} from '../stores/characterAssets'
import {
  createCreativeBriefFromCharacterProfiles,
  createEmptyCharacterProfile,
  getCreativeBriefCharacterProfiles,
  getNovelFoundationForPrompt,
  type NovelCharacterProfile,
  useNovelLibraryStore,
} from '../stores/novelLibrary'

const route = useRoute()
const router = useRouter()
const library = useNovelLibraryStore()
const characterAssets = useCharacterAssetsStore()
const aiSettings = useAiSettingsStore()

const characterDrafts = ref<NovelCharacterProfile[]>([])
const imageInput = ref<HTMLInputElement | null>(null)
const referenceImageInput = ref<HTMLInputElement | null>(null)
const activeCharacterId = ref('')
const portraitUploadProfileId = ref('')
const activeReferenceProfileId = ref('')
const generatingCharacterIds = ref<string[]>([])
const selectingGenerationIds = ref<string[]>([])
const uploadingPortraitProfileIds = ref<string[]>([])
const uploadingReferenceProfileIds = ref<string[]>([])
const deletingCharacterIds = ref<string[]>([])
const characterImageErrors = ref<Record<string, string>>({})
const isCharacterDrawingOpen = ref(false)
const isCharacterHistoryOpen = ref(false)
const drawingProfileId = ref('')
const drawingAspectRatio = ref<AiImageAspectRatio>('2:3')
const drawingResolution = ref<AiImageResolution>('1K')
const drawingDirection = ref('')
const drawingPromptDraft = ref('')
const isDrawingPromptCustomized = ref(false)
const isSaving = ref(false)
const autoSaveStatus = ref<'saved' | 'pending' | 'saving' | 'needs-name' | 'error'>('saved')
const savedMessage = ref('')
const formError = ref('')
let autoSaveTimer: number | undefined
let activeCharacterSave: Promise<void> | null = null
let isClosingAfterCharacterSave = false

const roleOptions = [
  { label: '主角', value: '主角' },
  { label: '反派', value: '反派' },
  { label: '配角', value: '配角' },
  { label: '其他', value: '其他' },
]
const genderOptions = [
  { label: '未知', value: '未知' },
  { label: '男性', value: '男性' },
  { label: '女性', value: '女性' },
  { label: '非人类 / 其他', value: '非人类 / 其他' },
]
const traitFields = [
  { key: 'extroversion', label: '外向度', low: '内向', high: '外向' },
  { key: 'rationality', label: '理性度', low: '感性', high: '理性' },
  { key: 'kindness', label: '善良度', low: '冷酷', high: '善良' },
  { key: 'decisiveness', label: '果断度', low: '犹豫', high: '果断' },
  { key: 'guardedness', label: '戒备度', low: '信任', high: '戒备' },
] as const
const characterImageAspectRatioOptions: { label: string; value: AiImageAspectRatio }[] = [
  { label: '全身角色 2:3', value: '2:3' },
  { label: '全身竖构图 9:16', value: '9:16' },
]
const MAX_CHARACTER_REFERENCE_IMAGES = 4

const scriptId = computed(() => String(route.params.scriptId ?? ''))
const isCharacterWorkspaceWindow = computed(() => route.meta.characterWindow === true)
const novel = computed(() => library.novels.find((item) => item.id === scriptId.value) ?? null)
const savedProfiles = computed(() => getCreativeBriefCharacterProfiles(novel.value?.creativeBrief))
const visualizedCharacterCount = computed(() =>
  characterDrafts.value.filter((profile) => Boolean(getReferencePreview(profile))).length,
)
const hasChanges = computed(() => JSON.stringify(characterDrafts.value) !== JSON.stringify(savedProfiles.value))
const visibleSavedMessage = computed(() =>
  savedMessage.value.startsWith('角色设定已') ? '' : savedMessage.value,
)
const activeCharacter = computed(
  () => characterDrafts.value.find((profile) => profile.id === activeCharacterId.value) ?? characterDrafts.value[0] ?? null,
)
const drawingProfile = computed(() => characterDrafts.value.find((profile) => profile.id === drawingProfileId.value) ?? null)
const assembledDrawingPrompt = computed(() => {
  const profile = drawingProfile.value

  return profile
    ? createCharacterImagePrompt(
        profile,
        getCharacterGenerationReferences(profile).length,
        drawingDirection.value,
        getNovelFoundationForPrompt(novel.value),
      )
    : ''
})
const drawingPrompt = computed({
  get: () => (isDrawingPromptCustomized.value ? drawingPromptDraft.value : assembledDrawingPrompt.value),
  set: (value: string) => {
    drawingPromptDraft.value = value
    isDrawingPromptCustomized.value = true
  },
})
const drawingGenerationRecords = computed(() => {
  if (!novel.value || !drawingProfile.value) {
    return []
  }

  return characterAssets.getImageGenerationsByProfile(novel.value.id, drawingProfile.value.id)
})
const autoSaveLabel = computed(() => {
  if (autoSaveStatus.value === 'saving') return '正在保存'
  if (autoSaveStatus.value === 'pending') return '即将保存'
  if (autoSaveStatus.value === 'needs-name') return '请先填写角色名称'
  if (autoSaveStatus.value === 'error') return '保存失败'
  return '已自动保存'
})

function cloneProfiles(profiles: NovelCharacterProfile[]) {
  return profiles.map((profile) => ({
    ...profile,
    traits: { ...profile.traits },
  }))
}

function syncDraft() {
  isCharacterDrawingOpen.value = false
  drawingProfileId.value = ''
  const profiles = cloneProfiles(savedProfiles.value)
  characterDrafts.value = profiles
  activeCharacterId.value = profiles.find((profile) => profile.id === activeCharacterId.value)?.id ?? profiles[0]?.id ?? ''
  autoSaveStatus.value = 'saved'
  formError.value = ''
  savedMessage.value = ''
}

function openReferencePicker(profileId: string) {
  portraitUploadProfileId.value = profileId
  imageInput.value?.click()
}

async function handleReferenceFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const profileId = portraitUploadProfileId.value
  const profile = characterDrafts.value.find((item) => item.id === profileId)

  input.value = ''

  if (!file || !profile || !novel.value) {
    return
  }

  if (!file.type.startsWith('image/')) {
    formError.value = '请上传图片文件。'
    return
  }

  if (!profile.name.trim()) {
    formError.value = '请先填写角色名称，再上传全身主图。'
    return
  }

  if (!(await flushCharacterSave())) {
    return
  }

  formError.value = ''
  uploadingPortraitProfileIds.value = [...uploadingPortraitProfileIds.value, profile.id]

  try {
    await characterAssets.addUploadedImageHistory({
      novelId: novel.value.id,
      profileId: profile.id,
      characterName: profile.name,
      file,
    })
    savedMessage.value = `已添加 ${profile.name.trim()} 的上传候选图`
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '保存上传候选图失败。'
  } finally {
    uploadingPortraitProfileIds.value = uploadingPortraitProfileIds.value.filter((id) => id !== profile.id)
    portraitUploadProfileId.value = ''
  }
}

function getSavedReference(profile: NovelCharacterProfile) {
  if (!novel.value || !profile.name.trim()) {
    return null
  }

  const normalizedName = normalizeCharacterName(profile.name)
  const savedCharacters = characterAssets.getCharactersByNovelId(novel.value.id)

  return (
    savedCharacters.find((asset) => asset.profileId === profile.id) ??
    savedCharacters.find(
      (asset) => !asset.profileId && normalizeCharacterName(asset.name) === normalizedName,
    ) ??
    null
  )
}

function getReferencePreview(profile: NovelCharacterProfile) {
  return getSavedReference(profile)?.referenceImageDataUrl || ''
}

function getCharacterCandidateCount(profile: NovelCharacterProfile) {
  if (!novel.value) {
    return 0
  }

  return characterAssets
    .getImageGenerationsByProfile(novel.value.id, profile.id)
    .filter((record) => record.status === 'succeeded').length
}

function selectCharacter(profile: NovelCharacterProfile) {
  activeCharacterId.value = profile.id
  formError.value = ''
}

function getCharacterReferenceImages(profile: NovelCharacterProfile) {
  if (!novel.value || !profile.name.trim()) {
    return []
  }

  const normalizedName = normalizeCharacterName(profile.name)
  const referenceImages = characterAssets.getReferenceImagesByNovelId(novel.value.id)
  const scopedReferences = referenceImages.filter((asset) => asset.profileId === profile.id)

  return scopedReferences.length
    ? scopedReferences
    : referenceImages.filter(
        (asset) => !asset.profileId && normalizeCharacterName(asset.name) === normalizedName,
      )
}

function getCharacterGenerationReferences(profile: NovelCharacterProfile) {
  const seenImages = new Set<string>()
  const references: string[] = []

  for (const image of getCharacterReferenceImages(profile).map((asset) => asset.referenceImageDataUrl)) {
    if (!image || seenImages.has(image)) {
      continue
    }

    seenImages.add(image)
    references.push(image)
  }

  return references.slice(0, MAX_CHARACTER_REFERENCE_IMAGES)
}

function isReferenceImageUploading(profile: NovelCharacterProfile) {
  return uploadingReferenceProfileIds.value.includes(profile.id)
}

function isPortraitImageUploading(profile: NovelCharacterProfile) {
  return uploadingPortraitProfileIds.value.includes(profile.id)
}

function resetDrawingPrompt() {
  drawingPromptDraft.value = ''
  isDrawingPromptCustomized.value = false
}

async function openCharacterDrawing(profile: NovelCharacterProfile) {
  if (!profile.name.trim()) {
    formError.value = '请先填写角色名称，再创建角色形象。'
    return
  }

  if (!(await flushCharacterSave())) {
    return
  }

  drawingProfileId.value = profile.id
  drawingAspectRatio.value = '2:3'
  drawingResolution.value = '1K'
  drawingDirection.value = ''
  resetDrawingPrompt()
  characterImageErrors.value = {
    ...characterImageErrors.value,
    [profile.id]: '',
  }
  isCharacterDrawingOpen.value = true
  isCharacterHistoryOpen.value = false

  const primaryImage = getSavedReference(profile)
  const hasPrimaryHistory = primaryImage?.generationId
    ? characterAssets.imageGenerations.some((record) => record.id === primaryImage.generationId)
    : false

  if (!primaryImage || hasPrimaryHistory || !novel.value) {
    return
  }

  try {
    const record = await characterAssets.ensureImageHistory({
      novelId: novel.value.id,
      profileId: profile.id,
      characterName: profile.name,
      imageDataUrl: primaryImage.referenceImageDataUrl,
      fileName: primaryImage.fileName,
    })
    await characterAssets.setImageGenerationAsPortrait({
      generationId: record.id,
      name: profile.name,
      description: profile.appearance,
    })
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '补全角色形象历史失败。'
  }
}

function openCharacterReferencePicker(profile: NovelCharacterProfile) {
  if (!profile.name.trim()) {
    formError.value = '请先填写角色名称，再添加生成参考图。'
    return
  }

  if (getCharacterReferenceImages(profile).length >= MAX_CHARACTER_REFERENCE_IMAGES) {
    formError.value = `每个角色最多添加 ${MAX_CHARACTER_REFERENCE_IMAGES} 张生成参考图。`
    return
  }

  activeReferenceProfileId.value = profile.id
  referenceImageInput.value?.click()
}

async function handleCharacterReferenceFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const profileId = activeReferenceProfileId.value
  const profile = characterDrafts.value.find((item) => item.id === profileId)

  input.value = ''

  if (!file || !profile || !novel.value) {
    return
  }

  if (!file.type.startsWith('image/')) {
    formError.value = '请上传图片文件。'
    return
  }

  formError.value = ''
  uploadingReferenceProfileIds.value = [...uploadingReferenceProfileIds.value, profile.id]

  try {
    await characterAssets.addCharacterReference({
      novelId: novel.value.id,
      profileId: profile.id,
      name: profile.name,
      description: '角色生成参考图',
      file,
    })
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '保存生成参考图失败。'
  } finally {
    uploadingReferenceProfileIds.value = uploadingReferenceProfileIds.value.filter((id) => id !== profile.id)
    activeReferenceProfileId.value = ''
  }
}

async function removeCharacterReference(assetId: string) {
  try {
    await characterAssets.removeCharacter(assetId)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '移除生成参考图失败。'
  }
}

function isCharacterImageGenerating(profile: NovelCharacterProfile) {
  return generatingCharacterIds.value.includes(profile.id)
}

function isGenerationSelecting(record: CharacterImageGenerationRecord) {
  return selectingGenerationIds.value.includes(record.id)
}

function isSelectedGeneration(profile: NovelCharacterProfile, record: CharacterImageGenerationRecord) {
  return getSavedReference(profile)?.generationId === record.id
}

function openSettings() {
  router.push({ name: 'settings' })
}

function formatImageHistoryTime(value: string) {
  return new Date(value).toLocaleString()
}

async function generateCharacterImage(profile: NovelCharacterProfile) {
  if (!novel.value || !profile.name.trim() || !aiSettings.canUseAiHubMix || isCharacterImageGenerating(profile)) {
    return
  }

  if (!(await flushCharacterSave())) {
    return
  }

  characterImageErrors.value = {
    ...characterImageErrors.value,
    [profile.id]: '',
  }
  generatingCharacterIds.value = [...generatingCharacterIds.value, profile.id]

  let generationId = ''

  try {
    const referenceImages = getCharacterGenerationReferences(profile)
    const prompt = drawingPrompt.value.trim()

    if (!prompt) {
      throw new Error('提示词不能为空。')
    }
    const generation = await characterAssets.startImageGeneration({
      novelId: novel.value.id,
      profileId: profile.id,
      characterName: profile.name,
      prompt,
      aspectRatio: drawingAspectRatio.value,
      resolution: drawingResolution.value,
      referenceImageCount: referenceImages.length,
    })
    generationId = generation.id
    const result = await generateAiImage({
      apiKey: aiSettings.aihubmixApiKey,
      appCode: aiSettings.aihubmixAppCode,
      model: aiSettings.imageModel,
      prompt,
      aspectRatio: drawingAspectRatio.value,
      resolution: drawingResolution.value,
      source: 'character-reference',
      referenceImages,
    })

    await characterAssets.completeImageGeneration(generation.id, result.imageDataUrl)
    savedMessage.value = `已生成 ${profile.name.trim()} 的候选形象`
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '角色图片生成失败。'

    if (generationId) {
      await characterAssets.failImageGeneration(generationId, errorMessage)
    }
    characterImageErrors.value = {
      ...characterImageErrors.value,
      [profile.id]: errorMessage,
    }
  } finally {
    generatingCharacterIds.value = generatingCharacterIds.value.filter((id) => id !== profile.id)
  }
}

async function selectCharacterGeneration(record: CharacterImageGenerationRecord) {
  const profile = drawingProfile.value

  if (!profile || record.status !== 'succeeded' || isGenerationSelecting(record)) {
    return
  }

  selectingGenerationIds.value = [...selectingGenerationIds.value, record.id]

  try {
    await characterAssets.setImageGenerationAsPortrait({
      generationId: record.id,
      name: profile.name,
      description: profile.appearance,
    })
    savedMessage.value = `已将候选图设为 ${profile.name.trim()} 的全身主图`
  } catch (error) {
    characterImageErrors.value = {
      ...characterImageErrors.value,
      [profile.id]: error instanceof Error ? error.message : '设置全身主图失败。',
    }
  } finally {
    selectingGenerationIds.value = selectingGenerationIds.value.filter((id) => id !== record.id)
  }
}

function addCharacter() {
  const profile = createEmptyCharacterProfile()
  characterDrafts.value.push(profile)
  activeCharacterId.value = profile.id
  autoSaveStatus.value = 'needs-name'
  formError.value = ''
  savedMessage.value = ''
}

async function removeCharacter(index: number) {
  const removedProfile = characterDrafts.value[index]

  if (!removedProfile || deletingCharacterIds.value.includes(removedProfile.id)) {
    return
  }

  if (!removedProfile.name.trim()) {
    characterDrafts.value.splice(index, 1)
    activeCharacterId.value = characterDrafts.value[index]?.id ?? characterDrafts.value[index - 1]?.id ?? ''
    formError.value = ''
    savedMessage.value = ''
    return
  }

  if (!(await flushCharacterSave()) || !novel.value) {
    return
  }

  deletingCharacterIds.value = [...deletingCharacterIds.value, removedProfile.id]
  formError.value = ''

  try {
    const result = await library.archiveCharacterProfile(novel.value.id, removedProfile.id)

    if (!result?.profile.deletedAt) {
      throw new Error('没有找到可归档的角色记录。')
    }

    await characterAssets.archiveCharacterProfileAssets({
      novelId: novel.value.id,
      profileId: removedProfile.id,
      characterName: removedProfile.name,
      deletedAt: result.profile.deletedAt,
      snapshot: result.characterContent,
    })
    syncDraft()
    savedMessage.value = `${removedProfile.name.trim()} 已从当前小说归档`
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '归档角色失败。'
  } finally {
    deletingCharacterIds.value = deletingCharacterIds.value.filter((id) => id !== removedProfile.id)
  }
}

async function removeActiveCharacter() {
  const index = characterDrafts.value.findIndex((profile) => profile.id === activeCharacterId.value)

  if (index >= 0) {
    await removeCharacter(index)
  }
}

async function backToReader() {
  if (!novel.value) {
    if (isCharacterWorkspaceWindow.value && (window.opener || window.panelForge)) {
      window.close()
      return
    }

    router.push({ name: 'script-library' })
    return
  }

  if (hasChanges.value && characterDrafts.value.some((profile) => !profile.name.trim())) {
    autoSaveStatus.value = 'needs-name'
    formError.value = '请填写新角色的名称，或先删除该角色。'
    return
  }

  if (hasChanges.value) {
    await saveCharacters()

    if (autoSaveStatus.value === 'error') {
      return
    }
  }

  if (isCharacterWorkspaceWindow.value && (window.opener || window.panelForge)) {
    window.close()
    return
  }

  router.push({ name: 'script-reader', params: { scriptId: novel.value.id } })
}

function scheduleCharacterSave() {
  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer)
  }

  if (!novel.value || !hasChanges.value) {
    if (!isSaving.value) {
      autoSaveStatus.value = 'saved'
    }
    return
  }

  if (characterDrafts.value.some((profile) => !profile.name.trim())) {
    autoSaveStatus.value = 'needs-name'
    return
  }

  if (isSaving.value) {
    autoSaveStatus.value = 'pending'
    return
  }

  autoSaveStatus.value = 'pending'
  autoSaveTimer = window.setTimeout(() => {
    void saveCharacters()
  }, 300)
}

async function flushCharacterSave() {
  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer)
    autoSaveTimer = undefined
  }

  if (!novel.value || characterDrafts.value.some((profile) => !profile.name.trim())) {
    autoSaveStatus.value = 'needs-name'
    return false
  }

  await saveCharacters()

  if (hasChanges.value && autoSaveStatus.value !== 'error') {
    await saveCharacters()
  }

  return autoSaveStatus.value === 'saved' && !hasChanges.value
}

async function saveCharacters() {
  if (!novel.value) {
    return
  }

  if (activeCharacterSave) {
    await activeCharacterSave
    return
  }

  if (characterDrafts.value.some((profile) => !profile.name.trim())) {
    autoSaveStatus.value = 'needs-name'
    return
  }

  formError.value = ''
  isSaving.value = true
  autoSaveStatus.value = 'saving'
  const creativeBrief = createCreativeBriefFromCharacterProfiles(cloneProfiles(characterDrafts.value))
  const currentSave = library.updateCreativeBrief(novel.value.id, creativeBrief)
  activeCharacterSave = currentSave

  try {
    await currentSave
    autoSaveStatus.value = 'saved'
    savedMessage.value = characterDrafts.value.length > 0 ? '角色设定已自动保存' : '角色设定已清空'
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '保存角色设定失败。'
    autoSaveStatus.value = 'error'
  } finally {
    activeCharacterSave = null
    isSaving.value = false
    if (hasChanges.value && autoSaveStatus.value !== 'error') {
      scheduleCharacterSave()
    }
  }
}

function flushCharactersBeforeUnload(event: BeforeUnloadEvent) {
  if (
    isClosingAfterCharacterSave ||
    !novel.value ||
    !hasChanges.value ||
    characterDrafts.value.some((profile) => !profile.name.trim())
  ) {
    return
  }

  event.preventDefault()
  event.returnValue = false

  void flushCharacterSave().then((saved) => {
    if (!saved) {
      return
    }

    isClosingAfterCharacterSave = true
    window.close()
  })
}

onMounted(() => {
  void library.loadLibrary()
  void characterAssets.loadAssets()
  void aiSettings.loadProviderDefaults()
  window.addEventListener('beforeunload', flushCharactersBeforeUnload)
})

watch(
  () => novel.value?.id,
  () => {
    if (novel.value) {
      library.selectNovel(novel.value.id)
      syncDraft()
    }
  },
  { immediate: true },
)

watch(characterDrafts, scheduleCharacterSave, { deep: true })

onUnmounted(() => {
  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer)
  }
  window.removeEventListener('beforeunload', flushCharactersBeforeUnload)
})
</script>

<template>
  <div class="outline-view" :class="{ 'outline-view--window': isCharacterWorkspaceWindow }">
    <div v-if="library.isLoading" class="reader-empty-state">
      <n-empty description="正在加载剧本" />
    </div>

    <div v-else-if="!novel" class="reader-empty-state">
      <n-empty description="剧本不存在或已移出">
        <template #extra>
          <n-button @click="backToReader">返回剧本库</n-button>
        </template>
      </n-empty>
    </div>

    <div v-else class="character-workspace" :class="{ 'character-workspace--window': isCharacterWorkspaceWindow }">
      <input ref="imageInput" class="file-input" type="file" accept="image/*" @change="handleReferenceFileChange" />
      <input
        ref="referenceImageInput"
        class="file-input"
        type="file"
        accept="image/*"
        @change="handleCharacterReferenceFileChange"
      />

      <n-layout
        class="character-workspace-layout"
        content-style="display: flex; flex-direction: column; height: 100%; min-height: 0;"
      >
        <n-layout-header bordered class="character-workspace-header">
          <n-space class="character-workspace-header-content" align="center" justify="space-between">
            <div>
              <n-text depth="3">{{ novel.title }}</n-text>
              <h2>角色工作台</h2>
            </div>
            <n-space align="center" size="large">
              <n-text class="character-autosave-status" :class="`character-autosave-status--${autoSaveStatus}`" depth="3">
                {{ autoSaveLabel }}
              </n-text>
              <n-button @click="backToReader">{{ isCharacterWorkspaceWindow ? '关闭窗口' : '返回阅读' }}</n-button>
            </n-space>
          </n-space>
        </n-layout-header>

        <n-layout-content
          class="character-workspace-main"
          style="flex: 1 1 0; min-height: 0;"
          content-style="height: 100%; min-height: 0;"
        >
          <n-layout class="character-workspace-split" has-sider content-style="height: 100%; min-height: 0;">
            <n-layout-sider class="character-roster" :width="240" bordered content-style="padding: 12px" aria-label="角色列表">
                <n-space class="character-roster-content" vertical size="medium">
                  <n-space align="center" justify="space-between">
                  <div class="character-roster-summary">
                    <strong>角色</strong>
                    <n-text depth="3">{{ characterDrafts.length }} 位 · {{ visualizedCharacterCount }} 已定稿</n-text>
                  </div>
                  <n-button size="small" type="primary" @click="addCharacter">新增</n-button>
                </n-space>

                <n-list v-if="characterDrafts.length" class="character-roster-list" hoverable clickable :show-divider="false">
                  <n-list-item
                    v-for="(profile, index) in characterDrafts"
                    :key="profile.id"
                    class="character-roster-item"
                    :class="{ 'character-roster-item--active': activeCharacter?.id === profile.id }"
                    @click="selectCharacter(profile)"
                  >
                    <n-thing :title="profile.name || `角色 ${index + 1}`" :description="profile.role">
                      <template #avatar>
                        <n-image
                          v-if="getReferencePreview(profile)"
                          class="character-roster-avatar"
                          :src="getReferencePreview(profile)"
                          :alt="`${profile.name || '角色'}缩略图`"
                          width="42"
                          height="58"
                          object-fit="cover"
                          :preview-disabled="true"
                        />
                        <n-tag v-else class="character-roster-avatar character-roster-avatar--empty" size="small">
                          {{ String(index + 1).padStart(2, '0') }}
                        </n-tag>
                      </template>
                    </n-thing>
                    <template #suffix>
                      <n-tag :type="getReferencePreview(profile) ? 'success' : 'default'" size="small">
                        {{ getReferencePreview(profile) ? '已定稿' : '待创建' }}
                      </n-tag>
                    </template>
                  </n-list-item>
                </n-list>

                <n-empty v-else size="small" description="添加首个角色">
                  <template #extra>
                    <n-button size="small" type="primary" @click="addCharacter">新增角色</n-button>
                  </template>
                </n-empty>
              </n-space>
            </n-layout-sider>

            <n-layout
              class="character-workbench-layout"
              content-style="display: flex; flex-direction: column; height: 100%; min-height: 0;"
            >
              <n-layout-header bordered class="character-workbench-header">
                <n-space v-if="activeCharacter" align="center" justify="space-between" :wrap="false">
                  <n-input
                    v-model:value="activeCharacter.name"
                    class="character-identity-name"
                    :bordered="false"
                    :style="{ '--n-font-size': '26px', '--n-font-weight': '700' }"
                    size="large"
                    placeholder="填写角色名称"
                    aria-label="角色名称"
                  />
                  <n-space class="character-workbench-actions" align="center" size="small">
                    <n-button
                      type="primary"
                      :disabled="!activeCharacter.name.trim()"
                      @click="openCharacterDrawing(activeCharacter)"
                    >
                      {{ getReferencePreview(activeCharacter) ? '优化全身形象' : '创建全身形象' }}
                    </n-button>
                    <n-popconfirm
                      positive-text="确认移出"
                      negative-text="取消"
                      @positive-click="removeActiveCharacter"
                    >
                      <template #trigger>
                        <n-button
                          text
                          type="error"
                          :loading="deletingCharacterIds.includes(activeCharacter.id)"
                        >
                          移出项目
                        </n-button>
                      </template>
                      角色将从当前小说归档，历史图片仍保留在资产库。
                    </n-popconfirm>
                  </n-space>
                </n-space>
                <n-text v-else depth="3">选择或新增角色后开始编辑</n-text>
              </n-layout-header>

              <n-layout-content
                class="character-workbench-content"
                style="flex: 1 1 0; min-height: 0;"
                content-style="height: 100%; min-height: 0; padding: 14px 18px 18px;"
              >
                <main v-if="activeCharacter" class="character-workbench">
                  <n-grid class="character-workbench-grid" cols="1 m:10" responsive="screen" :x-gap="16" :y-gap="12">
                    <n-grid-item span="1 m:3">
                      <n-card
                        class="character-focus-card"
                        size="small"
                        :content-style="{ padding: '0', display: 'flex', flex: '1 1 auto', minHeight: '0' }"
                        :footer-style="{ padding: '8px 12px' }"
                      >
                        <div class="character-focus-visual">
                          <n-image
                            v-if="getReferencePreview(activeCharacter)"
                            class="character-focus-visual-image"
                            :src="getReferencePreview(activeCharacter)"
                            :alt="`${activeCharacter.name || '角色'}全身主图`"
                            width="100%"
                            height="100%"
                            object-fit="contain"
                          />
                          <n-empty v-else class="character-focus-visual-empty" size="small" description="待创建全身形象" />
                        </div>
                        <template #footer>
                          <n-space align="center" justify="space-between">
                            <n-tag :type="getReferencePreview(activeCharacter) ? 'success' : 'default'" size="small">
                              {{ getReferencePreview(activeCharacter) ? '全身主图' : '未设全身图' }}
                            </n-tag>
                            <n-text depth="3">候选 {{ getCharacterCandidateCount(activeCharacter) }}</n-text>
                          </n-space>
                        </template>
                      </n-card>
                    </n-grid-item>

                    <n-grid-item span="1 m:7">
                      <n-form class="character-editor-form" label-placement="top">
                        <n-space vertical :size="8">
                          <div class="character-editor-section-head"><n-text>人物设定</n-text></div>
                          <n-grid cols="1 m:6" responsive="screen" :x-gap="12" :y-gap="0">
                            <n-form-item-gi class="character-editor-field" :show-feedback="false">
                              <template #label>
                                <n-tooltip trigger="hover">
                                  <template #trigger><span class="character-field-label">身份</span></template>
                                  角色在故事中的功能定位，用于剧情与分镜生成。
                                </n-tooltip>
                              </template>
                              <n-select v-model:value="activeCharacter.role" :options="roleOptions" aria-label="角色身份" />
                            </n-form-item-gi>
                            <n-form-item-gi class="character-editor-field" :show-feedback="false">
                              <template #label>
                                <n-tooltip trigger="hover">
                                  <template #trigger><span class="character-field-label">性别</span></template>
                                  用于统一角色外观与绘图表现。
                                </n-tooltip>
                              </template>
                              <n-select v-model:value="activeCharacter.gender" :options="genderOptions" />
                            </n-form-item-gi>
                            <n-form-item-gi class="character-editor-field" :show-feedback="false">
                              <template #label>
                                <n-tooltip trigger="hover">
                                  <template #trigger><span class="character-field-label">年龄</span></template>
                                  角色的实际或视觉年龄，会影响全身形象生成。
                                </n-tooltip>
                              </template>
                              <n-input-number v-model:value="activeCharacter.age" :min="0" :max="120" :step="1" placeholder="未知" />
                            </n-form-item-gi>
                            <n-form-item-gi span="1 m:3" class="character-editor-field" :show-feedback="false">
                              <template #label>
                                <n-tooltip trigger="hover">
                                  <template #trigger><span class="character-field-label">外观</span></template>
                                  填写发型、服装、体型、面容和气质等稳定特征。
                                </n-tooltip>
                              </template>
                              <n-input v-model:value="activeCharacter.appearance" placeholder="发型、服装、年龄感、气质等" />
                            </n-form-item-gi>
                          </n-grid>

                          <div class="character-editor-section-head"><n-text>性格</n-text></div>
                          <n-grid cols="1 m:2" responsive="screen" :x-gap="16" :y-gap="0">
                            <n-grid-item v-for="field in traitFields" :key="field.key">
                              <n-form-item class="character-trait-field" :show-feedback="false">
                                <template #label>
                                  <n-tooltip trigger="hover">
                                    <template #trigger><span class="character-field-label">{{ field.label }}</span></template>
                                    0 表示{{ field.low }}，100 表示{{ field.high }}。
                                  </n-tooltip>
                                </template>
                                <div class="character-trait-row">
                                  <n-slider v-model:value="activeCharacter.traits[field.key]" :min="0" :max="100" :step="5" />
                                  <n-text class="character-trait-score" depth="3">{{ activeCharacter.traits[field.key] }}</n-text>
                                </div>
                              </n-form-item>
                            </n-grid-item>
                          </n-grid>

                          <div class="character-editor-section-head"><n-text>剧情关系</n-text></div>
                          <n-grid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="0">
                            <n-form-item-gi class="character-editor-field" :show-feedback="false">
                              <template #label>
                                <n-tooltip trigger="hover">
                                  <template #trigger><span class="character-field-label">目标</span></template>
                                  角色当前最想达成的事，决定其行为动机。
                                </n-tooltip>
                              </template>
                              <n-input
                                v-model:value="activeCharacter.goal"
                                type="textarea"
                                placeholder="角色当前最想得到什么"
                                :autosize="{ minRows: 2, maxRows: 4 }"
                              />
                            </n-form-item-gi>
                            <n-form-item-gi class="character-editor-field" :show-feedback="false">
                              <template #label>
                                <n-tooltip trigger="hover">
                                  <template #trigger><span class="character-field-label">关系</span></template>
                                  填写与主要角色的关系及其变化，用于分镜和台词判断。
                                </n-tooltip>
                              </template>
                              <n-input
                                v-model:value="activeCharacter.relationship"
                                type="textarea"
                                placeholder="与其他主要角色的关系"
                                :autosize="{ minRows: 2, maxRows: 4 }"
                              />
                            </n-form-item-gi>
                          </n-grid>
                        </n-space>
                      </n-form>
                    </n-grid-item>
                  </n-grid>
                </main>

                <main v-else class="character-workbench character-workbench--empty">
                  <n-empty description="从一个主要角色开始">
                    <template #extra>
                      <n-button type="primary" @click="addCharacter">新增角色</n-button>
                    </template>
                  </n-empty>
                </main>
              </n-layout-content>

              <n-layout-footer bordered class="character-workbench-footer">
                <n-alert v-if="formError" type="error" :show-icon="false">{{ formError }}</n-alert>
                <n-space v-else align="center" justify="space-between">
                  <n-text v-if="visibleSavedMessage" depth="3">{{ visibleSavedMessage }}</n-text>
                  <n-space v-else-if="activeCharacter" align="center" size="small">
                    <n-tag :type="getReferencePreview(activeCharacter) ? 'success' : 'default'" size="small">
                      {{ getReferencePreview(activeCharacter) ? '全身主图已确认' : '待创建全身形象' }}
                    </n-tag>
                    <n-text depth="3">候选 {{ getCharacterCandidateCount(activeCharacter) }}</n-text>
                  </n-space>
                  <n-text v-else depth="3">暂无角色</n-text>
                  <n-text class="character-autosave-status" :class="`character-autosave-status--${autoSaveStatus}`" depth="3">
                    {{ autoSaveLabel }}
                  </n-text>
                </n-space>
              </n-layout-footer>
            </n-layout>
          </n-layout>
        </n-layout-content>
      </n-layout>
    </div>

    <n-drawer v-model:show="isCharacterDrawingOpen" placement="right" width="min(480px, 100vw)">
      <n-drawer-content :title="drawingProfile ? `创建 ${drawingProfile.name} 的全身形象` : '角色全身绘图'" closable>
        <n-space v-if="drawingProfile" vertical size="medium">
          <section class="character-drawing-overview">
            <n-image
              v-if="getReferencePreview(drawingProfile)"
              class="character-drawing-overview-image"
              :src="getReferencePreview(drawingProfile)"
              :alt="`${drawingProfile.name}全身主图`"
              width="92"
              height="122"
              object-fit="contain"
            />
            <div v-else class="character-drawing-overview-placeholder">待创建</div>
            <div class="character-drawing-overview-copy">
              <n-tag size="small" :type="getReferencePreview(drawingProfile) ? 'success' : 'default'">
                {{ getReferencePreview(drawingProfile) ? '全身主图已确认' : '尚未选择全身主图' }}
              </n-tag>
              <strong>{{ drawingProfile.name }}</strong>
              <n-text depth="3">{{ drawingProfile.role }} · {{ drawingProfile.gender }}</n-text>
              <n-button secondary @click="isCharacterHistoryOpen = true">
                查看全身形象历史（{{ drawingGenerationRecords.length }}）
              </n-button>
            </div>
          </section>

          <n-form label-placement="top">
            <n-grid cols="1 s:2" responsive="screen" :x-gap="12" :y-gap="0">
              <n-form-item-gi label="画幅比例">
                <n-select v-model:value="drawingAspectRatio" :options="characterImageAspectRatioOptions" />
              </n-form-item-gi>
              <n-form-item-gi label="生成清晰度">
                <n-select v-model:value="drawingResolution" :options="AI_IMAGE_RESOLUTION_OPTIONS" />
              </n-form-item-gi>
            </n-grid>
            <n-form-item label="本次全身设定要求">
              <n-input
                v-model:value="drawingDirection"
                type="textarea"
                placeholder="例如：常服、冷静表情、正面自然站姿"
                :autosize="{ minRows: 2, maxRows: 4 }"
              />
            </n-form-item>
          </n-form>

          <section class="character-prompt-editor">
            <n-space class="character-prompt-editor-head" align="center" justify="space-between">
              <div class="character-prompt-editor-title">
                <strong>最终提示词</strong>
                <n-text depth="3">
                  {{ isDrawingPromptCustomized ? '已手动修改，本次生成将按此文本执行' : '自动由角色设定、参考图和本次要求拼接' }}
                </n-text>
              </div>
              <n-button v-if="isDrawingPromptCustomized" size="small" secondary @click="resetDrawingPrompt">
                恢复自动拼接
              </n-button>
            </n-space>
            <n-descriptions class="character-prompt-summary" :column="2" size="small" label-placement="left">
              <n-descriptions-item label="模型">{{ aiSettings.imageModel }}</n-descriptions-item>
              <n-descriptions-item label="手动参考图">{{ getCharacterGenerationReferences(drawingProfile).length }} 张</n-descriptions-item>
              <n-descriptions-item label="画幅">{{ drawingAspectRatio }}</n-descriptions-item>
              <n-descriptions-item label="清晰度">{{ drawingResolution }}</n-descriptions-item>
            </n-descriptions>
            <n-input
              v-model:value="drawingPrompt"
              type="textarea"
              :autosize="{ minRows: 12, maxRows: 22 }"
              aria-label="最终图像生成提示词"
            />
          </section>

          <section class="character-generation-references">
            <div class="character-generation-references-head">
              <div>
                <strong>外观参考</strong>
                <n-text depth="3">{{ getCharacterReferenceImages(drawingProfile).length }} / {{ MAX_CHARACTER_REFERENCE_IMAGES }}</n-text>
                <n-text depth="3">仅发送这里手动添加的图片</n-text>
              </div>
              <n-button
                size="small"
                secondary
                :loading="isReferenceImageUploading(drawingProfile)"
                :disabled="isReferenceImageUploading(drawingProfile) || getCharacterReferenceImages(drawingProfile).length >= MAX_CHARACTER_REFERENCE_IMAGES"
                @click="openCharacterReferencePicker(drawingProfile)"
              >
                添加参考图
              </n-button>
            </div>

            <div v-if="getCharacterReferenceImages(drawingProfile).length" class="character-generation-reference-grid">
              <div
                v-for="reference in getCharacterReferenceImages(drawingProfile)"
                :key="reference.id"
                class="character-generation-reference-item"
              >
                <n-image
                  class="character-generation-reference-image"
                  :src="reference.referenceImageDataUrl"
                  :alt="`${drawingProfile.name}外观参考`"
                  width="72"
                  height="88"
                  object-fit="cover"
                />
                <n-button size="tiny" text type="error" @click="removeCharacterReference(reference.id)">移除</n-button>
              </div>
            </div>
          </section>

          <n-alert v-if="characterImageErrors[drawingProfile.id]" type="error" :show-icon="false">
            {{ characterImageErrors[drawingProfile.id] }}
          </n-alert>

          <n-alert v-if="!aiSettings.canUseAiHubMix" type="warning" :show-icon="false">
            <n-space align="center" justify="space-between">
              <n-text>请先配置图像模型。</n-text>
              <n-button size="small" @click="openSettings">设置模型</n-button>
            </n-space>
          </n-alert>

          <n-button
            block
            type="primary"
            :loading="isCharacterImageGenerating(drawingProfile)"
            :disabled="!aiSettings.canUseAiHubMix || isCharacterImageGenerating(drawingProfile)"
            @click="generateCharacterImage(drawingProfile)"
          >
            生成候选图
          </n-button>
        </n-space>

        <n-empty v-else description="请选择需要创建形象的角色" />
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="isCharacterHistoryOpen">
      <n-card
        v-if="drawingProfile"
        class="character-history-modal"
        :title="`${drawingProfile.name} · 形象历史`"
        :bordered="false"
        :content-style="{ maxHeight: '72vh', overflowY: 'auto' }"
        closable
        @close="isCharacterHistoryOpen = false"
        >
          <div class="character-history-modal-head">
            <n-text depth="3">共 {{ drawingGenerationRecords.length }} 条记录 · 最新优先</n-text>
          <n-button
            size="small"
            secondary
            :loading="isPortraitImageUploading(drawingProfile)"
            :disabled="isPortraitImageUploading(drawingProfile)"
            @click="openReferencePicker(drawingProfile.id)"
          >
            上传全身候选图
          </n-button>
        </div>

        <n-image-group v-if="drawingGenerationRecords.length">
          <div class="character-history-modal-grid">
            <article
            v-for="record in drawingGenerationRecords"
            :key="record.id"
            class="character-generation-history-item"
            :class="{ 'character-generation-history-item--selected': isSelectedGeneration(drawingProfile, record) }"
          >
            <div class="character-generation-history-preview">
              <n-image
                v-if="record.status === 'succeeded' && record.imageDataUrl"
                class="character-generation-history-image"
                :src="record.imageDataUrl"
                :alt="`${drawingProfile.name}全身候选形象`"
                width="100%"
                height="100%"
                object-fit="contain"
              />
              <div v-else class="character-generation-history-placeholder">
                <n-tag :type="record.status === 'failed' ? 'error' : 'info'" size="small">
                  {{ record.status === 'failed' ? '生成失败' : '生成中' }}
                </n-tag>
              </div>
            </div>

            <div class="character-generation-history-meta">
              <n-tag v-if="isSelectedGeneration(drawingProfile, record)" type="success" size="small">全身主图</n-tag>
              <n-tag v-else-if="record.status === 'succeeded'" size="small">
                {{ record.source === 'upload' ? '上传' : 'AI' }}
              </n-tag>
              <n-text depth="3">{{ formatImageHistoryTime(record.createdAt) }}</n-text>
            </div>
            <n-text v-if="record.status === 'failed'" class="character-generation-history-error" depth="3">
              {{ record.errorMessage }}
            </n-text>
            <n-button
              v-if="record.status === 'succeeded'"
              size="small"
              block
              :type="isSelectedGeneration(drawingProfile, record) ? 'default' : 'primary'"
              :secondary="!isSelectedGeneration(drawingProfile, record)"
              :loading="isGenerationSelecting(record)"
              :disabled="isSelectedGeneration(drawingProfile, record) || isGenerationSelecting(record)"
              @click="selectCharacterGeneration(record)"
            >
              {{ isSelectedGeneration(drawingProfile, record) ? '当前全身主图' : '设为全身主图' }}
            </n-button>
            </article>
          </div>
        </n-image-group>
        <n-empty v-else description="暂无形象记录" />
      </n-card>
    </n-modal>
  </div>
</template>
