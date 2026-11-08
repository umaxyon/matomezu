// 原文の中を探す（見た目を持たない計算）: 探す字と切り替え（大文字小文字の区別・正規表現）から、当たり（原文の中の [start, end)）の並びを出し、
// 置き換えた原文を作り、次・前の当たりを選ぶ。正規表現は VS Code と同じく ^・$ を行の頭と終わりに当て（m）、. は改行に当てない。
// 幅 0 の当たり（^ や a* など）は飛ばして先へ進む。正規表現が読めなければ、当たりではなく bad-pattern を返す
export interface SearchQuery {
  text: string // 探す字（正規表現なら式）
  caseSensitive: boolean // 大文字小文字を区別する
  regex: boolean // 正規表現として読む
}

// 原文の中の当たり 1 つ（end は含まない）
export interface SearchHit {
  start: number
  end: number
}

export type Found = { kind: "hits"; hits: SearchHit[] } | { kind: "bad-pattern" }

// 探す字の正規表現（g と m。区別しなければ i）。読めなければ bad-pattern
function patternOf(query: SearchQuery): RegExp | "bad-pattern" {
  const source = query.regex ? query.text : query.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  try {
    return new RegExp(source, `gmu${query.caseSensitive ? "" : "i"}`)
  } catch {
    return "bad-pattern"
  }
}

// 原文 source の中の当たり（探す字が空なら無い）
export function findAll(source: string, query: SearchQuery): Found {
  if (query.text === "") return { kind: "hits", hits: [] }
  const pattern = patternOf(query)
  if (pattern === "bad-pattern") return { kind: "bad-pattern" }
  const hits: SearchHit[] = []
  for (const m of source.matchAll(pattern)) if (m[0] !== "") hits.push({ start: m.index, end: m.index + m[0].length })
  return { kind: "hits", hits }
}

// 当たり hit を replacement に置き換えた原文（hit がもう当たりでなければ source のまま）。正規表現なら replacement に $1 などを使え、
// 式は原文全体に当てる（前後の字の条件を正しく効かせる）。正規表現でなければ replacement は字のまま
export function replaceOne(source: string, query: SearchQuery, hit: SearchHit, replacement: string): string {
  const pattern = patternOf(query)
  if (pattern === "bad-pattern") return source
  const sticky = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}y`)
  sticky.lastIndex = hit.start
  const m = sticky.exec(source)
  if (!m || m.index + m[0].length !== hit.end) return source
  sticky.lastIndex = hit.start
  return query.regex ? source.replace(sticky, replacement) : source.replace(sticky, () => replacement)
}

// 当たりを全部 replacement に置き換えた原文（幅 0 の当たりは替えない）
export function replaceAll(source: string, query: SearchQuery, replacement: string): string {
  const found = findAll(source, query)
  if (found.kind !== "hits") return source
  let out = source
  for (const hit of [...found.hits].reverse()) out = replaceOne(out, query, hit, replacement)
  return out
}

// 原文の位置 at から向き direction に進んだ次の当たりの番号。端を越えたら wrap なら反対の端から、そうでなければ none
export function nextHit(
  hits: readonly SearchHit[],
  at: number,
  direction: "forward" | "backward",
  wrap: boolean,
): number | "none" {
  if (hits.length === 0) return "none"
  const i = direction === "forward" ? hits.findIndex(h => h.start >= at) : lastIndex(hits, h => h.start < at)
  if (i >= 0) return i
  if (!wrap) return "none"
  return direction === "forward" ? 0 : hits.length - 1
}

// 並びの中で、ok に当たる最後の物の番号（無ければ -1）
function lastIndex<T>(list: readonly T[], ok: (x: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (ok(list[i] as T)) return i
  return -1
}
