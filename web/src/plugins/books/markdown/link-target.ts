// 描いた文書のリンクと画像の行き先: 外の世界に触らないよう、開いてよい物だけを選ぶ。
// リンクは http・https・mailto を新しいタブで開き、# で始まる物は同じ文書の見出しや脚注へ飛ぶ。ほかは開かない。
// 画像は原文に埋め込んだ物（data:image/…）だけを描き、外の画像は読み込まない
export type LinkTarget = { kind: "open"; url: string } | { kind: "anchor"; anchor: string } | { kind: "none" }

const OPENS = /^(?:https?|mailto):/i

export function linkTarget(url: string): LinkTarget {
  if (url.startsWith("#")) return { kind: "anchor", anchor: anchorName(url.slice(1)) }
  return OPENS.test(url) ? { kind: "open", url } : { kind: "none" }
}

// #… の名前（%xx は戻す。戻せなければそのまま）
function anchorName(name: string): string {
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

export const drawsImage = (url: string) => /^data:image\//i.test(url)

// 脚注と、その参照の飛ぶ先の名前（見出しの名前には : が残らないので、見出しとぶつからない）
export const footnoteAnchor = (n: number) => `fn:${n}`
export const footnoteRefAnchor = (n: number) => `fnref:${n}`
