// チケットの番号の見せ方: プロジェクトのチケットプレフィクスに、番号を 4 桁まで 0 で埋めてつなぐ（10000 からはそのまま伸ばす）。例 T-0003。
// プレフィクスは見せ方だけで、変えると今ある番号の頭も変わる
export const ticketLabel = (prefix: string, number: number): string => `${prefix}${String(number).padStart(4, "0")}`

// ticketLabel の逆: 語が数字で終わる形（プレフィクスに数字が続く M-0050 も、数字だけの 0050 も）なら、その数字（先頭の 0 を除いた物。例 "50"）。そうでなければ undefined
export function ticketNumberOf(word: string): string | undefined {
  const m = /^(.*\D)?(\d+)$/.exec(word)
  const digits = m?.[2]?.replace(/^0+/, "")
  return digits ? digits : undefined
}
