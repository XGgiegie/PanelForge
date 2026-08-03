<script setup lang="ts">
import { ref } from 'vue'
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSpace,
  NTag,
  NText,
} from 'naive-ui'

const prompt = ref('')
const style = ref('黑白漫画')
const ratio = ref('9:16')

const styleOptions = [
  { label: '黑白漫画', value: '黑白漫画' },
  { label: '电影分镜', value: '电影分镜' },
  { label: '角色立绘', value: '角色立绘' },
  { label: '场景概念图', value: '场景概念图' },
]

const ratioOptions = [
  { label: '竖屏 9:16', value: '9:16' },
  { label: '横屏 16:9', value: '16:9' },
  { label: '方图 1:1', value: '1:1' },
]

const drawingTasks = [
  {
    title: '角色定妆图',
    status: '待生成',
    desc: '从小说角色设定生成统一角色外观。',
  },
  {
    title: '章节关键画面',
    status: '待生成',
    desc: '根据章节摘要生成可用于分镜的关键图。',
  },
  {
    title: '场景参考图',
    status: '待生成',
    desc: '沉淀后续视频合成需要的场景资产。',
  },
]
</script>

<template>
  <n-space vertical size="large" class="tool-view">
    <section class="view-title">
      <div>
        <n-text depth="3">基于小说内容生成视觉资产</n-text>
        <h2>AI绘图</h2>
      </div>
      <n-button type="primary">生成图片</n-button>
    </section>

    <div class="tool-grid">
      <n-card title="绘图输入">
        <n-form label-placement="top">
          <n-form-item label="画面描述">
            <n-input
              v-model:value="prompt"
              type="textarea"
              placeholder="输入角色、场景、镜头、情绪等画面描述"
              :autosize="{ minRows: 8, maxRows: 14 }"
            />
          </n-form-item>
          <div class="form-row">
            <n-form-item label="画风">
              <n-select v-model:value="style" :options="styleOptions" />
            </n-form-item>
            <n-form-item label="画幅">
              <n-select v-model:value="ratio" :options="ratioOptions" />
            </n-form-item>
          </div>
        </n-form>
      </n-card>

      <n-card title="生成任务">
        <div class="task-list">
          <article v-for="task in drawingTasks" :key="task.title" class="task-item">
            <div>
              <strong>{{ task.title }}</strong>
              <p>{{ task.desc }}</p>
            </div>
            <n-tag size="small">{{ task.status }}</n-tag>
          </article>
        </div>
      </n-card>
    </div>
  </n-space>
</template>
