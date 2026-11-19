// 品牌档案服务：业务名 / slogan / 页脚由管理端配置驱动，页面文案不写死品牌，
// 换业务时只改 Mock（或后端 /config/profile），不动页面。
import { get } from '@/utils/request'
import type { ProfileConfig } from '@/mock/types'

export const getProfile = () => get<ProfileConfig>('/config/profile')
