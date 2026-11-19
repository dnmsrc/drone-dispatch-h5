import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// 端口 / 接口基地址等环境差异一律从 .env 分层读取（约定见 workspace AGENTS.md）。
// manifest.json 里的 h5.devServer.port 恒为 5174，改端口时两处一起改，否则 uni 的 H5 devServer 会各说各话。
export default defineConfig(({ mode }) => {
  // 用 '.'（工程根）而不是 process.cwd()：vite 以项目根解析 .env，顺带避免前端工程引入 Node 类型
  const env = loadEnv(mode, '.')
  const port = Number(env.VITE_DEV_PORT || 5174)
  return {
    plugins: [uni()],
    server: {
      host: true,
      port,
      strictPort: false,
      // 静态页阶段不依赖后端；保留代理出口，后续接 drone-dispatch-server 时把 VITE_API_BASE 换掉即可
      proxy: env.VITE_API_TARGET
        ? {
            [env.VITE_API_BASE || '/api']: {
              target: env.VITE_API_TARGET,
              changeOrigin: true,
            },
          }
        : undefined,
    },
  }
})
