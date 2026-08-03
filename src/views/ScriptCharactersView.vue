<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NEmpty, NForm, NFormItem, NInput, NPopconfirm, NSpace, NTag, NText } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'

import { useCharacterAssetsStore } from '../stores/characterAssets'
import { useNovelLibraryStore } from '../stores/novelLibrary'

const route = useRoute()
const router = useRouter()
const library = useNovelLibraryStore()
const characterAssets = useCharacterAssetsStore()
const imageInput = ref<HTMLInputElement | null>(null)
const characterName = ref('')
const characterDescription = ref('')
const selectedFile = ref<File | null>(null)
const previewObjectUrl = ref('')
const uploadError = ref('')
const isSaving = ref(false)

const scriptId = computed(() => String(route.params.scriptId ?? ''))
const novel = computed(() => library.novels.find((item) => item.id === scriptId.value) ?? null)
const characters = computed(() => {
  if (!novel.value) {
    return []
  }

  return characterAssets.getCharactersByNovelId(novel.value.id)
})
const selectedFileName = computed(() => selectedFile.value?.name ?? '')

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim()
}

function revokePreviewObjectUrl() {
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value)
    previewObjectUrl.value = ''
  }
}

function openImagePicker() {
  imageInput.value?.click()
}

function handleReferenceFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  uploadError.value = ''

  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    uploadError.value = '请上传图片文件。'
    input.value = ''
    return
  }

  selectedFile.value = file
  revokePreviewObjectUrl()
  previewObjectUrl.value = URL.createObjectURL(file)

  if (!characterName.value.trim()) {
    characterName.value = stripFileExtension(file.name)
  }
}

function resetForm() {
  characterName.value = ''
  characterDescription.value = ''
  selectedFile.value = null
  uploadError.value = ''
  revokePreviewObjectUrl()

  if (imageInput.value) {
    imageInput.value.value = ''
  }
}

async function saveCharacter() {
  if (!novel.value || isSaving.value) {
    return
  }

  if (!selectedFile.value) {
    uploadError.value = '请先选择角色参考图。'
    return
  }

  uploadError.value = ''
  isSaving.value = true

  try {
    await characterAssets.addCharacter({
      novelId: novel.value.id,
      name: characterName.value,
      description: characterDescription.value,
      file: selectedFile.value,
    })
    resetForm()
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : '保存角色失败。'
  } finally {
    isSaving.value = false
  }
}

function backToReader() {
  if (!novel.value) {
    router.push({ name: 'script-library' })
    return
  }

  router.push({ name: 'script-reader', params: { scriptId: novel.value.id } })
}

onMounted(() => {
  void library.loadLibrary()
  void characterAssets.loadAssets()
})

onBeforeUnmount(() => {
  revokePreviewObjectUrl()
})
</script>

<template>
  <n-space vertical size="large" class="character-assets-view">
    <section class="view-title">
      <div>
        <n-text depth="3">{{ novel?.title ?? '小说角色资产' }}</n-text>
        <h2>角色资产</h2>
      </div>
      <n-space>
        <n-button @click="backToReader">返回正文</n-button>
        <n-button type="primary" @click="openImagePicker">上传角色</n-button>
      </n-space>
    </section>

    <n-alert type="info" :show-icon="false">
      角色名要和分镜里的角色名一致；生成图片和视频时会优先使用这里的参考图保持外观稳定。
    </n-alert>

    <n-empty v-if="library.isLoading || characterAssets.isLoading" description="正在加载角色资产" />

    <n-empty v-else-if="!novel" description="剧本不存在或已移出">
      <template #extra>
        <n-button @click="backToReader">返回剧本库</n-button>
      </template>
    </n-empty>

    <div v-else class="character-assets-layout">
      <n-card title="上传角色参考">
        <input
          ref="imageInput"
          class="file-input"
          type="file"
          accept="image/*"
          @change="handleReferenceFileChange"
        />

        <button class="character-upload-box" type="button" @click="openImagePicker">
          <img v-if="previewObjectUrl" :src="previewObjectUrl" alt="角色参考预览" />
          <span v-else>选择角色参考图</span>
        </button>

        <n-form label-placement="top">
          <n-form-item label="角色名称">
            <n-input v-model:value="characterName" placeholder="例如：林清、男主、女主" />
          </n-form-item>
          <n-form-item label="角色设定">
            <n-input
              v-model:value="characterDescription"
              type="textarea"
              placeholder="发型、服装、年龄感、气质等关键外观"
              :autosize="{ minRows: 4, maxRows: 6 }"
            />
          </n-form-item>
        </n-form>

        <n-text v-if="selectedFileName" depth="3">已选择：{{ selectedFileName }}</n-text>

        <n-alert v-if="uploadError" type="error" :show-icon="false">
          {{ uploadError }}
        </n-alert>

        <div class="character-form-actions">
          <n-button secondary @click="resetForm">清空</n-button>
          <n-button type="primary" :loading="isSaving" :disabled="isSaving" @click="saveCharacter">
            保存角色
          </n-button>
        </div>
      </n-card>

      <n-card title="本书角色">
        <n-empty v-if="characters.length === 0" description="还没有上传角色参考">
          <template #extra>
            <n-button type="primary" @click="openImagePicker">上传第一个角色</n-button>
          </template>
        </n-empty>

        <div v-else class="character-card-grid">
          <n-card v-for="character in characters" :key="character.id" class="character-card" size="small">
            <img class="character-cover" :src="character.referenceImageDataUrl" :alt="character.name" />
            <div class="character-card-body">
              <div>
                <strong>{{ character.name }}</strong>
                <p>{{ character.description || '暂无设定。' }}</p>
              </div>
              <div class="character-card-footer">
                <n-tag size="small">一致性参考</n-tag>
                <n-popconfirm @positive-click="characterAssets.removeCharacter(character.id)">
                  <template #trigger>
                    <n-button size="tiny" text>移除</n-button>
                  </template>
                  移除角色「{{ character.name }}」？
                </n-popconfirm>
              </div>
            </div>
          </n-card>
        </div>
      </n-card>
    </div>
  </n-space>
</template>
