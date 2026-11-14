# drone-dispatch-h5（用户端 H5 / 微信小程序 · 正式版）

> 本目录是四个平级独立 Git 仓库之一（仓库名即目录名 `drone-dispatch-h5`），提交记录与用户端相关，
> 与 `drone-dispatch-prototype`、`drone-dispatch-web`、`drone-dispatch-server` 三仓互不混杂。
> 四仓总览与 GitHub 地址见 [`drone-dispatch-prototype` 的 README](https://github.com/dnmsrc/drone-dispatch-prototype#项目全貌与仓库分布)。

- 原型基线：`drone-dispatch-prototype/h5`（uni-app Vue3 + Vite，`dist/build/h5` 与 `dist/build/mp-weixin`）
- 负责：微信授权登录、选参计价、档期日历、下单支付、退款申请、评价、售前咨询流程

**当前状态：目录占位，尚未放入正式代码。** 原型 `drone-dispatch-prototype/h5` 已跑通完整 H5 演示链路并可编译微信小程序，本仓将以它为基线迁移。多仓结构与迁移方案见 [`drone-dispatch-prototype` 的 README](https://github.com/dnmsrc/drone-dispatch-prototype#项目全貌与仓库分布)。

## 规划技术栈

- uni-app（Vue 3 + `<script setup>` + TypeScript）+ Vite，一套代码同时产出 H5 与微信小程序（`mp-weixin`）
- 状态管理 Pinia、网络请求统一封装（对接 `drone-dispatch-server` 的 `/api`）
- 地图选点接高德、登录接 `wx.login` code2session、支付接微信/支付宝（原型阶段均为模拟，接入点已在原型预留）

## 迁移后的目录与命令（规划）

```bash
cd drone-dispatch-h5
npm install
npm run dev:h5          # H5 开发调试
npm run build:h5        # 产物 dist/build/h5
npm run build:mp-weixin # 微信小程序产物 dist/build/mp-weixin，用微信开发者工具导入（AppID 自行配置）
```

迁移时沿用原型时期的相对路径与页面结构，保证业务逻辑可直接搬运；机器读的目录名、接口路径、字段 key 一律英文 ASCII，文档与注释用中文。
