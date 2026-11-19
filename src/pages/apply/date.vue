<template>
  <view class="page">
    <NavBar title="申请单 · 日期与时段" />
    <StepBar :current="3" />

    <scroll-view scroll-y class="body">
      <view class="sec card">
        <SecHead title="表演日期" :sub="cityOf(venue.city).name" />
        <ApplyCalendar :value="date" :days="days" @select="onDate" />
        <view v-if="picked" class="picked" :class="toneClass">
          <text class="pk-status">{{ statusText }}</text>
          <text class="pk-note">{{ pickedNote }}</text>
        </view>
      </view>

      <view class="sec card">
        <SecHead title="申请时段" />
        <view class="slot-row">
          <view
            v-for="s in slotList"
            :key="s.slot"
            class="slot"
            :class="{ on: slot === s.slot, dis: !s.open }"
            @click="onSlot(s)"
          >
            <text class="sl-t">{{ fmtSlot(s.slot) }}</text>
            <text v-if="s.label" class="sl-s">{{ s.label }}</text>
          </view>
        </view>
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <button class="pb-btn" :class="{ dis: !date || !slot }" @click="next">
        {{ !date ? '请选择日期' : !slot ? '请选择申请时段' : '下一步 · 看报价区间' }}
      </button>
    </view>

    <BasisPop
      :show="pop.show"
      :title="pop.title"
      :lines="pop.lines"
      :touch="pop.touch"
      :sec="pop.sec"
      :must="pop.must"
      :risk="pop.risk"
      @close="pop.show = false"
      @risk-ack="ackWx"
      @risk-skip="skipWx"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import StepBar from '@/components/StepBar.vue'
import BasisPop from '@/components/BasisPop.vue'
import SecHead from '@/components/SecHead.vue'
import ApplyCalendar from '@/components/ApplyCalendar.vue'
import { store, invalidateFrom, hydrateForPage, ackWeatherRisk, wxAckOf } from '@/store'
import { useAckPop } from '@/composables/useAckPop'
import { calendarDays, dayInfo, STATUS_TEXT } from '@/mock/engines/calendar.js'
import { dateWeather } from '@/mock/engines/weather.js'
import { cityOf } from '@/mock/engines/policy.js'
import { TIME_SLOTS } from '@/mock/engines/pricing.js'
import { fmtSlot } from '@/mock/engines/slotRange.js'
import { getSilent } from '@/utils/request'

const STEP = 3
const apply = hydrateForPage(STEP)
const need = apply.need
// 第 3 步的场地由 hydrateForPage 兜底补齐（冷进入 / 回看时），这里按已补齐取值
const venue = apply.venue as Record<string, any>
const date = ref(apply.date)
const slot = ref(apply.slot)

// 只在「排他资源本身冲突」时给一句短说明（≤5 字、单行），且不出现在默认视图里：
// 天气类（预报不适宜 / 预报风险）不再产生任何卡片文字，也不再禁选（2026-11-02 用户口径）。
const SLOT_LABEL: Record<string, string> = {
  lead: '提前不足',
  ban: '管制',
  notice: '管控',
  full: '已占用',
  closed: '检修',
  past: '已过',
  wait: '先选日期',
  offslot: '未开放',
}

// 运营在后台「档期管理」里配置的每日可接单时段（整点区间）：{ '2026-11-20': ['19:00-20:00'] }
const slotsByDate = ref<Record<string, string[]>>({})
const schTick = ref(0)

const days = computed(() => {
  // 依赖 schTick，后台档期到位后日历自动重算（静态阶段档期来自 Mock 路由）
  void schTick.value
  return calendarDays({ venue, drones: need.droneCount, slotsByDate: slotsByDate.value as any })
})

// 日级天气：填报页只给「这一天大致是什么天」，不再逐小时列 19/20/21 的天气与温度
const dayWx = computed(() => {
  if (!date.value) return null
  return dateWeather({ date: date.value, cityCode: cityOf(venue.city).code })
})

const picked = computed(() => dayInfo(days.value, date.value))

// 可选时段（2026-11-02 用户口径）：不再跟踪时段天气、不再用天光窗口预判「装不下」，
// 三个时段一律让用户自己选——当天照常 / 推迟 / 取消由现场实际情况决定，天气预报的误差是允许的。
// 只有排他资源本身冲突（管制 / 占用 / 检修 / 提前量不足 / 已过）才不可点，且卡片上不写原因，点了才解释。
const slotList = computed(() => {
  if (!picked.value) {
    return TIME_SLOTS.map((s: string) => ({
      slot: s,
      status: 'wait',
      open: false,
      label: '先选日期',
    }))
  }
  return picked.value.slots.map((s: any) => ({
    ...s,
    label: s.open ? '' : SLOT_LABEL[s.status] || '',
  }))
})

// 状态颜色只看「这一天」：绿 = 可提交、橙 = 可提交但当天可能调整、中性灰 = 天气未公布；红 = 不可选日
const toneClass = computed(() => {
  if (!picked.value) return ''
  if (picked.value.disabled) return 'dead'
  return picked.value.status
})

const statusText = computed(() => {
  if (!picked.value) return ''
  if (!slotList.value.some((s: any) => s.open)) return '本日无可用时段'
  const st = picked.value.status
  if (st === 'unknown') return STATUS_TEXT.unknown
  if (st === 'risk') return '可提交申请（当天可能调整）'
  return STATUS_TEXT.ok
})

// 日级天气（2026-11-02 用户：取消更细的小时天气，只要大致是什么天；预报可能不准，允许提前或推迟）
const pickedNote = computed(() => {
  if (!picked.value) return ''
  if (picked.value.disabled) return picked.value.note
  const w = dayWx.value
  if (!w) return ''
  if (w.status === 'unknown') {
    return `日级天气未公布（超出 ${w.horizonDays} 天预报期），可预约，可能提前或推迟`
  }
  const t = w.tempC == null ? '' : ` ${w.tempC}℃`
  return `日级预报：${w.kind}${t} · 可能提前或推迟`
})

// 条款门 + 天气风险弹窗统一走 useAckPop（等价原型 mixins/ackPop.js）
const { pop, gateWithWeather } = useAckPop()

// 草稿里的日期可能是上一次演示留下的（已过去 / 超出窗口）：清掉，不让它变成「选了但不可选」
onLoad(() => {
  if (date.value && !picked.value) {
    date.value = ''
    slot.value = ''
    store.apply.date = ''
    store.apply.slot = ''
  }
  syncSlot()
  prefetchSchedule()
})

// 后台「档期管理」配置的可接单时段：用户端按配置渲染时段（缺的时段不出现，整日没配 = 停接）。
// 静态阶段由本地 Mock 路由返回；只认 slots（后台档期配置），排期余量不当作档期配置用。
function prefetchSchedule() {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const from = fmt(new Date())
  const to = fmt(new Date(Date.now() + 62 * 86400000))
  getSilent(`/schedule?from=${from}&to=${to}`)
    .then((d: any) => {
      if (!d || !Array.isArray(d.days)) return
      const map: Record<string, string[]> = {}
      for (const day of d.days) {
        if (Array.isArray(day.slots) && day.slots.length) map[day.date] = day.slots
      }
      slotsByDate.value = map
      schTick.value++
      syncSlot()
    })
    .catch(() => {})
}

// 选择对齐：没有日期 / 日期不可选 → 落到第一个可提交日；时段不可选 → 落到第一个可点时段
function syncSlot() {
  const day = dayInfo(days.value, date.value)
  if (!day || day.disabled) {
    const first = days.value.find((d: any) => !d.disabled)
    if (first) {
      date.value = first.date
      store.apply.date = first.date
      slot.value = ''
      store.apply.slot = ''
    }
  }
  const cur = slotList.value.find((x: any) => x.slot === slot.value)
  if (!cur || !cur.open) {
    const ok = slotList.value.find((x: any) => x.open)
    slot.value = ok ? ok.slot : ''
    store.apply.slot = slot.value
  }
}

function onDate(d: string) {
  // 换日期 = 第 3 步的产物变了，报价、派单、合同都得重算；日期本身是用户填的，不丢
  invalidateFrom(3)
  date.value = d
  store.apply.date = d
  slot.value = ''
  store.apply.slot = ''
  // 自动落到第一个可点时段：用户不用在「选完日期再点一次时段」上多走一步
  const ok = slotList.value.find((x: any) => x.open)
  if (ok) {
    slot.value = ok.slot
    store.apply.slot = ok.slot
  }
}

function onSlot(s: any) {
  if (!s.open) {
    uni.showToast({ title: s.label || '该时段暂不可选', icon: 'none' })
    return
  }
  slot.value = s.slot
  store.apply.slot = s.slot
}

// 天气未公布（超出预报期）的预约风险：不在选择时打断，统一在「下一步」这一道门里确认
const wxNeed = computed(() => {
  const s = slotList.value.find((x: any) => x.slot === slot.value)
  return !!(s && s.status === 'unknown')
})

const riskPayload = computed(() => {
  const ex = wxAckOf(date.value, slot.value)
  const hz = picked.value ? picked.value.horizonDays : 0
  return {
    group: '时段与审批',
    lines: [
      `${date.value} ${slot.value} 超出逐日天气预报覆盖范围（系统仅覆盖未来 ${hz} 天），天气未公布，无法判断是否适飞。`,
      '若因天气改期：改期 = 重新审批，重新申请与加急费用（3–7 工作日加收 20–50%）由甲方承担；定金 30–50% 不可退（《申请说明》「费用与付款」组）。',
      '当日是否举行由公安机关根据现场整体态势决定；因不可抗力或主管部门决定推迟、取消的，按合同的不可抗力与变更条款处理。',
    ],
    acked: !!ex,
    at: ex ? ex.at : '',
    user: ex ? ex.user : '',
  }
})

function ackWx() {
  const rec = ackWeatherRisk({
    date: date.value,
    slot: slot.value,
    horizonDays: picked.value ? picked.value.horizonDays : 0,
    // 静态阶段不接真实天气源，留痕来源固定为本地引擎
    source: 'mock',
  })
  // 弹窗内就地变成留痕状态（版本 + 日期时段 + 时间戳 + 账号 + 内容哈希），不留 toast
  pop.risk = { ...(pop.risk || {}), acked: true, at: rec.at, user: rec.user }
}

// 不同意就要换日期：关掉弹窗并清空选择，回到选择状态（不跳转、不留确认记录）
function skipWx() {
  pop.show = false
  date.value = ''
  slot.value = ''
  store.apply.date = ''
  store.apply.slot = ''
  invalidateFrom(3)
}

function next() {
  if (!date.value || !slot.value) {
    uni.showToast({ title: '请选择日期与申请时段', icon: 'none' })
    return
  }
  const s = slotList.value.find((x: any) => x.slot === slot.value)
  if (!s || !s.open) {
    uni.showToast({ title: (s && s.label) || '请重新选择申请时段', icon: 'none' })
    return
  }
  // 本步未确认条款 + 天气未公布的预约风险，统一在点击下一步时弹出确认。
  if (!gateWithWeather(wxNeed.value ? riskPayload.value : null)) return
  store.apply.step = 4
  uni.navigateTo({ url: '/pages/apply/quote' })
}
</script>

<style scoped>
.page {
  height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.body {
  flex: 1;
  min-height: 0;
}
/* 间距标准（2026-10-28）：节奏 = 4 的倍数；卡片留白 24、卡片内边距 24、标题→内容 20、可点目标 ≥88rpx(44px)。 */
.sec {
  margin: 24rpx;
}
/* 标题行与入口收进共用组件（2026-10-29 十次调整）：SecHead = 竖条 + 标题（左）+ 入口（右），
   EntryChip = 唯一的入口形态（88rpx 胶囊）。页里不再写 .sec-title / .sec-link / .kv-info / .ack。 */
.picked {
  margin-top: 16rpx;
  background: var(--bg);
  border-radius: 14rpx;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
/* 状态色只看「这一天」：可提交绿、当天可能调整橙、天气未公布中性灰、不可排红 */
.picked.ok .pk-status {
  color: #1b8e5b;
}
.picked.unknown .pk-status {
  color: #6b7280;
}
.picked.risk .pk-status {
  color: #b45a18;
}
.picked.lead .pk-status,
.picked.weather .pk-status,
.picked.ban .pk-status,
.picked.notice .pk-status,
.picked.full .pk-status,
.picked.closed .pk-status,
.picked.dead .pk-status {
  color: var(--danger);
}
.pk-status {
  font-size: var(--fs-4);
  font-weight: var(--fw-bold);
  color: var(--primary);
}
.pk-note {
  font-size: var(--fs-2);
  color: var(--text-2);
  line-height: 1.6;
}
.slot-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
/* 时段卡只写时间区间，不写任何天气/窗口状态字（2026-11-02 用户：时段都让用户自己选）；
   2026-11-03：时段改成「起-止」区间后单条更宽，改用换行流式布局，两个一行，时段多了也不挤 */
.slot {
  flex: 1 1 300rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16rpx 8rpx;
  border-radius: 16rpx;
  border: 2rpx solid var(--line);
  box-sizing: border-box;
  min-height: 88rpx;
}
.slot.on {
  border-color: var(--primary);
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
}
/* 不可点只可能是排他资源冲突（管制 / 占用 / 检修 / 提前不足 / 已过），不是天气 */
.slot.dis {
  background: var(--bg-2);
}
.sl-t {
  display: block;
  font-size: var(--fs-4);
  font-weight: var(--fw-bold);
}
.sl-s {
  display: block;
  font-size: var(--fs-1);
  color: var(--text-3);
  margin-top: 4rpx;
}
.slot.on .sl-s {
  color: rgba(255, 255, 255, 0.8);
}
.price-bar {
  flex: none;
  background: rgba(255, 255, 255, 0.97);
  border-top: 1rpx solid var(--line);
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
}
.pb-btn {
  width: 100%;
  border: none;
  border-radius: 999rpx;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
  padding: 20rpx 0;
  min-height: 88rpx;
  box-sizing: border-box;
}
.pb-btn::after {
  border: none;
}
.pb-btn.dis {
  background: #e3e6f0;
  color: var(--text-3);
}
</style>
