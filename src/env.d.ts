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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
