// 画面とは別の処理の流れ（Web Worker）で原文を読む入口: { id, text } を受け、{ id, document }（base の parseMarkdown で読んだ物）を返す。
// 画面のビルドで、別の入口として組む（出力は markdown-parse-worker.js）
import { parseMarkdown } from "../../base"

export type ParseRequest = { id: number; text: string }
export type ParseReply = { id: number; document: ReturnType<typeof parseMarkdown> }

// 画面の型（DOM）の下で、Worker の中の受け口と返し口だけを使う
const scope = self as unknown as {
  postMessage(reply: ParseReply): void
  addEventListener(type: "message", listener: (e: MessageEvent<ParseRequest>) => void): void
}
scope.addEventListener("message", e => scope.postMessage({ id: e.data.id, document: parseMarkdown(e.data.text) }))
