// 紙の表。足すときは、定義のファイルを作ってここに 1 行足す。
// ページのデータの形（schema/page.ts）とブックのタイプの紙の規定が、この表を参照する
import type { PaperDef } from "../def/paper"
import { A3, A4, A5 } from "./iso-a"

export const PAPERS = [A5, A4, A3] as const satisfies readonly PaperDef[]
export type PaperId = (typeof PAPERS)[number]["id"]
export const PAPER_IDS = PAPERS.map(p => p.id) as [PaperId, ...PaperId[]]
