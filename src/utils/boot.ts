// 启动骨架（index.html 里的 #boot）的收尾。
//
// 为什么骨架写在 HTML 里而不是 Vue 里：这层要盖住的是「JS 还没执行」的那段时间 ——
// 微信网页授权回跳是一次整页重载，SPA 得重新下载执行全部模块，期间 #app 是空的。
// 只有静态 HTML + CSS 能在那个时刻画出东西来，Vue 组件做不到（它自己都还没启动）。
//
// 撤掉的时机有两类，都收在这里，避免每个调用点各写一份定时器：
// - 正常启动：页面首帧画出来之后再撤（早撤会露出空 #app）；
// - 微信授权回跳：换 token 期间页面还是未登录态，骨架必须留着，由 auth 换完再撤。
//   这一路有兜底：不管请求悬挂还是路由异常，最长 8 秒也会撤，不能让人一直停在转圈。
const BOOT_ID = 'boot'
const PENDING_CLASS = 'wx-pending'
const OUT_CLASS = 'out'
/** 页面首帧画完到骨架消失之间的余量（ms）；配合 CSS 里 0.26s 的淡出 */
const HIDE_DELAY = 160
/** 兜底撤骨架的最长时间（ms） */
const FAILSAFE = 8000

let hidden = false

function hasDom(): boolean {
  return typeof document !== 'undefined' && !!document.getElementById
}

/** 立刻淡出并移除启动骨架（幂等，重复调用无副作用） */
export function hideBootSplash(): void {
  if (hidden || !hasDom()) return
  hidden = true
  // 回跳标记只是给 initBoot 看的开关，撤骨架时一并清掉，免得后续 HMR/切换模式时误判
  document.documentElement.classList.remove(PENDING_CLASS)
  const el = document.getElementById(BOOT_ID)
  if (!el) return
  el.classList.add(OUT_CLASS)
  // 等 CSS 过渡跑完再真正删节点，否则中途被移除会「啪」地消失
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el)
  }, 320)
}

/**
 * 应用启动时调用一次（App.onLaunch）。
 * 微信回跳中（index.html 已打 wx-pending）不主动撤，由 auth 换完 token 后调用 hideBootSplash。
 */
export function initBoot(): void {
  if (!hasDom() || hidden) return
  // 兜底先挂上：下面的分支无论哪条没走到，8 秒后都会撤掉
  setTimeout(hideBootSplash, FAILSAFE)

  if (document.documentElement.classList.contains(PENDING_CLASS)) return

  const show = () => setTimeout(hideBootSplash, HIDE_DELAY)
  if (typeof requestAnimationFrame === 'function') {
    // 两帧：第一帧 Vue 的这次渲染落盘，第二帧样式生效，之后再淡出
    requestAnimationFrame(() => requestAnimationFrame(show))
  } else {
    show()
  }
}
