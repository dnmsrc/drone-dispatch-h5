<template>
  <view class="page">
    <NightSky :star-count="60">
      <view class="login-hero">
        <DroneLogo :size="190" color="#7E97FF" rotor-color="#A9BCFF" light="#3DE0C0" />
        <text class="title">{{ brandName }}</text>
        <text class="sub">把夜空，变成你的舞台</text>
      </view>
    </NightSky>

    <view class="panel">
      <!-- ① 微信内 + 真实授权：点一次 → 微信授权页 → 用户点「允许」→ 自动登录并回到刚才的页面 -->
      <block v-if="inWechat && realMode">
        <button class="wx-btn" :disabled="loading" @click="startReal">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="#fff"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8.7 4C4.9 4 2 6.6 2 9.8c0 1.8 1 3.4 2.5 4.5l-.6 2 2.2-1.1c.7.2 1.4.3 2.1.3h.5A6 6 0 0 1 10 14c0-3.2 3-5.7 6.6-5.7h.4C16.3 5.7 12.9 4 8.7 4Zm-2 3.2a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM22 14.2c0-2.7-2.5-4.9-5.6-4.9s-5.6 2.2-5.6 4.9 2.5 4.9 5.6 4.9c.6 0 1.2-.1 1.8-.3l1.9 1-.5-1.8c1.4-1 2.4-2.3 2.4-3.8Zm-7.5-1.4a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm3.8 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z"
            />
          </svg>
          <text>{{ loading ? '正在唤起微信授权…' : '微信授权登录' }}</text>
        </button>
        <text class="hint">点击后跳转微信授权页，同意即自动登录，并回到刚才的页面</text>
      </block>

      <!-- ② 微信内 + 模拟授权：没有公众号资质时用，演示「用户点允许 → 自动登录」的完整交互 -->
      <view v-else-if="inWechat" class="mock-card">
        <view class="auth-head">
          <view class="auth-logo"><DroneLogo :size="56" :float="false" /></view>
          <text class="auth-title">{{ brandName }} 申请</text>
          <text class="auth-sub">获取你的昵称、头像</text>
        </view>
        <view class="auth-user">
          <image class="auth-avatar" :src="demoAvatar" mode="aspectFill" />
          <view class="auth-userinfo">
            <text class="auth-nick">微信用户（模拟）</text>
            <text class="auth-tip">微信个人信息</text>
          </view>
        </view>
        <view class="auth-btns">
          <button class="btn deny" @click="deny">拒绝</button>
          <button class="btn allow" :disabled="loading" @click="allow">
            {{ loading ? '登录中…' : '允许' }}
          </button>
        </view>
        <text class="auth-note">演示模式 · 模拟微信网页授权，不会真的读取你的微信资料</text>
      </view>

      <!-- ③ 微信外：本系统只支持微信内登录，引导扫码 -->
      <view v-else class="scan-card">
        <text class="scan-title">请用微信扫码打开</text>
        <text class="scan-desc">
          本系统仅支持在微信内登录。请用手机微信扫描预约二维码进入，或复制下方链接后在微信中打开。
        </text>
        <button class="btn-copy" @click="copyLink">复制当前链接</button>
        <button class="btn-back" @click="goHome">先随便看看</button>
      </view>

      <view class="agree">
        <text>登录即代表同意</text>
        <text class="link">《用户协议》</text>
        <text>与</text>
        <text class="link">《隐私政策》</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
// 登录页（三种角色，由环境和配置决定，不靠人工切换）：
// ① 微信内 + real：真实微信网页授权（OAuth2），用户点「允许」后由 App.onLaunch 处理 code 回跳；
// ② 微信内 + mock：模拟授权层，本地/演示/自动化跑完整「同意即登录」；
// ③ 微信外：提示扫码（网页授权只能在微信内置浏览器里发起）。
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import NightSky from '@/components/NightSky.vue'
import DroneLogo from '@/components/DroneLogo.vue'
import { store } from '@/store'
import { get } from '@/utils/request'
import { avatar } from '@/mock/media'
import { isWeixin } from '@/utils/wechat'
import { beginLogin, completeMockLogin, jumpAfterLogin, loginMode } from '@/services/auth'

const inWechat = isWeixin()
const realMode = loginMode() === 'real'
const loading = ref(false)
const redirect = ref('')
const demoAvatar = avatar('wechat-demo')

const brandName = computed(() => store.profile?.brand?.appName || '星穹 SkyShow')

onShow(() => {
  if (!store.profile) {
    get<Record<string, any>>('/config/profile')
      .then((d) => {
        store.profile = d
      })
      .catch(() => {})
  }
})

// 登录后回跳：登录门把「登录完该回到哪」带过来（requireLogin / 401 跳转都会带）；
// 不带 redirect 时回首页（此时页面栈里没有上一页可退的场景更常见，比如扫码后落在登录页）
onLoad((opts) => {
  redirect.value = opts && opts.redirect ? decodeURIComponent(opts.redirect as string) : ''
})

function startReal() {
  loading.value = true
  beginLogin(redirect.value || '/pages/index/index', { fromClick: true })
}

function allow() {
  loading.value = true
  completeMockLogin()
    .then(() => {
      uni.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => jumpAfterLogin(redirect.value || '/pages/index/index'), 400)
    })
    .catch(() => {
      /* request 层已提示失败原因 */
    })
    .finally(() => {
      loading.value = false
    })
}

function deny() {
  uni.showToast({ title: '你已拒绝授权，可随时重新登录', icon: 'none' })
  setTimeout(() => {
    uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
  }, 700)
}

function linkOf(): string {
  try {
    if (typeof window !== 'undefined' && window.location) return window.location.href
  } catch {
    /* ignore */
  }
  return ''
}

function copyLink() {
  const url = linkOf()
  if (!url) {
    uni.showToast({ title: '请复制浏览器地址栏里的链接', icon: 'none' })
    return
  }
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: '已复制，请到微信中打开', icon: 'none' }),
  })
}

function goHome() {
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
}
.login-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0 110rpx;
}
.title {
  color: #fff;
  font-size: var(--fs-11);
  font-weight: var(--fw-heavy);
  letter-spacing: 4rpx;
  margin-top: 36rpx;
}
.sub {
  color: rgba(232, 236, 255, 0.6);
  font-size: var(--fs-3);
  margin-top: 10rpx;
  letter-spacing: 2rpx;
}
.panel {
  padding: 50rpx 60rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.wx-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  background: #07c160;
  color: #fff;
  font-size: var(--fs-7);
  font-weight: var(--fw-semibold);
  border-radius: 999rpx;
  padding: 24rpx 0;
  border: none;
  box-shadow: 0 10rpx 26rpx rgba(7, 193, 96, 0.35);
}
.wx-btn::after {
  border: none;
}
.hint {
  margin-top: 22rpx;
  font-size: var(--fs-2);
  color: var(--text-3);
  text-align: center;
  line-height: 1.6;
}
.agree {
  margin-top: 28rpx;
  font-size: var(--fs-2);
  color: var(--text-3);
  text-align: center;
}
.link {
  color: var(--primary);
}

/* 模拟授权卡（微信内 + mock） */
.mock-card {
  width: 100%;
  background: var(--card);
  border-radius: 32rpx;
  box-shadow: var(--shadow);
  padding: 44rpx 36rpx 34rpx;
}
.auth-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.auth-logo {
  width: 96rpx;
  height: 96rpx;
  border-radius: 24rpx;
  background: #eef2ff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8rpx;
}
.auth-title {
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
}
.auth-sub {
  font-size: var(--fs-3);
  color: var(--text-3);
}
.auth-user {
  margin-top: 36rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: var(--bg);
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.auth-avatar {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
}
.auth-userinfo {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.auth-nick {
  font-size: var(--fs-5);
  font-weight: var(--fw-semibold);
}
.auth-tip {
  font-size: var(--fs-2);
  color: var(--text-3);
}
.auth-btns {
  display: flex;
  gap: 24rpx;
  margin-top: 40rpx;
}
.btn {
  flex: 1;
  border-radius: 999rpx;
  font-size: var(--fs-6);
  font-weight: var(--fw-semibold);
  padding: 20rpx 0;
  border: none;
}
.btn::after {
  border: none;
}
.btn.deny {
  background: var(--bg-2);
  color: var(--text-2);
}
.btn.allow {
  background: #07c160;
  color: #fff;
  box-shadow: 0 8rpx 20rpx rgba(7, 193, 96, 0.3);
}
.auth-note {
  display: block;
  text-align: center;
  font-size: var(--fs-1);
  color: var(--text-4);
  margin-top: 26rpx;
}

/* 扫码引导卡（微信外） */
.scan-card {
  width: 100%;
  background: var(--card);
  border-radius: 32rpx;
  box-shadow: var(--shadow);
  padding: 44rpx 36rpx 34rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.scan-title {
  font-size: var(--fs-7);
  font-weight: var(--fw-bold);
}
.scan-desc {
  margin-top: 18rpx;
  font-size: var(--fs-3);
  color: var(--text-3);
  line-height: 1.7;
  text-align: center;
}
.btn-copy {
  margin-top: 36rpx;
  width: 100%;
  background: #07c160;
  color: #fff;
  font-size: var(--fs-6);
  font-weight: var(--fw-semibold);
  border-radius: 999rpx;
  padding: 20rpx 0;
  border: none;
}
.btn-copy::after {
  border: none;
}
.btn-back {
  margin-top: 20rpx;
  width: 100%;
  background: var(--bg-2);
  color: var(--text-2);
  font-size: var(--fs-6);
  border-radius: 999rpx;
  padding: 20rpx 0;
  border: none;
}
.btn-back::after {
  border: none;
}
</style>
