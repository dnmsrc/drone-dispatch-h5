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
      <!-- ① 微信授权通道（只在微信内出现）：能调起微信授权就走这条，用户点「允许」即登录 -->
      <block v-if="view === 'wx'">
        <!-- 真实模式：点一次 → 微信授权页 → 用户点「允许」→ 自动登录并回到刚才的页面 -->
        <button v-if="realMode" class="wx-btn" :disabled="loading" @click="startReal">
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
        <text v-if="realMode" class="hint"
          >点击后跳转微信授权页，同意即自动登录，并回到刚才的页面</text
        >

        <!-- 模拟模式：没有公众号资质时用，演示「用户点允许 → 自动登录」的完整交互 -->
        <view v-else class="mock-card">
          <view class="auth-head">
            <view class="auth-logo"><DroneLogo :size="86" :float="false" /></view>
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

        <view class="alt" @click="view = 'sms'">
          <text class="alt-text">使用手机号登录</text>
        </view>
      </block>

      <!-- ② 手机号验证码通道：微信外默认走这条（网页授权必须在微信内置浏览器发起）；微信内也可切换 -->
      <view v-else class="sms-card">
        <text class="sms-title">手机号登录</text>
        <text class="sms-sub">
          {{
            inWechat
              ? '不用微信授权，用手机号 + 验证码也能登录'
              : '当前不在微信内，微信授权登录需要在微信中打开；这里可以直接用手机号登录'
          }}
        </text>
        <view class="field">
          <input
            v-model="phone"
            class="input"
            type="number"
            maxlength="11"
            placeholder="请输入手机号"
            placeholder-class="ph"
          />
        </view>
        <view class="field">
          <input
            v-model="code"
            class="input"
            type="number"
            maxlength="6"
            placeholder="6 位验证码"
            placeholder-class="ph"
          />
          <text class="send" :class="{ disabled: counting }" @click="sendCode">
            {{ counting ? countdown + 's 后重发' : '获取验证码' }}
          </text>
        </view>
        <button class="sms-btn" :disabled="!canSubmit" @click="submitSms">
          {{ submitting ? '登录中…' : '登录' }}
        </button>
        <text v-if="demoCode" class="sms-note">演示环境：验证码固定为 {{ demoCode }}</text>
        <view v-if="inWechat" class="alt" @click="view = 'wx'">
          <text class="alt-text">返回微信授权登录</text>
        </view>
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
// 登录页：两条通道，按环境自动决定首屏形态（不靠人工切换）
// ① 微信内：能调起微信授权就展示授权入口 —— real 点按钮跳微信授权页，mock 展示模拟授权卡；
// ② 手机号验证码：微信外默认走这条（网页授权只能在微信内置浏览器发起），微信内也可切换过来。
// 两条通道登录成功后的收尾一致：写登录态 → jumpAfterLogin(redirect)。
import { computed, onUnmounted, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import NightSky from '@/components/NightSky.vue'
import DroneLogo from '@/components/DroneLogo.vue'
import { store } from '@/store'
import { get } from '@/utils/request'
import { avatar } from '@/mock/media'
import { isWeixin } from '@/utils/wechat'
import {
  beginLogin,
  completeMockLogin,
  isValidPhone,
  jumpAfterLogin,
  loginMode,
  loginWithSms,
  sendSmsCode,
} from '@/services/auth'

const inWechat = isWeixin()
const realMode = loginMode() === 'real'
const loading = ref(false)
const redirect = ref('')
const demoAvatar = avatar('wechat-demo')

// 首屏形态：微信内先给微信授权；微信外只能手机号（页面加载即判定一次，不在两种形态间来回跳）
const view = ref<'wx' | 'sms'>(inWechat ? 'wx' : 'sms')

// ── 手机号验证码通道状态 ──
const phone = ref('')
const code = ref('')
const submitting = ref(false)
const counting = ref(false)
const countdown = ref(0)
const demoCode = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const brandName = computed(() => store.profile?.brand?.appName || '星穹 SkyShow')
const canSubmit = computed(
  () => isValidPhone(phone.value) && code.value.length === 6 && !submitting.value,
)

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
  // 登录页本身就是登录 UI（用户已经点了「微信登录」），不再叠自己的授权确认卡
  beginLogin(redirect.value || '/pages/index/index', { confirm: false })
}

function allow() {
  loading.value = true
  completeMockLogin()
    .then((d) => {
      uni.showToast({ title: d.merged ? '已登录你之前的账号' : '登录成功', icon: 'success' })
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

// 手机号通道：先发码再登录，与真实短信接口同一套交互（60s 倒计时）
function sendCode() {
  if (counting.value) return
  if (!isValidPhone(phone.value)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
    return
  }
  sendSmsCode(phone.value)
    .then((d) => {
      demoCode.value = d.demoCode || ''
      uni.showToast({
        title: d.demoCode ? '演示验证码：' + d.demoCode : '验证码已发送',
        icon: 'none',
        duration: 2500,
      })
      startCountdown(d.ttl || 60)
    })
    .catch(() => {
      /* request 层已提示失败原因 */
    })
}

function startCountdown(sec: number) {
  stopCountdown()
  counting.value = true
  countdown.value = sec
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) stopCountdown()
  }, 1000)
}

function stopCountdown() {
  counting.value = false
  countdown.value = 0
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function submitSms() {
  if (!canSubmit.value) return
  submitting.value = true
  loginWithSms(phone.value, code.value)
    .then((d) => {
      uni.showToast({ title: d.merged ? '已登录你之前的账号' : '登录成功', icon: 'success' })
      setTimeout(() => jumpAfterLogin(redirect.value || '/pages/index/index'), 400)
    })
    .catch(() => {
      /* request 层已提示失败原因 */
    })
    .finally(() => {
      submitting.value = false
    })
}

onUnmounted(stopCountdown)
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
  width: 108rpx;
  height: 108rpx;
  border-radius: 26rpx;
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

/* 手机号验证码卡（微信外默认 / 微信内备选） */
.sms-card {
  width: 100%;
  background: var(--card);
  border-radius: 32rpx;
  box-shadow: var(--shadow);
  padding: 44rpx 36rpx 30rpx;
  display: flex;
  flex-direction: column;
}
.sms-title {
  font-size: var(--fs-7);
  font-weight: var(--fw-bold);
}
.sms-sub {
  margin-top: 12rpx;
  font-size: var(--fs-2);
  color: var(--text-3);
  line-height: 1.7;
}
.field {
  margin-top: 26rpx;
  display: flex;
  align-items: center;
  height: 96rpx;
  padding: 0 24rpx;
  border-radius: 18rpx;
  background: var(--bg);
}
.input {
  flex: 1;
  height: 100%;
  font-size: var(--fs-5);
  color: var(--text-2);
}
.ph {
  color: var(--text-4);
}
.send {
  flex: none;
  padding-left: 20rpx;
  font-size: var(--fs-3);
  color: var(--primary);
}
.send.disabled {
  color: var(--text-4);
}
.sms-btn {
  margin-top: 32rpx;
  width: 100%;
  border: none;
  border-radius: 999rpx;
  padding: 22rpx 0;
  background: linear-gradient(135deg, #4a6cf7 0%, #6c8bff 100%);
  color: #fff;
  font-size: var(--fs-6);
  font-weight: var(--fw-semibold);
  box-shadow: 0 10rpx 24rpx rgba(74, 108, 247, 0.32);
}
.sms-btn::after {
  border: none;
}
.sms-btn[disabled] {
  background: var(--bg-2);
  color: var(--text-4);
  box-shadow: none;
}
.sms-note {
  margin-top: 20rpx;
  font-size: var(--fs-1);
  color: var(--text-4);
  text-align: center;
}
.alt {
  margin-top: 30rpx;
  display: flex;
  justify-content: center;
}
.alt-text {
  font-size: var(--fs-3);
  color: var(--text-3);
  text-decoration: underline;
}
</style>
