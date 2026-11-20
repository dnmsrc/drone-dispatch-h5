// 品牌/环境配置的唯一出口：业务代码只从这里读，不直接散落 import.meta.env。
export const APP_ENV = import.meta.env.VITE_APP_ENV || 'development'
export const APP_TITLE = import.meta.env.VITE_APP_TITLE || '星穹 SkyShow · 无人机编队表演'
export const BRAND_NAME = import.meta.env.VITE_BRAND_NAME || '星穹 SkyShow'
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'
export const DEV_PORT = Number(import.meta.env.VITE_DEV_PORT || 5174)
export const MOCK_DELAY = Number(import.meta.env.VITE_MOCK_DELAY || 0)

// ── 微信网页授权（H5 登录）──
// mock：本地模拟授权，不需要公众号资质（开发/演示/自动化默认）
// real：真实跳转微信授权页，必须配好服务号 AppID 与公众平台「网页授权域名」
export const WX_AUTH_MODE = (import.meta.env.VITE_WX_AUTH_MODE || 'mock') as 'mock' | 'real'
// 服务号 AppID 是公开标识（不是密钥），可以进仓库；AppSecret 只能放后端环境变量
export const WX_APP_ID = import.meta.env.VITE_WX_APP_ID || ''
// 登录用授权作用域。snsapi_base（默认）：静默授权，无授权弹窗，只拿 openid —— 登录只需要「能认人」的标识，
// 不该为了登录逼用户同意「获取昵称头像」。昵称头像改由用户在「我的」里主动触发 snsapi_userinfo 授权
// （见 services/auth.ts 的 beginProfileAuth），那时才会真的弹授权页。
// 若确实想在登录时就弹授权页顺手拿资料，把它改成 snsapi_userinfo 即可。
export const WX_SCOPE = import.meta.env.VITE_WX_SCOPE || 'snsapi_base'
// 授权回调基址，必须是「网页授权域名」下的地址；留空取当前站点根目录
export const WX_REDIRECT_URI = import.meta.env.VITE_WX_REDIRECT_URI || ''

export const env = {
  APP_ENV,
  APP_TITLE,
  BRAND_NAME,
  API_BASE,
  DEV_PORT,
  MOCK_DELAY,
  WX_AUTH_MODE,
  WX_APP_ID,
  WX_SCOPE,
  WX_REDIRECT_URI,
}
