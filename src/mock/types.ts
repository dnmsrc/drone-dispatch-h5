// Mock 路由响应的类型声明：只声明 H5 静态页实际读取的字段，字段名与 fixtures.json / admin 配置一致。
// 接后端后，这些类型换成接口契约生成的类型即可，页面代码不需要改。

export interface ProfileBrand {
  appName: string
  adminTitle?: string
  slogan: string
  footer: string
  description?: string
}

export interface ProfileConfig {
  key: string
  name: string
  brand: ProfileBrand
}
