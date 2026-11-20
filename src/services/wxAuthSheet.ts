// 「微信授权确认」弹窗的全局状态（组件 WxAuthSheet.vue 挂在需要登录的页面里）。
//
// 为什么要有这一层：微信网页授权（snsapi_base）在微信里是静默的 —— 用户点按钮后
// 页面直接跳一下微信中转页再回来，中间没有任何提示，用户会以为「我点的预约怎么没反应」。
// 所以我们在真正跳转之前先弹一张自己的确认卡（应用名 / 这次要拿什么 / 不要什么），
// 用户点「允许」才发起授权；点「拒绝」就什么也不做，留在原页面。
//
// 放在 services 而不是组件内部：发起方是 services/auth.ts（不在任何页面里），
// 弹窗状态必须是模块级的单例，页面只负责把组件挂到模板上。
import { reactive } from 'vue'

/** 这次授权是为了：登录换 token，还是在「我的」里补昵称头像 */
export type WxAuthIntent = 'login' | 'profile'

/** 弹窗可见性（页面模板直接读它渲染 WxAuthSheet） */
export const wxSheet = reactive<{ visible: boolean; intent: WxAuthIntent }>({
  visible: false,
  intent: 'login',
})

let resolver: ((ok: boolean) => void) | null = null
let pending: Promise<boolean> | null = null
// 已挂载的弹窗组件数量。没有任何页面挂载时退化为系统弹窗 ——
// 否则用户点预约后弹窗渲染不出来，Promise 永远悬着，登录流程看起来就是「点了没反应」。
let mountedCount = 0

/** 组件挂载/卸载时登记；最后一个组件卸载时把悬着的确认判为「取消」，不留死 Promise */
export function registerWxSheet(delta: 1 | -1): void {
  mountedCount = Math.max(0, mountedCount + delta)
  if (mountedCount === 0 && pending) settleWxAuth(false)
}

function fallbackAsk(intent: WxAuthIntent): Promise<boolean> {
  const content =
    intent === 'profile'
      ? '确定获取你的微信昵称和头像吗？只用于「我的」页面展示。'
      : '将使用你的微信身份登录，仅获取账号标识（openid），不读取昵称头像。'
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '微信授权',
      content,
      confirmText: '允许',
      cancelText: '拒绝',
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    })
  })
}

/**
 * 请求用户确认这次微信授权。
 * @returns true = 用户点了「允许」，调用方可以发起跳转；false = 拒绝/关闭（不做任何事）
 */
export function askWxAuth(intent: WxAuthIntent): Promise<boolean> {
  // 一次只问一件事：已有确认在等时复用同一个结果，避免连点叠出两张卡
  if (pending) return pending
  if (!mountedCount) return fallbackAsk(intent)
  wxSheet.intent = intent
  wxSheet.visible = true
  pending = new Promise<boolean>((resolve) => {
    resolver = resolve
  })
  return pending
}

/** 弹窗内按钮的收口：关闭并给出结果（允许 / 拒绝） */
export function settleWxAuth(ok: boolean): void {
  wxSheet.visible = false
  const done = resolver
  resolver = null
  pending = null
  if (done) done(ok)
}
