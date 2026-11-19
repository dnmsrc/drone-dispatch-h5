// H5 登录编排（唯一入口）：微信扫码打开 H5 → 需要登录时自动发起微信网页授权 →
// 用户点「允许」后回跳、用 code 换后端 token → 自动恢复原页面。
//
// 分层约定：
// - utils/wechat.ts 只管环境与 URL（纯函数）；
// - 本文件管流程（发起授权 / 处理回跳 / 恢复登录态 / 登出），是页面唯一该调用的地方；
// - store 只管登录态本身（token / user / 持久化），不反向依赖本文件，避免循环引用。
//
// 两种模式（VITE_WX_AUTH_MODE）：
// - mock：本地模拟微信授权，不需要公众号资质；登录页展示模拟授权层，点「允许」即登录。
// - real：真实跳转微信授权页（仅微信内可用）；未配置 AppID 时自动降级 mock，避免用户卡死。
//
// 第二条通道（手机号验证码）：微信外无法发起网页授权，直接用手机号 + 验证码登录；
// 微信内也能切换（用户拒绝授权、或只想用手机号）。两条通道登录成功后的收尾完全一致：
// 都落到 setLogin(token, user) + jumpAfterLogin(redirect)，页面侧不需要区分用户是怎么登进来的。
import { post, postSilent } from '@/utils/request'
import { store, setLogin, isLoggedIn, logout as clearSession } from '@/store'
import { WX_APP_ID, WX_AUTH_MODE, WX_SCOPE, WX_REDIRECT_URI } from '@/config/env'
import * as wx from '@/utils/wechat'

export interface WxUserInfo {
  id: string
  nickname: string
  avatar?: string
  phone?: string
}

export interface LoginResp {
  token: string
  user: WxUserInfo
}

export type LoginMode = 'mock' | 'real'

/** 登录页（mock 模拟授权 / 微信外扫码引导） */
export const LOGIN_PAGE = '/pages/login/login'

const KEY_STATE = 'wx_oauth_state'
const KEY_REDIRECT = 'wx_oauth_redirect'
const KEY_MOCK_OPENID = 'mock_wx_openid'

/** sessionStorage 兜底：小程序端没有该对象，全部读写都要容错 */
function ss(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

/**
 * 实际生效的登录模式：
 * real 模式但没配 AppID 时降级 mock —— 否则会跳到一个必然报错的微信授权链接（10012）。
 */
export function loginMode(): LoginMode {
  if (WX_AUTH_MODE === 'real') {
    if (!WX_APP_ID) {
      console.warn('[auth] VITE_WX_AUTH_MODE=real 但未配置 VITE_WX_APP_ID，已降级为 mock 模式')
      return 'mock'
    }
    return 'real'
  }
  return 'mock'
}

/** 当前环境能否发起真实授权：real 模式 + 微信内置浏览器 */
export function canRealLogin(): boolean {
  return loginMode() === 'real' && wx.isWeixin()
}

/** 把「一次性 state + 登录后回哪」暂存到 sessionStorage（state 只能放 [a-zA-Z0-9]，回跳目标不能进 state） */
function stashAuth(redirect: string): string {
  const state = wx.randomState()
  const s = ss()
  if (s) {
    try {
      s.setItem(KEY_STATE, state)
      s.setItem(KEY_REDIRECT, redirect)
    } catch {
      /* 隐私模式：退化为「回首页」，不影响登录本身 */
    }
  }
  return state
}

function clearAuthStash(): void {
  const s = ss()
  if (!s) return
  try {
    s.removeItem(KEY_STATE)
    s.removeItem(KEY_REDIRECT)
  } catch {
    /* ignore */
  }
}

/**
 * 发起登录（唯一入口）。
 * @param redirect 登录成功后回到哪个页面，缺省用当前路由
 * @param opts.fromClick 是否由用户点击触发。微信要求「页面加载后无交互直接跳授权」会被固化成快照页，
 *        所以 true 才直接跳转，false（页面 onLoad 兜底）先弹一次确认再跳。
 */
export function beginLogin(redirect?: string, opts: { fromClick?: boolean } = {}): void {
  const back = redirect || wx.currentRoute() || '/pages/index/index'
  // 默认按「用户点击触发」处理：绝大多数入口是点按钮/点卡片进来的
  const fromClick = opts.fromClick !== false

  if (loginMode() === 'real' && wx.isWeixin()) {
    const state = stashAuth(back)
    const url = wx.buildAuthorizeUrl({
      appId: WX_APP_ID,
      redirectUri: wx.callbackBase(WX_REDIRECT_URI),
      scope: WX_SCOPE,
      state,
    })
    const jump = () => {
      if (wx.isH5()) window.location.replace(url)
    }
    if (fromClick) {
      jump()
      return
    }
    uni.showModal({
      title: '需要登录',
      content: '微信一键登录后即可继续操作',
      confirmText: '微信登录',
      cancelText: '取消',
      success: (r) => {
        if (r.confirm) jump()
      },
    })
    return
  }

  // 进登录页：mock 模式显示模拟授权卡；真实模式在微信外无法网页授权，登录页直接给手机号验证码
  uni.navigateTo({ url: LOGIN_PAGE + '?redirect=' + encodeURIComponent(back) })
}

/**
 * 登录门：调用点统一用它。
 * 已登录返回 true（调用方继续）；未登录返回 false，并异步发起登录流程。
 */
export function requireLogin(redirect?: string, opts: { fromClick?: boolean } = {}): boolean {
  if (isLoggedIn()) return true
  beginLogin(redirect, opts)
  return false
}

/** 模拟模式下的「微信用户」：同一浏览器保持同一个 openid，token 过期重登不会换人 */
function mockOpenid(): string {
  let id = ''
  try {
    id = uni.getStorageSync(KEY_MOCK_OPENID) || ''
  } catch {
    id = ''
  }
  if (!id) {
    id = 'oMock_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    try {
      uni.setStorageSync(KEY_MOCK_OPENID, id)
    } catch {
      /* ignore */
    }
  }
  return id
}

/**
 * 登录页「允许」时调用（mock 模式）：模拟微信 code2session，
 * 请求形状与真实模式一致（{ code }），差别只是 Mock 路由认识 mockOpenid 字段。
 */
export function completeMockLogin(): Promise<LoginResp> {
  return post<LoginResp>('/auth/wechat-login', {
    code: 'mock',
    mockOpenid: mockOpenid(),
  }).then((d) => {
    setLogin(d.token, d.user)
    return d
  })
}

/** 登录成功后的跳转：优先 reLaunch（清空授权往返留下的页面栈），失败再退 redirectTo */
export function jumpAfterLogin(redirect?: string): void {
  const url = redirect || '/pages/index/index'
  uni.reLaunch({
    url,
    fail: () => {
      uni.redirectTo({ url, fail: () => uni.reLaunch({ url: '/pages/index/index' }) })
    },
  })
}

/**
 * 处理微信授权回跳（real 模式）：解析 code/state → 校验 → 换 token → 回原页面。
 * App.onLaunch 调用一次即可；没有 code 时是空操作。
 */
export function resumeFromCallback(): void {
  if (loginMode() !== 'real' || !wx.isH5()) return
  const cb = wx.readCallback()
  if (!cb) return

  const s = ss()
  const expected = (s && s.getItem(KEY_STATE)) || ''
  const redirect = (s && s.getItem(KEY_REDIRECT)) || '/pages/index/index'
  // 先清地址栏再发请求：无论成功失败，code 都不能留在 URL 里被二次使用
  wx.stripCallback()
  clearAuthStash()

  // state 不匹配 = 不是本次会话发起的授权（或已被使用），拒绝换取，防 CSRF / 重放
  if (!expected || cb.state !== expected) {
    uni.showToast({ title: '登录校验失败，请重新登录', icon: 'none' })
    return
  }

  postSilent<LoginResp>('/auth/wechat-login', { code: cb.code })
    .then((d) => {
      setLogin(d.token, d.user)
      uni.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => jumpAfterLogin(redirect), 400)
    })
    .catch((e: { msg?: string }) => {
      uni.showToast({ title: (e && e.msg) || '微信登录失败，请重试', icon: 'none' })
    })
}

/** 启动时恢复：先补登录态（内存丢了但 storage 还在，比如 F5 之后），再处理微信回跳 */
export function initAuth(): void {
  try {
    const token = uni.getStorageSync('token') || ''
    const user = uni.getStorageSync('user') || null
    if (token && !store.token) store.token = token
    if (user && !store.user) store.user = user
  } catch {
    /* ignore */
  }
  resumeFromCallback()
}

/** 退出登录：通知后端（失败不影响本地清理）+ 清本地会话与申请草稿 */
export function logout(): void {
  postSilent('/auth/logout').catch(() => {})
  clearSession()
}

// ── 手机号验证码（第二条通道：微信外无法网页授权时用，微信内也可作为备选）──
// 契约（由后端 drone-dispatch-server 实现）：
//   POST /auth/sms/code  { phone }         → { ttl }        真实后端可额外返回 demoCode 供演示
//   POST /auth/sms/login { phone, code }   → { token, user }
// 真实后端必须做频控与风控（同号 60s 一次、每日上限、IP 限流、必要时图形验证码），
// 否则短信接口会被刷、产生真实费用。
export const PHONE_RE = /^1[3-9]\d{9}$/

export function isValidPhone(phone: string): boolean {
  return PHONE_RE.test(phone)
}

export interface SmsCodeResp {
  /** 验证码有效期（秒），用于前端 60s 倒计时 */
  ttl: number
  /** 仅 Mock/演示环境返回；前端据此提示「演示验证码」，真实后端不要返回该字段 */
  demoCode?: string
}

/** 发送短信验证码 */
export function sendSmsCode(phone: string): Promise<SmsCodeResp> {
  return post<SmsCodeResp>('/auth/sms/code', { phone })
}

/** 手机号 + 验证码登录：成功后与微信通道共用同一套登录态写入，页面无需区分来源 */
export function loginWithSms(phone: string, code: string): Promise<LoginResp> {
  return post<LoginResp>('/auth/sms/login', { phone, code }).then((d) => {
    setLogin(d.token, d.user)
    return d
  })
}
