// インスタンスを組み立てる入口: 渡したプラグインから定義の表と store を作る。作った後は、プラグインを足したり変えたりしない。
// 型では、機能台帳の型の側に書き足した id と、渡したプラグインの id がそろっているかを確かめる（型と実物のずれを、書いた時点で捕まえる）。
// 1 つのプロジェクトの createMatomezu には、型を書き足したプラグインを全部渡す。わざと減らすインスタンス（テストなど）は partial: true

import type {
  CapabilityTable,
  ContextMenuTable,
  KeyScopeTable,
  MenuTable,
  MessageTable,
  Part,
  PartTables,
  SlotTable,
} from "../core/catalog"
import type { MESSAGES } from "../core/i18n/messages"
import type { IdsOf, Plugin } from "./plugin"
import { createMatomezuInstance, type MatomezuInstance, type StoreOptions } from "./store"

// 機能台帳の型の側と合わない id を「種類:id」の文字にする。書き足したのに渡していないものと、渡したのに書き足していないもの
type Gaps<P> = {
  [K in Part]:
    | `${K}:${Exclude<keyof PartTables[K], IdsOf<P, K>> & string}`
    | `${K}:${Exclude<IdsOf<P, K>, keyof PartTables[K]> & string}`
}[Part]
// 文言の鍵の食い違い（土台の文言は、いつも表に入る）
type MessageKeysOf<P> = P extends { messages?: { messages: infer M } } ? (M extends object ? keyof M : never) : never
type Provided<P> = keyof typeof MESSAGES | MessageKeysOf<P>
type MessageGaps<P> =
  | `messages:${Exclude<keyof MessageTable, Provided<P>> & string}`
  | `messages:${Exclude<MessageKeysOf<P>, keyof MessageTable> & string}`
// 型の表だけで作る名前（キーの範囲・スロット・メニュー・右クリックのメニュー・能力）のうち、土台の言葉でも、渡したプラグインの id と : で始まる名前でもないもの
type PluginIdOf<P> = P extends { id: infer I extends string } ? I : never
type Unowned<P, Table, Base extends string, Kind extends string> =
  Exclude<keyof Table & string, Base> extends infer N
    ? N extends `${PluginIdOf<P>}:${string}`
      ? never
      : `${Kind}:${N & string}`
    : never
type NameGaps<P> =
  | Unowned<P, KeyScopeTable, "global" | "stage" | "dialog" | "menu", "keyScope">
  | Unowned<P, SlotTable, "root", "slot">
  | Unowned<P, MenuTable, never, "menu">
  | Unowned<P, ContextMenuTable, never, "contextMenu">
  | Unowned<P, CapabilityTable, "connectable" | "resizable", "capability">
// 合わない id を、渡す値に要る項目の名前にする（型の誤りの文に id がそのまま並ぶ）
type Check<P> = [Gaps<P> | MessageGaps<P> | NameGaps<P>] extends [never]
  ? unknown
  : { [gap in Gaps<P> | MessageGaps<P> | NameGaps<P>]: "機能台帳の型の側と合わない id" }

export interface MatomezuOptions<Ps extends readonly Plugin[], Partial extends boolean> extends StoreOptions<Ps> {
  plugins: Ps
  partial?: Partial
}

export function createMatomezu<const Ps extends readonly Plugin[], const Partial extends boolean = false>(
  options: MatomezuOptions<Ps, Partial> & (Partial extends true ? unknown : Check<Ps[number]>),
): MatomezuInstance<Ps> {
  const { partial: _, ...rest } = options
  return createMatomezuInstance(rest)
}
