// 本地 Mock 路由（静态页阶段的数据源）：在浏览器内存里实现 H5 用到的接口子集，
// 响应形状与原型 mock-server 保持一致，页面里的 get/post 调用可以原样保留。
// 刷新页面 = 内存恢复种子数据；不连后端、不落库。
import fixtures from './fixtures.json'
import { avatar, photo } from './media'
import { MOCK_DELAY } from '@/config/env'

type Json = Record<string, any>

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

const CONSULT_STATUS_TEXT: Record<string, string> = {
  PENDING: '待客服接待',
  RECEIVED: '客服已接待·拟方案',
  DISPATCHED: '已派单·待你确认',
  CONFIRMED: '已确认派单',
  REJECTED: '客服已驳回',
  ABANDONED: '已自动废弃',
}

const DISPATCH_TERMS: Json = {
  approvalOwner: '承飞方（乙方）负责空域申请与备案',
  approvalFailLiability: '明确约定：乙方未按时取得批复 → 乙方全责退还已付费用',
  subcontractApproved: '是（甲方书面同意）',
  depositNature: '预付款（未约定定金条款，不适用定金罚则）',
  insuranceAmount: 1000000,
  scaleBasis: '投入规模（实际投入的机队数）；同时升空峰值由编舞决定，不作为计价与验收口径',
}

const DISPATCH_TERM_SPEC = [
  { key: 'approvalOwner', label: '审批义务承担主体', note: '' },
  {
    key: 'approvalFailLiability',
    label: '审批失败责任划分',
    note: '约定不明 → 双方共同承担、互不支付违约金或赔偿利息',
  },
  {
    key: 'subcontractApproved',
    label: '转包是否经甲方书面同意',
    note: '未经书面同意的转包费用可能不被认定为共同履约成本',
  },
  {
    key: 'depositNature',
    label: '签约节点是定金还是预付款',
    note: '未明确约定「定金」条款，解除时只能退还未履行部分',
  },
  { key: 'insuranceAmount', label: '责任保险保额', note: '行业实操要求不低于 100 万元' },
  { key: 'scaleBasis', label: '计价与验收按投入规模还是峰值', note: '派单只写投入规模' },
]

// ---- 内存数据库：刷新即恢复种子 ----
const db = {
  profile: clone(fixtures.profile),
  pricing: clone(fixtures.pricing),
  config: clone(fixtures.config),
  orders: clone(fixtures.orders) as Json[],
  consults: clone(fixtures.consults) as Json[],
  contracts: clone(fixtures.contracts) as Json[],
  user: null as Json | null,
  // 模拟微信授权建档：openid → 用户（同一 openid 复用一个账号，等价后端 users.openid 唯一索引）
  users: [] as Json[],
}

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const nowIso = () => new Date().toISOString()

function fail(msg: string, code = 40000, data?: Json): never {
  const err = new Error(msg) as Error & { code?: number; data?: Json }
  err.code = code
  err.data = data
  throw err
}

function ok(data: Json, msg = 'ok'): Json {
  return { code: 0, msg, data }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 已登录用户：内存优先，storage 兜底（刷新后 token 还在，但内存里的用户名丢了） */
function currentUser(): Json | null {
  if (db.user) return db.user
  let token = ''
  let user: Json | null = null
  try {
    token = uni.getStorageSync('token') || ''
    user = uni.getStorageSync('user') || null
  } catch {
    /* ignore */
  }
  if (!token || !user) return null
  db.user = user
  return db.user
}

function authUser(): Json {
  const u = currentUser()
  if (!u) fail('请先登录', 40100)
  return u as Json
}

// ---- 档期：由默认时段 + 休整日 + 已占用时段派生 ----
const OCCUPYING_STATUS = [
  'PENDING_PAY',
  'PENDING_ACCEPT',
  'ACCEPTED',
  'IN_SERVICE',
  'COMPLETED',
  'REVIEWED',
  'REFUNDING',
]

function bookedSlotsOf(date: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const o of db.orders) {
    if (o.performDate === date && OCCUPYING_STATUS.includes(o.status))
      out[o.timeSlot] = (out[o.timeSlot] || 0) + 1
  }
  return out
}

function scheduleOf(date: string): Json {
  const closed = (db.config.closedDates || []).includes(date)
  // fixtures.json 里 daySlots / customHolidays 是字面量对象，按 date 取值要显式声明成字典
  const daySlots = db.config.daySlots as Record<string, string[]>
  const customHolidays = db.config.customHolidays as Record<string, string>
  const slots: string[] = (daySlots && daySlots[date]) || db.config.defaultSlots || []
  const bookedSlots = bookedSlotsOf(date)
  const openSlots = slots.filter((s) => (bookedSlots[s] || 0) < 1)
  const booked = slots.filter((s) => (bookedSlots[s] || 0) >= 1).length
  return {
    date,
    closed,
    slots,
    openSlots,
    bookedSlots,
    noSlots: slots.length === 0,
    limit: slots.length,
    booked,
    holiday: customHolidays[date] || '',
    customHoliday: !!customHolidays[date],
    overridden: false,
    slotsOverridden: false,
  }
}

// ---- 计价与退款 ----
function computePrice(body: Json): { detail: Json[]; total: number } {
  const rules = db.pricing.priceRules
  const tier = rules.tiers.find((t: Json) => t.drones === Number(body.droneCount))
  if (!tier) fail('无效的架次档位')
  const dur = rules.durations.find((d: Json) => d.minutes === Number(body.duration))
  if (!dur) fail('无效的表演时长')
  const detail: Json[] = [{ label: `${tier.drones} 架基础价（含 10 分钟）`, amount: tier.price }]
  if (dur.extra > 0) detail.push({ label: `时长 ${dur.minutes} 分钟加价`, amount: dur.extra })
  if (body.customText && String(body.customText).trim())
    detail.push({
      label: `定制文字「${String(body.customText).trim()}」`,
      amount: rules.customTextPrice,
    })
  if (body.customLogo) detail.push({ label: 'LOGO/图片定制', amount: rules.customLogoPrice })
  for (const k of body.addons || []) {
    const a = rules.addons.find((x: Json) => x.key === k)
    if (!a) fail(`无效的附加服务：${k}`)
    detail.push({ label: a.label, amount: a.price })
  }
  return { detail, total: detail.reduce((s, i) => s + i.amount, 0) }
}

function performDateTime(o: Json): number {
  const start = String(o.timeSlot || '20:00').slice(0, 5)
  return new Date(`${o.performDate}T${start}:00+08:00`).getTime()
}

function refundPreview(o: Json): Json {
  if (o.status === 'PENDING_ACCEPT')
    return {
      refundable: true,
      ratio: 1,
      amount: o.totalAmount,
      ruleLabel: '订单未接单，可全额退款',
    }
  if (o.status !== 'ACCEPTED')
    return { refundable: false, ratio: 0, amount: 0, ruleLabel: '当前状态不可退款' }
  const hours = (performDateTime(o) - Date.now()) / 3600000
  const rules = db.pricing.refundRules
  const hit = rules.find((r: Json) => hours >= r.minHours) || { ratio: 0, label: '不可退款' }
  return {
    refundable: hit.ratio > 0,
    ratio: hit.ratio,
    amount: Math.round(o.totalAmount * hit.ratio),
    ruleLabel: hit.label,
    hoursToPerform: Math.round(hours),
  }
}

function publicOrder(o: Json): Json {
  return {
    ...o,
    statusText: o.statusText || undefined,
    media: {
      photos: (o.media && o.media.photos ? o.media.photos : []).map((p: string) =>
        p.startsWith('data:') ? p : photo(p),
      ),
      videos: (o.media && o.media.videos) || [],
    },
  }
}

function orderSeq(): string {
  return String(db.orders.length + 23).padStart(4, '0')
}

// ---- 咨询单：用户侧只能提交与确认派单；静态阶段用定时器模拟客服接待/派单 ----
const CONSULT_ACTIVE = ['PENDING', 'RECEIVED', 'DISPATCHED', 'CONFIRMED']

function activeConsultOf(userId: string): Json | null {
  return (
    db.consults
      .filter((c) => c.userId === userId && CONSULT_ACTIVE.includes(c.status))
      .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))[0] || null
  )
}

function publicConsult(c: Json): Json {
  const d = c.dispatch
    ? {
        ...c.dispatch,
        mustFill:
          c.dispatch.mustFill && c.dispatch.mustFill.length
            ? c.dispatch.mustFill
            : DISPATCH_TERM_SPEC.map((t) => ({
                key: t.key,
                label: t.label,
                value: (c.dispatch.terms || {})[t.key] ?? null,
                required: true,
                note: t.note,
              })),
      }
    : null
  return { ...c, statusText: CONSULT_STATUS_TEXT[c.status] || c.status, dispatch: d }
}

function consultSummary(c: Json): Json {
  return {
    id: c.id,
    status: c.status,
    statusText: CONSULT_STATUS_TEXT[c.status] || c.status,
    performDate: c.performDate,
    timeSlot: c.timeSlot,
    venue: c.venue ? { id: c.venue.id, name: c.venue.name } : null,
    submittedAt: c.submittedAt,
    note: c.note || '',
    dispatch: c.dispatch ? { id: c.dispatch.id, quoteRange: c.dispatch.quoteRange || [] } : null,
  }
}

/**
 * 静态演示的关键差异：原型里「客服接待 + 创建派单」发生在管理端，
 * 静态页无管理端，这里用定时器模拟（收到 ↓ 3 秒接待、6 秒派单），页面轮询即可看到状态推进。
 */
function simulateDispatch(c: Json): void {
  setTimeout(() => {
    if (c.status !== 'PENDING') return
    c.status = 'RECEIVED'
    c.receivedBy = '调度操作员'
    c.receivedAt = nowIso()
    c.updatedAt = c.receivedAt
    c.timeline.push({ at: c.receivedAt, by: '客服', text: '客服已接待，正在拟定方案' })
    setTimeout(() => {
      if (c.status !== 'RECEIVED') return
      const lo = Math.round((c.quote?.total || 0) * 0.9)
      const hi = Math.round((c.quote?.total || 0) * 1.15)
      c.status = 'DISPATCHED'
      c.updatedAt = nowIso()
      c.dispatch = {
        id: 'P' + String(c.id).slice(1),
        status: 'DISPATCHED',
        createdBy: '调度操作员',
        createdAt: c.updatedAt,
        quoteRange: [lo, hi],
        terms: DISPATCH_TERMS,
        note: '静态演示：接待与派单由本地 Mock 自动推进；正式版由客服在管理端创建。',
      }
      c.timeline.push({
        at: c.updatedAt,
        by: '客服',
        text: `已创建派单 ${c.dispatch.id}，等待用户确认`,
      })
    }, 3000)
  }, 3000)
}

// ---- 路由表 ----
type Ctx = { params: Record<string, string>; query: Record<string, string>; body: Json }
type Handler = (c: Ctx) => Json

interface RouteDef {
  method: string
  parts: string[]
  handler: Handler
}

const routes: RouteDef[] = []

function route(method: string, pattern: string, handler: Handler): void {
  routes.push({ method, parts: pattern.split('/').filter(Boolean), handler })
}

function match(parts: string[], pathParts: string[]): Record<string, string> | null {
  if (parts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(pathParts[i])
    else if (p !== pathParts[i]) return null
  }
  return params
}

function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {}
  const q = search.startsWith('?') ? search.slice(1) : search
  for (const kv of q.split('&')) {
    if (!kv) continue
    const i = kv.indexOf('=')
    const k = decodeURIComponent(i >= 0 ? kv.slice(0, i) : kv)
    out[k] = decodeURIComponent(i >= 0 ? kv.slice(i + 1) : '')
  }
  return out
}

// ---- 配置 ----
route('GET', '/config/profile', () => ok({ ...db.profile }))

route('GET', '/config/pricing', () =>
  ok({ ...db.pricing, venues: db.pricing.venues.filter((v: Json) => v.enabled !== false) }),
)

// ---- 档期 ----
route('GET', '/schedule', ({ query }) => {
  const from = query.from || fmtDate(new Date())
  const to = query.to || fmtDate(new Date(Date.now() + 60 * 86400000))
  const days: Json[] = []
  const d = new Date(`${from}T00:00:00+08:00`)
  const end = new Date(`${to}T00:00:00+08:00`)
  while (d <= end) {
    days.push(scheduleOf(fmtDate(d)))
    d.setDate(d.getDate() + 1)
  }
  return ok({ days })
})

// ---- 场地 ----
route('GET', '/venues', () =>
  ok({ venues: db.pricing.venues.filter((v: Json) => v.enabled !== false) }),
)

route('GET', '/venue/search', ({ query }) => {
  const kw = (query.keyword || '').trim()
  const list = db.pricing.venues.filter(
    (v: Json) =>
      v.enabled !== false && (!kw || String(v.name).includes(kw) || String(v.address).includes(kw)),
  )
  return ok({ venues: list })
})

// ---- 鉴权（模拟微信网页授权 code2session） ----
// 真实链路：前端拿到微信回跳的 code → 后端用 AppSecret 调
//   GET https://api.weixin.qq.com/sns/oauth2/access_token?appid=&secret=&code=&grant_type=authorization_code
//   拿到 openid/access_token → GET /sns/userinfo 取昵称头像 → 按 openid 建档 → 签发自己的 token。
// Mock 阶段用 mockOpenid 顶替 openid（前端存在本地，保证同一浏览器重登不换人），
// 接口形状保持 { code }，真实后端接管时前端代码不用改。
function mockHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function publicUser(u: Json): Json {
  return {
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    phone: u.phone || '',
    openid: u.openid || '',
    profileReady: !!u.profileReady,
  }
}

// ---- 账号表：微信与手机号两种登录共用一份 ----
// 口径与 wx-server.js 一致：openid 与 phone 是同一个账号上的两个「身份位」，不是两条账号。
// 两种登录都先按已有身份找账号、找不到才建档，否则同一个人换个登录方式就会变成两个人。
// 账号落 localStorage：刷新页面 / 重新扫码进来后「他之前的账号」还在 —— 这是
// 「手机号登录不该新建账号」能被验证的前提。
const USERS_KEY = 'mock_users'

function loadUsers(): Json[] {
  try {
    const raw = uni.getStorageSync(USERS_KEY)
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveUsers(): void {
  try {
    uni.setStorageSync(USERS_KEY, JSON.stringify(db.users))
  } catch {
    /* 隐私模式：账号只活在内存里，不影响本次演示 */
  }
}

function byOpenid(openid: string): Json | null {
  if (!openid) return null
  return db.users.find((x) => x && x.openid === openid) || null
}

function byPhone(phone: string): Json | null {
  if (!phone) return null
  return db.users.find((x) => x && x.phone === phone) || null
}

/** 新建账号骨架（调用方补身份位与昵称头像） */
function newUser(): Json {
  const seq = String(db.users.length + 1).padStart(4, '0')
  return { id: 'u' + (9000 + db.users.length), nickname: '用户' + seq, avatar: '' }
}

// 启动时恢复账号表（db 定义在前，这里补一次即可）
const persistedUsers = loadUsers()
if (persistedUsers.length) db.users = persistedUsers

route('POST', '/auth/wechat-login', ({ body }) => {
  if (!body.code) fail('缺少微信授权 code（请重新发起授权）', 40001)
  const openid = String(body.mockOpenid || 'oMock_' + mockHash(String(body.code)))
  // 本机上次用手机号登录过的号码：用来把「先手机号后微信」两次登录并到同一个账号
  const rememberedPhone = String(body.phone || '')

  let u = byOpenid(openid)
  let merged = false
  if (!u) {
    const prev = PHONE_RE.test(rememberedPhone) ? byPhone(rememberedPhone) : null
    // 该手机号账号还没绑微信 → 同一个人，把 openid 挂上去，登录他之前的账号
    if (prev && !prev.openid) {
      prev.openid = openid
      u = prev
      merged = true
    }
  }
  if (!u) {
    const seq = String(db.users.length + 1).padStart(4, '0')
    u = newUser()
    u.openid = openid
    u.nickname = '微信用户_' + seq
    u.avatar = avatar('wechat-' + seq)
    db.users.push(u)
  }
  saveUsers()
  db.user = u
  return ok(
    { token: 'utk_mock_' + mockHash(openid), user: publicUser(u), merged },
    merged ? '已登录你之前的账号' : '登录成功',
  )
})

route('POST', '/auth/logout', () => {
  db.user = null
  return ok({})
})

// 恢复登录态 / 校验 token 是否还有效（前端启动时可用；403/401 由 authUser 统一抛 40100）
route('GET', '/auth/me', () => {
  const u = authUser()
  return ok({ user: publicUser(u) })
})

// 主动获取微信昵称头像（snsapi_userinfo 一档，用户「我的」里点一下才会调）。
// 真实后端：拿 code 调 /sns/userinfo → 回填 users 表 → 返回昵称头像。登录走的 base 授权拿不到这些。
route('POST', '/user/wechat-profile', ({ body }) => {
  if (!body.code) fail('缺少微信授权 code（请重新发起授权）', 40001)
  const u = authUser()
  const seq = mockHash(String(u.id)).slice(-4)
  u.nickname = '微信用户_' + seq
  u.avatar = avatar('wechat-' + seq)
  u.profileReady = true
  saveUsers()
  db.user = u
  return ok({ nickname: u.nickname, avatar: u.avatar, openid: u.openid }, '已获取微信资料')
})

// ---- 手机号验证码登录（微信外兜底通道）----
// 真实后端接短信服务商（阿里云/腾讯云）并向 users 表落 phone；Mock 用内存假码，
// 响应形状与真实接口一致，前端代码切后端时不需要改。
const smsCodes = new Map<string, string>()
const PHONE_RE = /^1[3-9]\d{9}$/

route('POST', '/auth/sms/code', ({ body }) => {
  const phone = String(body.phone || '')
  if (!PHONE_RE.test(phone)) fail('请输入正确的手机号', 40002)
  const code = '123456'
  smsCodes.set(phone, code)
  // demoCode 只给演示/自动化用：前端拿它提示「验证码固定为 123456」；真实后端不要返回
  return ok({ ttl: 60, demoCode: code }, '验证码已发送')
})

route('POST', '/auth/sms/login', ({ body }) => {
  const phone = String(body.phone || '')
  const code = String(body.code || '')
  if (!PHONE_RE.test(phone)) fail('请输入正确的手机号', 40002)
  if (!code) fail('请输入验证码', 40003)
  if (smsCodes.get(phone) !== code) fail('验证码不正确或已过期', 40004)
  smsCodes.delete(phone)

  // 本机上次微信登录的 openid：用来把「先微信后手机号」两次登录并到同一个账号
  const openid = String(body.openid || '')

  let u = byPhone(phone)
  let merged = false
  if (!u && openid) {
    const w = byOpenid(openid)
    // 该微信账号还没绑手机号 → 同一个人（短信验证已证明手机号归属），绑上，登录他之前的账号
    if (w && !w.phone) {
      w.phone = phone
      u = w
      merged = true
    }
  }
  if (!u) {
    const seq = String(db.users.length + 1).padStart(4, '0')
    u = newUser()
    u.nickname = '用户' + phone.slice(-4)
    u.avatar = avatar('phone-' + seq)
    u.phone = phone
    db.users.push(u)
  }
  saveUsers()
  db.user = u
  return ok(
    { token: 'utk_mock_' + mockHash(phone), user: publicUser(u), merged },
    merged ? '已登录你之前的账号' : '登录成功',
  )
})

// ---- 订单 ----

/**
 * 静态阶段专用的续期：种子里的待支付单的 expireAt 是写入数据那一刻的「现在 + 15 分钟」，
 * 隔天再看就过期了，收银台会直接弹「订单已超时取消」并跳详情，演示链路等于断掉。
 * 这里在读取时把已经过期的待支付单续到「现在 + 15 分钟」，保证「去支付 → 收银台倒计时 → 支付成功」始终可演示。
 * 正式接后端后，过期时间由服务端下单接口决定，这段逻辑随 Mock 一起删掉。
 */
const PAY_WINDOW_MS = 15 * 60 * 1000

function freshenPendingPay(o: Json): Json {
  if (o.status === 'PENDING_PAY') {
    const t = o.expireAt ? new Date(o.expireAt).getTime() : NaN
    if (!Number.isFinite(t) || t <= Date.now()) {
      o.expireAt = new Date(Date.now() + PAY_WINDOW_MS).toISOString()
    }
  }
  return o
}

route('GET', '/orders', ({ query }) => {
  const s = authUser()
  let list = db.orders.filter((o) => o.userId === s.id || o.userId === 'u1001')
  if (query.status) {
    const sts = query.status.split(',')
    list = list.filter((o) => sts.includes(o.status))
  }
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return ok({
    list: list.map((o) => ({
      ...publicOrder(freshenPendingPay(o)),
      statusText: orderStatusText(o.status),
    })),
  })
})

route('GET', '/orders/:id', ({ params }) => {
  authUser()
  const o = db.orders.find((x) => x.id === params.id)
  if (!o) fail('订单不存在', 40400)
  return ok({
    order: { ...publicOrder(freshenPendingPay(o)), statusText: orderStatusText(o.status) },
  })
})

route('POST', '/orders', ({ body }) => {
  const s = authUser()
  const { detail, total } = computePrice(body)
  const today = fmtDate(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.performDate || '')) fail('请选择表演日期')
  if (body.performDate <= today) fail('表演日期最早为明天')
  const sch = scheduleOf(body.performDate)
  if (sch.closed) fail('该日期为休整日，请选择其他日期')
  const slot = String(body.timeSlot || '')
  if (!slot) fail('请选择表演时段')
  if (!sch.slots.includes(slot)) fail('该时段当日未开放接单，请选择其他时段')
  if ((sch.bookedSlots[slot] || 0) >= 1) fail('该时段已被占用，请选择其他时段')
  if (!body.venue || !String(body.venue.name || '').trim()) fail('请填写表演场地')
  if (!body.contact || !body.contact.name || !/^1\d{10}$/.test(body.contact.phone || ''))
    fail('请填写正确的联系人姓名与 11 位手机号')

  const created = new Date()
  const o: Json = {
    id: `D${fmtDate(created).replace(/-/g, '')}-${orderSeq()}`,
    userId: s.id,
    status: 'PENDING_PAY',
    droneCount: Number(body.droneCount),
    duration: Number(body.duration),
    patternPreset: body.patternPreset || [],
    customText: String(body.customText || '')
      .trim()
      .slice(0, 10),
    customLogo: body.customLogo || '',
    addons: body.addons || [],
    occasion: body.occasion || '',
    performDate: body.performDate,
    timeSlot: slot,
    venue: body.venue,
    contact: body.contact,
    priceDetail: detail,
    totalAmount: total,
    payChannel: '',
    payTradeNo: '',
    paidAt: '',
    acceptedBy: '',
    acceptedAt: '',
    startedAt: '',
    completedAt: '',
    media: { photos: [], videos: [] },
    review: null,
    refund: null,
    cancelReason: '',
    timeline: [{ time: nowIso(), text: '提交订单' }],
    createdAt: nowIso(),
    expireAt: new Date(
      Date.now() + (db.pricing.priceRules.payExpireMinutes ?? 15) * 60000,
    ).toISOString(),
  }
  db.orders.unshift(o)
  return ok({ order: publicOrder(o) }, '下单成功')
})

route('POST', '/orders/:id/pay', ({ params, body }) => {
  authUser()
  const o = db.orders.find((x) => x.id === params.id)
  if (!o) fail('订单不存在', 40400)
  if (o.status !== 'PENDING_PAY') fail('订单状态已变化，请刷新')
  if (!body.success) return ok({ paid: false }, '支付失败，可重试')
  const channel = body.channel === 'ALIPAY' ? 'ALIPAY' : 'WECHAT'
  o.payChannel = channel
  o.payTradeNo = `${channel === 'WECHAT' ? 'WX' : 'ALI'}${Date.now()}`
  o.paidAt = nowIso()
  o.status = 'PENDING_ACCEPT'
  o.timeline.push({
    time: o.paidAt,
    text: `支付成功（${channel === 'WECHAT' ? '微信支付' : '支付宝'}），等待商户接单`,
  })
  return ok({ paid: true, order: publicOrder(o) }, '支付成功')
})

route('POST', '/orders/:id/cancel', ({ params }) => {
  authUser()
  const o = db.orders.find((x) => x.id === params.id)
  if (!o) fail('订单不存在', 40400)
  if (o.status !== 'PENDING_PAY') fail('仅待支付订单可取消')
  o.status = 'CANCELLED'
  o.cancelReason = '用户主动取消'
  o.timeline.push({ time: nowIso(), text: '用户主动取消订单' })
  return ok({ order: publicOrder(o) }, '订单已取消')
})

route('POST', '/orders/:id/refund-preview', ({ params }) => {
  authUser()
  const o = db.orders.find((x) => x.id === params.id)
  if (!o) fail('订单不存在', 40400)
  const pv = refundPreview(o)
  return ok({ preview: { ...pv, totalAmount: o.totalAmount, rules: db.pricing.refundRules } })
})

route('POST', '/orders/:id/refund', ({ params, body }) => {
  authUser()
  const o = db.orders.find((x) => x.id === params.id)
  if (!o) fail('订单不存在', 40400)
  const pv = refundPreview(o)
  if (!pv.refundable) fail(pv.ruleLabel || '当前状态不可退款')
  if (!body.reason || !String(body.reason).trim()) fail('请填写退款原因')
  o.refund = {
    reason: String(body.reason).trim(),
    ratio: pv.ratio,
    applyAmount: pv.amount,
    status: 'PENDING',
    prevStatus: o.status,
    auditBy: '',
    auditNote: '',
    refundAmount: 0,
    refundNo: '',
    createdAt: nowIso(),
    auditedAt: '',
  }
  o.status = 'REFUNDING'
  o.timeline.push({ time: nowIso(), text: `用户申请退款（${pv.ruleLabel}，预计退 ¥${pv.amount}）` })
  return ok({ order: publicOrder(o) }, '退款申请已提交，等待审核')
})

route('POST', '/orders/:id/review', ({ params, body }) => {
  authUser()
  const o = db.orders.find((x) => x.id === params.id)
  if (!o) fail('订单不存在', 40400)
  if (o.status !== 'COMPLETED') fail('仅已完成订单可评价')
  const stars = Math.min(5, Math.max(1, Number(body.stars) || 5))
  o.review = { stars, content: String(body.content || '').slice(0, 200), createdAt: nowIso() }
  o.status = 'REVIEWED'
  o.timeline.push({ time: nowIso(), text: '用户已评价' })
  return ok({ order: publicOrder(o) }, '评价成功')
})

// ---- 咨询单（用户侧） ----
route('GET', '/consults/active', () => {
  const s = authUser()
  const active = activeConsultOf(s.id) || activeConsultOf('u1001')
  return ok({ active: active ? publicConsult(active) : null })
})

route('GET', '/consults/mine', () => {
  const s = authUser()
  const list = db.consults
    .filter((c) => c.userId === s.id || c.userId === 'u1001')
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))
    .map(publicConsult)
  return ok({ list })
})

route('GET', '/consults/:id', ({ params }) => {
  authUser()
  const c = db.consults.find((x) => x.id === params.id)
  if (!c) fail('咨询单不存在', 40400)
  return ok({ consult: publicConsult(c) })
})

route('POST', '/consults', ({ body }) => {
  const s = authUser()
  const performDate = String(body.performDate || '')
  const timeSlot = String(body.timeSlot || '')
  if (!performDate || !timeSlot) fail('请先选择申请日期与时段')
  if (!body.venue || !body.venue.name) fail('请先选择场地')
  if (!body.need || !body.need.droneCount) fail('缺少规模与内容')

  const active = activeConsultOf(s.id)
  if (active && body.abandonActive !== true) {
    fail(`你已有一张进行中的咨询单（${active.id}）`, 40901, {
      active: consultSummary(active),
      sameVenue: !!(
        active.venue &&
        body.venue &&
        (active.venue.id === body.venue.id || active.venue.name === body.venue.name)
      ),
      sameSlot: active.performDate === performDate && active.timeSlot === timeSlot,
    })
  }

  const v = body.venue
  const venue = {
    id: v.id || '',
    name: v.name,
    type: v.type || 'preset',
    address: v.address || '',
    lng: v.lng,
    lat: v.lat,
  }
  const quote = body.quote || {}
  const total = Number(quote.total) || 0
  const seq = String(
    db.consults.filter((c) => String(c.id).startsWith('C' + fmtDate(new Date()).replace(/-/g, '')))
      .length + 1,
  ).padStart(4, '0')
  const c: Json = {
    id: 'C' + fmtDate(new Date()).replace(/-/g, '') + '-' + seq,
    userId: s.id,
    status: 'PENDING',
    statusText: CONSULT_STATUS_TEXT.PENDING,
    submittedAt: nowIso(),
    updatedAt: nowIso(),
    note: body.note || '',
    need: body.need,
    venue,
    judgment: body.judgment || {
      conclusion: 'SURVEY',
      conclusionText: '无实测数据，需实地勘察',
      checks: [],
    },
    performDate,
    timeSlot,
    reasons: body.reasons || [],
    quote: {
      total,
      lo: Math.round(total * 0.9),
      hi: Math.round(total * 1.15),
      fee: (quote.fee || {
        payable: 0,
        factors: [],
        waived: { condition: '', effect: '' },
      }) as Json,
    },
    dispatch: null,
    supersede: null,
    reject: null,
    timeline: [{ at: nowIso(), by: '用户', text: '提交咨询单，等待客服接待' }],
  }

  if (active) {
    active.status = 'ABANDONED'
    active.supersede = { by: c.id, at: c.submittedAt, text: '用户重新申请，本单自动废弃' }
    active.updatedAt = nowIso()
    active.timeline.push({
      at: active.updatedAt,
      by: '系统',
      text: `用户重新申请（${c.id}），本单自动废弃`,
    })
    c.timeline.unshift({ at: c.submittedAt, by: '系统', text: `已自动废弃旧咨询单 ${active.id}` })
  }

  db.consults.push(c)
  simulateDispatch(c)
  return ok({ consult: publicConsult(c) }, '咨询单已提交，客服将在工作时间内接待')
})

route('POST', '/consults/:id/confirm-dispatch', ({ params }) => {
  authUser()
  const c = db.consults.find((x) => x.id === params.id)
  if (!c) fail('咨询单不存在', 40400)
  if (c.status === 'CONFIRMED') fail('派单已确认，无需重复确认')
  if (c.status !== 'DISPATCHED') fail('客服还没有创建派单，暂时无法确认')
  c.status = 'CONFIRMED'
  c.updatedAt = nowIso()
  if (c.dispatch) {
    c.dispatch.status = 'CONFIRMED'
    c.dispatch.confirmedAt = c.updatedAt
    c.dispatch.confirmedBy = '用户'
  }
  c.timeline.push({
    at: c.updatedAt,
    by: '用户',
    text: `用户已确认派单 ${c.dispatch ? c.dispatch.id : ''}`,
  })
  return ok({ consult: publicConsult(c) }, '派单已确认')
})

function orderStatusText(status: string): string {
  const map: Record<string, string> = {
    PENDING_PAY: '待支付',
    PENDING_ACCEPT: '待接单',
    ACCEPTED: '已接单·待执行',
    IN_SERVICE: '执行中',
    COMPLETED: '已完成',
    REVIEWED: '已评价',
    CANCELLED: '已取消',
    REFUNDING: '退款中',
    REFUNDED: '已退款',
  }
  return map[status] || status
}

/**
 * 本地 Mock 请求入口：与原型 `api(method, url, data, opts)` 的语义对齐。
 * 静态阶段一次性落到内存路由；接后端时把本函数替换成 uni.request 即可，页面不用改。
 */
export async function mockRequest(method: string, url: string, body: Json = {}): Promise<Json> {
  if (MOCK_DELAY > 0) await sleep(MOCK_DELAY)
  const [path, search = ''] = String(url).split('?')
  const pathParts = path.split('/').filter(Boolean)
  const query = parseQuery(search)
  const upper = method.toUpperCase()
  for (const r of routes) {
    if (r.method !== upper) continue
    const params = match(r.parts, pathParts)
    if (!params) continue
    return r.handler({ params, query, body: body || {} })
  }
  throw Object.assign(new Error(`Mock 路由未实现：${upper} ${path}`), { code: 40400 })
}
