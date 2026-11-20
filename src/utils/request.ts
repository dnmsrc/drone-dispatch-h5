// 统一请求封装：自动带 token、统一错误提示、401 引导重新登录。
// 静态页阶段把请求落到 @/mock/router（浏览器内存 Mock 路由），页面里的 get/post 调用与原型一致；
// 接 drone-dispatch-server 时只改本文件的 transport 实现，页面无需改动。
//
// 登录相关：本文件不做登录编排（避免 request ↔ auth ↔ store 循环引用），
// 401 只负责「清干净本地登录态 + 把用户带到登录页」，真实微信授权的发起交给
// services/auth.ts（登录页在微信内会自动承接）。登录页已在栈顶时不再重复跳转，防止死循环。
import { mockRequest } from '@/mock/router'
import { store } from '@/store'
import { API_BASE, WX_AUTH_MODE } from '@/config/env'

export interface ApiError {
  code?: number
  msg?: string
  data?: Record<string, any>
}

interface RequestOptions {
  silent?: boolean
}

/** 当前页路由（登录后回跳用）；拿不到就返回空串，登录页会退化成「返回上一页」 */
function curRoute(): string {
  try {
    const ps = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (!ps.length) return ''
    const route = ps[ps.length - 1].route || ''
    return route ? '/' + route : ''
  } catch {
    return ''
  }
}

/** 带去登录页；已经在登录页就不再压栈（否则 401 循环会把页面栈刷满） */
function toLogin(back: string): void {
  if (curRoute().startsWith('/pages/login/login')) return
  uni.navigateTo({
    url: '/pages/login/login' + (back ? '?redirect=' + encodeURIComponent(back) : ''),
  })
}

function hideToastSafely(): void {
  try {
    uni.hideToast()
  } catch {
    /* ignore */
  }
}

/**
 * 真实模式（VITE_WX_AUTH_MODE=real）下必须由后端完成的接口：
 * 微信网页授权拿到的 code 只能在后端用 AppSecret 换 openid（浏览器里做会泄露密钥，且微信接口不允许跨域）。
 * 其余业务接口仍走内存 mock —— 静态页阶段不需要整站后端，只有「认人」这两步必须真。
 */
const REAL_WX_APIS = ['/auth/wechat-login', '/user/wechat-profile']

function needRealBackend(url: string): boolean {
  return WX_AUTH_MODE === 'real' && REAL_WX_APIS.some((p) => url.startsWith(p))
}

/** 与 mockRequest 同形状（{ code, msg, data }）的真实 HTTP 通道，经 vite 的 /api 代理打到后端 */
async function httpRequest(
  method: string,
  url: string,
  data: Record<string, any>,
): Promise<{ code: number; msg?: string; data?: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (store.token) headers.Authorization = 'Bearer ' + store.token
  const resp = await fetch(API_BASE + url, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(data),
  })
  let body: any = null
  try {
    body = await resp.json()
  } catch {
    /* 后端返回非 JSON（网关错误页等）时统一兜底 */
  }
  if (!resp.ok && !body) {
    throw { code: resp.status, msg: 'HTTP ' + resp.status } as ApiError
  }
  return body
}

export function api<T = any>(
  method: string,
  url: string,
  data: Record<string, any> = {},
  opts: RequestOptions = {},
): Promise<T> {
  const silent = opts.silent === true

  const task = needRealBackend(url)
    ? httpRequest(method, url, data)
    : mockRequest(method, url, data)

  return task.then(
    (res) => {
      if (res.code === 0) return res.data as T
      if (res.code === 40100) {
        // 登录凭证失效：内存与 storage 都要清，否则会出现「界面还显示已登录、请求却一直被拒」
        try {
          uni.removeStorageSync('token')
          uni.removeStorageSync('user')
        } catch {
          /* ignore */
        }
        store.token = ''
        store.user = null
        if (!silent) {
          uni.showToast({ title: '登录状态已失效，请重新登录', icon: 'none', duration: 2500 })
          const back = curRoute()
          setTimeout(() => {
            hideToastSafely()
            toLogin(back)
          }, 800)
        }
        return Promise.reject(res as ApiError)
      }
      if (!silent) uni.showToast({ title: res.msg || '请求失败', icon: 'none', duration: 2500 })
      return Promise.reject(res as ApiError)
    },
    (err: ApiError & { message?: string }) => {
      if (err && err.code === 40100) {
        if (!silent) {
          uni.showToast({ title: '请先登录', icon: 'none', duration: 2000 })
          const back = curRoute()
          setTimeout(() => {
            hideToastSafely()
            toLogin(back)
          }, 500)
        }
        return Promise.reject(err)
      }
      if (!silent) {
        uni.showToast({ title: (err && err.message) || '请求失败', icon: 'none', duration: 2500 })
      }
      return Promise.reject(err)
    },
  )
}

export const get = <T = any>(url: string): Promise<T> => api<T>('GET', url)
export const post = <T = any>(url: string, data: Record<string, any> = {}): Promise<T> =>
  api<T>('POST', url, data)
// 需要自己处理失败（弹自定义层 / 轮询）的请求走这两个
export const getSilent = <T = any>(url: string): Promise<T> =>
  api<T>('GET', url, {}, { silent: true })
export const postSilent = <T = any>(url: string, data: Record<string, any> = {}): Promise<T> =>
  api<T>('POST', url, data, { silent: true })
