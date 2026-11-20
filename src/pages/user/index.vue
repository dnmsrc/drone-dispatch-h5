<template>
  <view class="page">
    <NightSky :star-count="40">
      <view class="user-head">
        <!-- 头像本身就是「设置微信头像昵称」的入口：未登录先登录，已登录就弹编辑面板 -->
        <view class="avatar-wrap" @click="onTapAvatar">
          <image class="avatar" :src="avatarSrc" mode="aspectFill" />
          <view v-if="user && !user.profileReady" class="avatar-tip">
            <text class="avatar-tip-txt">设置</text>
          </view>
        </view>
        <view class="u-info">
          <text class="u-name" @click="onTapAvatar">{{ displayName }}</text>
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
      <!-- 头像昵称：微信可能只回脱敏资料，所以入口既给「用微信填」也允许自己改 -->
      <view v-if="user" class="menu-item" @click="openEditor">
        <text class="m-icon">🪪</text>
        <text class="m-label">头像与昵称</text>
        <text class="m-value">{{ user.profileReady ? '去修改 ›' : '去设置 ›' }}</text>
      </view>
      <!-- 账号身份：两条登录通道都只是「认人」的一种方式，缺哪个就在这儿补哪个。
           微信网页授权拿不到手机号，换设备/换浏览器后必须靠这个绑定才回得到同一个账号 -->
      <view v-if="user && !user.phone" class="menu-item" @click="bindPhoneOpen = true">
        <text class="m-icon">📱</text>
        <text class="m-label">绑定手机号</text>
        <text class="m-value">未绑定，去绑定 ›</text>
      </view>
      <view v-if="user && !user.openid" class="menu-item" @click="onBindWechat">
        <text class="m-icon">💬</text>
        <text class="m-label">绑定微信</text>
        <text class="m-value">{{ bindWxHint }}</text>
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
    <BindPhoneDialog
      :visible="bindPhoneOpen"
      @close="bindPhoneOpen = false"
      @bound="onBoundPhone"
    />
    <ProfileEditor
      :visible="editOpen"
      :nickname="user?.nickname"
      :avatar="user?.avatar"
      @close="editOpen = false"
      @save="onSaveProfile"
      @wechat="onWechatInEditor"
    />
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
import ProfileEditor from '@/components/ProfileEditor.vue'
import BindPhoneDialog from '@/components/BindPhoneDialog.vue'
import { store, isLoggedIn, patchUser } from '@/store'
import {
  beginLogin,
  beginProfileAuth,
  beginBindWechat,
  canRealLogin,
  loginMode,
  logout,
} from '@/services/auth'
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
// 头像昵称编辑面板：微信能拿到真实资料就直接用，拿不到就让用户自己给（见 auth.applyProfile）
const editOpen = ref(false)
// 绑定手机号弹窗：账号还缺手机号时才会出现这个入口
const bindPhoneOpen = ref(false)
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
// 未设置资料时不显示后端建档的占位昵称（「微信用户_XXXX」），直接告诉用户这里可以设置
const displayName = computed(() => {
  if (!user.value) return '未登录'
  return user.value.profileReady && user.value.nickname ? user.value.nickname : '点击设置昵称'
})
const userSub = computed(() => {
  if (!user.value) return '点击登录体验完整流程'
  // 副标题只说「这个账号认得哪种身份」，不给「点此设置头像昵称」——
  // 头像上的「设置」角标已经表达过了，两件事堆一行会把 414px 宽的头部挤到换行
  const ids: string[] = []
  if (user.value.openid) ids.push('微信')
  if (user.value.phone) ids.push('手机号 ' + maskPhone(user.value.phone))
  if (!ids.length) return user.value.profileReady ? '已登录' : '已登录 · 点此设置头像昵称'
  return ids.join(' / ')
})
const maskPhone = (p: string) => (p ? p.slice(0, 3) + '****' + p.slice(-4) : '')
// 绑定微信只能从微信内置浏览器发起（网页授权的硬前提）：微信外先说清原因，
// 而不是放一个点下去必然失败的按钮
const bindWxHint = computed(() => {
  if (loginMode() === 'mock') return '未绑定，去绑定 ›'
  return canRealLogin() ? '未绑定，去绑定 ›' : '需在微信中打开'
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

/** 打开编辑面板（菜单入口） */
function openEditor() {
  editOpen.value = true
}

/**
 * 点头像 / 点昵称：先试微信授权（能拿到就一键填上），
 * 微信只回脱敏数据或已经设置过，就直接进手动编辑。
 */
function onTapAvatar() {
  if (!user.value) {
    beginLogin('/pages/user/index')
    return
  }
  if (user.value.profileReady || user.value.profileMasked) {
    editOpen.value = true
    return
  }
  // 浏览器里网页授权根本发起不了（微信只允许在它自己的内置浏览器里授权），
  // 那就别弹一张点完只能提示「请用微信打开」的卡，直接给手动设置
  if (loginMode() === 'real' && !canRealLogin()) {
    editOpen.value = true
    return
  }
  beginProfileAuth()
}

/** 绑定微信：先弹授权确认卡，允许后跳微信授权，回来由 auth.resumeFromCallback 接管 */
function onBindWechat() {
  beginBindWechat()
}

/** 绑定手机号成功：user 已由 auth.applyBind 整体替换（合并时 id 会变成旧账号），这里只关面板 */
function onBoundPhone() {
  bindPhoneOpen.value = false
}

/** 编辑面板里的「用微信资料填充」：先关面板再跳授权，回来由 applyProfile 回填 */
function onWechatInEditor() {
  editOpen.value = false
  beginProfileAuth()
}

/** 保存用户自己设置的头像昵称：这才是他的真实资料，之后不再提示去设置 */
function onSaveProfile(d: { nickname: string; avatar: string }) {
  patchUser({ nickname: d.nickname, avatar: d.avatar, profileReady: true, profileMasked: false })
  editOpen.value = false
  uni.showToast({ title: '已保存', icon: 'success' })
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
.avatar-wrap {
  position: relative;
  /* 可点击：给一点按下反馈，用户才知道头像是个入口 */
  transition: transform 0.15s ease;
}
.avatar-wrap:active {
  transform: scale(0.94);
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  display: block;
}
/* 未取微信资料时的角标：微信绿 = 点这里可以用微信身份换头像昵称 */
.avatar-tip {
  position: absolute;
  right: -8rpx;
  bottom: -8rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #07c160, #06ad56);
  border: 3rpx solid #0b1230;
  line-height: 1.5;
}
.avatar-tip-txt {
  color: #fff;
  font-size: 20rpx;
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
