// チケットの番号の見せ方: プロジェクトのチケットプレフィクスに、番号を 3 桁まで 0 で埋めてつなぐ（1000 からはそのまま伸ばす）。例 T-003。
// プレフィクスは見せ方だけで、変えると今ある番号の頭も変わる
export const ticketLabel = (prefix: string, number: number): string => `${prefix}${String(number).padStart(3, "0")}`
