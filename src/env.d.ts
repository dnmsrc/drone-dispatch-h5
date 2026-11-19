/// <reference types="@dcloudio/types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  /** 运行环境标识：development | production */
  readonly VITE_APP_ENV: string
  /** 业务/品牌名（静态页阶段用于登录页、导航栏兜底文案） */
  readonly VITE_BRAND_NAME: string
  /** 接口基地址（静态页阶段不发起真实请求，接入后端时才消费） */
  readonly VITE_API_BASE: string
  /** H5 dev server 端口（与 manifest.json 的 h5.devServer.port 保持一致） */
  readonly VITE_DEV_PORT: string
  /** 静态 Mock 数据模拟的网络延迟（毫秒），调成 0 可即时返回 */
  readonly VITE_MOCK_DELAY: string
  /** 微信登录模式：mock（本地模拟授权）| real（真实微信网页授权） */
  readonly VITE_WX_AUTH_MODE: string
  /** 服务号 AppID（公开标识，非密钥）；real 模式必填，留空自动降级 mock */
  readonly VITE_WX_APP_ID: string
  /** 授权作用域：snsapi_userinfo（可拿昵称头像）| snsapi_base（静默只拿 openid） */
  readonly VITE_WX_SCOPE: string
  /** 授权回调基址，需落在公众平台「网页授权域名」下；留空取当前站点根目录 */
  readonly VITE_WX_REDIRECT_URI: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
