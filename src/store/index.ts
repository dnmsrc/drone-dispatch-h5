// 全局状态（静态页阶段）：用户、品牌档案、计价缓存、下单草稿、申请草稿与条款留痕。
// 说明：申请引擎（判定/日历/报价/合同/告知条款）整包复用原型基线，页面与组件统一从本模块取状态，
// 不在页面里各写一份。接后端后，把 hydrateTo 里的推导改成接口返回即可，页面无需改动。
import { reactive, watch } from 'vue'
import { VENUES, venueOf } from '@/mock/engines/venues.js'
import { judge } from '@/mock/engines/judge.js'
import { quote as calcQuote } from '@/mock/engines/pricing.js'
import { calendarDays, dayInfo } from '@/mock/engines/calendar.js'
import { CLAUSES, hashOf } from '@/mock/engines/contract.js'
import {
  DISCLOSURE_VERSION,
  clauseOf,
  contentHash,
  confirmedClauses,
  pendingTouches,
} from '@/mock/engines/disclosure.js'

export interface MockUser {
  id: string
  nickname: string
  avatar?: string
  phone?: string
  /** 微信昵称头像是否已由用户主动授权获取（登录只拿 openid，资料是后补的） */
  profileReady?: boolean
  /** 微信只回了脱敏资料（「微信用户」+ 默认灰头像）：此后不再重复走授权，直接手动设置 */
  profileMasked?: boolean
}

export interface ApplyDraft {
  step: number
  acks: Array<Record<string, unknown>>
  wxAcks: Array<Record<string, unknown>>
  need: Record<string, any>
  venue: Record<string, any> | null
  date: string
  slot: string
  anchor: string
  judgment: Record<string, any> | null
  quote: Record<string, any> | null
  consult: Record<string, any> | null
  dispatch: Record<string, any> | null
  contract: Record<string, any> | null
  payment: Record<string, any> | null
}

// 草稿按「会话」存：演示中途 F5 能恢复，关掉标签页 / 换一次演示则重新开始。
// 用 window.sessionStorage 而不是 uni 的 localStorage：后者跨会话，会把上一次演示的草稿带进来。
const APPLY_KEY = 'apply_draft'

function storeSpace(): Storage | null {
  return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null
}

export function newApply(): ApplyDraft {
  return {
    step: 1,
    acks: [], // 逐条确认事件：[{ v, at, user, hash, clause, touch }]，按说明版本绑定（版本变了要重新确认）
    wxAcks: [], // 天气未公布时的预约风险确认：[{ v, date, slot, at, user, hash, horizonDays, source }]
    need: {
      droneCount: 100,
      duration: 10,
      contentMode: 'template',
      screens: 'mid',
      dimension: '2D',
      motion: 'static',
      matrix: 1,
      addons: [],
      audience: 200,
    },
    venue: null,
    date: '',
    slot: '',
    anchor: 'flex', // 第 3 步求解方向：flex = 锁场地解日期；fixed = 锁日期解场地
    judgment: null,
    quote: null,
    consult: null,
    dispatch: null,
    contract: null,
    payment: null,
  }
}

function loadApply(): ApplyDraft | null {
  const s = storeSpace()
  if (!s) return null
  try {
    const raw = s.getItem(APPLY_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || typeof d !== 'object') return null
    // 老草稿可能缺字段（结构会变），按当前结构补齐，缺什么补什么
    return Object.assign(newApply(), d)
  } catch {
    return null
  }
}

function saveApply(a: ApplyDraft) {
  const s = storeSpace()
  if (!s || !a) return
  try {
    s.setItem(APPLY_KEY, JSON.stringify(a))
  } catch {
    /* 隐私模式 / 配额满：丢草稿不影响渲染 */
  }
}

export const store = reactive({
  token: '',
  user: null as MockUser | null,
  profile: null as Record<string, any> | null, // 品牌档案（业务名 / slogan）
  pricing: null as Record<string, any> | null, // /config/pricing 缓存
  draft: null as Record<string, any> | null, // 下单草稿（create -> confirm 传递）
  apply: (loadApply() || newApply()) as ApplyDraft,
})

// 任何页面改草稿都写回，不依赖每页各自记得存（deep watch）
watch(store, (v) => saveApply(v.apply), { deep: true })

/** 步骤号 → 页面名（与 src/pages/apply 下的文件名一致） */
export const APPLY_PAGES = [
  'venue',
  'need',
  'date',
  'quote',
  'consult',
  'contract',
  'pay',
  'progress',
]

export function ensureApply(): ApplyDraft {
  if (!store.apply) store.apply = newApply()
  return store.apply
}

/** 1 基：哪些步骤的产物是「推导出来的结论」（可重算），哪些是「用户填的选择」（不能预置） */
const DERIVED = [false, false, true, false, true, true, true, true]

let coldEntry = true

export function hydrateForPage(step: number): ApplyDraft {
  const a = ensureApply()
  // 告知不再是流程的第一步，也不在填写途中打断：本步条款在点「下一步/提交/签署」时逐条确认。
  if (coldEntry) {
    coldEntry = false
    hydrateTo(step)
    a.step = step // 冷进入时把「当前步」对齐到正在看的页，否则步骤条会亮在第 1 步而页面显示第 4 步内容
  } else if (a.step > step) {
    hydrateTo(step)
  } else if (DERIVED[step] && !stepFilled(step)) {
    // 回退后重走：用户填的选择还在，缺的「结论」按当前上游重算（用户填的步骤不预置）
    hydrateTo(step)
  }
  return a
}

function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function accountName(): string {
  const u = store.user
  return u ? u.nickname || u.id || '未登录' : '未登录'
}

/**
 * 逐条确认：每次弹层里点「确认本条」是一个独立事件
 * （版本 + 条款号 + 触点 + 时间戳 + 账号 + 内容哈希）。
 * 已确认不可撤销——留痕的意义就是「当时确实确认过」，撤销会让记录变成可篡改的。
 */
export function confirmClause(touch: string): { ok: boolean; clause: any } {
  const a = ensureApply()
  const c = clauseOf(touch)
  if (!c) return { ok: false, clause: null }
  if (!confirmedClauses(a.acks, DISCLOSURE_VERSION).includes(c.n as never)) {
    a.acks.push({
      v: DISCLOSURE_VERSION,
      at: nowStamp(),
      user: accountName(),
      hash: contentHash(),
      clause: c.n,
      touch,
    })
    return { ok: true, clause: c }
  }
  return { ok: false, clause: c }
}

/** 本单适用但尚未确认的触点（门用这个）—— 只看已经走到的那几步里触发的条款 */
export function pendingForPage(step: number): string[] {
  const a = ensureApply()
  return pendingTouches(a, null, step || a.step)
}

/**
 * 天气未公布（超出逐日预报期）时的预约风险确认：
 * 记录 = 说明版本 + 日期 + 时段 + 时间戳 + 账号 + 内容哈希 + 当时的预报期，按日期×时段绑定；
 * 换日期或换时段就要重新确认，不能拿一条旧记录覆盖新选择。
 */
export function ackWeatherRisk(input: {
  date: string
  slot: string
  horizonDays?: number
  source?: string
}): Record<string, any> {
  const a = ensureApply()
  const hit = a.wxAcks.find(
    (e: any) => e && e.date === input.date && e.slot === input.slot && e.v === DISCLOSURE_VERSION,
  )
  if (hit) return hit as Record<string, any>
  const rec = {
    v: DISCLOSURE_VERSION,
    date: input.date,
    slot: input.slot,
    at: nowStamp(),
    user: accountName(),
    hash: contentHash(),
    horizonDays: input.horizonDays || 0,
    source: input.source || '',
  }
  a.wxAcks.push(rec)
  return rec
}

export function wxAckOf(date: string, slot: string): Record<string, any> | null {
  const a = ensureApply()
  return (
    a.wxAcks
      .filter((e: any) => e && e.date === date && e.slot === slot && e.v === DISCLOSURE_VERSION)
      .pop() || null
  )
}

/** 某一步是否「已编写」—— 判据是这一步的产物数据在不在，不是它有没有被访问过 */
export function stepFilled(step: number): boolean {
  const a = store.apply
  if (!a) return false
  const paid = !!(a.contract && a.contract.paidNodes && a.contract.paidNodes.length)
  switch (step) {
    case 1:
      return !!a.venue
    case 2:
      return !!(a.venue && a.need && a.judgment)
    case 3:
      return !!(a.venue && a.need && a.judgment && a.date && a.slot)
    case 4:
      return !!(a.venue && a.need && a.judgment && a.date && a.quote)
    case 5:
      return !!(a.consult && ['DISPATCHED', 'CONFIRMED'].includes(String(a.consult.status)))
    case 6:
      return !!a.contract
    case 7:
      return !!(a.contract && paid)
    case 8:
      return !!(a.contract && a.quote && paid)
    default:
      return false
  }
}

/**
 * 用户在某一步改了选择：他填的东西一律保留，只作废「由上游推导出来的结论」——判定单、报价、咨询派单、合同、付款记录。
 * 依赖链：判定 = 场地(1) × 规模与内容(2)；报价 = 判定 + 日期时段(3)。
 */
export function invalidateFrom(changedStep: number): void {
  const a = store.apply
  if (!a) return
  if (changedStep <= 2) a.judgment = null
  if (changedStep <= 3) a.quote = null
  if (changedStep <= 5) {
    a.consult = null
    a.dispatch = null
  }
  if (changedStep <= 6) a.contract = null
  else if (a.contract) a.contract.paidNodes = []
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function seedContract(a: ApplyDraft, paid: boolean): Record<string, any> {
  const d = new Date()
  const content = [
    a.quote?.total,
    a.venue?.name,
    a.date,
    a.slot,
    '演示签署人',
    CLAUSES.map((c: any) => c.key).join(','),
  ].join('|')
  return {
    no:
      'HT' +
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      '-' +
      hashOf(content).slice(0, 6).toUpperCase(),
    subject: 'person',
    name: '演示签署人',
    idno: '530************01X',
    agent: '',
    phone: '138****0000',
    clauses: CLAUSES.map((c: any) => c.key),
    hash: hashOf(content),
    time: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    ca: '演示环境未接入 CA · 正式版由依法设立的电子认证服务提供者签发',
    paidNodes: paid ? ['SIGN'] : [],
    seed: true,
  }
}

/**
 * 把演示往深里做：跳到第 n 步时，把 1..n 步缺的产物按真实算法补全（不是塞假数字）。
 * 补的是「缺失」，已有的一律不动，所以预生成后用户自己改选择也不会覆盖他的决定。
 */
export function hydrateTo(step: number): ApplyDraft {
  const a = ensureApply()
  const need = a.need

  // 第 1 步产物是场地（用户选，不预置）；只有冷进入第 2 步及以后才补一个有实测档案的默认场地
  if (step >= 2 && !a.venue) {
    a.venue = venueOf('V02') || VENUES[0]
    a.judgment = null
  }
  // 第 2 步产物：判定单 = 场地 × 规模 × 观众（规模与内容是用户填的，不预置）
  if (step >= 2 && a.venue && !a.judgment) {
    a.judgment = judge({
      venue: a.venue,
      drones: need.droneCount,
      date: a.date || '',
      audience: need.audience,
    })
  }

  // 第 3 步产物：日期与申请时段（时段是排他资源，只能取可安排的那一个）
  if (step >= 3 && a.venue && (!a.date || !a.slot)) {
    const days = calendarDays({ venue: a.venue, drones: need.droneCount })
    let day = a.date ? dayInfo(days, a.date) : null
    if (!day || !day.openSlots.length)
      day = days.find((x: any) => x.status === 'ok') || days.find((x: any) => !x.disabled)
    if (day) {
      a.date = day.date
      a.slot = (day.openSlots[0] || { slot: '20:00-21:00' }).slot
    }
  }

  // 第 4 步产物：报价区间（判定结果驱动，含判定费）
  if (step >= 4 && !a.quote && a.venue && a.judgment && a.date) {
    a.quote = calcQuote({ need, venue: a.venue, judgment: a.judgment, date: a.date })
  }

  // 第 5 步产物：咨询单 + 派单- 用户侧不能自己推进，冷进入时为「未提交」

  // 第 6 步产物：已签署的合同；跳到第 8 步时顺带把签约节点标为已付（否则进度页与付款记录不一致）
  if (step >= 7 && !a.contract && a.quote && a.venue && a.date) {
    a.contract = seedContract(a, step >= 8)
  }

  return a
}

/**
 * 把服务端的一张咨询单恢复进当前草稿：刷新后继续同一次申请、或在「我的预约」点「继续办理」。
 * 恢复的是这张单依赖的上游产物（场地/日期/规模/报价总额），判定单与报价明细按当前上游重算（已有的不动）。
 */
export function restoreFromConsult(c: any): ApplyDraft | null {
  if (!c) return null
  const a = ensureApply()
  if (c.venue) a.venue = { ...c.venue }
  if (c.performDate) a.date = c.performDate
  if (c.timeSlot) a.slot = c.timeSlot
  if (c.need) a.need = Object.assign(newApply().need, c.need)
  if (c.quote)
    a.quote = Object.assign(
      { total: 0, lines: [], detail: [], fee: null },
      { total: c.quote.total, fee: c.quote.fee || null },
    )
  hydrateTo(5)
  a.consult = c
  a.dispatch = c.dispatch || null
  a.step = 5
  return a
}

/** 用户侧拿到的咨询单只用来展示与判定阶段，写回草稿统一走这里，避免页面各写一份 */
export function setConsult(c: any): ApplyDraft {
  const a = ensureApply()
  a.consult = c || null
  a.dispatch = (c && c.dispatch) || null
  return a
}

export function setLogin(token: string, user: MockUser): void {
  store.token = token
  store.user = user
  uni.setStorageSync('token', token)
  uni.setStorageSync('user', user)
}

/**
 * 只更新用户资料、不动 token：「我的」里用户主动授权拿到昵称头像后回填。
 * 登录本身不索取这些信息，所以资料可能一直是空的，必须支持「登录后再补」。
 */
export function patchUser(patch: Partial<MockUser>): void {
  if (!store.user) return
  store.user = { ...store.user, ...patch }
  uni.setStorageSync('user', store.user)
}

export function logout(): void {
  store.token = ''
  store.user = null
  uni.removeStorageSync('token')
  uni.removeStorageSync('user')
  // 退出 = 这一段演示结束：草稿也跟着清，下一个登录的人不该看到上一个会话的申请单
  store.apply = newApply()
  const s = storeSpace()
  if (s) {
    try {
      s.removeItem(APPLY_KEY)
    } catch {
      /* ignore */
    }
  }
}

export function isLogin(): boolean {
  return !!store.token
}

/** 当前是否已登录：内存优先、storage 兜底（页面可能在 App.onLaunch 之前读取内存态） */
export function tokenNow(): string {
  let t = ''
  try {
    t = (typeof uni !== 'undefined' && uni.getStorageSync ? uni.getStorageSync('token') : '') || ''
  } catch {
    t = ''
  }
  if (t && !store.token) store.token = t
  return store.token || t
}

export function isLoggedIn(): boolean {
  return !!tokenNow()
}

/**
 * 登录门已移到 services/auth.ts（beginLogin / requireLogin）。
 * 原因：登录流程要调微信授权与后端换票，属于「服务层编排」；放在 store 会让
 * store ↔ request 形成循环引用。store 只保留登录态本身（token / user / 持久化）。
 */
