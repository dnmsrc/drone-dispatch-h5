<script lang="ts">
import type { ProfileConfig } from '@/mock/types'
import { store } from '@/store'
import { getProfile } from '@/services/config'

export default {
  onLaunch() {
    // 用户态先按本地缓存恢复；静态页阶段的"登录"只写本地 Mock 用户，不换真实 token
    try {
      store.user = uni.getStorageSync('user') || null
    } catch {
      store.user = null
    }
    // 品牌档案（业务名 / slogan）由 Mock 数据驱动：换业务时只改 Mock，不改页面文案
    getProfile().then((d: ProfileConfig) => {
      store.profile = d
    })
  },
}
</script>

<style>
/* ===== 全局设计变量（基线来自 drone-dispatch-prototype/h5/src/App.vue，取值不得随意改动） ===== */
:root,
page {
  --primary: #4a6cf7;
  --primary-deep: #3553c8;
  --primary-2: #6c8bff; /* 主按钮渐变的第二色，和 --primary 同族 */
  --cyan: #3de0c0;
  --night-1: #141b3d;
  --night-2: #0b1026;
  --bg: #f6f7fb;
  --bg-2: #f2f3f9; /* 内嵌浅块、分段选项底 */
  --card: #ffffff;
  --text-1: #1a1d2e;
  --text-2: #5a6072;
  --text-3: #636b7c; /* 次要文字：白底 5.2:1 / 浅灰底 4.7:1，满足 WCAG AA 正文 4.5:1 */
  --text-4: #c9cede; /* 占位、时间戳、禁用态 */
  --line: #eceef5;
  --success: #2ba471;
  --danger: #f56c6c;
  --warn: #e6a23c;

  /* 步骤条语言：没保存过的 = 灰、保存过的（当前之前）= 绿、当前 = 蓝；
     当前之后的步骤一律灰 —— 它只是"还没走到"。走过的路用蓝色流动虚线，方向朝当前步。 */
  --step-idle-line: #e4e7f1;
  --step-idle-text: #9aa0b5;
  --step-accent: var(--primary);
  --step-accent-soft: rgba(74, 108, 247, 0.12);
  --step-accent-line: rgba(74, 108, 247, 0.55);
  --step-saved: var(--success);
  --step-saved-soft: rgba(43, 164, 113, 0.1);
  --step-saved-line: rgba(43, 164, 113, 0.42);
  --step-dash: #e4e7f1;
  --step-flow: var(--primary);
  --step-flow-soft: rgba(74, 108, 247, 0.22);

  /* 字号阶梯（12 档，按尺寸升序）：新代码只允许消费这些档位，不再散写 rpx 字号 */
  --fs-1: 20rpx; /* 时间戳 / 注脚 / 小标签 */
  --fs-2: 22rpx; /* 次要说明、标签（步骤条标签、点内数字） */
  --fs-3: 24rpx; /* 小正文 */
  --fs-4: 26rpx; /* 正文（表单、列表项、键值行） */
  --fs-5: 28rpx; /* 基准正文（page 已用） */
  --fs-6: 30rpx; /* 小标题、按钮文字 */
  --fs-7: 32rpx; /* 卡片标题、大按钮 */
  --fs-8: 34rpx; /* 强调数字、档位数字 */
  --fs-9: 36rpx; /* 图标、页面主标题 */
  --fs-10: 40rpx; /* 金额、结算总价 */
  --fs-11: 44rpx; /* 大数字、slogan、登录标题 */
  --fs-12: 64rpx; /* 收银台 / 退款页的金额特写 */

  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;
  --fw-heavy: 800;

  --radius: 24rpx;
  --shadow: 0 8rpx 30rpx rgba(26, 29, 46, 0.06);
}

page {
  background: var(--bg);
  color: var(--text-1);
  font-family:
    -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei',
    sans-serif;
  font-size: var(--fs-5);
  line-height: 1.5;
}

view,
text,
scroll-view,
swiper,
button,
input,
textarea,
image {
  box-sizing: border-box;
}

/* 勾选标记统一用 CSS 画，不用 ✓(U+2713) 字符：该字符在不少系统字体里缺字，
   渲染出来是一个「?」，会把勾选框里本该是勾的位置压成一个白色问号。
   用 currentColor，任何勾选态直接套，无需每页再写一份。 */
.gck {
  flex: none;
  width: 15rpx;
  height: 9rpx;
  border-left: 3rpx solid currentColor;
  border-bottom: 3rpx solid currentColor;
  transform: rotate(-45deg);
}

/* H5 输入组件兜底：uni-input/uni-textarea 是自定义元素，内部原生控件靠 100% 高度继承，
   宿主没有显式高度时会塌缩为 0（表现为点击无法输入）。统一给一个最小内容高度。 */
uni-input,
uni-textarea {
  display: block;
  box-sizing: border-box;
}
uni-input .uni-input-input,
uni-textarea .uni-textarea-textarea {
  min-height: 48rpx;
}
/* uni 基础样式表给 uni-textarea 设了 width:300px；页面只设 padding 与背景时宽度停在 300px。
   用属性选择器（特异性 0,0,1,1）压过基础表，不再依赖样式表插入顺序。 */
uni-textarea[class] {
  width: 100%;
}

/* H5 按钮兜底：uni-button 自带 margin-left/right: auto，在 flex 容器里会阻止交叉轴拉伸，
   使按钮收缩成内容宽。项目内所有按钮均显式声明宽度/位置，这里全局归零。 */
uni-button[class] {
  margin-left: 0;
  margin-right: 0;
  /* 按钮行高归一：uni-button 默认行高 2.55×字号，单行控件高度会超过 88rpx 标准 */
  line-height: 1.5;
  /* 按钮文字几何居中：避免单行文字从顶部起排呈偏上 */
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 通用卡片 */
.card {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 24rpx;
}

/* 通用主按钮 */
.btn-primary {
  background: linear-gradient(135deg, #4a6cf7 0%, #6c8bff 100%);
  color: #fff;
  border-radius: 999rpx;
  font-weight: var(--fw-semibold);
  box-shadow: 0 10rpx 24rpx rgba(74, 108, 247, 0.35);
  border: none;
  /* 单行控件触摸目标下限 88rpx（44px，H5/小程序通用标准） */
  min-height: 88rpx;
  box-sizing: border-box;
  padding: 0 40rpx;
}
.btn-primary::after {
  border: none;
}
.btn-ghost {
  background: #fff;
  color: var(--primary);
  border: 2rpx solid var(--primary);
  border-radius: 999rpx;
}
.btn-ghost::after {
  border: none;
}
.btn-disabled {
  background: #c9cede !important;
  color: #fff !important;
  box-shadow: none !important;
}

/* 分区标题 */
.sec-title {
  font-size: var(--fs-7);
  font-weight: var(--fw-bold);
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.sec-title::before {
  content: '';
  width: 8rpx;
  height: 30rpx;
  border-radius: 4rpx;
  background: linear-gradient(180deg, var(--primary), var(--cyan));
}
.sec-sub {
  font-size: var(--fs-3);
  color: var(--text-3);
  font-weight: 400;
  margin-left: 8rpx;
}

/* ===== 桌面宽屏自适应：以手机栏宽（480px）居中演示 =====
   uni-app H5 按「视口宽 / 23.4375」设置 rem 基准，宽屏下整个界面会被等比放大；
   这里在视口 >480px 时锁定 rem 基准（与 480px 视口连续衔接），并把页面限宽居中。 */
@media (min-width: 481px) {
  html {
    font-size: 20.48px !important; /* = 480 / 23.4375 */
  }
  body {
    background: radial-gradient(1200px 640px at 50% -10%, #1b2450 0%, #0b1026 62%) fixed;
  }
  uni-page-body {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    box-shadow: 0 0 60rpx rgba(8, 12, 32, 0.55);
  }
}
</style>
