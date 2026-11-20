<template>
  <!-- 自定义「微信授权确认」卡：微信的 snsapi_base 授权本身是静默的（跳一下中转页就回来），
       用户点完预约会觉得"怎么什么都没发生"。所以在真正跳转前先用这张卡把「将做什么」讲清楚，
       用户点「允许」才发起授权；点「拒绝」/点遮罩就什么都不做，留在原页面。 -->
  <view v-if="wxSheet.visible" class="wx-mask" @click="deny">
    <view class="wx-card" @click.stop>
      <view class="wx-app">
        <view class="wx-ico">
          <DroneLogo :size="96" color="#4A6CF7" rotor-color="#94ACFF" />
        </view>
        <text class="wx-name">{{ appName }}</text>
        <text class="wx-slogan">{{ slogan }}</text>
      </view>

      <text class="wx-title">{{
        isProfile ? '申请获取你的微信资料' : '申请使用你的微信身份'
      }}</text>
      <text class="wx-desc">{{ desc }}</text>

      <view class="wx-list">
        <view v-for="it in items" :key="it.k" class="wx-row">
          <view class="wx-mark" :class="{ off: !it.on }">
            <view v-if="it.on" class="gck"></view>
            <view v-else class="wx-dash"></view>
          </view>
          <view class="wx-txt">
            <text class="wx-k">{{ it.k }}</text>
            <text class="wx-v">{{ it.v }}</text>
          </view>
        </view>
      </view>

      <text class="wx-hint">{{ hint }}</text>

      <view class="wx-btns">
        <button class="wx-btn ghost" @click="deny">拒绝</button>
        <button class="wx-btn primary" @click="allow">允许</button>
      </view>
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
const slogan = computed(() => store.profile?.brand?.slogan || '无人机编队灯光表演一站式预约平台')

// 一次只申请一件事，逐条列清楚「会拿什么 / 不会拿什么」——用户看得懂才谈得上同意
const items = computed(() =>
  isProfile.value
    ? [
        { on: true, k: '头像、昵称', v: '展示在「我的」页面' },
        { on: false, k: '手机号、好友关系', v: '不获取' },
      ]
    : [
        { on: true, k: '账号标识（openid）', v: '用于识别你的账号、保持登录' },
        { on: false, k: '昵称、头像', v: '不获取，可在「我的」里单独授权' },
      ],
)

const desc = computed(() =>
  isProfile.value
    ? '用于在「我的」里显示你的头像和昵称，不会用于其他用途。'
    : '用于登录。只会拿到你在本公众号下的账号标识，用来认出你，不读取其他微信信息。',
)

const hint = computed(() =>
  isProfile.value
    ? '点「允许」后会短暂跳转微信授权页，随即回到「我的」。'
    : '点「允许」后会短暂跳转微信并立即返回，无需在微信里再次点同意。',
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
.wx-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(12, 16, 34, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  box-sizing: border-box;
}
.wx-card {
  width: 100%;
  max-width: 600rpx;
  background: #fff;
  border-radius: 32rpx;
  padding: 44rpx 36rpx 32rpx;
  box-sizing: border-box;
  box-shadow: 0 24rpx 80rpx rgba(8, 12, 32, 0.35);
}
.wx-app {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28rpx;
}
.wx-ico {
  width: 120rpx;
  height: 120rpx;
  border-radius: 28rpx;
  background: linear-gradient(180deg, #f2f5ff, #e6ecff);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
}
.wx-name {
  font-size: var(--fs-6);
  font-weight: var(--fw-bold);
  color: var(--text-1);
}
.wx-slogan {
  font-size: var(--fs-2);
  color: var(--text-3);
  margin-top: 6rpx;
}
.wx-title {
  display: block;
  font-size: var(--fs-5);
  font-weight: var(--fw-bold);
  color: var(--text-1);
  text-align: center;
  margin-bottom: 10rpx;
}
.wx-desc {
  display: block;
  font-size: var(--fs-3);
  color: var(--text-2);
  line-height: 1.7;
  text-align: center;
  margin-bottom: 24rpx;
}
.wx-list {
  background: var(--bg-2);
  border-radius: 20rpx;
  padding: 8rpx 24rpx;
  margin-bottom: 20rpx;
}
.wx-row {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  padding: 18rpx 0;
}
.wx-row + .wx-row {
  border-top: 2rpx solid var(--line);
}
.wx-mark {
  flex: none;
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  background: rgba(43, 164, 113, 0.12);
  color: var(--success);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 4rpx;
}
.wx-mark.off {
  background: rgba(99, 107, 124, 0.1);
  color: var(--text-4);
}
/* 不获取的项用短横线，和「已获取」的勾形成明确对比；不用 ✕ 字符（部分字体缺字） */
.wx-dash {
  width: 16rpx;
  height: 4rpx;
  border-radius: 2rpx;
  background: currentColor;
}
.wx-txt {
  flex: 1;
  min-width: 0;
}
.wx-k {
  display: block;
  font-size: var(--fs-4);
  color: var(--text-1);
  font-weight: var(--fw-medium);
}
.wx-v {
  display: block;
  font-size: var(--fs-2);
  color: var(--text-3);
  margin-top: 4rpx;
}
.wx-hint {
  display: block;
  font-size: var(--fs-2);
  color: var(--text-3);
  line-height: 1.6;
  text-align: center;
  margin-bottom: 24rpx;
}
.wx-btns {
  display: flex;
  gap: 20rpx;
}
.wx-btn {
  flex: 1;
  border: none;
  border-radius: 999rpx;
  font-size: var(--fs-5);
  font-weight: var(--fw-semibold);
  min-height: 88rpx;
  padding: 0;
  box-sizing: border-box;
}
.wx-btn::after {
  border: none;
}
.wx-btn.ghost {
  background: var(--bg-2);
  color: var(--text-2);
}
.wx-btn.primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  box-shadow: 0 10rpx 24rpx rgba(74, 108, 247, 0.3);
}
</style>
