<template>
  <view class="page">
    <NavBar title="确认订单" />
    <view v-if="d" class="body">
      <!-- 方案摘要 -->
      <view class="card hero-card">
        <view class="hc-top">
          <text class="hc-title">{{ d.droneCount }} 架编队 · {{ d.duration }} 分钟</text>
          <text class="hc-date">{{ d.performDate }} {{ d.timeSlot }}</text>
        </view>
        <view class="hc-tags">
          <text v-for="p in patternLabels" :key="p" class="tag">{{ p }}</text>
          <text v-if="d.customText" class="tag custom">「{{ d.customText }}」</text>
          <text v-if="d.customLogo" class="tag custom">LOGO 定制</text>
          <text v-for="a in addonLabels" :key="a" class="tag addon">{{ a }}</text>
        </view>
      </view>

      <!-- 场地联系人 -->
      <view class="card">
        <view class="sec-title">场地与联系人</view>
        <view class="kv"
          ><text class="k">表演场地</text><text class="v">{{ d.venue.name }}</text></view
        >
        <view v-if="d.venue.address" class="kv"
          ><text class="k">详细地址</text><text class="v">{{ d.venue.address }}</text></view
        >
        <view class="kv"
          ><text class="k">联系人</text
          ><text class="v">{{ d.contact.name }} · {{ d.contact.phone }}</text></view
        >
      </view>

      <!-- 价格明细 -->
      <view class="card">
        <view class="sec-title">价格明细</view>
        <view v-for="(p, i) in priceLines" :key="i" class="kv">
          <text class="k">{{ p.label }}</text>
          <text class="v price">{{ p.amount ? '¥' + p.amount.toLocaleString() : '免费' }}</text>
        </view>
        <view class="total-row">
          <text>合计</text>
          <text class="total">¥{{ estTotal.toLocaleString() }}</text>
        </view>
        <text class="tip">* 最终价格以提交后服务端计算为准</text>
      </view>

      <!-- 协议 -->
      <view class="agree" @click="agreed = !agreed">
        <view class="checkbox" :class="{ on: agreed }"
          ><view v-if="agreed" class="gck"></view
        ></view>
        <text>我已阅读并同意</text>
        <text class="link" @click.stop="showAgreement = true">《无人机表演服务协议》</text>
      </view>

      <view style="height: 170rpx"></view>
    </view>

    <view class="bottom-bar">
      <view class="bb-left">
        <text class="bb-label">合计</text>
        <text class="bb-price">¥{{ estTotal.toLocaleString() }}</text>
      </view>
      <button
        class="bb-btn"
        :class="{ 'btn-disabled': submitting }"
        :disabled="submitting"
        @click="submit"
      >
        {{ submitting ? '提交中…' : '提交并去支付' }}
      </button>
    </view>

    <!-- 协议弹层 -->
    <view v-if="showAgreement" class="mask" @click="showAgreement = false">
      <view class="sheet" @click.stop>
        <text class="sheet-title">无人机表演服务协议（演示文本）</text>
        <scroll-view scroll-y class="sheet-body">
          <text class="p"
            >一、服务内容：乙方（星穹
            SkyShow）按订单约定，于指定日期、时段、场地为甲方提供无人机编队灯光表演服务。</text
          >
          <text class="p"
            >二、天气与管制：如遇大风、降雨、空域临时管制等不可抗力，双方协商改期，改期不成的全额退款。</text
          >
          <text class="p"
            >三、场地责任：甲方应确保表演场地已取得物业/管理方许可，具备安全起降条件；因场地许可问题导致无法表演的，按退款规则执行。</text
          >
          <text class="p"
            >四、退款规则：未接单全额退；已接单按距表演时间阶梯退款（7 天以上 90%、3-7 天 50%、1-3
            天 20%、24 小时内不可退）。</text
          >
          <text class="p"
            >五、安全须知：表演期间请服从现场工作人员引导，观众区与起降区保持安全距离。</text
          >
          <text class="p">六、本协议为演示环境模拟文本，最终以正式签署版本为准。</text>
        </scroll-view>
        <button class="bb-btn" style="margin-top: 20rpx" @click="agreeAndClose">同意并关闭</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
// 确认订单页：接收 create 写入的 store.draft，算价格明细，勾选协议后 POST /orders → 收银台
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import { get, post } from '@/utils/request'
import { store } from '@/store'
import { ADDON_NAMES, PATTERN_NAMES } from '@/utils/format'

interface PriceLine {
  label: string
  amount: number
}

interface OrderResp {
  order: { id: string }
}

const d = ref<Record<string, any> | null>(null)
const agreed = ref(false)
const showAgreement = ref(false)
const submitting = ref(false)

const patternLabels = computed<string[]>(() =>
  ((d.value?.patternPreset || []) as string[]).map((k) => PATTERN_NAMES[k] || k),
)

const addonLabels = computed<string[]>(() =>
  ((d.value?.addons || []) as string[]).map((k) => ADDON_NAMES[k] || k),
)

const priceLines = computed<PriceLine[]>(() => {
  const lines: PriceLine[] = []
  const f = d.value
  if (!f) return lines
  const rules = store.pricing ? store.pricing.priceRules : null
  const tier = rules && rules.tiers.find((t: any) => t.drones === f.droneCount)
  lines.push({ label: `${f.droneCount} 架基础价（含 10 分钟）`, amount: tier ? tier.price : 0 })
  const dur = rules && rules.durations.find((x: any) => x.minutes === f.duration)
  if (dur && dur.extra) lines.push({ label: `时长 ${f.duration} 分钟加价`, amount: dur.extra })
  if (f.customText)
    lines.push({
      label: `定制文字「${f.customText}」`,
      amount: rules ? rules.customTextPrice : 2000,
    })
  if (f.customLogo)
    lines.push({ label: 'LOGO/图片定制', amount: rules ? rules.customLogoPrice : 5000 })
  for (const k of (f.addons || []) as string[]) {
    const a = rules && rules.addons.find((x: any) => x.key === k)
    lines.push({ label: ADDON_NAMES[k] || k, amount: a ? a.price : 0 })
  }
  return lines
})

const estTotal = computed(() => priceLines.value.reduce((s, i) => s + i.amount, 0))

onLoad(() => {
  if (!store.pricing) {
    // 兜底拉一次配置，保证价格明细可算
    get<Record<string, any>>('/config/pricing')
      .then((p) => {
        store.pricing = p
      })
      .catch(() => {})
  }
  const draft = store.draft
  if (!draft || !draft.performDate) {
    uni.showToast({ title: '请先填写预约信息', icon: 'none' })
    setTimeout(() => uni.redirectTo({ url: '/pages/order/create' }), 500)
    return
  }
  d.value = draft
})

function agreeAndClose(): void {
  agreed.value = true
  showAgreement.value = false
}

function submit(): void {
  if (!agreed.value) {
    uni.showToast({ title: '请先阅读并同意服务协议', icon: 'none' })
    return
  }
  if (submitting.value) return
  const f = d.value
  if (!f) return
  submitting.value = true
  post<OrderResp>('/orders', {
    droneCount: f.droneCount,
    duration: f.duration,
    patternPreset: f.patternPreset,
    customText: f.customText,
    customLogo: f.customLogo,
    addons: f.addons,
    performDate: f.performDate,
    timeSlot: f.timeSlot,
    venue: f.venue,
    contact: f.contact,
  })
    .then((res) => {
      store.draft = null
      uni.redirectTo({ url: `/pages/order/cashier?id=${res.order.id}` })
    })
    .finally(() => {
      submitting.value = false
    })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
}
.body {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.hero-card {
  background: linear-gradient(160deg, #1b2452, #10173a);
}
.hc-top {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.hc-title {
  color: #fff;
  font-size: var(--fs-9);
  font-weight: var(--fw-heavy);
}
.hc-date {
  color: #3de0c0;
  font-size: var(--fs-4);
  font-weight: var(--fw-semibold);
  letter-spacing: 1rpx;
}
.hc-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}
.tag {
  font-size: var(--fs-1);
  color: #b9c6ff;
  background: rgba(122, 143, 255, 0.15);
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
}
.tag.custom {
  color: #3de0c0;
  background: rgba(61, 224, 192, 0.12);
}
.tag.addon {
  color: #ffd9a0;
  background: rgba(255, 200, 120, 0.12);
}
.kv {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  padding: 14rpx 0;
}
.k {
  color: var(--text-3);
  font-size: var(--fs-4);
  flex-shrink: 0;
}
.v {
  color: var(--text-1);
  font-size: var(--fs-4);
  text-align: right;
}
.v.price {
  font-weight: var(--fw-semibold);
}
.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--bg-2);
  font-size: var(--fs-5);
  font-weight: var(--fw-bold);
}
.total {
  color: var(--primary);
  font-size: var(--fs-10);
  font-weight: var(--fw-heavy);
}
.tip {
  display: block;
  margin-top: 10rpx;
  font-size: var(--fs-1);
  color: var(--text-4);
  text-align: right;
}
.agree {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: var(--fs-3);
  color: var(--text-2);
  padding: 0 8rpx;
}
.checkbox {
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  border: 2rpx solid var(--text-4);
  color: #fff;
  font-size: var(--fs-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.checkbox.on {
  background: var(--primary);
  border-color: var(--primary);
}
.link {
  color: var(--primary);
}
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  max-width: 480px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.97);
  border-top: 1rpx solid var(--line);
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
}
.bb-left {
  display: flex;
  flex-direction: column;
}
.bb-label {
  font-size: var(--fs-1);
  color: var(--text-3);
}
.bb-price {
  font-size: var(--fs-10);
  font-weight: var(--fw-heavy);
}
.bb-btn {
  flex: 1;
  border: none;
  border-radius: 999rpx;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
  padding: 20rpx 0;
  box-shadow: 0 8rpx 22rpx rgba(74, 108, 247, 0.35);
}
.bb-btn::after {
  border: none;
}
.mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(10, 12, 26, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 40rpx 36rpx 50rpx;
}
.sheet-title {
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
  display: block;
  margin-bottom: 16rpx;
}
.sheet-body {
  max-height: 600rpx;
}
.p {
  display: block;
  font-size: var(--fs-3);
  color: var(--text-2);
  line-height: 1.8;
  margin-bottom: 12rpx;
}
</style>
