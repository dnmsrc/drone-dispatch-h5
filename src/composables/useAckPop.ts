// 条款门 composable：与原型 mixins/ackPop.js 等价，供 <script setup> 页面使用。
// 填报页只保留输入与选项，不在选择途中打断；本步未确认条款统一在「下一步 / 提交 / 签署」时阻断弹出。
import { computed, reactive } from 'vue'
import { APPLY_PAGES, pendingForPage, store } from '@/store'
import { clauseOf } from '@/mock/engines/disclosure.js'

export interface AckPopState {
  show: boolean
  title: string
  lines: string[]
  sec: string
  touch: string[]
  must: boolean
  risk: Record<string, any> | null
}

export function useAckPop() {
  const pop = reactive<AckPopState>({
    show: false,
    title: '',
    lines: [],
    sec: '',
    touch: [],
    must: false,
    risk: null,
  })

  // 这一页是第几步：门只拦「这一步及之前真的遇到的条款」。按当前页面路由算，不读 flow 的 step——
  // 直接跳到第 5 步时 flow step 还停在 1，门会一条都不拦（这就是「没确认也能提交」的漏法）。
  const ackStep = computed(() => {
    const ps = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const route = ps.length ? ps[ps.length - 1].route || '' : ''
    const i = APPLY_PAGES.indexOf(route.split('/').pop() || '')
    return i >= 0 ? i + 1 : (store.apply && store.apply.step) || 1
  })

  const pendSet = computed(() => new Set(pendingForPage(ackStep.value)))

  function keysOf(t: string | string[]): string[] {
    return Array.isArray(t) ? t : t ? [t] : []
  }

  /**
   * must = true：阻断式弹窗——这一屏的条款没确认完不能关，只能逐条确认。
   * 用在门（下一步 / 提交 / 签署）上：门的作用就是拦人，弹窗能关就等于没拦。
   */
  function open(
    t: string | string[],
    title: string,
    lines: string[],
    sec?: string,
    must?: boolean,
    risk?: Record<string, any> | null,
  ): void {
    pop.show = true
    pop.title = title
    pop.lines = lines
    pop.sec = sec || ''
    pop.touch = keysOf(t)
    pop.must = !!must
    pop.risk = risk || null
  }

  /** 门：每一步的「下一步」都要先过这个门，把本单触发但还没确认的条款一次性摆出来 */
  function gate(): boolean {
    return gateWithWeather(null)
  }

  /** 带天气风险的门：条款和「天气未公布」的预约风险放在同一个弹窗里（不叠第二层弹窗） */
  function gateWithWeather(risk: Record<string, any> | null): boolean {
    const pend = pendingForPage(ackStep.value)
    const needRisk = !!(risk && !risk.acked)
    if (!pend.length && !needRisk) return true
    // 不再叠 toast：弹窗本身就是拦截，toast 会浮在弹窗正文上把条款文字盖住
    if (pend.length)
      open(
        pend,
        `还有 ${pend.length} 条未确认`,
        [],
        clauseOf(pend[0])?.group || '',
        true,
        risk || null,
      )
    else open([], '天气未公布 · 需确认预约风险', [], '时段与审批', true, risk)
    return false
  }

  return { pop, ackStep, pendSet, keysOf, open, gate, gateWithWeather }
}
