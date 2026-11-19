// 静态页阶段的图片占位：用 SVG data URI 生成，不依赖任何图片文件 / 后端图片路由。
// 生成算法与原型 mock-server 的 /api/media/photo|avatar 一致（同一个 seed 得到同一张图，刷新不闪）。

function hueOf(seed: string): number {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function dataUri(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\n\s*/g, ''))
}

/** 表演现场占位图（等价于原型 /api/media/photo/:seed） */
export function photo(seed: string): string {
  const h = hueOf(seed)
  const stars = Array.from({ length: 60 })
    .map(
      (_, i) =>
        `<circle cx="${(i * 97) % 640}" cy="${(i * 53) % 400}" r="${1 + (i % 3)}" fill="hsla(${h},80%,80%,0.7)"/>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${h},55%,22%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},60%,10%)"/>
  </linearGradient></defs>
  <rect width="640" height="400" fill="url(#g)"/>
  ${stars}
  <g fill="none" stroke="hsl(${h},85%,65%)" stroke-width="2">
    <circle cx="320" cy="180" r="60" opacity="0.9"/><circle cx="320" cy="180" r="90" opacity="0.4"/>
  </g>
  <text x="320" y="188" text-anchor="middle" font-size="26" fill="#fff" font-family="sans-serif">✦ 表演现场 ✦</text>
  <text x="320" y="360" text-anchor="middle" font-size="14" fill="rgba(255,255,255,.65)" font-family="sans-serif">${seed}</text>
</svg>`
  return dataUri(svg)
}

/** 用户头像占位图（等价于原型 /api/media/avatar/:seed） */
export function avatar(seed: string): string {
  const h = hueOf(seed)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
  <rect width="120" height="120" rx="60" fill="hsl(${h},60%,55%)"/>
  <circle cx="60" cy="46" r="20" fill="rgba(255,255,255,.9)"/>
  <path d="M20 110 Q60 70 100 110 Z" fill="rgba(255,255,255,.9)"/>
</svg>`
  return dataUri(svg)
}

/** 演示版没有真实视频文件：页面展示占位卡片即可 */
export function video(seed: string): { url: string; note: string } {
  return { url: '', note: `演示版无真实视频文件（${seed}）` }
}
