// 横断検索の結果の行で、入力した言葉に当たった所を分ける純関数: 入力を空白で分けた語のどれにでも当たる所（大文字小文字は分けない）を hit にし、
// 前から順に、当たった所とそうでない所に切る（重なる・続く当たりは 1 つにまとめる）。語が無ければ全体を当たらない所 1 つにする
export interface Part {
  text: string
  hit: boolean
}

export function highlightParts(text: string, input: string): Part[] {
  const words = [...new Set(input.split(/\s+/).filter(w => w !== ""))].sort((a, b) => b.length - a.length)
  if (words.length === 0 || text === "") return text === "" ? [] : [{ text, hit: false }]
  const pattern = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "giu")
  const parts: Part[] = []
  let at = 0
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0
    if (m[0] === "" || start < at) continue
    if (start > at) parts.push({ text: text.slice(at, start), hit: false })
    const last = parts[parts.length - 1]
    if (start === at && last?.hit) last.text += m[0]
    else parts.push({ text: m[0], hit: true })
    at = start + m[0].length
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false })
  return parts
}
