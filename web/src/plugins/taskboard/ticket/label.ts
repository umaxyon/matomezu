// チケットの番号の見せ方: プロジェクトのチケットプレフィクスに、番号を 4 桁まで 0 で埋めてつなぐ（10000 からはそのまま伸ばす）。例 T-0003。
// プレフィクスは見せ方だけで、変えると今ある番号の頭も変わる
export const ticketLabel = (prefix: string, number: number): string => `${prefix}${String(number).padStart(4, "0")}`
