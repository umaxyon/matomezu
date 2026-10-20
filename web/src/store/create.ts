// app を組み立てる入口: 渡したプラグインから定義の表と store を作る。作った後は、プラグインを足したり変えたりしない。
// 型では、型の表に書き足した id と、渡したプラグインの id がそろっているかを確かめる（型と実物のずれを、書いた時点で捕まえる）。
// 1 つのプロジェクトの createMatomezu には、型を書き足したプラグインを全部渡す。わざと減らす app（テストなど）は partial: true
import type { MESSAGES } from "../core/i18n/messages"
import type { ActionTable, BookTypeTable, ItemTable, MessageTable, PaperTable, ThemeTable } from "../core/tables"
import type { IdsOf, Part, Plugin } from "./plugin"
import { type AppStore, createAppStore, type StoreOptions } from "./store"
import type { CommandTable, DialogTable } from "./tables"

interface Tables {
  bookTypes: BookTypeTable
  items: ItemTable
  actions: ActionTable
  themes: ThemeTable
  papers: PaperTable
  commands: CommandTable
  dialogs: DialogTable
}

// 型の表と合わない id を「種類:id」の文字にする。書き足したのに渡していないものと、渡したのに書き足していないもの
type Gaps<P> = {
  [K in Part]:
    | `${K}:${Exclude<keyof Tables[K], IdsOf<P, K>> & string}`
    | `${K}:${Exclude<IdsOf<P, K>, keyof Tables[K]> & string}`
}[Part]
// 文言の鍵の食い違い（土台の文言は、いつも表に入る）
type MessageKeysOf<P> = P extends { messages?: infer M } ? (M extends object ? keyof M : never) : never
type Provided<P> = keyof typeof MESSAGES | MessageKeysOf<P>
type MessageGaps<P> =
  | `messages:${Exclude<keyof MessageTable, Provided<P>> & string}`
  | `messages:${Exclude<MessageKeysOf<P>, keyof MessageTable> & string}`
// 合わない id を、渡す値に要る項目の名前にする（型の誤りの文に id がそのまま並ぶ）
type Check<P> = [Gaps<P> | MessageGaps<P>] extends [never]
  ? unknown
  : { [gap in Gaps<P> | MessageGaps<P>]: "型の表と合わない id" }

export interface MatomezuOptions<Ps extends readonly Plugin[], Partial extends boolean> extends StoreOptions<Ps> {
  plugins: Ps
  partial?: Partial
}

export function createMatomezu<const Ps extends readonly Plugin[], const Partial extends boolean = false>(
  options: MatomezuOptions<Ps, Partial> & (Partial extends true ? unknown : Check<Ps[number]>),
): AppStore<Ps> {
  const { partial: _, ...rest } = options
  return createAppStore(rest)
}
