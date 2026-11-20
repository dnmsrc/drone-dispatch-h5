<template>
  <!-- 绑定手机号（底部弹出，与微信授权卡同一套视觉）：
       背景 —— 微信网页授权拿不到手机号，「本机记住上次身份」又只在同一个浏览器环境里有效，
       换手机 / 换浏览器（微信内外是两个存储环境）就会变成另一个人。用户主动把手机号
       绑到当前账号上，才算真正「一个账号两种登录方式」。 -->
  <view v-if="visible" class="bp-mask" @click="close">
    <view class="bp-sheet" @click.stop>
      <view class="bp-bar"></view>

      <text class="bp-title">绑定手机号</text>
      <text class="bp-desc">绑定后，用这个手机号在别的手机或浏览器里也能登录回这个账号。</text>

      <view class="bp-field">
        <text class="bp-prefix">+86</text>
        <input
          v-model="phone"
          class="bp-input"
          type="number"
          :maxlength="11"
          placeholder="请输入手机号"
          placeholder-class="bp-ph"
        />
      </view>

      <view class="bp-field">
        <input
          v-model="code"
          class="bp-input"
          type="number"
          :maxlength="6"
          placeholder="短信验证码"
          placeholder-class="bp-ph"
        />
        <text class="bp-send" :class="{ off: counting || !phoneValid }" @click="send">
          {{ counting ? countdown + 's 后重发' : '获取验证码' }}
        </text>
      </view>

      <button class="bp-btn primary" :disabled="!canSubmit" @click="submit">
        {{ submitting ? '绑定中…' : '确认绑定' }}
      </button>
      <button class="bp-btn ghost" @click="close">取消</button>
    </view>
  </view>
</template>

<script setup lang="ts">
// 只负责「输入手机号 + 验证码」这一段交互，绑定请求与结果提示都在 services/auth（bindPhone）
import { computed, onUnmounted, ref, watch } from 'vue'
import { bindPhone, isValidPhone, sendSmsCode } from '@/services/auth'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'bound'): void }>()

const phone = ref('')
const code = ref('')
const submitting = ref(false)
const counting = ref(false)
const countdown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const phoneValid = computed(() => isValidPhone(phone.value))
const canSubmit = computed(() => phoneValid.value && code.value.length === 6 && !submitting.value)

// 每次打开都是新的一次绑定：清空上次的输入与倒计时，避免拿旧验证码去提交
watch(
  () => props.visible,
  (v) => {
    if (!v) return
    phone.value = ''
    code.value = ''
    submitting.value = false
    stopCountdown()
  },
)

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

function send() {
  if (counting.value) return
  if (!phoneValid.value) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
    return
  }
  sendSmsCode(phone.value)
    .then((d) => {
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

function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  bindPhone(phone.value, code.value)
    .then(() => {
      // 成功提示由 auth.applyBind 统一发（含「已合并到你之前的账号」）
      emit('bound')
      emit('close')
    })
    .catch(() => {
      /* request 层已提示失败原因 */
    })
    .finally(() => {
      submitting.value = false
    })
}

function close() {
  emit('close')
}

onUnmounted(stopCountdown)
</script>

<style scoped>
.bp-mask {
  position: fixed;
  inset: 0;
  z-index: 320;
  background: rgba(12, 16, 34, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: bpFade 0.2s ease both;
}
.bp-sheet {
  width: 100%;
  max-width: 640px;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 16rpx 40rpx calc(28rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  animation: bpSlideUp 0.26s cubic-bezier(0.22, 0.8, 0.28, 1) both;
}
.bp-bar {
  width: 72rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: #e3e7f1;
  margin: 0 auto 24rpx;
}
@keyframes bpFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes bpSlideUp {
  from {
    transform: translateY(30%);
  }
  to {
    transform: translateY(0);
  }
}
.bp-title {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #1b2340;
}
.bp-desc {
  display: block;
  margin: 12rpx 0 28rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #7b849c;
}
.bp-field {
  display: flex;
  align-items: center;
  height: 96rpx;
  padding: 0 24rpx;
  margin-bottom: 20rpx;
  border-radius: 20rpx;
  background: #f5f7fb;
}
.bp-prefix {
  font-size: 28rpx;
  color: #4a5470;
  padding-right: 16rpx;
  border-right: 1rpx solid #e3e7f1;
  margin-right: 20rpx;
}
.bp-input {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
  color: #1b2340;
}
.bp-ph {
  color: #a9b0c2;
}
.bp-send {
  font-size: 26rpx;
  color: #4a6cf7;
  padding-left: 20rpx;
  white-space: nowrap;
}
.bp-send.off {
  color: #a9b0c2;
}
.bp-btn {
  width: 100%;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 46rpx;
  font-size: 30rpx;
  margin-top: 16rpx;
}
.bp-btn.primary {
  background: #4a6cf7;
  color: #fff;
}
.bp-btn.primary[disabled] {
  background: #c9d3f2;
  color: #fff;
}
.bp-btn.ghost {
  background: transparent;
  color: #7b849c;
  font-size: 28rpx;
}
.bp-btn::after {
  border: none;
}
</style>
