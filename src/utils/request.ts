// 统一请求封装：自动带 token、统一错误提示、401 跳登录。
// 静态页阶段把请求落到 @/mock/router（浏览器内存 Mock 路由），页面里的 get/post 调用与原型一致；
// 接 drone-dispatch-server 时只改本文件的 transport 实现，页面无需改动。
import { mockRequest } from '@/mock/router'
import { store } from '@/store'

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

export function api<T = any>(
  method: string,
  url: string,
  data: Record<string, any> = {},
  opts: RequestOptions = {},
): Promise<T> {
  const silent = opts.silent === true

  return mockRequest(method, url, data).then(
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
            try {
              uni.hideToast()
            } catch {
              /* ignore */
            }
            uni.navigateTo({
              url: '/pages/login/login' + (back ? '?redirect=' + encodeURIComponent(back) : ''),
            })
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
            try {
              uni.hideToast()
            } catch {
              /* ignore */
            }
            uni.navigateTo({
              url: '/pages/login/login' + (back ? '?redirect=' + encodeURIComponent(back) : ''),
            })
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
