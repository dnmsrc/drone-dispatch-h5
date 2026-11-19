<template>
  <!-- 卡片标题行：竖条 + 标题一律在左，入口靠 margin-left:auto 停在行右端。
       一个标题行只允许一个入口——多个入口意味着这一屏该合并成一个弹窗。 -->
  <view class="sec-head">
    <view class="sh-bar"></view>
    <text class="sh-title">{{ title }}</text>
    <text v-if="sub" class="sh-sub">{{ sub }}</text>
    <EntryChip v-if="entry" :label="entry" @tap="emit('tap')" />
  </view>
</template>

<script setup lang="ts">
import EntryChip from './EntryChip.vue'

withDefaults(
  defineProps<{
    title?: string
    // 短值 / 副标题：只放这一屏要用到的数，说明式文案一律进弹窗
    sub?: string
    // 纯说明入口文字；条款确认状态只在右下角统一入口里查看
    entry?: string
  }>(),
  { title: '', sub: '', entry: '' },
)

const emit = defineEmits<{ tap: [] }>()
</script>

<style scoped>
/* 标题行节奏：竖条 8×30、行内间隔 12、标题行 → 内容 20。
   align-items:center —— 入口是 88rpx 的控件，baseline 对齐会让标题落在半高。 */
.sec-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.sh-bar {
  flex: none;
  width: 8rpx;
  height: 30rpx;
  border-radius: 4rpx;
  background: linear-gradient(180deg, var(--primary), var(--cyan));
}
.sh-title {
  flex: none;
  font-size: var(--fs-5);
  font-weight: var(--fw-bold);
  white-space: nowrap;
}
.sh-sub {
  flex: none;
  font-size: var(--fs-2);
  color: var(--text-3);
  font-weight: 400;
  white-space: nowrap;
}
</style>
