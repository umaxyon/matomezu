// 紙の表。足すときは、定義のファイルを作ってここに 1 行足す。
// ブックのタイプの紙の規定が、この表の id を参照する
import type { PaperDef } from "../def/paper"
import { A3, A4, A5 } from "./iso-a"

export const PAPERS = [A5, A4, A3] as const satisfies readonly PaperDef[]
export const PAPER_IDS = PAPERS.map(p => p.id)

declare module "../tables" {
  interface PaperTable {
    a5: typeof A5
    a4: typeof A4
    a3: typeof A3
  }
}
