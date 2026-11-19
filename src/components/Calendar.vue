<template>
  <!-- 预约日历：满档/休整/过期置灰 -->
  <view class="cal card">
    <view class="cal-head">
      <view class="nav" @click="shift(-1)" :class="{ off: !canPrev }">‹</view>
      <text class="ym">{{ year }} 年 {{ month }} 月</text>
      <view class="nav" @click="shift(1)">›</view>
    </view>
    <view class="week-row">
      <text v-for="w in weeks" :key="w" class="week">{{ w }}</text>
    </view>
    <view class="grid">
      <view v-for="n in firstWeekday" :key="'p' + n" class="cell pad"></view>
      <view
        v-for="d in daysInMonth"
        :key="d.date"
        class="cell"
        :class="{ sel: d.date === value, off: d.disabled }"
        @click="pick(d)"
      >
        <text class="day">{{ d.day }}</text>
        <text v-if="d.tag" class="tag" :class="d.tagCls">{{ d.tag }}</text>
      </view>
    </view>
    <view class="legend">
      <view class="lg"><view class="dot ok"></view><text>可预约</text></view>
      <view class="lg"><view class="dot full"></view><text>满档</text></view>
      <view class="lg"><view class="dot closed"></view><text>休整日</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface DayCell {
  day: number
  date: string
  disabled: boolean
  tag: string
  tagCls: string
}

interface ScheduleItem {
  booked?: number
  limit?: number
  closed?: boolean
}

const props = withDefaults(
  defineProps<{
    value?: string
    schedule?: Record<string, ScheduleItem>
    windowDays?: number
  }>(),
  { value: '', schedule: () => ({}), windowDays: 60 },
)

const emit = defineEmits<{ select: [date: string] }>()

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const weeks = ['日', '一', '二', '三', '四', '五', '六']

const todayStr = computed(() => fmt(new Date()))
const maxStr = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + props.windowDays)
  return fmt(d)
})
const canPrev = computed(() => {
  const n = new Date()
  return (
    year.value > n.getFullYear() ||
    (year.value === n.getFullYear() && month.value > n.getMonth() + 1)
  )
})

const daysInMonth = computed<DayCell[]>(() => {
  const count = new Date(year.value, month.value, 0).getDate()
  const list: DayCell[] = []
  for (let i = 1; i <= count; i++) {
    const date = `${year.value}-${pad(month.value)}-${pad(i)}`
    const sch = props.schedule[date]
    let disabled = false
    let tag = ''
    let tagCls = ''
    if (date <= todayStr.value) {
      disabled = true
    } else if (date > maxStr.value) {
      disabled = true
    } else if (sch && sch.closed) {
      disabled = true
      tag = '休'
      tagCls = 'closed'
    } else if (sch && (sch.booked || 0) >= (sch.limit || 0)) {
      disabled = true
      tag = '满'
      tagCls = 'full'
    } else if (sch && (sch.booked || 0) > 0) {
      tag = `余${(sch.limit || 0) - (sch.booked || 0)}`
      tagCls = 'left'
    }
    list.push({ day: i, date, disabled, tag, tagCls })
  }
  return list
})

const firstWeekday = computed(() => new Date(year.value, month.value - 1, 1).getDay())

function shift(n: number) {
  if (n < 0 && !canPrev.value) return
  let m = month.value + n
  let y = year.value
  if (m < 1) {
    m = 12
    y--
  }
  if (m > 12) {
    m = 1
    y++
  }
  month.value = m
  year.value = y
}

function pick(d: DayCell) {
  if (d.disabled) {
    if (d.tag === '满') uni.showToast({ title: '该日期已满档', icon: 'none' })
    else if (d.tag === '休') uni.showToast({ title: '该日期为休整日', icon: 'none' })
    return
  }
  emit('select', d.date)
}
</script>

<style scoped>
.cal {
  padding: 24rpx;
}
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.ym {
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
}
.nav {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-9);
  color: var(--primary);
  background: rgba(74, 108, 247, 0.08);
}
.nav.off {
  color: var(--text-4);
  background: var(--bg-2);
}
.week-row {
  display: flex;
  margin-bottom: 8rpx;
}
.week {
  flex: 1;
  text-align: center;
  font-size: var(--fs-2);
  color: var(--text-3);
}
.grid {
  display: flex;
  flex-wrap: wrap;
}
.cell {
  width: 14.2857%;
  padding: 10rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rpx;
  border-radius: 16rpx;
}
.cell.pad {
  background: transparent;
}
.day {
  font-size: var(--fs-4);
  font-weight: var(--fw-medium);
}
.cell.sel {
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  box-shadow: 0 6rpx 16rpx rgba(74, 108, 247, 0.35);
}
.cell.sel .day,
.cell.sel .tag {
  color: #fff;
}
.cell.off .day {
  color: var(--text-4);
}
.tag {
  font-size: var(--fs-1);
  color: var(--primary);
}
.tag.left {
  color: var(--success);
}
.tag.full {
  color: var(--danger);
}
.tag.closed {
  color: var(--text-3);
}
.cell.off .tag {
  color: var(--text-4);
}
.legend {
  display: flex;
  gap: 28rpx;
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid var(--bg-2);
}
.lg {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: var(--fs-2);
  color: var(--text-3);
}
.dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
}
.dot.ok {
  background: var(--success);
}
.dot.full {
  background: var(--danger);
}
.dot.closed {
  background: var(--text-4);
}
</style>
