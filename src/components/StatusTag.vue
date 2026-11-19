<template>
  <text class="status-tag" :style="{ color: s.color, background: s.bg }">{{ s.text }}</text>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { statusOf } from '@/utils/format'

const props = defineProps<{ status: string }>()
const s = computed(() => statusOf(props.status))
</script>

<style scoped>
.status-tag {
  font-size: var(--fs-2);
  font-weight: var(--fw-semibold);
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  white-space: nowrap;
}
</style>
