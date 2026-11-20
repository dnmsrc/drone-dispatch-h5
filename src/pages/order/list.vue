<template>
  <view class="page">
    <NavBar title="我的订单" :show-back="false" />
    <!-- 状态 Tab -->
    <scroll-view scroll-x class="tabs" enhanced :show-scrollbar="false">
      <view class="tabs-row">
        <view
          v-for="t in tabs"
          :key="t.key"
          class="tab"
          :class="{ on: active === t.key }"
          @click="selectTab(t.key)"
          >{{ t.label }}</view
        >
      </view>
    </scroll-view>

    <scroll-view scroll-y class="list" @scrolltolower="noop">
      <view v-if="!loading && !orders.length">
        <Empty text="暂无相关订单">
          <button class="btn-primary go-btn" @click="goCreate">去预约一场表演</button>
        </Empty>
      </view>
      <view v-for="o in orders" :key="o.id" class="order-card card" @click="goDetail(o.id)">
        <view class="oc-head">
          <text class="oc-title">{{ o.occasion || '无人机编队表演' }}</text>
          <StatusTag :status="o.status" />
        </view>
        <view class="oc-summary">{{ summary(o) }}</view>
        <view class="oc-meta">
          <text class="oc-date">{{ o.performDate }} {{ o.timeSlot }}</text>
          <text class="oc-venue">{{ o.venue.name }}</text>
        </view>
        <view class="oc-foot">
          <text class="oc-time">下单：{{ fmtTime(o.createdAt) }}</text>
          <text class="oc-amount">¥{{ o.totalAmount.toLocaleString() }}</text>
        </view>
        <!-- 快捷操作 -->
        <view v-if="o.status === 'PENDING_PAY'" class="oc-actions" @click.stop>
          <button class="mini ghost" @click.stop="cancel(o)">取消订单</button>
          <button class="mini primary" @click.stop="goPay(o.id)">去支付</button>
        </view>
        <view
          v-else-if="['PENDING_ACCEPT', 'ACCEPTED'].includes(o.status)"
          class="oc-actions"
          @click.stop
        >
          <button class="mini ghost" @click.stop="goRefund(o.id)">申请退款</button>
        </view>
        <view v-else-if="o.status === 'COMPLETED'" class="oc-actions" @click.stop>
          <button class="mini ghost" @click.stop="goGallery(o.id)">现场照片</button>
          <button class="mini primary" @click.stop="goReview(o.id)">评价</button>
        </view>
      </view>
      <view style="height: 150rpx"></view>
    </scroll-view>
    <TabBar current="order" />
    <WxAuthSheet />
  </view>
</template>

<script setup lang="ts">
// 我的订单：状态 Tab + 列表 + 行内快捷操作（去支付 / 取消 / 退款 / 相册 / 评价）
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import NavBar from '@/components/NavBar.vue'
import TabBar from '@/components/TabBar.vue'
import StatusTag from '@/components/StatusTag.vue'
import Empty from '@/components/Empty.vue'
import WxAuthSheet from '@/components/WxAuthSheet.vue'
import { get, post } from '@/utils/request'
import { isLoggedIn } from '@/store'
import { beginLogin } from '@/services/auth'
import { fmtTime, orderSummary } from '@/utils/format'

interface OrderItem {
  id: string
  status: string
  occasion?: string
  performDate: string
  timeSlot: string
  venue: { name: string }
  totalAmount: number
  createdAt: string
  droneCount: number
  duration: number
  customText?: string
  customLogo?: string
  addons?: string[]
}

interface Tab {
  key: string
  label: string
}

const active = ref('all')
const tabs: Tab[] = [
  { key: 'all', label: '全部' },
  { key: 'PENDING_PAY', label: '待支付' },
  { key: 'PENDING_ACCEPT', label: '待接单' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' },
  { key: 'aftersale', label: '退款/售后' },
]
const orders = ref<OrderItem[]>([])
const loading = ref(false)

const summary = orderSummary

onLoad((q) => {
  if (q && q.tab) active.value = q.tab
})

onShow(() => {
  if (!isLoggedIn()) {
    // 未登录：微信内直接发起授权，微信外由登录页提示扫码；登录后回到当前 tab
    beginLogin('/pages/order/list?tab=' + active.value)
    return
  }
  load()
})

function noop(): void {
  /* 滚动到底：当前接口一次性返回全部订单，保留事件占位语义 */
}

function statusParam(): string {
  const map: Record<string, string> = {
    all: '',
    PENDING_PAY: 'PENDING_PAY',
    PENDING_ACCEPT: 'PENDING_ACCEPT',
    doing: 'ACCEPTED,IN_SERVICE',
    done: 'COMPLETED,REVIEWED',
    aftersale: 'REFUNDING,REFUNDED,CANCELLED',
  }
  return map[active.value] || ''
}

function selectTab(key: string): void {
  active.value = key
  load()
}

function load(): void {
  loading.value = true
  const s = statusParam()
  get<{ list: OrderItem[] }>(`/orders${s ? '?status=' + s : ''}`)
    .then((d) => {
      orders.value = d.list
    })
    .finally(() => {
      loading.value = false
    })
}

function goCreate(): void {
  uni.navigateTo({ url: '/pages/order/create' })
}

function goDetail(id: string): void {
  uni.navigateTo({ url: `/pages/order/detail?id=${id}` })
}

function goPay(id: string): void {
  uni.navigateTo({ url: `/pages/order/cashier?id=${id}` })
}

function goRefund(id: string): void {
  uni.navigateTo({ url: `/pages/order/refund?id=${id}` })
}

function goReview(id: string): void {
  uni.navigateTo({ url: `/pages/order/review?id=${id}` })
}

function goGallery(id: string): void {
  uni.navigateTo({ url: `/pages/order/gallery?id=${id}` })
}

function cancel(o: OrderItem): void {
  uni.showModal({
    title: '取消订单',
    content: '确定取消该订单吗？',
    success: (r) => {
      if (!r.confirm) return
      post(`/orders/${o.id}/cancel`).then(() => {
        uni.showToast({ title: '已取消', icon: 'success' })
        load()
      })
    },
  })
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
.tabs {
  background: var(--bg);
  padding: 10rpx 24rpx;
  white-space: nowrap;
}
.tabs-row {
  display: inline-flex;
  gap: 14rpx;
}
.tab {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  font-size: var(--fs-4);
  color: var(--text-2);
  background: #fff;
}
.tab.on {
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  font-weight: var(--fw-semibold);
  box-shadow: 0 6rpx 16rpx rgba(74, 108, 247, 0.3);
}
.list {
  flex: 1;
  min-height: 0;
  padding: 10rpx 0 0;
}
.order-card {
  margin: 16rpx 24rpx 0;
}
.oc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.oc-title {
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
}
.oc-summary {
  color: var(--text-2);
  font-size: var(--fs-3);
  margin-top: 10rpx;
}
.oc-meta {
  display: flex;
  gap: 20rpx;
  margin-top: 8rpx;
}
.oc-date {
  color: var(--primary);
  font-size: var(--fs-3);
  font-weight: var(--fw-semibold);
}
.oc-venue {
  color: var(--text-3);
  font-size: var(--fs-2);
}
.oc-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid var(--bg-2);
}
.oc-time {
  color: var(--text-4);
  font-size: var(--fs-1);
}
.oc-amount {
  font-size: var(--fs-7);
  font-weight: var(--fw-heavy);
}
.oc-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 16rpx;
}
.mini {
  font-size: var(--fs-3);
  padding: 10rpx 32rpx;
  border-radius: 999rpx;
  margin: 0;
  line-height: 1.6;
}
.mini.primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  border: none;
}
.mini.ghost {
  background: #fff;
  color: var(--primary);
  border: 2rpx solid var(--primary);
}
.mini::after {
  border: none;
}
.go-btn {
  margin-top: 20rpx;
  font-size: var(--fs-4);
  padding: 16rpx 40rpx;
}
</style>
