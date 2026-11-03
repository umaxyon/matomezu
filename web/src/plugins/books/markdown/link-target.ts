// 描いた文書のリンクと画像の行き先: 外の世界に触らないよう、開いてよい物だけを選ぶ。
// リンクは http・https・mailto を新しいタブで開き、# で始まる物は同じ文書の見出しや脚注へ飛ぶ。ほかは開かない。
// 画像は原文に埋め込んだ物（data:image/…）だけを描き、外の画像は読み込まない
export type LinkTarget = { kind: "open"; url: string } | { kind: "fragment"; fragment: string } | { kind: "none" }

const OPENS = /^(?:https?|mailto):/i

export function linkTarget(url: string): LinkTarget {
  if (url.startsWith("#")) return { kind: "fragment", fragment: fragmentName(url.slice(1)) }
  return OPENS.test(url) ? { kind: "open", url } : { kind: "none" }
}

// #… のフラグメント（%xx は戻す。戻せなければそのまま）
function fragmentName(name: string): string {
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

export const drawsImage = (url: string) => /^data:image\//i.test(url)

// 脚注と、その参照のフラグメント（見出しのフラグメントには : が残らないので、見出しとぶつからない）
export const footnoteFragment = (n: number) => `fn:${n}`
export const footnoteRefFragment = (n: number) => `fnref:${n}`
