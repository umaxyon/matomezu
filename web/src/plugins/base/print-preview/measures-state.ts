// 測るプレゼンテーション（printMeasure）が知らせた、ページごとの測った結果の、base のステージごとのプラグイン状態 print-measures（開いたステージエントリごとに 1 つ）
import { kit } from "../kit"

// 印刷区画の数と、印刷区画 1 つのビューに渡すデータ（ページ 1 つの測った結果）
export interface PrintMeasured {
  rows: number
  data: unknown
}

// 測ったステージエントリの id（entry）と、ページの id → 測った結果
export interface Measures {
  entry: string
  pages: Readonly<Record<string, PrintMeasured>>
}

export const PRINT_MEASURES = kit.definePluginStateOf<Measures>()({ id: "print-measures", scope: "stage" })

export const MEASURES_STATES = [PRINT_MEASURES] as const
