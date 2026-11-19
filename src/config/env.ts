// 品牌/环境配置的唯一出口：业务代码只从这里读，不直接散落 import.meta.env。
export const APP_ENV = import.meta.env.VITE_APP_ENV || 'development'
export const APP_TITLE = import.meta.env.VITE_APP_TITLE || '星穹 SkyShow · 无人机编队表演'
export const BRAND_NAME = import.meta.env.VITE_BRAND_NAME || '星穹 SkyShow'
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'
export const DEV_PORT = Number(import.meta.env.VITE_DEV_PORT || 5174)
export const MOCK_DELAY = Number(import.meta.env.VITE_MOCK_DELAY || 0)

export const env = { APP_ENV, APP_TITLE, BRAND_NAME, API_BASE, DEV_PORT, MOCK_DELAY }
