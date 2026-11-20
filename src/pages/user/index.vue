<template>
  <view class="page">
    <NightSky :star-count="40">
      <view class="user-head">
        <image class="avatar" :src="avatarSrc" mode="aspectFill" />
        <view class="u-info">
          <text class="u-name">{{ user ? user.nickname : '未登录' }}</text>
          <text class="u-sub">{{ userSub }}</text>
        </view>
        <button v-if="!user" class="login-btn" @click="goLogin">去登录</button>
      </view>
    </NightSky>

    <!-- 我的订单 -->
    <view class="card orders-card">
      <view class="oc-head" @click="goOrders('all')">
        <text class="oc-title">我的订单</text>
        <text class="oc-more">全部 ›</text>
      </view>
      <view class="oc-grid">
        <view v-for="e in entries" :key="e.key" class="oc-item" @click="goOrders(e.key)">
          <view class="oc-icon" v-html="e.icon"></view>
          <text class="oc-label">{{ e.label }}</text>
        </view>
      </view>
    </view>

    <!-- 功能列表 -->
    <view class="card menu-card">
      <!-- 微信资料：登录只要 openid，昵称头像由用户在这里主动授权（这一句才会弹微信授权页） -->
      <view v-if="user" class="menu-item" @click="doProfileAuth">
        <text class="m-icon">🪪</text>
        <text class="m-label">微信资料</text>
        <text class="m-value">{{ user.profileReady ? '已获取 ›' : '获取头像昵称 ›' }}</text>
      </view>
      <view class="menu-item" @click="goMine">
        <text class="m-icon">📋</text>
        <text class="m-label">我的预约</text>
        <text class="m-value">{{
          activeCount ? activeCount + ' 单进行中 ›' : '查看咨询进度 ›'
        }}</text>
      </view>
      <view class="menu-item" @click="contact">
        <text class="m-icon">🎧</text>
        <text class="m-label">联系客服</text>
        <text class="m-value">400-888-8888 ›</text>
      </view>
      <view class="menu-item" @click="showAbout = true">
        <text class="m-icon">✨</text>
        <text class="m-label">关于{{ brandShort }}</text>
        <text class="m-value">v1.0.0 演示版 ›</text>
      </view>
      <view v-if="user" class="menu-item" @click="doLogout">
        <text class="m-icon">🚪</text>
        <text class="m-label">退出登录</text>
        <text class="m-value">›</text>
      </view>
    </view>

    <view style="height: 150rpx"></view>
    <TabBar current="user" />

    <!-- 关于弹层 -->
    <view v-if="showAbout" class="mask" @click="showAbout = false">
      <view class="about" @click.stop>
        <DroneLogo :size="130" color="#7E97FF" rotor-color="#A9BCFF" />
        <text class="ab-name">{{ brandName }}</text>
        <text class="ab-ver">v1.0.0 · 演示版</text>
        <text class="ab-desc">{{ aboutDesc }}</text>
        <button class="ab-btn" @click="showAbout = false">知道了</button>
      </view>
    </view>
    <WxAuthSheet />
  </view>
</template>

<script setup lang="ts">
// 「我的」：登录态展示 + 订单四宫格入口 + 咨询单/客服/关于；登录门统一带 redirect，登录后回跳原页
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import NightSky from '@/components/NightSky.vue'
import TabBar from '@/components/TabBar.vue'
import DroneLogo from '@/components/DroneLogo.vue'
import WxAuthSheet from '@/components/WxAuthSheet.vue'
import { store, isLoggedIn } from '@/store'
import { beginLogin, beginProfileAuth, logout } from '@/services/auth'
import { getSilent } from '@/utils/request'
import { avatar } from '@/mock/media'

interface Entry {
  key: string
  label: string
  icon: string
}

const ico = (p: string, c = '#4A6CF7') =>
  `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${p}</svg>`

const showAbout = ref(false)
// 进行中的咨询单数量：入口上直接显示，用户不用点进去才知道在等客服
const activeCount = ref(0)

const entries: Entry[] = [
  {
    key: 'PENDING_PAY',
    label: '待支付',
    icon: ico('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>', '#E6A23C'),
  },
  {
    key: 'PENDING_ACCEPT',
    label: '待接单',
    icon: ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>', '#F56C6C'),
  },
  {
    key: 'doing',
    label: '进行中',
    icon: ico(
      '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
      '#4A6CF7',
    ),
  },
  { key: 'done', label: '已完成', icon: ico('<path d="M20 6 9 17l-5-5"/>', '#2BA471') },
]

const user = computed(() => store.user)
const userSub = computed(() => {
  if (!user.value) return '点击登录体验完整流程'
  // 登录只换 openid，昵称头像是用户主动授权后才有的，两种状态要分开说
  return user.value.profileReady ? '微信用户' : '已登录 · 可获取微信头像昵称'
})
const avatarSrc = computed(() => store.user?.avatar || avatar('guest'))
const brandName = computed(() => store.profile?.brand?.appName || '星穹 SkyShow')
const brandShort = computed(() => (store.profile?.brand?.appName || '星穹 SkyShow').split(' ')[0])
const aboutDesc = computed(() => {
  const d = store.profile?.brand?.description || '无人机编队灯光表演一站式预约平台'
  return `${d}。\n本演示前端为 uni-app 工程，可编译 H5 与微信小程序；数据来自本地静态数据。`
})

// 每次进「我的」都刷一次进行中的单：客服刚派单，入口上一眼能看到
function refreshActive() {
  if (!isLoggedIn()) {
    activeCount.value = 0
    return
  }
  getSilent('/consults/active')
    .then((d: { active: Record<string, any> | null }) => {
      activeCount.value = d.active ? 1 : 0
    })
    .catch(() => {
      activeCount.value = 0
    })
}

function goMine() {
  if (!isLoggedIn()) {
    beginLogin('/pages/consult/index')
    return
  }
  uni.navigateTo({ url: '/pages/consult/index' })
}

function goLogin() {
  beginLogin()
}

/** 用户主动唤起微信授权页，只为了拿昵称头像；登录流程从不索取这些 */
function doProfileAuth() {
  beginProfileAuth()
}

function goOrders(tab: string) {
  if (!isLoggedIn()) {
    beginLogin('/pages/order/list?tab=' + tab)
    return
  }
  uni.reLaunch({ url: `/pages/order/list?tab=${tab}` })
}

function contact() {
  uni.showModal({
    title: '联系客服',
    content: '客服热线：400-888-8888\n服务时间：9:00 - 21:00\n（演示环境，模拟拨号）',
    confirmText: '拨打',
    cancelText: '取消',
    success: (r) => {
      if (r.confirm) uni.showToast({ title: '演示环境，模拟拨打', icon: 'none' })
    },
  })
}

function doLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定退出当前账号吗？',
    success: (r) => {
      if (!r.confirm) return
      logout()
      uni.showToast({ title: '已退出', icon: 'success' })
      setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 500)
    },
  })
}

onShow(() => refreshActive())
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
}
.user-head {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 40rpx 36rpx 80rpx;
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
}
.u-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.u-name {
  color: #fff;
  font-size: var(--fs-9);
  font-weight: var(--fw-heavy);
}
.u-sub {
  color: rgba(232, 236, 255, 0.55);
  font-size: var(--fs-2);
}
.login-btn {
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  font-size: var(--fs-3);
  border: none;
  border-radius: 999rpx;
  padding: 12rpx 36rpx;
}
.login-btn::after {
  border: none;
}
.orders-card {
  margin: -50rpx 24rpx 0;
  position: relative;
  z-index: 2;
}
.oc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}
.oc-title {
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
}
.oc-more {
  font-size: var(--fs-3);
  color: var(--text-3);
}
.oc-grid {
  display: flex;
}
.oc-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}
.oc-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 22rpx;
  background: #f6f8ff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.oc-label {
  font-size: var(--fs-3);
  color: var(--text-2);
}
.menu-card {
  margin: 24rpx 24rpx 0;
  padding: 8rpx 28rpx;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--bg-2);
}
.menu-item:last-child {
  border-bottom: none;
}
.m-icon {
  font-size: var(--fs-9);
}
.m-label {
  flex: 1;
  font-size: var(--fs-5);
}
.m-value {
  font-size: var(--fs-3);
  color: var(--text-3);
}
.mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(10, 12, 26, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.about {
  width: 80%;
  max-width: 420px;
  background: #fff;
  border-radius: 28rpx;
  padding: 50rpx 40rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}
.ab-name {
  font-size: var(--fs-8);
  font-weight: var(--fw-heavy);
}
.ab-ver {
  font-size: var(--fs-2);
  color: var(--text-3);
}
.ab-desc {
  font-size: var(--fs-3);
  color: var(--text-2);
  text-align: center;
  line-height: 1.8;
  margin: 16rpx 0;
  white-space: pre-line;
}
.ab-btn {
  width: 100%;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  border: none;
  border-radius: 999rpx;
  font-size: var(--fs-5);
  padding: 18rpx 0;
}
.ab-btn::after {
  border: none;
}
</style>
