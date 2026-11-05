// 印刷プレビューが base のステージの画面の状態に置く、刷れるか（測り終え、並べる印刷区画が 1 つ以上ある）。
// 印刷プレビューのビューが置き、印刷のコマンドが読む
const READY = "printReady"

export const printReadyOf = (state: unknown): boolean =>
  (state as Record<string, unknown> | undefined)?.[READY] === "ready"

export const withPrintReady = (state: unknown, ready: boolean): Record<string, unknown> => ({
  ...((state as Record<string, unknown> | undefined) ?? {}),
  [READY]: ready ? "ready" : "not-ready",
})
