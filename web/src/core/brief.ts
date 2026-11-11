// AI に知らせる 1 行の整え方（アノテーションの aiBrief・郵便の aiBrief が返した文に、core が掛ける）:
// 改行と続く空白は 1 つの空白にし、上限 limit（字。コードポイントで数える）を超えたら切って「…」と全体の字数を添える。空の文は空のまま返す
export function briefLine(text: string, limit: number): string {
  const chars = [...text.replace(/\s+/g, " ").trim()]
  return chars.length > limit ? `${chars.slice(0, limit).join("")}… (${chars.length} chars)` : chars.join("")
}
