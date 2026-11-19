# drone-dispatch-h5（用户端 H5 / 微信小程序 · 正式版）

> 本目录是四个平级独立 Git 仓库之一（仓库名即目录名 `drone-dispatch-h5`），提交记录与用户端相关，
> 与 `drone-dispatch-prototype`、`drone-dispatch-web`、`drone-dispatch-server` 三仓互不混杂。
> 四仓总览与 GitHub 地址见 [`drone-dispatch-prototype` 的 README](https://github.com/dnmsrc/drone-dispatch-prototype#项目全貌与仓库分布)。

- 原型基线：`drone-dispatch-prototype/h5`（uni-app Vue3 + Vite）
- 负责：微信授权登录、选参计价、档期日历、下单支付、退款申请、评价、售前咨询与申请流程

## 当前状态（静态页阶段）

原型 H5 的 22 个页面已全部迁入本仓，模板/class/rpx/样式逐段对搬，交互链路（下单 → 确认 → 收银台 → 结果 → 详情 → 退款/评价/相册；申请 8 步 → 合同 → 付款 → 进度）在本地可点通。

- **数据不连后端**：页面里的 `get` / `post` 调用形状与原型一致，落到 `src/mock/router.ts` 的浏览器内存 Mock 路由（种子数据 `src/mock/fixtures.json`），刷新即恢复。
- **接后端时**：只改 `src/utils/request.ts` 的 transport 与 `src/config/env.ts` 的 `VITE_API_BASE`，页面与 store 不用动。
- 原型专有的评审辅助浮层（`proto-tip.js`）按约定不迁入，这是与原型唯一的预期视觉差异。

## 登录（微信授权 / 手机号双通道）

入口只有一个：**用二维码打开 H5**（微信内、普通浏览器都能打开页面，可匿名浏览）。需要登录时按环境自动选通道：

- **微信内**：优先微信网页授权，用户点「允许」即自动登录并回到刚才那页；也可切「使用手机号登录」；
- **微信外**（网页授权在微信外无法发起）：直接用**手机号 + 验证码**登录。

- 登录编排集中在 `src/services/auth.ts`（`beginLogin` / `requireLogin` / `resumeFromCallback` / `logout`，手机号通道 `sendSmsCode` / `loginWithSms`），页面不自己拼跳转；微信环境判断与授权 URL 在 `src/utils/wechat.ts`。
- 两种模式（`VITE_WX_AUTH_MODE`）：`mock`＝本地模拟授权（无需公众号资质，开发/演示/自动化默认）；`real`＝真实跳转微信授权页（需已认证服务号 AppID + 公众平台「网页授权域名」，未配 AppID 会自动降级 mock）。
- 页面加载兜底会先弹确认再跳授权：微信会把「无用户交互的自动跳转」固化成快照页（只显示「点击访问完整网页」），所以深链进受保护页时不能直接跳。
- 手机号验证码：60s 重发倒计时；Mock 环境验证码固定 `123456`（发码后由接口返回的 `demoCode` 决定是否提示）。
- 真实环境的资质、后端接口契约、部署与排错清单见 [docs/微信登录接入说明.md](docs/微信登录接入说明.md)。
- 自动化：`node ../.shots-tmp/h5-login-e2e.mjs`（mock 全流程含手机号通道，24 断言）、`node ../.shots-tmp/h5-login-real-e2e.mjs`（real 协议链路，21 断言）。

## 技术栈

- uni-app（Vue 3 + `<script setup>` + TypeScript）+ Vite，一套代码同时产出 H5 与微信小程序（`mp-weixin`）
- 状态管理用本仓自带的轻量 store（`src/store/index.ts`，`reactive` + `watch` 持久化），页面与组件统一从它取状态；**规划中的 Pinia 暂未引入**，等接后端、状态复杂化后再评估替换
- 申请引擎（判定 / 日历 / 报价 / 合同 / 告知条款 / 里程碑）整包复用原型基线的纯函数实现，集中在 `src/mock/engines/`
- 环境差异一律走 `.env` 分层，业务代码只从 `src/config/env.ts` 读，不散落 `import.meta.env.VITE_*`

## 目录

```
src/
  pages/            页面（pages.json 注册，navigationStyle=自定义）
    index/          首页
    login/          登录（微信授权发起 / 模拟授权 / 手机号验证码）
    apply/          申请流程 9 页：disclosure 申请说明 / venue 场地 / need 规模与内容 /
                    date 日期时段 / quote 报价区间 / consult 人工咨询与派单 /
                    contract 电子合同 / pay 付款节点 / progress 进度
    order/          订单流程 9 页：create 下单配置 / confirm 确认 / cashier 收银台 /
                    result 支付结果 / list 列表 / detail 详情 / refund 退款 /
                    review 评价 / gallery 现场回传
    user/           我的
    consult/        售前咨询
  components/       共用组件（NavBar / StepBar / BasisPop 条款弹窗 / AckDock 留痕徽标 /
                    Calendar / ApplyCalendar / StatusTag / TabBar / Empty 等）
  composables/      useAckPop（条款门的弹窗与拦截，等价原型 mixins/ackPop.js）
  store/            全局状态 + 申请草稿 + 条款留痕 + 持久化
  mock/
    engines/        原型同款业务引擎（纯函数，无 UI 依赖）
    router.ts       内存 Mock 路由（接口形状与原型 mock-server 一致）
    fixtures.json   种子数据（场地 / 订单 / 咨询单 / 合同 / 配置）
    media.ts        头像与现场照片的占位图（data URI / SVG）
  services/         业务服务层：auth 登录编排（微信授权 / 回跳换票 / 登出）、config 品牌档案
  utils/            request 统一封装（带 token / 401 引导重新登录 / 错误提示）、
                    wechat 微信环境判断与授权 URL、format 格式化
  config/env.ts     品牌、环境、端口、微信授权的唯一出口
docs/              接入说明（微信登录：资质 / 后端接口契约 / 部署 / 排错）
```

## 命令

```bash
cd drone-dispatch-h5
npm install
npm run dev:h5          # H5 开发调试（默认 5174，见 .env 的 VITE_DEV_PORT）
npm run build:h5        # 产物 dist/build/h5
npm run build:mp-weixin # 微信小程序产物 dist/build/mp-weixin，用微信开发者工具导入（AppID 自行配置）
npm run type-check      # vue-tsc 类型检查
npm run format          # prettier --write；只检查用 npm run format:check
```

机器读的目录名、接口路径、字段 key 一律英文 ASCII，文档与注释用中文。