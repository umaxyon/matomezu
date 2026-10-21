// 見た目の定義: 標準のテーマ、ダーク・ライトのスキン、紙（A5・A4・A3）
import { A3, A4, A5 } from "./papers"

export { DARK } from "./dark"
export { LIGHT } from "./light"
export { STANDARD } from "./standard"

export const PAPERS = [A5, A4, A3] as const
export const PAPER_IDS = PAPERS.map(p => p.id)
