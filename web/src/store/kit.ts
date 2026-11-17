// プラグインの定義の関数の組（pluginKit）: プラグインは自分の物を短い名前で書き、この組が頭（プラグインの id と :）を付けて返す。
// 返した定義の id は本当の id（型も）で、自分の物はそれか kit.name(名前) で名指す。ほかのプラグインの物は本当の id で書く。
// 頭を付けるのは、定義の id・名前（title。自分の文言の短い鍵）・宣言するテーマキーの id・テーマが上書きする自分のテーマキーだけ
import type { ActionId, DialogExtras, MessageKey } from "../core/catalog"
import type { ActionAttach, ActionDef, ActionTarget, OnContainer, ScopeRequired } from "../core/def/action"
import type { AnnotationDef } from "../core/def/annotation"
import type { ControlCenterDef } from "../core/def/control-center"
import type { EnumDataOf, EnumDef, EnumValueDef } from "../core/def/enum"
import type { ConnectorDataOf, ConnectorItemDef, ShapeDataOf, ShapeItemDef } from "../core/def/item"
import type { MailDef } from "../core/def/mail"
import type { PageTypeDef } from "../core/def/page-type"
import type { PaperDef } from "../core/def/paper"
import type { PermissionDef } from "../core/def/permission"
import type { PluginStateAddress, PluginStateDef, PluginStateSchema, PluginStateScope } from "../core/def/plugin-state"
import type { PresentationDef } from "../core/def/presentation"
import type { ScreenArrangementDef } from "../core/def/screen-arrangement"
import type { ScreenDef } from "../core/def/screen-def"
import type { DefaultedSettingDef, SettingDef, SettingHolder } from "../core/def/setting"
import type { SkinDef } from "../core/def/skin"
import type { KeysOfTypes, RecordKeyDef, SubjectDef } from "../core/def/subject"
import type { TextColorDef } from "../core/def/text-color"
import type { ThemeDef, TokenDef } from "../core/def/theme"
import type { ToolDef, ToolSetDef } from "../core/def/tool"
import type { LanguagePackDef, MessageMap } from "../core/i18n/messages"
import { type Owned, owned } from "../core/names"
import type {
  CommandPlace,
  CommandScopeRequired,
  ScreenCommandDef,
  ScreenPerforms,
  StageCommandDef,
} from "./commands/def"
import type { DialogDef } from "./dialogs"
import type { KeyDef, KeyScopeDef } from "./keys"
import type { PluginParts } from "./plugin"

// 頭を付けた文言の表
export type OwnedMessages<P extends string, M> = { readonly [K in keyof M & string as Owned<P, K>]: M[K] }
// 名前（title）を自分の文言の短い鍵で書いた定義と、頭を付けた定義
type Titled<D, K extends string> = Omit<D, "id" | "title"> & { title: K }
type Placed<D, Id extends string> = Omit<D, "id" | "title"> & { id: Id; title: MessageKey }
type ShapeProps = ShapeItemDef["props"]

// 設定の項目の定義の、持つ所（holder を書いた定義はその値、書かない定義は持たない）
type Held<H> = H extends SettingHolder ? { holder: H } : { holder?: never }

// 定義の関数の組。返す型は書いておく（文言の表を通して、この組の型が自分を参照するため）
export interface PluginKit<P extends string, M extends MessageMap> {
  id: P // プラグインの id
  messages: OwnedMessages<P, M> // 頭を付けた文言（core/catalog.ts の MessageTable に書き足す）
  name<const N extends string>(name: N): Owned<P, N> // 自分の名前の本当の id
  message<const K extends keyof M & string>(key: K): Owned<P, K> // 自分の文言の本当の鍵

  // プラグインの束（id と、頭を付けた文言の組を足す。文言の組の id は「プラグインの id:messages」）
  // title と description は、自分の文言の短い鍵（プラグインの名前と概要。設定の「プラグイン」に出る）
  plugin<const D extends Omit<PluginParts, "messages"> & { title?: keyof M & string; description?: keyof M & string }>(
    parts: D,
  ): Omit<D, "title" | "description"> & {
    id: P
    messages: { id: Owned<P, "messages">; messages: OwnedMessages<P, M> }
    title?: MessageKey
    description?: MessageKey
  }

  defineShape<
    const Id extends string,
    Pr extends ShapeProps,
    const C extends Readonly<Record<string, ShapeProps>> = Record<never, never>,
    const G extends { add?: string; edit?: string } = Record<never, never>,
  >(
    def: Omit<ShapeItemDef<ShapeDataOf<Pr, C>, keyof M & string>, "id" | "props" | "content" | "kind" | "dialogs"> & {
      id: Id
      kind: "shape"
      props: Pr
      content?: C
      dialogs?: G
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
    const Sc = unknown,
  >(
    def: ActionDef<T, A, R, I, keyof M & string, At> & { id: Id } & ScopeRequired<T, A> & { permissionScope?: Sc },
  ): Omit<ActionDef<T, A, R, I, MessageKey, At>, "id"> & { id: Owned<P, Id> } & OnContainer<Sc>

  // 既定を持つ項目は、読むとき（settingValue）に必ず値があると分かるように、default を持つ形で返す
  // 設定の項目。holder（"page" か "book"）を書いた定義はページ・ブックの項目、書かない定義は利用者の設定の項目（型に holder が残り、読む関数が合う項目だけを受ける）
  defineSetting<
    const Id extends string,
    S extends SettingDef["schema"],
    const H extends SettingHolder | undefined = undefined,
  >(
    def: Omit<DefaultedSettingDef<S, keyof M & string>, "holder"> & { id: Id; holder?: H },
  ): Omit<DefaultedSettingDef<S>, "id" | "holder"> & { id: Owned<P, Id> } & Held<H>
  defineSetting<
    const Id extends string,
    S extends SettingDef["schema"],
    const H extends SettingHolder | undefined = undefined,
  >(
    def: Omit<SettingDef<S, keyof M & string>, "holder"> & { id: Id; holder?: H },
  ): Omit<SettingDef<S>, "id" | "holder"> & { id: Owned<P, Id> } & Held<H>

  definePresentation<const Id extends string>(
    def: Omit<PresentationDef, "id"> & { id: Id },
  ): PresentationDef & { id: Owned<P, Id> }

  defineTool<const Id extends string, const T extends Titled<ToolDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  // 道具の組: tools はほかのプラグインの道具も並べられるので、本当の id で書く
  defineToolSet<const Id extends string, const T extends readonly string[]>(def: {
    id: Id
    tools: T
  }): ToolSetDef & { id: Owned<P, Id>; tools: T }

  definePermission<const Id extends string, const T extends Titled<PermissionDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  defineAnnotation<const Id extends string, Pr extends AnnotationDef["props"]>(
    def: AnnotationDef<Pr, keyof M & string> & { id: Id },
  ): Omit<AnnotationDef<Pr>, "id"> & { id: Owned<P, Id> }

  defineMail<const Id extends string, Pr extends MailDef["props"]>(
    def: MailDef<Pr, keyof M & string> & { id: Id },
  ): Omit<MailDef<Pr>, "id"> & { id: Owned<P, Id> }

  // 対象の定義（アクションの対象の種類。レコード 1 件の形を record に書く）
  // 索引キー（keys）は、書いたとおりの名前と値の型（text か number）で残す（条件・並び・ctx.keys の型が、そこから決まる）
  defineSubject<
    const Id extends string,
    R extends SubjectDef["record"],
    const Kt extends Readonly<Record<string, RecordKeyDef["type"]>> = Record<never, never>,
  >(
    def: Omit<SubjectDef<R, keyof M & string, KeysOfTypes<Kt, R>>, "keys"> & {
      id: Id
      keys?: KeysOfTypes<Kt, R>
    },
  ): Omit<SubjectDef<R, MessageKey, KeysOfTypes<Kt, R>>, "id"> & { id: Owned<P, Id> }

  // スクリーンの定義（窓が見せる画面 1 枚の種類。開くときに渡す値の形を props に書く）
  defineScreen<const Id extends string, Pr extends ScreenDef["props"]>(
    def: ScreenDef<Pr, keyof M & string> & { id: Id },
  ): Omit<ScreenDef<Pr>, "id"> & { id: Owned<P, Id> }

  // スクリーンアレンジメントの定義（窓の、開いているスクリーンの見せ方。見えているスクリーンを shown が答える）
  defineScreenArrangement<const Id extends string, V = unknown>(
    def: ScreenArrangementDef<keyof M & string, V> & { id: Id },
  ): Omit<ScreenArrangementDef<MessageKey, V>, "id"> & { id: Owned<P, Id> }

  // 列挙の宣言（値の組。値が持つフィールドの形を value に書く）と、列挙の値（宣言した列挙 enum に足す。data は宣言の value の形）
  defineEnum<const Id extends string, V extends EnumDef["value"]>(
    def: EnumDef<V, keyof M & string> & { id: Id },
  ): Omit<EnumDef<V>, "id"> & { id: Owned<P, Id> }
  defineEnumValue<const Id extends string, const E extends string>(
    def: EnumValueDef<E, EnumDataOf<E>, keyof M & string> & { id: Id },
  ): Omit<EnumValueDef<E>, "id"> & { id: Owned<P, Id> }

  // ページのタイプ: ページのデータの type は、ここで頭を付けた本当の id
  definePageType<const Id extends string, const T extends Titled<PageTypeDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  // コントロールセンター（ブックでない、利用者に 1 つの入口。core/def/control-center.ts）
  defineControlCenter<const Id extends string, const T extends Omit<ControlCenterDef, "id">>(
    def: T & { id: Id },
  ): Omit<T, "id"> & { id: Owned<P, Id> }

  // テーマ: tokens の鍵のうち : の無いものは自分のテーマキー
  defineTheme<const Id extends string, const T extends Titled<ThemeDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  definePaper<const Id extends string, const T extends Titled<PaperDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  defineTextColor<const Id extends string, const T extends Titled<TextColorDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  defineSkin<const Id extends string, const T extends Titled<SkinDef, keyof M & string>>(
    def: T & { id: Id },
  ): Placed<T, Owned<P, Id>>

  // run の 3 つ目の引数の型から A を決める（defineCommand と同じく、run は when より前に書く）
  defineCommand<const Id extends string, A = undefined, const Ps extends readonly ActionId[] | undefined = undefined>(
    def: Omit<StageCommandDef<A, keyof M & string>, "permissionScope"> & {
      id: Id
      performs?: Ps
      place?: CommandPlace<NoInfer<A>>
    } & CommandScopeRequired<Ps, A>,
  ): Omit<StageCommandDef<A>, "id"> & { id: Owned<P, Id> }

  // スクリーンから呼ぶコマンド（ステージを持たないスクリーンからも呼べる。ステージとブックは受け取らず、ブック・ページ・アノテーションが対象のアクションは行わない）
  defineScreenCommand<
    const Id extends string,
    A = undefined,
    const Ps extends readonly ActionId[] | undefined = undefined,
  >(
    def: Omit<ScreenCommandDef<A, keyof M & string>, "permissionScope" | "from" | "performs"> & {
      id: Id
      performs?: Ps & ScreenPerforms<Ps>
      place?: CommandPlace<NoInfer<A>>
    },
  ): Omit<ScreenCommandDef<A>, "id"> & { id: Owned<P, Id> }

  defineDialog<const Id extends string>(def: { id: Id } & DialogExtras): DialogDef & { id: Owned<P, Id> }

  // キーの範囲（title は自分の文言の短い鍵）
  defineKeyScope<const Id extends string>(
    def: Omit<KeyScopeDef, "id" | "title"> & { id: Id; title: keyof M & string },
  ): KeyScopeDef & { id: Owned<P, Id> }

  // プラグイン状態の宣言（プラグインが画面の中で持つ状態。id は頭が付く）。address が push か replace なら、値を画面の場所（URL）に入れ、読み直しても戻す。値の形 schema を持つ
  definePluginState<
    const Id extends string,
    S,
    const Sc extends PluginStateScope,
    const Ad extends Exclude<PluginStateAddress, "none">,
  >(
    def: Omit<PluginStateDef<S>, "id" | "scope" | "address" | "schema"> & {
      id: Id
      scope: Sc
      address: Ad
      schema: PluginStateSchema<S>
    },
  ): PluginStateDef<S> & { id: Owned<P, Id>; scope: Sc; address: Ad }

  // 画面の場所に入れない（none）プラグイン状態の宣言（読み直すと消える。値の型だけを持つ。kit.definePluginStateOf<値の型>()({ id, scope })）
  definePluginStateOf<S>(): <const Id extends string, const Sc extends PluginStateScope>(
    def: Omit<PluginStateDef<S>, "id" | "scope" | "address" | "schema"> & { id: Id; scope: Sc },
  ) => PluginStateDef<S> & { id: Owned<P, Id>; scope: Sc; address: "none" }

  // キーの既定のキーバインド 1 つ（command はコマンドの本当の id。args はそのコマンドの引数の型。title は自分の文言の短い鍵）
  defineKey<const K extends KeyDef>(def: K & { title?: keyof M & string }): Omit<K, "id"> & { id: Owned<P, K["id"]> }

  // 言語パック: id は言語から付ける（「プラグインの id:言語」）
  defineLanguagePack<const L extends Omit<LanguagePackDef, "id">>(def: L): L & { id: Owned<P, L["lang"]> }

  // 開くときに A の値を渡すダイアログ（kit.defineDialogWith<渡す値の型>()({ id })）
  defineDialogWith<A>(): <const Id extends string>(
    def: { id: Id } & DialogExtras<A>,
  ) => DialogDef<A> & { id: Owned<P, Id> }
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
    plugin: (parts: { tokens?: readonly TokenDef[]; title?: string; description?: string }) => ({
      ...parts,
      ...(parts.tokens ? { tokens: tokens(parts.tokens) } : {}),
      ...(parts.title ? { title: message(parts.title) } : {}),
      ...(parts.description ? { description: message(parts.description) } : {}),
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
    definePermission: place,
    defineAnnotation: place,
    defineMail: place,
    defineSubject: place,
    defineScreen: place,
    defineScreenArrangement: place,
    defineEnum: place,
    defineEnumValue: place,
    definePageType: place,
    defineControlCenter: place,
    defineTheme: (def: { id: string; tokens?: Record<string, unknown> }) => {
      const placed = place(def)
      if (!def.tokens) return placed
      const own = Object.entries(def.tokens).map(([k, v]) => [k.includes(":") ? k : owned(plugin, k), v])
      return { ...placed, tokens: Object.fromEntries(own) }
    },
    definePaper: place,
    defineTextColor: place,
    defineSkin: place,
    defineCommand: place,
    defineScreenCommand: (def: { id: string }) => ({ ...place(def), from: "screen" as const }),
    defineDialog: place,
    defineDialogWith: () => place,
    defineKeyScope: place,
    definePluginState: place,
    definePluginStateOf: () => (def: { id: string }) => ({ ...place(def), address: "none" as const }),
    defineKey: place,
    defineLanguagePack: (def: { lang: string }) => ({ ...def, id: owned(plugin, def.lang) }),
  }
  return kit as unknown as PluginKit<P, M>
}
