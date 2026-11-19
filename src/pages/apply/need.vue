<template>
  <view class="page">
    <NavBar title="申请单 · 规模与内容" />
    <StepBar :current="2" />

    <scroll-view scroll-y class="body">
      <view class="sec card">
        <SecHead title="规模" :sub="'投入 ' + need.droneCount + ' 架'" />
        <!-- 成句解释进弹窗（spec-ackflow）：页上只留一行短状态 -->
        <view v-if="needOverCap" class="warn-box">超出上限 · 需重选档位</view>
        <view class="tier-grid">
          <view
            v-for="t in tiers"
            :key="t.drones"
            class="tier"
            :class="{ on: need.droneCount === t.drones, dis: !fits(t.drones) }"
            @click="pickTier(t)"
          >
            <text class="tier-num">{{ t.drones }}<text class="u"> 架</text></text>
            <text class="tier-price">¥{{ t.price.toLocaleString() }}</text>
            <text class="tier-desc">{{
              fits(t.drones)
                ? t.desc
                : `装不下 · 需 ≥ ${areaNeeded(t.drones)} m²，该场地 ${venue.launchAreaM2} m²`
            }}</text>
          </view>
        </view>
      </view>

      <view class="sec card">
        <SecHead title="预计观众人数" sub="必填" />
        <!-- 输入时只更新人数；需要确认的条款在下一步统一弹出。 -->
        <input
          v-model="audienceInput"
          class="text-input"
          type="number"
          placeholder="观众人数（必填）"
          placeholder-class="ph"
          @blur="onAudienceBlur"
        />
      </view>

      <view class="sec card">
        <SecHead title="表演时长" />
        <view class="seg">
          <view
            v-for="d in durations"
            :key="d.minutes"
            class="seg-item"
            :class="{ on: need.duration === d.minutes }"
            @click="need.duration = d.minutes"
          >
            <text class="seg-name">{{ d.minutes }} 分钟</text>
            <text class="seg-price">{{
              d.rate ? '+' + Math.round(d.rate * 100) + '%' : '含在基础价'
            }}</text>
          </view>
        </view>
      </view>

      <view class="sec card">
        <SecHead title="内容复杂度" />
        <view class="mode-row">
          <view
            v-for="m in modes"
            :key="m.key"
            class="mode"
            :class="{ on: need.contentMode === m.key }"
            @click="need.contentMode = m.key"
          >
            <text class="mode-name">{{ m.label }}</text>
            <text class="mode-desc">{{ m.desc }}</text>
          </view>
        </view>
        <view v-if="need.contentMode !== 'template'" class="sub-grid">
          <view class="sub-col">
            <text class="sub-label">画面数量</text>
            <view class="sub-opts">
              <text
                v-for="b in bands"
                :key="b.key"
                class="opt"
                :class="{ on: need.screens === b.key }"
                @click="need.screens = b.key"
                >{{ b.label }}</text
              >
            </view>
          </view>
          <view class="sub-col">
            <text class="sub-label">维度</text>
            <view class="sub-opts">
              <text
                v-for="v in ['2D', '3D']"
                :key="v"
                class="opt"
                :class="{ on: need.dimension === v }"
                @click="need.dimension = v"
                >{{ v }}</text
              >
            </view>
          </view>
          <view class="sub-col">
            <text class="sub-label">运动方式</text>
            <view class="sub-opts">
              <text
                v-for="v in ['static', 'dynamic']"
                :key="v"
                class="opt"
                :class="{ on: need.motion === v }"
                @click="need.motion = v"
                >{{ v === 'static' ? '静态编队' : '动态编队' }}</text
              >
            </view>
          </view>
          <view class="sub-col">
            <text class="sub-label">矩阵数</text>
            <view class="sub-opts">
              <text
                v-for="v in [1, 2, 3]"
                :key="v"
                class="opt"
                :class="{ on: need.matrix === v }"
                @click="need.matrix = v"
                >{{ v }} 矩阵</text
              >
            </view>
          </view>
        </view>
      </view>

      <view class="sec card">
        <SecHead title="其它附加内容" sub="可多选" />
        <view class="addon-grid">
          <view
            v-for="a in addons"
            :key="a.key"
            class="addon"
            :class="{ on: need.addons.includes(a.key) }"
            @click="toggleAddon(a.key)"
          >
            <view class="addon-check"
              ><view v-if="need.addons.includes(a.key)" class="gck"></view
            ></view>
            <text class="addon-name">{{ a.label }}</text>
            <text class="addon-price">+¥{{ a.price.toLocaleString() }}</text>
            <text class="addon-desc">{{ a.desc }}</text>
          </view>
        </view>
      </view>

      <view style="height: 180rpx"></view>
    </scroll-view>

    <view class="price-bar">
      <view class="pb-left">
        <text class="pb-label">已选小计</text>
        <text class="pb-price">¥{{ subtotal.toLocaleString() }}</text>
      </view>
      <button class="pb-btn" @click="next">
        {{ reasons.length ? '转人工咨询' : '下一步 · 选日期与时段' }}
      </button>
    </view>

    <BasisPop
      :show="pop.show"
      :title="pop.title"
      :lines="pop.lines"
      :touch="pop.touch"
      :sec="pop.sec"
      :must="pop.must"
      @close="pop.show = false"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import NavBar from '@/components/NavBar.vue'
import StepBar from '@/components/StepBar.vue'
import BasisPop from '@/components/BasisPop.vue'
import SecHead from '@/components/SecHead.vue'
import { store, invalidateFrom, hydrateForPage } from '@/store'
import { useAckPop } from '@/composables/useAckPop'
import { TIERS, DURATIONS, CONTENT_MODES, SCREEN_BANDS, ADDONS } from '@/mock/engines/pricing.js'
import { venueCap, fitsTier, spacingOf } from '@/mock/engines/venues.js'
import { judge } from '@/mock/engines/judge.js'

const STEP = 2
const apply = hydrateForPage(STEP)
const need = apply.need
// 第 2 步的场地由 hydrateForPage 兜底补齐（冷进入 / 回看时），这里按已补齐取值
const venue = apply.venue as Record<string, any>
const tiers = TIERS
const durations = DURATIONS
const modes = CONTENT_MODES
const bands = SCREEN_BANDS
const addons = ADDONS

// 输入框保留用户的原始字符串：失焦 / 下一步才写回草稿，避免边输边触发下游重算。
const audienceInput = ref(String(need.audience || ''))

// 条款门与弹窗状态走 useAckPop（等价原型 mixins/ackPop.js）
const { pop, gate } = useAckPop()

const cap = computed(() => venueCap(venue))
const judgment = computed(() =>
  judge({ venue, drones: need.droneCount, date: need.date || '', audience: need.audience }),
)
const reasons = computed(() => judgment.value.consultReasons)
const needOverCap = computed(() => cap.value !== null && need.droneCount > cap.value)

const subtotal = computed(() => {
  const t = tiers.find((x: any) => x.drones === need.droneCount) || tiers[0]
  const d = durations.find((x: any) => x.minutes === need.duration)
  const m = modes.find((x: any) => x.key === need.contentMode) || modes[0]
  let rate = m.rate
  if (m.key !== 'template') {
    const band = bands.find((b: any) => b.key === need.screens)
    if (band) rate = band.rate
    if (need.dimension === '3D') rate += 0.12
    if (need.motion === 'dynamic') rate += 0.15
    if (m.key === 'matrix' && need.matrix >= 3) rate = Math.max(rate, 1.0)
    else if (m.key === 'matrix' && need.matrix === 2) rate = Math.max(rate, 0.6)
    rate = Math.min(rate, 1.5)
  }
  let total = Math.round(t.price * (1 + (d ? d.rate : 0)) + t.price * rate)
  for (const k of need.addons) {
    const a = addons.find((x: any) => x.key === k)
    if (a) total += a.price
  }
  return total
})

function fits(drones: number) {
  return fitsTier(venue, drones)
}

function areaNeeded(drones: number) {
  return Math.round(drones * spacingOf(drones) ** 2) * 2
}

function pickTier(t: any) {
  if (!fitsTier(venue, t.drones)) {
    uni.showToast({
      title: `该场地装不下 ${t.drones} 架（需 ≥ ${areaNeeded(t.drones)} m²）`,
      icon: 'none',
    })
    return
  }
  need.droneCount = t.drones
  invalidateFrom(2)
}

// 失焦只保存输入；本步条款在点击下一步时统一确认。
function onAudienceBlur() {
  const n = parseInt(audienceInput.value, 10)
  if (!Number.isFinite(n) || n <= 0) return
  need.audience = n
  invalidateFrom(2)
}

function toggleAddon(k: string) {
  const i = need.addons.indexOf(k)
  if (i >= 0) need.addons.splice(i, 1)
  else need.addons.push(k)
}

function next() {
  const n = parseInt(audienceInput.value, 10)
  if (!Number.isFinite(n) || n <= 0) {
    uni.showToast({ title: '预计观众人数必填', icon: 'none' })
    return
  }
  need.audience = n
  // 规模与内容是第 2 步的产物：改它只作废「结论」（报价、派单、合同），第 1 步已选的场地保留
  invalidateFrom(2)
  store.apply.judgment = judgment.value
  // 门在每一步的「下一步」（2026-10-29 用户指出）：本单触发的条款没确认完不能进下一步。
  // 放在观众数写入之后——1200 人这一条（许可层级 + 甲方侧罚则）是不是成立，取决于刚填的这个数。
  if (!gate()) return
  if (reasons.value.length) {
    store.apply.step = 5
    uni.navigateTo({ url: '/pages/apply/consult' })
    return
  }
  store.apply.step = 3
  uni.navigateTo({ url: '/pages/apply/date' })
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
.ph {
  color: var(--text-4);
}
/* 标题行与入口收进共用组件（2026-10-29 十次调整）：SecHead = 竖条 + 标题（左）+ 入口（右），
   EntryChip = 唯一的入口形态（88rpx 胶囊）。页里不再各写一份 .sec-title / .ack / .sec-link——
   四套入口写法（小圆点、裸文字链接、小胶囊、行尾链接）就是这么长出来的。 */
.tier-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}
.tier {
  border: 2rpx solid var(--line);
  border-radius: 20rpx;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.tier.on {
  border-color: var(--primary);
  background: linear-gradient(180deg, rgba(74, 108, 247, 0.08), rgba(74, 108, 247, 0.02));
}
.tier.dis {
  background: var(--bg-2);
  color: var(--text-3);
}
.tier-num {
  font-size: var(--fs-8);
  font-weight: var(--fw-heavy);
}
.tier-num .u {
  font-size: var(--fs-2);
  font-weight: var(--fw-medium);
  color: var(--text-2);
}
/* 金额 / 结论 / 待定 badge 用主色深阶（--primary-deep）：--primary 在浅色底上只有 4.0–4.4:1，
   达不到正文 4.5:1；深阶 #3553C8 在白色上 7.2:1、在淡蓝底上 6.6:1。判据 audit-unify.mjs D 项。 */
.tier-price {
  color: var(--primary-deep);
  font-weight: var(--fw-bold);
  font-size: var(--fs-4);
}
.tier-desc {
  font-size: var(--fs-1);
  color: var(--text-3);
}
.note {
  display: block;
  margin-top: 16rpx;
  font-size: var(--fs-1);
  color: var(--text-3);
  line-height: 1.7;
}
.seg {
  display: flex;
  background: var(--bg-2);
  border-radius: 18rpx;
  padding: 8rpx;
  gap: 8rpx;
}
.seg-item {
  flex: 1;
  border-radius: 14rpx;
  padding: 16rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  box-sizing: border-box;
  min-height: 88rpx;
}
.seg-item.on {
  background: #fff;
  box-shadow: 0 4rpx 14rpx rgba(26, 29, 46, 0.1);
}
.seg-name {
  font-size: var(--fs-4);
  font-weight: var(--fw-semibold);
}
.seg-item.on .seg-name {
  color: var(--primary);
}
.seg-price {
  font-size: var(--fs-1);
  color: var(--text-3);
}
.mode-row {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.mode {
  border: 2rpx solid var(--line);
  border-radius: 16rpx;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.mode.on {
  border-color: var(--primary);
  background: rgba(74, 108, 247, 0.06);
}
.mode-name {
  font-size: var(--fs-4);
  font-weight: var(--fw-semibold);
}
.mode.on .mode-name {
  color: var(--primary);
}
.mode-desc {
  font-size: var(--fs-1);
  color: var(--text-3);
}
.sub-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}
.sub-col {
  min-width: 116rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.sub-label {
  font-size: var(--fs-2);
  color: var(--text-3);
}
.sub-opts {
  display: flex;
  gap: 12rpx;
}
.opt {
  padding: 12rpx 16rpx;
  border-radius: 12rpx;
  background: var(--bg-2);
  font-size: var(--fs-3);
  color: var(--text-2);
  box-sizing: border-box;
  min-height: 88rpx;
  display: flex;
  align-items: center;
}
.opt.on {
  background: rgba(74, 108, 247, 0.1);
  color: var(--primary);
  font-weight: var(--fw-semibold);
}
.addon-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}
.addon {
  border: 2rpx solid var(--line);
  border-radius: 18rpx;
  padding: 20rpx;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.addon.on {
  border-color: var(--primary);
  background: rgba(74, 108, 247, 0.05);
}
.addon-check {
  position: absolute;
  top: 14rpx;
  right: 14rpx;
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  border: 2rpx solid #d5daea;
  color: #fff;
  font-size: var(--fs-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.addon.on .addon-check {
  background: var(--primary);
  border-color: var(--primary);
}
.addon-name {
  font-size: var(--fs-4);
  font-weight: var(--fw-semibold);
}
.addon-price {
  color: var(--primary-deep);
  font-size: var(--fs-3);
  font-weight: var(--fw-bold);
}
.addon-desc {
  font-size: var(--fs-1);
  color: var(--text-3);
}
.text-input {
  margin-top: 16rpx;
  background: var(--bg);
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  font-size: var(--fs-5);
  height: 88rpx;
  box-sizing: border-box;
}
.concl {
  border-radius: 18rpx;
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.concl.bad {
  background: rgba(245, 108, 108, 0.1);
}
.concl.warn {
  background: rgba(230, 162, 60, 0.1);
}
.concl.pend {
  background: rgba(74, 108, 247, 0.08);
}
.concl-title {
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
}
.concl.bad .concl-title {
  color: var(--danger);
}
.concl.warn .concl-title {
  color: var(--warn);
}
.concl.pend .concl-title {
  color: var(--primary-deep);
}
.concl-sub {
  font-size: var(--fs-1);
  color: var(--text-3);
}
.warn-box {
  background: rgba(245, 108, 108, 0.08);
  border-left: 8rpx solid var(--danger);
  border-radius: 14rpx;
  padding: 20rpx;
  font-size: var(--fs-3);
  color: var(--text-2);
  line-height: 1.7;
  margin-bottom: 16rpx;
}
.consult-box {
  background: rgba(74, 108, 247, 0.07);
  border-left: 8rpx solid var(--primary);
  border-radius: 14rpx;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  margin-bottom: 20rpx;
}
.cb-line {
  font-size: var(--fs-2);
  color: var(--text-2);
  line-height: 1.6;
}
.check-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
/* 判定项行是可点目标（入口按钮）：行高 ≥88rpx；说明文案在弹窗里，行内只留 badge + label + 入口 */
.check {
  display: flex;
  gap: 16rpx;
  align-items: center;
  min-width: 116rpx;
  min-height: 88rpx;
}
.ck-badge {
  flex: none;
  min-width: 84rpx;
  text-align: center;
  font-size: var(--fs-1);
  padding: 8rpx 12rpx;
  border-radius: 10rpx;
}
.ck-badge.PASS {
  color: var(--success);
  background: rgba(43, 164, 113, 0.12);
}
.ck-badge.WARN {
  color: var(--warn);
  background: rgba(230, 162, 60, 0.12);
}
.ck-badge.FAIL {
  color: var(--danger);
  background: rgba(245, 108, 108, 0.12);
}
.ck-badge.PENDING {
  color: var(--primary-deep);
  background: rgba(74, 108, 247, 0.1);
}
/* 判定项行 = badge + 名称 + 入口（入口占行右端，88rpx 触摸目标）；说明与文号在弹窗里 */
.ck-label {
  flex: 1;
  min-width: 116rpx;
  font-size: var(--fs-4);
  font-weight: var(--fw-semibold);
}
.kv {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  padding: 12rpx 0;
}
.k {
  color: var(--text-3);
  font-size: var(--fs-4);
  flex: 1 1 auto;
  min-width: 116rpx;
}
/* 键值行的标签不换行；.gk 里的 .k 是判定费因子标题，长文案允许换行 */
.kv > .k {
  flex: none;
  white-space: nowrap;
}
.v {
  color: var(--text-1);
  font-size: var(--fs-4);
  text-align: right;
}
.v.price {
  font-weight: var(--fw-bold);
  color: var(--primary-deep);
}
.gk {
  flex: 1;
  min-width: 116rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.kd {
  font-size: var(--fs-1);
  color: var(--text-3);
}
.rhythm {
  margin-top: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.rline {
  font-size: var(--fs-2);
  color: var(--text-2);
  line-height: 1.6;
}
.rline.bad {
  color: var(--danger);
}
/* 卡片内的子分区：只加 20rpx 上间距，不再套一层卡片（套卡片会把留白叠成 24+24） */
.sub {
  margin-top: 20rpx;
}
.price-bar {
  flex: none;
  background: rgba(255, 255, 255, 0.97);
  border-top: 1rpx solid var(--line);
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
}
.pb-left {
  flex: 1;
  min-width: 116rpx;
  display: flex;
  flex-direction: column;
}
.pb-label {
  font-size: var(--fs-1);
  color: var(--text-3);
}
.pb-price {
  font-size: var(--fs-10);
  font-weight: var(--fw-heavy);
}
.pb-btn {
  flex: 1;
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
</style>
