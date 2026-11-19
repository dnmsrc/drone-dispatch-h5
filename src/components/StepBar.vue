<template>
  <view class="bar">
    <!-- 左箭头：滚到最左时置灰。8 步加连接线后总宽超过屏幕，靠左右两个箭头平移 -->
    <!-- 箭头用 CSS 画（方框转 45° 出的尖角），不用 ‹ › 这种生僻字符：缺字时会变成方块或问号 -->
    <view class="nav" :class="{ off: atStart }" @click="nudge(-1)"
      ><view class="arw arw-l"></view
    ></view>

    <scroll-view
      class="scroller"
      scroll-x="true"
      :show-scrollbar="false"
      :scroll-left="left"
      scroll-with-animation
      @scroll="onScroll"
    >
      <!-- 每个步骤项等宽、点居中、点两侧各一段虚线，所以任意两个相邻点之间的间隔区域视觉一致 -->
      <!-- 只有「当前填报步骤之前」的步骤可点 —— 已走过的步骤可回看、可改；改完只能从这一步重新往下走 -->
      <view class="steps">
        <view
          v-for="(s, i) in steps"
          :key="s.key"
          class="st"
          :class="['s-' + stateOf(i), clickable(i) ? 'can' : '']"
          :style="itemStyle"
          @click="goto(i)"
        >
          <!-- 首项不画左虚线、末项不画右虚线：滚到两端时最外侧露出的是步骤本身，而不是一段悬空的线 -->
          <!-- flow：只有「当前节点与上一个节点之间」那一段流动，其它段一律静态 -->
          <view v-if="i > 0" class="ln ln-l" :class="{ flow: flowL(i) }"></view>
          <!-- 完成勾用 CSS 画，不用 ✓(U+2713)：该字符在不少系统字体里缺字，会渲染成白色「?」压在点上 -->
          <view class="dot">
            <view v-if="stateOf(i) === 'done'" class="ck"></view>
            <text v-else class="dg">{{ i + 1 }}</text>
          </view>
          <view v-if="i < steps.length - 1" class="ln ln-r" :class="{ flow: flowR(i) }"></view>
          <text class="lb">{{ s.label }}</text>
        </view>
      </view>
    </scroll-view>

    <view class="nav" :class="{ off: atEnd }" @click="nudge(1)"
      ><view class="arw arw-r"></view
    ></view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, ref } from 'vue'
import { APPLY_PAGES, ensureApply, hydrateTo, stepFilled, store } from '@/store'

// 拿不到标签实测宽时的兜底下限：够放 4 个 22rpx 汉字 + 左右留白。
// 真正的下限由 mounted 里实测的「最长标签宽 + 留白」算出来（见 measure）。这里不写 rpx：
// 宽屏下 CSS 的 rpx 被 App.vue 的 rem 上限锁死、跟 uni.upx2px 的换算不一致，写死就会毁掉整除。
const MIN_ITEM_PX = 88
const MIN_VISIBLE = 4 // 用户要求：一屏最少显示 4 个完整步骤

const props = withDefaults(defineProps<{ current?: number }>(), { current: 1 })

const steps = [
  { key: 'venue', label: '场地' },
  { key: 'need', label: '规模与内容' },
  { key: 'date', label: '日期时段' },
  { key: 'quote', label: '报价区间' },
  { key: 'consult', label: '咨询派单' },
  { key: 'contract', label: '合同' },
  { key: 'pay', label: '付款' },
  { key: 'progress', label: '进度' },
]

const left = ref(0) // 受控滚动位置（px），改变这个值才会滚
const atStart = ref(true)
const atEnd = ref(false)
const itemPx = ref(0) // 单项宽度（px，由可视区宽除以整除的项数算出来，不是写死的 rpx）
const viewport = ref(0) // 可视区宽度（bar 减掉两个箭头后）
const content = ref(0) // 内容总宽度 = steps.length * itemPx

const currentStep = computed(() => Math.min(Math.max(props.current, 1), steps.length))
// 单项宽度直接写 px：跟着设备走，且保证「可视区宽 = 单项宽 × 整除的项数」，任何停靠位置左边缘都落在整项边界上
const itemStyle = computed(() => (itemPx.value ? { width: itemPx.value + 'px' } : {}))

const instance = getCurrentInstance()

onMounted(() => {
  // 演示用：把前面缺的产物按真实算法补出来 —— 页面内容需要它；补数据不等于「已保存」
  ensureApply()
  hydrateTo(currentStep.value)
  // 两件事一起量：滚动区可视宽（决定一屏放几项）+ 最长标签的实际像素宽（决定单项的下限）。
  // 必须从 DOM 实测，不能用 uni.upx2px：宽屏下 CSS 的 rpx 被 App.vue 的 rem 上限锁死，算出来的项宽会对不上。
  uni
    .createSelectorQuery()
    .in(instance?.proxy as never)
    .select('.scroller')
    .boundingClientRect()
    .selectAll('.lb')
    .boundingClientRect()
    .exec((res: any[]) => {
      const box = res && res[0]
      const labels = (res && res[1]) || []
      const maxL =
        Array.isArray(labels) && labels.length
          ? Math.max(...labels.map((r: any) => (r && r.width) || 0))
          : 0
      measure(box ? box.width : 0, maxL)
    })
})

/**
 * 三档（当前步本身是单独一档，所以渲染上是 state + cur 两层）：
 *   done  保存过的（当前之前）—— 绿
 *   cur   当前步 —— 蓝
 *   todo  没保存过的 —— 一律灰。当前之后的步骤只是「还没走到」，不能因为预置了数据就显示成已保存。
 */
function stateOf(i: number): string {
  const n = i + 1
  if (n === currentStep.value) return 'cur'
  if (n < currentStep.value && stepFilled(n)) return 'done'
  return 'todo'
}

/** 只有「当前填报步骤之前」的步骤可点：当前之后的步骤不可点，改完只能从这一步重新往下走 */
function clickable(i: number): boolean {
  return stateOf(i) === 'done'
}

function goto(i: number) {
  if (!clickable(i)) return
  const n = i + 1
  const page = APPLY_PAGES[i]
  store.apply.step = n
  // 目标页还在页面栈里就「回退」，否则新开 —— 两种都比重复 push 干净
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  const idx = pages.findIndex((p: any) => String(p.route || p.id || '').endsWith('apply/' + page))
  if (idx >= 0 && idx < pages.length - 1) {
    uni.navigateBack({ delta: pages.length - 1 - idx })
    return
  }
  uni.redirectTo({ url: '/pages/apply/' + page })
}

/**
 * 流动只发生在「当前节点 ↔ 上一个节点」这一条连接线上。相邻两点之间的视觉连线由两半拼成
 * （前一项的右半 + 当前项的左半），所以这条线的两半都要流动，否则一半动一半不动。
 */
function flowL(i: number): boolean {
  if (i <= 0) return false
  return stateOf(i) === 'cur' && stateOf(i - 1) === 'done'
}
function flowR(i: number): boolean {
  if (i >= steps.length - 1) return false
  return stateOf(i) === 'done' && stateOf(i + 1) === 'cur'
}

/** 一屏放几个整项由设备可视宽算：n = 可视宽能放下的整项数（下限 4，上限步骤总数），w = 可视宽 / n */
function measure(avail: number, maxLabelPx: number) {
  const total = steps.length
  if (!avail || !isFinite(avail)) {
    itemPx.value = 0
    return
  }
  // 单项下限 = 最长标签实测宽 + 左右各 11px 留白；拿不到标签宽时用兜底常量。
  // 被除数再和「可视宽/4」取小，保证极窄屏上也至少 4 项。
  const floorPx = maxLabelPx > 0 ? maxLabelPx + 22 : MIN_ITEM_PX
  const n = Math.max(
    MIN_VISIBLE,
    Math.min(total, Math.floor(avail / Math.min(floorPx, avail / MIN_VISIBLE))),
  )
  itemPx.value = avail / n
  viewport.value = avail
  content.value = total * itemPx.value
  atEnd.value = content.value <= viewport.value + 2
  atStart.value = left.value <= 2
  scrollToStep(currentStep.value - 1) // 进入时把当前步滚到中间，否则长流程下当前步常在屏外
}

function onScroll(e: any) {
  const d = e.detail || {}
  left.value = d.scrollLeft || 0
  if (!content.value || !viewport.value) {
    // 有的环境事件里直接给 scrollWidth / clientWidth，也能补出尺寸
    if (d.scrollWidth && d.clientWidth) measure(d.clientWidth, 0)
    else return
  }
  atStart.value = left.value <= 2
  const max = Math.max(0, content.value - viewport.value)
  atEnd.value = left.value >= max - 2
}

/** 滚动位置吸附到整项边界，保证两端都是完整步骤，绝不会半截 */
function snap(v: number): number {
  const max = Math.max(0, content.value - viewport.value)
  if (!itemPx.value) return Math.max(0, Math.min(max, Math.round(v)))
  const full = Math.max(1, Math.round(viewport.value / itemPx.value))
  const k = Math.round(v / itemPx.value)
  return Math.max(0, Math.min(steps.length - full, k)) * itemPx.value
}

function scrollToStep(idx: number) {
  if (!viewport.value || !itemPx.value) {
    left.value = left.value === 0 ? 1 : 0
    return
  }
  const target = idx * itemPx.value - (viewport.value - itemPx.value) / 2
  // 先归零再设值，保证同一步骤重复点击时 scroll-left 值确实发生变化、真的会滚
  left.value = 0
  nextTick(() => {
    left.value = snap(target)
  })
}

function nudge(dir: number) {
  if (!viewport.value || !itemPx.value) {
    left.value = left.value + (dir > 0 ? 1 : -1)
    return
  }
  const max = Math.max(0, content.value - viewport.value)
  const next = left.value + dir * itemPx.value
  // 到头时直接落到 maxScroll（末项正好贴右边缘），贴左时落 0（首项正好贴左边缘）
  left.value = next >= max - 1 ? max : snap(next)
  atStart.value = left.value <= 2
  atEnd.value = next >= max - 2
}
</script>

<style scoped>
.bar {
  /* width:100% 是必须的：申请页的 .page 是 display:flex; flex-direction:column，
     flex 项的 width:auto + margin:0 auto 会「先按内容收缩、再居中」，整条 bar 只剩两个箭头宽。 */
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  background: #fff;
  border-bottom: 1rpx solid var(--line);
}
.nav {
  flex: none;
  width: 52rpx;
  height: 120rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--step-accent);
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
}
.nav.off {
  color: var(--step-idle-line);
}
/* 箭头：一个方框加两条边转 45°，尖角是画出来的，不依赖字体字符 */
.arw {
  width: 16rpx;
  height: 16rpx;
  border-top: 3rpx solid currentColor;
}
.arw-l {
  border-left: 3rpx solid currentColor;
  transform: rotate(-45deg);
}
.arw-r {
  border-right: 3rpx solid currentColor;
  transform: rotate(45deg);
}
/* 完成勾：左下两条边转 -45°，形状同 ✓，同样不依赖字体。
   绝对定位 + translate(-50%,-50%) 把方框中心钉在圆心，旋转后勾的视觉中心就和圆心重合。 */
.ck {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 15rpx;
  height: 9rpx;
  border-left: 3rpx solid currentColor;
  border-bottom: 3rpx solid currentColor;
  transform: translate(-50%, -50%) rotate(-45deg);
  box-sizing: border-box;
}
/* 滚动区宽度 = 整条 bar 减掉两个箭头（各 52rpx）。直接写死 calc 后 basis 与外层无关，箭头必在屏内。 */
.scroller {
  flex: 1 1 auto;
  width: calc(100% - 104rpx);
  min-width: 0;
  overflow: hidden;
  height: 120rpx;
  white-space: nowrap;
}
.steps {
  display: inline-flex;
  align-items: flex-start;
}
.st {
  /* 单项宽度由 mounted 里按「可视区宽 ÷ 整除的项数」算出来（inline px），这里不写 min-width */
  position: relative;
  flex: none;
  height: 120rpx;
  padding-top: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}
/* 点两侧各一段虚线、两段等长（点宽 44rpx，剩下的左右平分），所以相邻两点之间的间隔视觉一致 */
.ln {
  position: absolute;
  top: 42rpx;
  height: 0;
  border-bottom: 2rpx dashed var(--step-dash);
}
.ln-l {
  left: 0;
  right: calc(50% + 24rpx);
}
.ln-r {
  right: 0;
  left: calc(50% + 24rpx);
}
/* 蓝色流动只给「当前节点 ↔ 上一个节点」那一条连线。
   这里必须用 background-image 而不是 border-bottom：border 的位置不能做动画，流动只能靠背景平移。
   一个周期 14rpx：前 7rpx 实、后 7rpx 空（空档用淡蓝，所以看得出在走）。 */
.ln.flow {
  height: 2rpx;
  border-bottom: 0;
  background-image: repeating-linear-gradient(
    90deg,
    var(--step-flow) 0 7rpx,
    var(--step-flow-soft) 7rpx 14rpx
  );
  background-size: 14rpx 2rpx;
  animation: step-flow 1.1s linear infinite;
}
@keyframes step-flow {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 14rpx 0;
  }
}
/* 系统开了「减少动效」时只留静态蓝虚线，不流动 */
@media (prefers-reduced-motion: reduce) {
  .ln.flow {
    animation: none;
  }
}
/* grid + place-items:center 把数字的方框中心严格对齐圆心；勾走绝对定位居中 */
.dot {
  position: relative;
  z-index: 1;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: #fff;
  border: 2rpx solid var(--step-idle-line);
  display: grid;
  place-items: center;
  flex: none;
}
.dg {
  font-size: var(--fs-2);
  line-height: 1;
  font-weight: var(--fw-bold);
  color: var(--step-idle-text);
}
.lb {
  font-size: var(--fs-2);
  line-height: 30rpx;
  color: var(--step-idle-text);
  white-space: nowrap;
}
/* 没保存过（默认档）：白底浅灰环 + 灰字。当前之后的步骤全部走这一档 */
.st.s-todo .dot {
  background: #fff;
  border-color: var(--step-idle-line);
}
.st.s-todo .dg {
  color: var(--step-idle-text);
}
.st.s-todo .lb {
  color: var(--step-idle-text);
}
.st.s-todo .ln {
  border-bottom-color: var(--step-dash);
}
/* 已保存（当前之前）：淡绿底 + 绿勾 + 绿标签。勾走 currentColor 自动变绿。 */
.st.s-done {
  color: var(--step-saved);
}
.st.s-done .dot {
  background: var(--step-saved-soft);
  border-color: var(--step-saved-line);
}
.st.s-done .lb {
  color: var(--step-saved);
}
.st.s-done .ln {
  border-bottom-color: var(--step-saved-line);
}
/* 可点 = 当前之前、已走过的步骤：下划线表示可回看可改 */
.st.can {
  cursor: pointer;
}
.st.can .lb {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4rpx;
}
/* 当前步骤：淡蓝底 + 蓝描边 + 蓝色加粗——当前是「选中」而不是「已保存」，两者必须能同时显示 */
.st.s-cur .dot {
  background: var(--step-accent-soft);
  border: 2rpx solid var(--step-accent-line);
}
.st.s-cur .dg {
  color: var(--step-accent);
}
.st.s-cur .lb {
  color: var(--step-accent);
  font-weight: var(--fw-bold);
}
</style>
