// 箱の文字のフォント（Noto Sans JP）を読む。フォントのファイルと @font-face は、ビルドで画面の隣の fonts/ に置く（scripts/fonts.ts copy）。
// 字の範囲ごとに分けたファイルなので、ブラウザは使う字の分だけを取りに行く。読み終わるまでは代わりのフォントで描く（大きさと行は base の文字の幅（plugins/base/text）が決めるので変わらない）。
// よく使う字の範囲（fonts/first.txt の字が指す範囲。ふつうと太字）は、@font-face を読んだあと手の空いたときに先に読む（初めてページを描くときに、取りに行って描き直さない）
const FAMILY = "'Noto Sans JP'"
const WEIGHTS = [400, 700] as const

export function loadFonts() {
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = "fonts/noto-sans-jp.css"
  // 先に読めなくても、描くときに取りに行くだけなので、失敗は捨てる
  link.addEventListener("load", () => whenIdle(() => void readFirst().catch(() => undefined)), { once: true })
  document.head.append(link)
}

async function readFirst() {
  const res = await fetch("fonts/first.txt")
  if (!res.ok) return
  const text = await res.text()
  await Promise.all(WEIGHTS.map(w => document.fonts.load(`${w} 16px ${FAMILY}`, text)))
}

function whenIdle(run: () => void) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(() => run())
  else setTimeout(run, 0)
}
