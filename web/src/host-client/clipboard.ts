// クリップボードの受け口: ブラウザのクリップボードのイベント（copy・cut・paste）を窓で 1 か所で受け、インスタンスが待たせたクリップボードを使うコマンド
// （キーで待たせた物と、メニューからホストクライアントに copy を起こしてもらって待たせた物）を、そのイベントの運ぶ物で行わせる（行ったらブラウザの動きを止める）。
// 写した常駐は窓の源（origin）で見分ける（ほかの常駐は、ほかのポートかホスト）
import type { ClipboardUse } from "../core/clipboard"
import type { MatomezuInstance } from "../store/state"

// クリップボードのイベントを受け始める。やめる関数を返す
export function followClipboard(instance: Pick<MatomezuInstance, "clipboardEvent">): () => void {
  const on = (use: ClipboardUse) => (e: ClipboardEvent) => {
    if (e.clipboardData && instance.clipboardEvent(use, e.clipboardData, window.location.origin)) e.preventDefault()
  }
  const listeners = (["copy", "cut", "paste"] as const).map(use => [use, on(use)] as const)
  for (const [use, listener] of listeners) document.addEventListener(use, listener)
  return () => {
    for (const [use, listener] of listeners) document.removeEventListener(use, listener)
  }
}
