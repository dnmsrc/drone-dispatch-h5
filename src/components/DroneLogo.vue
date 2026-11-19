<template>
  <!-- 四旋翼无人机 SVG -->
  <view
    class="drone-wrap"
    :class="{ float: props.float }"
    :style="{ width: props.size + 'rpx', height: props.size * 0.62 + 'rpx' }"
  >
    <svg
      viewBox="0 0 200 124"
      :width="'100%'"
      :height="'100%'"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- 机臂 -->
      <line
        x1="52"
        y1="42"
        x2="148"
        y2="82"
        :stroke="props.color"
        stroke-width="7"
        stroke-linecap="round"
        opacity="0.9"
      />
      <line
        x1="148"
        y1="42"
        x2="52"
        y2="82"
        :stroke="props.color"
        stroke-width="7"
        stroke-linecap="round"
        opacity="0.9"
      />
      <!-- 旋翼 -->
      <g class="rotor" style="transform-origin: 52px 40px">
        <ellipse cx="52" cy="38" rx="30" ry="7" :fill="props.rotorColor" opacity="0.55" />
        <circle cx="52" cy="40" r="7" :fill="props.color" />
      </g>
      <g class="rotor r2" style="transform-origin: 148px 40px">
        <ellipse cx="148" cy="38" rx="30" ry="7" :fill="props.rotorColor" opacity="0.55" />
        <circle cx="148" cy="40" r="7" :fill="props.color" />
      </g>
      <g class="rotor r3" style="transform-origin: 52px 84px">
        <ellipse cx="52" cy="86" rx="30" ry="7" :fill="props.rotorColor" opacity="0.55" />
        <circle cx="52" cy="84" r="7" :fill="props.color" />
      </g>
      <g class="rotor r4" style="transform-origin: 148px 84px">
        <ellipse cx="148" cy="86" rx="30" ry="7" :fill="props.rotorColor" opacity="0.55" />
        <circle cx="148" cy="84" r="7" :fill="props.color" />
      </g>
      <!-- 机身 -->
      <rect x="76" y="48" width="48" height="28" rx="14" :fill="props.color" />
      <circle cx="100" cy="62" r="8" :fill="props.light" />
      <circle cx="100" cy="62" r="13" :fill="props.light" opacity="0.25" />
      <!-- 光点 -->
      <circle cx="100" cy="100" r="4" :fill="props.light" opacity="0.9" />
      <circle cx="100" cy="112" r="2.5" :fill="props.light" opacity="0.5" />
    </svg>
  </view>
</template>

<script setup lang="ts">
// 默认值必须走 withDefaults，不能用「解构默认值」写法：
// uni 当前版本的 Vue 编译器没有启用 props 解构默认值回填，未显式传参时颜色会变成 undefined，
// 结果 fill/stroke 属性被整个移除 —— 表现为「logo 渲染成一个空白方块」（2026-11-19 登录页发现）。
const props = withDefaults(
  defineProps<{
    size?: number
    color?: string
    rotorColor?: string
    light?: string
    float?: boolean
  }>(),
  {
    size: 160,
    color: '#4A6CF7',
    rotorColor: '#9DB4FF',
    light: '#3DE0C0',
    float: true,
  },
)
</script>

<style scoped>
.drone-wrap {
  display: inline-block;
}
.drone-wrap.float {
  animation: hover 3.2s ease-in-out infinite;
}
@keyframes hover {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-14rpx);
  }
}
.rotor {
  animation: spin 0.6s linear infinite;
}
.rotor.r2 {
  animation-delay: 0.1s;
}
.rotor.r3 {
  animation-delay: 0.2s;
}
.rotor.r4 {
  animation-delay: 0.3s;
}
@keyframes spin {
  from {
    transform: rotate(0deg) scaleX(1);
  }
  50% {
    transform: rotate(180deg) scaleX(0.85);
  }
  to {
    transform: rotate(360deg) scaleX(1);
  }
}
</style>
