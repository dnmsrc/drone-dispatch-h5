<template>
  <!-- 授权确认（底部弹出）：微信的 snsapi_base 授权本身是静默的（跳一下中转页就回来），
       用户点完预约会觉得"怎么什么都没发生"。所以在真正跳转前用这张底部卡只讲一件事
       「要用你的微信身份登录」，点「允许」才发起授权，点「取消」/点遮罩留在原页面。
       刻意不放权限清单：登录只拿一个账号标识，列一堆「不获取什么」反而增加阅读负担。 -->
  <view v-if="wxSheet.visible" class="wx-mask" @click="deny">
    <view class="wx-sheet" @click.stop>
      <view class="wx-bar"></view>

      <view class="wx-head">
        <view class="wx-ico">
          <DroneLogo :size="72" color="#4A6CF7" rotor-color="#94ACFF" />
        </view>
        <view class="wx-head-txt">
          <text class="wx-title">{{ isProfile ? '获取微信资料' : '授权登录' }}</text>
          <text class="wx-sub">{{ appName }}</text>
        </view>
      </view>

      <text class="wx-desc">{{ desc }}</text>

      <button class="wx-btn primary" @click="allow">
        {{ isProfile ? '允许获取' : '允许登录' }}
      </button>
      <button class="wx-btn ghost" @click="deny">取消</button>
    </view>
  </view>
</template>

<script setup lang="ts">
// 挂在需要登录/预约的页面里（页面模板末尾一行 <WxAuthSheet />），可见性由 services/wxAuthSheet 的单例驱动
import { computed, onMounted, onUnmounted } from 'vue'
import DroneLogo from '@/components/DroneLogo.vue'
import { store } from '@/store'
import { wxSheet, settleWxAuth, registerWxSheet } from '@/services/wxAuthSheet'

const isProfile = computed(() => wxSheet.intent === 'profile')
const appName = computed(() => store.profile?.brand?.appName || '星穹 SkyShow')

// 一句话说清这次点「允许」会发生什么，不做权限罗列
const desc = computed(() =>
  isProfile.value
    ? '微信会跳转一次确认页，把返回的资料填到「我的」里。'
    : '将识别你的微信账号用于登录，不会读取聊天、好友等其他信息。',
)

// 在服务层登记一次挂载：没有页面挂载时它会退化成系统弹窗，不会让确认卡丢失
onMounted(() => registerWxSheet(1))
onUnmounted(() => registerWxSheet(-1))

function allow() {
  settleWxAuth(true)
}

function deny() {
  settleWxAuth(false)
}
</script>

<style scoped>
/* 底部弹出：遮罩淡入 + 面板上滑。用 keyframes 而不是 <transition>，小程序端也能跑 */
.wx-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(12, 16, 34, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: wxFade 0.2s ease both;
}
.wx-sheet {
  width: 100%;
  max-width: 640px;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 16rpx 40rpx calc(28rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  animation: wxSlideUp 0.26s cubic-bezier(0.22, 0.8, 0.28, 1) both;
}
@keyframes wxFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes wxSlideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
/* 顶部拖拽指示条：让用户一眼明白这是从底部升起的浮层 */
.wx-bar {
  width: 72rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: var(--bg-2);
  margin: 0 auto 28rpx;
}
.wx-head {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 20rpx;
}
.wx-ico {
  flex: none;
  width: 96rpx;
  height: 96rpx;
  border-radius: 24rpx;
  background: linear-gradient(180deg, #f2f5ff, #e6ecff);
  display: flex;
  align-items: center;
  justify-content: center;
}
.wx-head-txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.wx-title {
  font-size: var(--fs-7);
  font-weight: var(--fw-heavy);
  color: var(--text-1);
}
.wx-sub {
  font-size: var(--fs-2);
  color: var(--text-3);
}
.wx-desc {
  display: block;
  font-size: var(--fs-3);
  color: var(--text-2);
  line-height: 1.7;
  margin-bottom: 32rpx;
}
.wx-btn {
  border: none;
  border-radius: 999rpx;
  font-size: var(--fs-5);
  font-weight: var(--fw-semibold);
  min-height: 92rpx;
  padding: 0;
  box-sizing: border-box;
}
.wx-btn::after {
  border: none;
}
.wx-btn.primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  box-shadow: 0 10rpx 24rpx rgba(74, 108, 247, 0.3);
}
.wx-btn.ghost {
  margin-top: 8rpx;
  background: transparent;
  color: var(--text-3);
  font-weight: var(--fw-medium);
  min-height: 76rpx;
}
</style>
