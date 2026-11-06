// 1 つのプラグインの中で、フォルダごとの文言の表を 1 つにする（プラグイン API の入口 matomezu からも出る）
import type { MessageMap } from "../../../core/i18n/messages"

// 2 つの表で、同じ鍵に違う訳を書いた鍵
type Clash<A, B> = {
  [K in keyof A & keyof B]: [A[K]] extends [B[K]] ? ([B[K]] extends [A[K]] ? never : K) : K
}[keyof A & keyof B]
// 並びの表で、前のどれかの表と同じ鍵に違う訳を書いた鍵（Seen は前の表を重ねたもの）
type Clashes<T extends readonly unknown[], Seen = unknown> = T extends readonly [infer H, ...infer R]
  ? Clash<Seen, H> | Clashes<R, Seen & H>
  : never
// 並びの表を重ねたもの
type Joined<T extends readonly unknown[], Seen = unknown> = T extends readonly [infer H, ...infer R]
  ? Joined<R, Seen & H>
  : Seen

// 1 つのプラグインの中で、フォルダごとの文言の表を 1 つにする。同じ鍵に違う訳を書いた表があれば型の誤り（keys にその鍵が出る）。同じ訳の重なりは通す。
// 表は defineMessages で書いた物を渡す（MessageMap のような広い型の表では鍵が string になり、どの鍵も重なりとして誤りになる）
export function joinMessages<const T extends readonly MessageMap[]>(
  ...tables: [Clashes<T>] extends [never] ? T : { error: "the same key has different translations"; keys: Clashes<T> }[]
): Joined<T> {
  return Object.assign({}, ...tables)
}
