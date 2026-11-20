<template>
  <!-- 「头像与昵称」编辑面板：微信网页授权能拿到什么不由我们决定（见 auth.applyProfile 的脱敏处理），
       所以真正的兜底是让用户自己给 —— 从相册选头像 + 自己写昵称，存下来就是他自己的真实资料。 -->
  <view v-if="visible" class="pe-mask" @click="close">
    <view class="pe-sheet" @click.stop>
      <view class="pe-bar"></view>
      <view class="pe-head">
        <text class="pe-title">头像与昵称</text>
        <text class="pe-close" @click="close">关闭</text>
      </view>

      <view class="pe-avatar-wrap" @click="pickImage">
        <image class="pe-avatar" :src="draftAvatar || fallbackAvatar" mode="aspectFill" />
        <view class="pe-cam">
          <text class="pe-cam-txt">相册</text>
        </view>
      </view>
      <text class="pe-tip">点头像从相册选一张照片</text>

      <button class="pe-wx" @click="fromWechat">用微信资料填充</button>

      <view class="pe-field">
        <text class="pe-label">昵称</text>
        <input
          v-model="draftName"
          class="pe-input"
          type="text"
          maxlength="16"
          placeholder="输入昵称"
          placeholder-class="pe-ph"
        />
      </view>

      <button class="pe-save" @click="save">保存</button>
    </view>
  </view>
</template>

<script setup lang="ts">
// 只在「我的」页使用；不接后端，头像压成小尺寸 dataURL 与昵称一起写进登录用户（localStorage 持久化）
import { ref, watch } from 'vue'
import { avatar as mockAvatar } from '@/mock/media'

const props = defineProps<{
  visible: boolean
  nickname?: string
  avatar?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', d: { nickname: string; avatar: string }): void
  (e: 'wechat'): void
}>()

const fallbackAvatar = mockAvatar('guest')
const draftName = ref('')
const draftAvatar = ref('')

// 每次打开都用当前账号资料重置，避免上次没保存的草稿串到这次
watch(
  () => props.visible,
  (on) => {
    if (!on) return
    draftName.value = props.nickname || ''
    draftAvatar.value = props.avatar || ''
  },
)

/**
 * H5 选图后拿到的是 blob URL，刷新即失效，必须转成 dataURL 才能存进 localStorage。
 * 缩到 200px 以内再压 jpeg：一张约 8~15KB，量级上够当头像，也不会把本地存储撑爆。
 */
function toDataUrl(src: string, max = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(src) // 小程序端：临时路径直接返回，由后端上传（这里仅演示）
      return
    }
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(src)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('图片读取失败'))
    img.src = src
  })
}

function pickImage() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (r) => {
      const src = String((r.tempFilePaths && r.tempFilePaths[0]) || '')
      if (!src) return
      toDataUrl(src)
        .then((url) => {
          draftAvatar.value = url
        })
        .catch(() => uni.showToast({ title: '图片处理失败，换一张试试', icon: 'none' }))
    },
  })
}

function fromWechat() {
  emit('wechat')
}

function save() {
  const name = draftName.value.trim()
  if (!name) {
    uni.showToast({ title: '请填写昵称', icon: 'none' })
    return
  }
  if (name.length > 16) {
    uni.showToast({ title: '昵称最多 16 个字', icon: 'none' })
    return
  }
  emit('save', { nickname: name, avatar: draftAvatar.value })
}

function close() {
  emit('close')
}
</script>

<style scoped>
.pe-mask {
  position: fixed;
  inset: 0;
  z-index: 320;
  background: rgba(12, 16, 34, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: peFade 0.2s ease both;
}
.pe-sheet {
  width: 100%;
  max-width: 640px;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 16rpx 40rpx calc(28rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  animation: peSlideUp 0.26s cubic-bezier(0.22, 0.8, 0.28, 1) both;
}
@keyframes peFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes peSlideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
.pe-bar {
  width: 72rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: var(--bg-2);
  margin: 0 auto 24rpx;
}
.pe-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.pe-title {
  font-size: var(--fs-7);
  font-weight: var(--fw-heavy);
  color: var(--text-1);
}
.pe-close {
  font-size: var(--fs-3);
  color: var(--text-3);
}
.pe-avatar-wrap {
  position: relative;
  width: 160rpx;
  height: 160rpx;
  margin: 0 auto;
}
.pe-avatar {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: var(--bg-2);
  display: block;
}
/* 头像右下角的「相册」角标：明确告诉用户这里点得动 */
.pe-cam {
  position: absolute;
  right: -4rpx;
  bottom: -4rpx;
  min-width: 48rpx;
  height: 48rpx;
  padding: 0 10rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  border: 4rpx solid #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pe-cam-txt {
  color: #fff;
  font-size: var(--fs-1);
}
.pe-tip {
  display: block;
  text-align: center;
  font-size: var(--fs-2);
  color: var(--text-3);
  margin: 16rpx 0 24rpx;
}
.pe-wx {
  background: rgba(7, 193, 96, 0.1);
  color: #07c160;
  border: none;
  border-radius: 999rpx;
  font-size: var(--fs-4);
  min-height: 84rpx;
  margin-bottom: 24rpx;
}
.pe-wx::after {
  border: none;
}
.pe-field {
  display: flex;
  align-items: center;
  gap: 20rpx;
  background: var(--bg-2);
  border-radius: 20rpx;
  padding: 0 24rpx;
  min-height: 96rpx;
  margin-bottom: 32rpx;
}
.pe-label {
  flex: none;
  font-size: var(--fs-4);
  color: var(--text-2);
}
.pe-input {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-5);
  color: var(--text-1);
  height: 96rpx;
  line-height: 96rpx;
}
.pe-ph {
  color: var(--text-4);
}
.pe-save {
  width: 100%;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  border: none;
  border-radius: 999rpx;
  font-size: var(--fs-5);
  font-weight: var(--fw-semibold);
  min-height: 92rpx;
  box-shadow: 0 10rpx 24rpx rgba(74, 108, 247, 0.3);
}
.pe-save::after {
  border: none;
}
</style>
