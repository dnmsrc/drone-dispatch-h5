// 微信网页授权（OAuth2）工具层：只做「环境判断 + URL 拼装 + 回调解析」的纯函数，
// 不碰 store、不发请求，便于单测与在 mock / real 两种模式下复用。
//
// 设计依据（微信官方《微信网页授权》，服务号 - 微信网页开发）：
// 1. 网页授权只支持「已认证的服务号」；订阅号、未认证服务号都不行。开发调试可用公众平台测试号。
// 2. 授权链接参数顺序被微信做正则强匹配校验，必须严格按
//    appid → redirect_uri → response_type → scope → state → #wechat_redirect 的顺序拼。
// 3. redirect_uri 必须落在公众平台配置的「网页授权域名」下，且建议 https。
// 4. state 仅允许 a-zA-Z0-9（≤128 字节），所以「登录后回哪一页」不能塞进 state，
//    单独存 sessionStorage，用 state 只放一次性随机串做 CSRF 校验。
// 5. code 一次性、5 分钟过期，只能交给后端换 token（AppSecret 绝不能出现在前端）。
// 6. 页面加载后「无任何用户交互」直接跳授权，微信会固化成快照页（「点击访问完整网页」），
//    因此只有用户点击动作触发的入口才允许直接跳转；页面加载兜底必须先让用户确认一次。

const WX_UA = /MicroMessenger/i

/** 是否运行在微信内置浏览器：只有这里才能发起网页授权 */
export function isWeixin(): boolean {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false
  return WX_UA.test(navigator.userAgent)
}

/** 是否 H5 端（H5 才有 location；小程序端走 uni.login 另一套） */
export function isH5(): boolean {
  return typeof window !== 'undefined' && typeof window.location !== 'undefined'
}

/** 授权链接里的 state：只允许 [a-zA-Z0-9]，长度自选（官方上限 128 字节） */
export function randomState(len = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : null
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint8Array(len)
    cryptoObj.getRandomValues(buf)
    for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length]
    return out
  }
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

/**
 * 回调基址（redirect_uri）：必须是「网页授权域名」下的地址。
 * 优先用显式配置（生产可配 https://h5.example.com/），否则取当前站点根目录，
 * 只保留到目录层级、不带 hash —— 带 hash 的话微信把 code 拼在 ? 后，解析容易出歧义。
 */
export function callbackBase(configured?: string): string {
  if (configured && configured.trim()) return configured.trim()
  if (!isH5()) return ''
  const { origin, pathname } = window.location
  // 去掉末尾的 index.html / 文件名，只留目录（部署在子路径时也能对上）
  const dir = pathname.endsWith('/') ? pathname : pathname.replace(/[^/]*$/, '')
  return origin + (dir || '/')
}

export interface AuthorizeParams {
  appId: string
  redirectUri: string
  /** snsapi_base（静默，只拿 openid）| snsapi_userinfo（弹授权页，可拿昵称头像） */
  scope?: string
  state: string
}

/** 拼授权链接：参数顺序不可调整（微信做正则强匹配校验） */
export function buildAuthorizeUrl(p: AuthorizeParams): string {
  const scope = p.scope || 'snsapi_userinfo'
  return (
    'https://open.weixin.qq.com/connect/oauth2/authorize' +
    `?appid=${encodeURIComponent(p.appId)}` +
    `&redirect_uri=${encodeURIComponent(p.redirectUri)}` +
    '&response_type=code' +
    `&scope=${scope}` +
    `&state=${p.state}` +
    '#wechat_redirect'
  )
}

export interface CallbackQuery {
  code: string
  state: string
  /** 本次授权往返的目的（随 redirect_uri 一起带回来；sessionStorage 丢了也能分派） */
  intent: string
  /** 授权结束后回哪一页 */
  back: string
}

/**
 * 读取微信回跳参数：正常是 redirect_uri/?code=CODE&state=STATE，
 * 所以放在 location.search；同时兼容参数被拼进 hash 的情况（不同部署/版本行为有差异）。
 */
export function readCallback(): CallbackQuery | null {
  if (!isH5()) return null
  const { search, hash } = window.location
  const parse = (raw: string) => {
    const s = raw.startsWith('?') ? raw.slice(1) : raw
    const q = new URLSearchParams(s)
    return {
      code: q.get('code') || '',
      state: q.get('state') || '',
      intent: q.get('intent') || '',
      back: q.get('back') || '',
    }
  }
  let got = parse(search)
  // hash 形如 #/pages/x?code=..&state=.. 时，从 '?' 后截取
  if (!got.code && hash.includes('?')) {
    got = parse(hash.slice(hash.indexOf('?')))
  }
  return got.code ? got : null
}

/** 清掉地址栏上的 code/state，避免刷新或分享时重复使用已失效的 code */
export function stripCallback(): void {
  if (!isH5() || typeof history === 'undefined') return
  const url = new URL(window.location.href)
  let changed = false
  ;['code', 'state', 'intent', 'back'].forEach((k) => {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k)
      changed = true
    }
  })
  if (!changed) return
  // 保留 hash（当前页），只清查询串
  history.replaceState(history.state, '', url.pathname + (url.search ? url.search : '') + url.hash)
}

/** 当前页面路由（不含域名），用于「登录后回到哪」；取不到就退化成首页 */
export function currentRoute(): string {
  if (!isH5()) {
    // 小程序端从页面栈取
    try {
      const ps = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const last = ps[ps.length - 1]
      return last && last.route ? '/' + last.route : ''
    } catch {
      return ''
    }
  }
  const h = window.location.hash || ''
  const raw = h.startsWith('#') ? h.slice(1) : ''
  return raw.startsWith('/') ? raw : ''
}
