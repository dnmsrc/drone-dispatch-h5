// H5 登录编排（唯一入口）。三段职责分得很清楚：
//
// ① 登录 = 只要「能认人」的标识（openid），不做任何打扰：
//    微信内 → 先弹自己的「微信授权确认」卡（用户点「允许」才继续）→ snsapi_base 静默授权
//    （微信这一档本身无弹窗，跳一下中转页就回来，所以确认这一步由我们提供）；
//    微信外 → 手机号 + 验证码（网页授权必须在微信内置浏览器里发起，浏览器里做不到）。
// ② 个人信息（昵称 / 头像）≠ 登录：由用户在「我的」里主动点一下，
//    同样先过确认卡，再走 snsapi_userinfo（这一档微信才会真弹「是否允许获取昵称头像」），见 beginProfileAuth。
// ③ 回跳处理按 intent 分派：登录回跳换 token，资料回跳只更新资料，互不干扰。
//
// 分层约定：
// - utils/wechat.ts 只管环境与 URL（纯函数）；
// - 本文件管流程（发起授权 / 处理回跳 / 恢复登录态 / 登出），是页面唯一该调用的地方；
// - store 只管登录态本身（token / user / 持久化），不反向依赖本文件，避免循环引用。
//
// 两种模式（VITE_WX_AUTH_MODE）：
// - mock：本地模拟微信授权，不需要公众号资质；微信内模拟「静默登录」，微信外照常手机号验证码。
// - real：真实跳转微信授权（仅微信内可用）；未配置 AppID 时自动降级 mock，避免用户卡死。
import { post, postSilent } from '@/utils/request'
import { store, setLogin, patchUser, isLoggedIn, logout as clearSession } from '@/store'
import { WX_APP_ID, WX_AUTH_MODE, WX_SCOPE, WX_REDIRECT_URI } from '@/config/env'
import { askWxAuth } from '@/services/wxAuthSheet'
import { hideBootSplash } from '@/utils/boot'
import * as wx from '@/utils/wechat'

export interface WxUserInfo {
  id: string
  nickname: string
  avatar?: string
  phone?: string
  /** 微信身份（本机记下来，换一种登录方式时用来合并到同一个账号） */
  openid?: string
  /** 微信昵称头像是否已拿到（登录用 base 授权拿不到，需「我的」里主动授权后才为 true） */
  profileReady?: boolean
}

export interface LoginResp {
  token: string
  user: WxUserInfo
  /** 本次登录命中了已有账号（把新身份绑到他之前的账号上），而不是新建的 */
  merged?: boolean
}

export type LoginMode = 'mock' | 'real'

/** 登录页（mock 模拟授权 / 微信外扫码引导） */
export const LOGIN_PAGE = '/pages/login/login'

const KEY_STATE = 'wx_oauth_state'
const KEY_REDIRECT = 'wx_oauth_redirect'
const KEY_INTENT = 'wx_oauth_intent'
const KEY_MOCK_OPENID = 'mock_wx_openid'
// 本机记住的两个身份：上次用微信登录的 openid、上次用手机号登录的号码。
// 换一种方式登录时把它们带给后端，让后端把新身份绑到已有账号上 —— 同一部手机上的，
// 大概率是同一个人（短信验证码已证明手机号归属，openid 由微信签名保证）。
const KEY_SAVED_OPENID = 'wx_saved_openid'
const KEY_SAVED_PHONE = 'wx_saved_phone'

function savedValue(key: string): string {
  try {
    return uni.getStorageSync(key) || ''
  } catch {
    return ''
  }
}

/** 本机上次微信登录的 openid（没有则空串） */
function savedOpenid(): string {
  return savedValue(KEY_SAVED_OPENID)
}

/** 本机上次手机号登录的号码（没有则空串） */
function savedPhone(): string {
  return savedValue(KEY_SAVED_PHONE)
}

/** 登录成功后记住这台设备上的身份，供下一次（可能是另一种方式）登录时合并到同一账号 */
function rememberIdentity(user: WxUserInfo): void {
  try {
    if (user.openid) uni.setStorageSync(KEY_SAVED_OPENID, user.openid)
    if (user.phone) uni.setStorageSync(KEY_SAVED_PHONE, user.phone)
  } catch {
    /* 隐私模式：记不住就退化成「每次新建」，不影响本次登录 */
  }
}

/** 一次授权往返的目的：登录换 token，还是「我的」里补昵称头像 */
export type AuthIntent = 'login' | 'profile'

/** 取昵称头像只能用 snsapi_userinfo —— snsapi_base 换不到用户资料 */
const PROFILE_SCOPE = 'snsapi_userinfo'

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

/** 把「一次性 state + 意图 + 登录后回哪」暂存到 sessionStorage（地址栏参数丢了时的兜底） */
function stashAuth(redirect: string, intent: AuthIntent = 'login'): string {
  const state = wx.randomState()
  const s = ss()
  if (s) {
    try {
      s.setItem(KEY_STATE, state)
      s.setItem(KEY_REDIRECT, redirect)
      s.setItem(KEY_INTENT, intent)
    } catch {
      /* 隐私模式：退化为「回首页」，不影响登录本身 */
    }
  }
  return state
}

/**
 * 回调地址上直接带 intent / back。
 * 微信授权是一次跨域往返，回来时页面可能被重建，sessionStorage 有概率丢；
 * 把「这次为什么授权、完了回哪」放进 URL 才不依赖存储。微信会在后面用 & 拼 code&state。
 */
function buildRedirectUri(intent: AuthIntent, back: string): string {
  const base = wx.callbackBase(WX_REDIRECT_URI)
  const sep = base.indexOf('?') >= 0 ? '&' : '?'
  return base + sep + 'intent=' + intent + '&back=' + encodeURIComponent(back)
}

function clearAuthStash(): void {
  const s = ss()
  if (!s) return
  try {
    s.removeItem(KEY_STATE)
    s.removeItem(KEY_REDIRECT)
    s.removeItem(KEY_INTENT)
  } catch {
    /* ignore */
  }
}

export interface BeginLoginOptions {
  /**
   * 是否先弹我们自己的「微信授权确认」卡。默认 true —— 微信的 base 授权是静默的，
   * 没有这一步用户点完「预约」只会看到页面闪一下，不知道发生了什么。
   * 登录页本身就是登录 UI（用户已点了「微信登录」按钮）时传 false，避免叠两层确认。
   */
  confirm?: boolean
}

/**
 * 发起登录（唯一入口）。
 * 微信内：先弹授权确认卡，用户点「允许」才发起静默授权（snsapi_base，不索取昵称头像）；
 * 微信外：直接进手机号验证码登录页（网页授权只能在微信内置浏览器发起）。
 * @param redirect 登录成功后回到哪个页面，缺省用当前路由 —— 点「预约」授权的，
 *        回来后仍在预约页，用户不用再点一次。
 */
export function beginLogin(redirect?: string, opts: BeginLoginOptions = {}): void {
  void runLogin(redirect, opts)
}

async function runLogin(redirect?: string, opts: BeginLoginOptions = {}): Promise<void> {
  const here = wx.currentRoute()
  // 登录后回哪：默认回「用户点按钮时所在的页面」，让他自己再点一次原来的按钮。
  // 不做「登录成功就替他继续下一步」——从首页点「立即预约」被直接带进预约表单，
  // 用户会觉得页面自己跑了。只有登录页里主动点「微信登录」时才回它声明的目标页。
  const back = here.startsWith(LOGIN_PAGE)
    ? redirect || '/pages/index/index'
    : here || redirect || '/pages/index/index'
  const needConfirm = opts.confirm !== false

  // ① 微信内 + 真实模式：静默授权，只换 openid，不索取任何个人信息
  if (loginMode() === 'real' && wx.isWeixin()) {
    // 确认卡的意义在这里：用户明确点了「允许」才跳转，也天然满足微信「必须有用户交互
    // 才能跳授权」的规则（页面加载直接跳会被固化成快照页）
    if (needConfirm && !(await askWxAuth('login'))) return
    const state = stashAuth(back, 'login')
    const url = wx.buildAuthorizeUrl({
      appId: WX_APP_ID,
      redirectUri: buildRedirectUri('login', back),
      scope: WX_SCOPE,
      state,
    })
    if (wx.isH5()) {
      // 卡片消失到微信中转页渲染之间有一小段空白，给一层「正在打开微信」，
      // 让用户知道是自己在跳转，而不是按钮失灵（页面随即被 replace，遮罩不会残留在回跳页）
      uni.showLoading({ title: '正在打开微信…', mask: true })
      window.location.replace(url)
    }
    return
  }

  // ② 微信内 + mock 模式：也先过同一张确认卡，再模拟一次静默登录，演示与真实链路同构
  if (loginMode() === 'mock' && wx.isWeixin()) {
    if (needConfirm && !(await askWxAuth('login'))) return
    silentMockLogin(back)
    return
  }

  // ③ 微信外（含 mock）：网页授权发起不了，直接给手机号验证码登录页
  uni.navigateTo({ url: LOGIN_PAGE + '?redirect=' + encodeURIComponent(back) })
}

/** mock 下的静默登录：没有授权页可跳，直接调一次换 token 的接口，行为对齐真实链路 */
function silentMockLogin(back: string): void {
  uni.showLoading({ title: '登录中…', mask: true })
  completeMockLogin()
    .then((d) => {
      uni.hideLoading()
      uni.showToast({ title: d.merged ? '已登录你之前的账号' : '登录成功', icon: 'success' })
      setTimeout(() => jumpAfterLogin(back), 400)
    })
    .catch((e: { msg?: string }) => {
      uni.hideLoading()
      uni.showToast({ title: (e && e.msg) || '登录失败，请重试', icon: 'none' })
    })
}

/**
 * 登录门：调用点统一用它。
 * 已登录返回 true（调用方继续）；未登录返回 false，并异步发起登录流程（先弹授权确认卡）。
 */
export function requireLogin(redirect?: string, opts: BeginLoginOptions = {}): boolean {
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
    // 本机上次手机号登录过的号码：先手机号后微信时，让后端并到那个账号上而不是新建
    phone: savedPhone(),
  }).then((d) => {
    setLogin(d.token, d.user)
    rememberIdentity(d.user)
    return d
  })
}

/** 微信资料（昵称头像）：登录不索取，只在用户主动授权后回填 */
export interface WechatProfile {
  nickname?: string
  avatar?: string
  /** 后端可回传 unionid / openid，前端只用于展示，不参与鉴权 */
  openid?: string
  /** 微信没给真实昵称头像（返回「微信用户」+ 默认灰头像）时为 true */
  masked?: boolean
}

/** 把拿到的微信资料回填到当前登录用户（不动 token） */
function applyProfile(d: WechatProfile): void {
  // 微信可能只回一个脱敏昵称（「微信用户」）和默认灰头像。照单全收会把占位数据
  // 当成用户资料展示，看着就像「假头像假昵称」，所以宁可留白让用户自己设置。
  if (d.masked || !d.nickname || d.nickname === '微信用户') {
    // 记下「微信这边拿不到」，下次点头像直接进手动编辑，不再让用户重复授权一次还是空手回来
    patchUser({ profileMasked: true, profileReady: false })
    uni.showToast({ title: '微信未返回真实昵称头像，请手动设置', icon: 'none', duration: 2500 })
    return
  }
  patchUser({ nickname: d.nickname, avatar: d.avatar, profileReady: true })
  uni.showToast({ title: '已获取微信资料', icon: 'success' })
}

/**
 * 主动获取微信昵称头像（「我的」里由用户点一下触发）。
 * 先弹授权确认卡说明「要拿头像昵称」，同意后才走 snsapi_userinfo
 * （这一档微信还会再弹一次它自己的「是否允许」——两道确认，因为这是个人信息）。
 * 必须已登录：资料要挂到当前账号上。
 */
export async function beginProfileAuth(): Promise<void> {
  if (!isLoggedIn()) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  // 先判断环境再弹卡：网页授权只能在微信内置浏览器里发起，在普通浏览器弹一张
  // 「允许获取」的卡、点完却只能告诉用户「请用微信打开」，是多出来的一道无效操作
  if (!(loginMode() === 'real' && wx.isWeixin()) && loginMode() !== 'mock') {
    uni.showToast({ title: '请用微信打开后再获取微信资料', icon: 'none' })
    return
  }

  if (!(await askWxAuth('profile'))) return

  if (loginMode() === 'real' && wx.isWeixin()) {
    const back = wx.currentRoute() || '/pages/user/index'
    const state = stashAuth(back, 'profile')
    const url = wx.buildAuthorizeUrl({
      appId: WX_APP_ID,
      redirectUri: buildRedirectUri('profile', back),
      scope: PROFILE_SCOPE,
      state,
    })
    uni.showLoading({ title: '正在打开微信授权…', mask: true })
    if (wx.isH5()) window.location.replace(url)
    return
  }

  if (loginMode() === 'mock') {
    uni.showLoading({ title: '获取中…', mask: true })
    post<WechatProfile>('/user/wechat-profile', { code: 'mock' })
      .then((d) => {
        uni.hideLoading()
        applyProfile(d)
      })
      .catch((e: { msg?: string }) => {
        uni.hideLoading()
        uni.showToast({ title: (e && e.msg) || '获取失败，请重试', icon: 'none' })
      })
    return
  }
}
export function jumpAfterLogin(redirect?: string): void {
  const url = redirect || '/pages/index/index'
  uni.reLaunch({
    url,
    fail: () => {
      // H5 兜底：回跳落地时 uni 的路由可能还没就绪，reLaunch/redirectTo 会静默失败，
      // 用户就停在落地页（首页）而不是原来的页面。hash 路由对 hashchange 有响应，最可靠。
      if (wx.isH5()) window.location.hash = url
    },
  })
}

/**
 * 处理微信授权回跳（real 模式）：解析 code/state → 校验 → 按 intent 分派：
 * intent=login 用 code 换 token；intent=profile 只换昵称头像回填，不动登录态。
 * App.onLaunch 调用一次即可；没有 code 时是空操作。
 */
export function resumeFromCallback(): void {
  if (!wx.isH5()) return
  const cb = wx.readCallback()
  if (!cb) return
  // 地址栏有 code 但当前不是 real 模式（比如本机切回了 mock）：这个 code 永远换不了，
  // 不能把它当「回调处理中」把启动骨架一直挂着，清掉参数并立刻撤骨架
  if (loginMode() !== 'real') {
    wx.stripCallback()
    hideBootSplash()
    return
  }

  const s = ss()
  const expected = (s && s.getItem(KEY_STATE)) || ''
  // 地址栏参数优先：微信是一次跨域往返，回来时页面可能被重建，sessionStorage 未必还在
  const urlIntent = cb.intent === 'profile' ? 'profile' : cb.intent === 'login' ? 'login' : ''
  const intent = (urlIntent || (s && s.getItem(KEY_INTENT)) || 'login') as AuthIntent
  const redirect =
    cb.back ||
    (s && s.getItem(KEY_REDIRECT)) ||
    (intent === 'profile' ? '/pages/user/index' : '/pages/index/index')
  // 先清地址栏再发请求：无论成功失败，code 都不能留在 URL 里被二次使用
  wx.stripCallback()
  clearAuthStash()

  // state 不匹配 = 不是本次会话发起的授权（或已被使用），拒绝换取，防 CSRF / 重放。
  // 只有「本地确实存过 state」时才比对：存储被微信清掉的极端情况下放行，
  // 此时仍有一次性的 code + 后端校验兜底，比让用户卡在这儿重试强。
  if (expected && cb.state !== expected) {
    console.warn('[auth] state 不匹配，拒绝换取：', cb.state, '≠', expected)
    // 骨架屏是为「换 token 中」准备的，这条路径已经决定了不换，得立刻撤，否则用户对着转圈干等
    hideBootSplash()
    uni.showToast({ title: '授权校验失败，请重试', icon: 'none' })
    return
  }

  // ② 资料授权回跳：只更新昵称头像，不碰 token
  if (intent === 'profile') {
    postSilent<WechatProfile>('/user/wechat-profile', { code: cb.code })
      .then((d) => {
        applyProfile(d)
        // 先跳回原页（新页会按「资料已就绪」渲染），稍后再撤骨架 —— 顺序反过来的话
        // 骨架淡出的那零点几秒里露出的是资料还没填上的旧页面，等于白闪一下
        jumpAfterLogin(redirect)
        setTimeout(hideBootSplash, 160)
      })
      .catch((e: { msg?: string }) => {
        hideBootSplash()
        uni.showToast({ title: (e && e.msg) || '获取微信资料失败，请重试', icon: 'none' })
      })
    return
  }

  // ① 登录回跳：code 交后端换 token（AppSecret 只在后端）
  postSilent<LoginResp>('/auth/wechat-login', { code: cb.code, phone: savedPhone() })
    .then((d) => {
      setLogin(d.token, d.user)
      rememberIdentity(d.user)
      uni.showToast({ title: d.merged ? '已登录你之前的账号' : '登录成功', icon: 'success' })
      jumpAfterLogin(redirect)
      setTimeout(hideBootSplash, 160)
    })
    .catch((e: { msg?: string }) => {
      hideBootSplash()
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
  // 带上本机上次微信登录的 openid：先微信后手机号时，后端把手机号绑到他之前的微信账号上，
  // 而不是再建一个新账号（返回 merged=true，页面据此提示「已登录你之前的账号」）
  return post<LoginResp>('/auth/sms/login', { phone, code, openid: savedOpenid() }).then((d) => {
    setLogin(d.token, d.user)
    rememberIdentity(d.user)
    return d
  })
}
