// 見た目の定義: 標準のテーマと、付箋紙・シンプルのテーマ（標準のテーマの組）、ダーク・ライトのスキン、紙（A5・A4・A3）
import { A3, A4, A5 } from "./papers"

export { DARK } from "./dark"
export { LIGHT } from "./light"
export { STANDARD } from "./standard"
export { SIMPLE, STICKY } from "./themes"

export const PAPERS = [A5, A4, A3] as const
export const PAPER_IDS = PAPERS.map(p => p.id)
