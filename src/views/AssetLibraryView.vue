<script setup lang="ts">
import {
  NButton,
  NCard,
  NEmpty,
  NSpace,
  NStatistic,
  NTag,
  NText,
} from 'naive-ui'

const assetGroups = [
  {
    name: '小说原文',
    count: 0,
    desc: '从剧本库导入的原始文本与章节。',
  },
  {
    name: '角色资产',
    count: 0,
    desc: '角色设定、立绘、表情与一致性参考。',
  },
  {
    name: '图片资产',
    count: 0,
    desc: 'AI绘图生成的场景图、分镜图和关键画面。',
  },
  {
    name: '音频字幕',
    count: 0,
    desc: '后续配音、字幕和时间轴文件。',
  },
]
</script>

<template>
  <n-space vertical size="large" class="tool-view">
    <section class="view-title">
      <div>
        <n-text depth="3">集中管理漫剧制作素材</n-text>
        <h2>资产库</h2>
      </div>
      <n-button type="primary">导入资产</n-button>
    </section>

    <div class="asset-summary-grid">
      <div v-for="group in assetGroups" :key="group.name" class="metric-panel">
        <n-statistic :label="group.name" :value="group.count" />
        <n-text depth="3">{{ group.desc }}</n-text>
      </div>
    </div>

    <n-card title="资产列表">
      <n-empty description="资产库将在剧本库和 AI绘图接入后沉淀素材">
        <template #extra>
          <n-space>
            <n-tag>小说</n-tag>
            <n-tag>角色</n-tag>
            <n-tag>图片</n-tag>
            <n-tag>音频</n-tag>
          </n-space>
        </template>
      </n-empty>
    </n-card>
  </n-space>
</template>