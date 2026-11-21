// チケットの番号の見せ方: プロジェクトのチケットプレフィクスに、番号を 4 桁まで 0 で埋めてつなぐ（10000 からはそのまま伸ばす）。例 T-0003。
// プレフィクスは見せ方だけで、変えると今ある番号の頭も変わる
export const ticketLabel = (prefix: string, number: number): string => `${prefix}${String(number).padStart(4, "0")}`

// ticketLabel の逆: 語が数字で終わる形（プレフィクスに数字が続く M-0050 も、数字だけの 0050 も）なら、その頭（無ければ空）と番号。
// 番号が 0 の語・数字で終わらない語は undefined
export function ticketLabelParts(word: string): { prefix: string; number: number } | undefined {
  const m = /^(.*\D)?(\d+)$/.exec(word)
  if (!m?.[2]) return undefined
  const number = Number(m[2])
  return number > 0 ? { prefix: m[1] ?? "", number } : undefined
}
