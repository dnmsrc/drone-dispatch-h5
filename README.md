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
    login/          微信授权登录
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
  services/         业务服务层（如品牌档案）
  utils/            request 统一封装（带 token / 401 跳登录 / 错误提示）、format 格式化
  config/env.ts     品牌、环境、端口的唯一出口
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