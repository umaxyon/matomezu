import { kit } from "../kit"

// 印刷プレビューがステージに置く、刷れるか（測り終え、並べる印刷区画が 1 つ以上ある間 true。刷れない間は無い）。
// 印刷プレビューのビューが置き、印刷のコマンドが読む
export const PRINT_READY_STATE = kit.definePluginStateOf<boolean>()({
  id: "print-ready",
  scope: "stage",
  default: false,
})

export const PRINT_PREVIEW_STATES = [PRINT_READY_STATE] as const
