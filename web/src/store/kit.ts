// プラグインの定義の関数の組（pluginKit）: プラグインは自分の物を短い名前で書き、この組が頭（プラグインの id と :）を付けて返す。
// 返した定義の id は本当の id（型も）で、自分の物はそれか kit.name(名前) で名指す。ほかのプラグインの物は本当の id で書く。
// 頭を付けるのは、定義の id・名前（title。自分の文言の短い鍵）・宣言するテーマキーの id・テーマが上書きする自分のテーマキーだけ
import type { MessageKey } from "../core/catalog"
import type { ActionAttach, ActionDef, ActionTarget } from "../core/def/action"
import {
  type BookSchema,
  type DataOf,
  type ManyBookTypeDef,
  type NewBook,
  type SingleBookTypeDef,
  type WithTypeField,
  withTypeField,
} from "../core/def/book-type"
import type { ConnectorDataOf, ConnectorItemDef, ShapeDataOf, ShapeItemDef } from "../core/def/item"
import type { PaperDef } from "../core/def/paper"
import type { PresentationDef } from "../core/def/presentation"
import type { SettingDef } from "../core/def/setting"
import type { SkinDef } from "../core/def/skin"
import type { ThemeDef, TokenDef } from "../core/def/theme"
import type { ToolDef, ToolSetDef } from "../core/def/tool"
import type { LanguagePackDef, MessageMap } from "../core/i18n/messages"
import { type Owned, owned } from "../core/names"
import type { CommandDef, CommandPlace } from "./commands/def"
import type { DialogDef } from "./dialogs"
import type { KeyDef } from "./keys"
import type { PluginParts } from "./plugin"

// 頭を付けた文言の表
export type OwnedMessages<P extends string, M> = { readonly [K in keyof M & string as Owned<P, K>]: M[K] }
// 名前（title）を自分の文言の短い鍵で書いた定義と、頭を付けた定義
type Titled<D, K extends string> = Omit<D, "id" | "title"> & { title: K }
type Placed<D, Id extends string> = Omit<D, "id" | "title"> & { id: Id; title: MessageKey }
type ShapeProps = ShapeItemDef["props"]

// ブックのタイプ（schema に type は書かない。1 冊だけのタイプのブックは id と名前も書かない）。book と create の返すデータの形は、組み立てが schema で確かめる
// （ここで schema から型を作って縛ると、型の推論が回って崩れる）
type SingleIn<S extends BookSchema, K extends string> = Titled<Omit<SingleBookTypeDef<S>, "book">, K> & { book: object }
type ManyIn<S extends BookSchema, K extends string> = Titled<Omit<ManyBookTypeDef<S>, "create">, K> & {
  create(init: NewBook): object
}
type BookTypeOut<T, S extends BookSchema, Id extends string> = Omit<
  T,
  "id" | "title" | "schema" | "book" | "create"
> & {
  id: Id
  title: MessageKey
  schema: WithTypeField<S, Id>
} & (T extends { single: true }
    ? { book: DataOf<WithTypeField<S, Id>> & { title: string } }
    : { create(init: NewBook): DataOf<WithTypeField<S, Id>> })

// 定義の関数の組。返す型は書いておく（文言の表を通して、この組の型が自分を参照するため）
export interface PluginKit<P extends string, M extends MessageMap> {
  id: P // プラグインの id
  messages: OwnedMessages<P, M> // 頭を付けた文言（core/catalog.ts の MessageTable に書き足す）
  name<const N extends string>(name: N): Owned<P, N> // 自分の名前の本当の id
  message<const K extends keyof M & string>(key: K): Owned<P, K> // 自分の文言の本当の鍵

  // プラグインの束（id と、頭を付けた文言の組を足す。文言の組の id は「プラグインの id:messages」）
  plugin<const D extends Omit<PluginParts, "messages">>(
    parts: D,
  ): D & { id: P; messages: { id: Owned<P, "messages">; messages: OwnedMessages<P, M> } }

  defineShape<
    const Id extends string,
    Pr extends ShapeProps,
    const C extends Readonly<Record<string, ShapeProps>> = Record<never, never>,
    const G extends { add?: string; edit?: string } = Record<never, never>,
  >(
    def: Omit<
      ShapeItemDef<ShapeDataOf<Pr, C>, keyof M & string>,
      "id" | "props" | "content" | "kind" | "dialogs" | "themeProp" | "captionProp"
    > & {
      id: Id
      kind: "shape"
      props: Pr
      content?: C
      dialogs?: G
      themeProp?: keyof ShapeDataOf<Pr, C>["props"] & string // 個別のテーマを持つ項目（props にある名前だけ）
      captionProp?: keyof ShapeDataOf<Pr, C>["props"] & string // キャプションの項目（props にある名前だけ）
    },
  ): Omit<ShapeItemDef<ShapeDataOf<Pr, C>>, "id" | "content" | "dialogs"> & {
    id: Owned<P, Id>
    kind: "shape"
    props: Pr
    content?: C
    dialogs?: G
  }

  defineConnector<const Id extends string, Pr extends ShapeProps>(
    def: Omit<ConnectorItemDef<ConnectorDataOf<Pr>, keyof M & string>, "id" | "props" | "kind"> & {
      id: Id
      kind: "connector"
      props: Pr
    },
  ): Omit<ConnectorItemDef<ConnectorDataOf<Pr>>, "id"> & { id: Owned<P, Id>; kind: "connector"; props: Pr }

  defineAction<
    const Id extends string,
    T extends ActionTarget,
    A,
    R,
    I,
    const At extends ActionAttach | undefined = undefined,
  >(
    def: ActionDef<T, A, R, I, keyof M & string, At> & { id: Id },
  ): Omit<ActionDef<T, A, R, I, MessageKey, At>, "id"> & { id: Owned<P, Id> }

  defineSetting<const Id extends string, S extends SettingDef["schema"]>(
    def: SettingDef<S, keyof M & string> & { id: Id },
  ): Omit<SettingDef<S>, "id"> & { id: Owned<P, Id> }

  definePresentation<const Id extends string>(def: { id: Id }): PresentationDef & { id: Owned<P, Id> }

  defineTool<const Id extends string, const T extends Titled<ToolDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  // 道具の組: tools はほかのプラグインの道具も並べられるので、本当の id で書く
  defineToolSet<const Id extends string, const T extends readonly string[]>(def: {
    id: Id
    tools: T
  }): ToolSetDef & { id: Owned<P, Id>; tools: T }

  // ブックのタイプ: データの type（と 1 冊だけのタイプのブックの id）は本当の id。schema に type は書かず、ここで足す
  defineBookType<
    const Id extends string,
    const S extends BookSchema,
    const T extends SingleIn<S, keyof M & string> | ManyIn<S, keyof M & string>,
  >(def: T & { id: Id; schema: S }): BookTypeOut<T, S, Owned<P, Id>>

  // テーマ: tokens の鍵のうち : の無いものは自分のテーマキー
  defineTheme<const Id extends string, const T extends Titled<ThemeDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  definePaper<const Id extends string, const T extends Titled<PaperDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  defineSkin<const Id extends string, const T extends Titled<SkinDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  // run の 3 つ目の引数の型から A を決める（defineCommand と同じく、run は when より前に書く）
  defineCommand<const Id extends string, A = undefined>(
    def: CommandDef<A, keyof M & string> & { id: Id; place?: CommandPlace<NoInfer<A>> },
  ): Omit<CommandDef<A>, "id"> & { id: Owned<P, Id> }

  defineDialog<const Id extends string>(def: { id: Id }): DialogDef & { id: Owned<P, Id> }

  // キーの既定の割り当て 1 つ（command はコマンドの本当の id。args はそのコマンドの引数の型）
  defineKey<const K extends KeyDef>(def: K): Omit<K, "id"> & { id: Owned<P, K["id"]> }

  // 言語パック: id は言語から付ける（「プラグインの id:言語」）
  defineLanguagePack<const L extends Omit<LanguagePackDef, "id">>(def: L): L & { id: Owned<P, L["lang"]> }

  // 開くときに A の値を渡すダイアログ（kit.defineDialogWith<渡す値の型>()({ id })）
  defineDialogWith<A>(): <const Id extends string>(def: { id: Id }) => DialogDef<A> & { id: Owned<P, Id> }
}

export function pluginKit<const P extends string, const M extends MessageMap = Record<never, never>>(
  plugin: P,
  messages: M = {} as M,
): PluginKit<P, M> {
  const ownMessages = Object.fromEntries(Object.entries(messages).map(([k, t]) => [`${plugin}:${k}`, t]))
  const message = (key: string) => `${plugin}:${key}`
  // テーマキーの宣言（短い名前か、kit.name で頭を付けた id）
  const tokens = (defs: readonly TokenDef[]): TokenDef[] =>
    defs.map(t => (t.id.includes(":") ? t : { ...t, id: owned(plugin, t.id) }))
  // 定義の id・名前・テーマキーの宣言に頭を付ける
  const place = <D extends { id: string }>(def: D): D => {
    const d = def as D & { title?: unknown; tokens?: unknown }
    return {
      ...def,
      id: owned(plugin, def.id),
      ...(typeof d.title === "string" ? { title: message(d.title) } : {}),
      ...(Array.isArray(d.tokens) ? { tokens: tokens(d.tokens) } : {}),
    }
  }
  const kit = {
    id: plugin,
    messages: ownMessages,
    name: (name: string) => owned(plugin, name),
    message,
    plugin: (parts: { tokens?: readonly TokenDef[] }) => ({
      ...parts,
      ...(parts.tokens ? { tokens: tokens(parts.tokens) } : {}),
      id: plugin,
      messages: { id: owned(plugin, "messages"), messages: ownMessages },
    }),
    defineShape: place,
    defineConnector: place,
    defineAction: place,
    defineSetting: place,
    definePresentation: place,
    defineTool: place,
    defineToolSet: place,
    defineBookType: (def: { id: string; schema: BookSchema; book?: object; create?(init: NewBook): object }) => {
      const id = owned(plugin, def.id)
      const placed = { ...place(def), schema: withTypeField(def.schema, id) }
      const { create, book } = def
      if (book !== undefined) return { ...placed, book: { type: id, id, title: "", ...book } } // 名前は土台のフィールド（1 冊だけのブックは空）
      return { ...placed, create: (init: NewBook) => ({ type: id, ...create?.(init) }) }
    },
    defineTheme: (def: { id: string; tokens?: Record<string, unknown> }) => {
      const placed = place(def)
      if (!def.tokens) return placed
      const own = Object.entries(def.tokens).map(([k, v]) => [k.includes(":") ? k : owned(plugin, k), v])
      return { ...placed, tokens: Object.fromEntries(own) }
    },
    definePaper: place,
    defineSkin: place,
    defineCommand: place,
    defineDialog: place,
    defineDialogWith: () => place,
    defineKey: (def: { id: string }) => ({ ...def, id: owned(plugin, def.id) }),
    defineLanguagePack: (def: { lang: string }) => ({ ...def, id: owned(plugin, def.lang) }),
  }
  return kit as unknown as PluginKit<P, M>
}
