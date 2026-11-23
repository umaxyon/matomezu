// 見た目のプラグイン: React を使わないプラグイン（store/plugin.ts）に、そのプラグインのプレゼンテーション・アイテム・設定の項目・ダイアログのビューを結び、
// ウィジェット（スロットに置けるコンポーネント）とコマンドのアイコンを足す。
// ビューは、そのプラグインの id を全部持たないと型の誤り（利用者の設定の項目のビューは書かなくてよい）。ほかのプラグインのビューを差し替えるのは overrides に書いたときだけ。
// 画面に置くインスタンスは、見た目を結んだプラグインだけで作る（MatomezuProvider が型と台帳アセンブルで確かめる）

import type { ComponentType, ReactNode } from "react"
import type {
  CommandId,
  ContextMenuId,
  ContextMenuTable,
  DialogId,
  PresentationId,
  PresentationViewExtras,
  WidgetId,
  WidgetTable,
} from "../core/catalog"
import type { NOT_SET, SettingHolder } from "../core/def/setting"
import { fail } from "../core/errors"
import type { Size } from "../core/geom"
import { isOwnedBy } from "../core/names"
import type { Page } from "../core/schema/book"
import type { NO_PAGE } from "../core/stage"
import type { DialogArgsOf, DialogDef } from "../store/dialogs"
import { type IdsOf, type Plugin, withoutParts } from "../store/plugin"
import type { ConnectorUi } from "./connector"
import type { AnyWidgetDef } from "./layout"

// プレゼンテーションのビューが受け取る物は無い（描くページと操作は、フックが描いている場所から引く。ui/scope.tsx）
export type PresentationViewProps = Record<string, never>
// プレゼンテーションのビュー: 開いたページのタイプが選んだプレゼンテーション（core/def/presentation.ts）のコンポーネント（プレゼンテーションの id で結び、UI マッピングには書かない）。
// ウィジェットと同じく、開く右クリックのメニュー（useContextMenu）を contextMenus に全部書く
export interface PresentationViewDef extends PresentationViewExtras {
  view: ComponentType<PresentationViewProps>
  contextMenus?: readonly ContextMenuId[]
}
// A は開くときに渡された値の型（値を渡さないダイアログは undefined）
export interface DialogProps<A = undefined> {
  args: A
  onClose: () => void
}
// どのダイアログのビューも入る型（表に入れるときに使う。渡す値の型は id ごとに違うので、表の上では見ない）
// biome-ignore lint/suspicious/noExplicitAny: 関数コンポーネントとクラスコンポーネントの両方を受けるには any しかない
type AnyDialogView = ComponentType<DialogProps<any>>
// アイテムのビューに渡す値: 項目（props）・大きさ（紙の上の px）・アイテムの id・
// 中身（形の定義の content に宣言したフィールドの名前 → その値。データに無いフィールドは undefined）・
// 今の倍率（紙の上の 1px が画面の何 px か。倍率を変えると、新しい値で描き直す）
export interface ItemViewProps<Props, Content = Readonly<Record<string, unknown>>> {
  props: Props
  size: Size
  id: string
  content: Content
  zoom: number
  hasChildren: boolean // 子の形を 1 つ以上持っているか（子はビューの外で、子の領域に描く）
}

// アイテムのビューは、そのアイテムの項目（props）のデータを受け取る
export interface ItemUi<Props = never, Content = never> {
  view: ComponentType<ItemViewProps<Props, Content>>
  icon: ReactNode // ツールボックスなどに出すアイコン
  contextMenus?: readonly ContextMenuId[] // ビューが開く右クリックのメニュー
}

// 利用者の設定の項目を変えるコンポーネントに渡す値。value は今の値（値が無いか形に合わなければ既定。既定も無ければ NOT_SET）、onChange は値を書き、onReset は値を消す（既定に戻す）。
// 変えさせないときは、並べる側がまとめて押せなくする（コンポーネントは見なくてよい）
export interface UserSettingControlProps<V = unknown> {
  label: string
  value: V | typeof NOT_SET
  onChange(value: V): void
  onReset(): void
}
// 設定の項目（core/def/setting.ts）を変えるコンポーネントに渡す値。of は項目を持つ所（ステージエントリかページか。定義の holder と同じ言葉）、value はその所の値（無ければ NOT_SET）、
// inherited は値が無いときに効く値（定義の既定。既定の無い項目なら NOT_SET）。onReset は値を消す（既定に戻す）。
// page は、ページの項目なら変えている項目を重ねたそのページ（ステージエントリの項目なら NO_PAGE）。ほかの項目の値やページのタイプで見せ方が変わるコンポーネントが読む
export interface SettingControlProps<V = unknown> extends UserSettingControlProps<V> {
  of: SettingHolder
  inherited: V | typeof NOT_SET
  page: Page | typeof NO_PAGE
}
// 設定の項目のビュー: 設定のダイアログに並べるコンポーネント
export interface SettingUi {
  // biome-ignore lint/suspicious/noExplicitAny: 値の型は項目ごとに違うので、表の上では見ない
  control: ComponentType<SettingControlProps<any>>
}

// 利用者の設定の項目のビュー: 設定の画面に並べるコンポーネント（無ければ、値の形から作った入力を出す）
export interface UserSettingUi {
  // biome-ignore lint/suspicious/noExplicitAny: 値の型は項目ごとに違うので、表の上では見ない
  control: ComponentType<UserSettingControlProps<any>>
}

// 画面に置く形（kind が shape）のアイテムの id。線（connector）はプレゼンテーションのビューが描くので、アイテムのビューを持たない
type ShapeIdsOf<P> = P extends { items?: readonly (infer D)[] }
  ? D extends { id: infer I; kind: "shape" }
    ? I
    : never
  : never

// 2 つの形をつなぐ（kind が connector）アイテムの id。形を並べるビューが、つなぐもののビュー（ui/connector.ts）を重ねる
type ConnectorIdsOf<P> = P extends { items?: readonly (infer D)[] }
  ? D extends { id: infer I; kind: "connector" }
    ? I
    : never
  : never

type ItemPropsOf<P, Id> = P extends { items?: readonly (infer D)[] }
  ? D extends { id: Id; props: { _zod: { output: infer O } } }
    ? O
    : never
  : never

// 形の中身のフィールド（content）の、フィールドの名前 → 値の型（データに無ければ undefined）
type ItemContentOf<P, Id> = P extends { items?: readonly (infer D)[] }
  ? D extends { id: Id; content?: infer C }
    ? { readonly [K in keyof NonNullable<C>]?: NonNullable<C>[K] extends { _zod: { output: infer O } } ? O : never }
    : never
  : never

type DialogArgsOfPlugin<P, Id> = P extends { dialogs?: readonly (infer D)[] }
  ? D extends { id: Id } & DialogDef<infer A>
    ? A
    : never
  : never

// そのプラグインに id が無ければ、そのフィールドは書かなくてよい
type Field<Ids, Name extends string, V> = [Ids] extends [never] ? { [n in Name]?: never } : { [n in Name]: V }

export type PluginViews<P> = Field<
  IdsOf<P, "presentations">,
  "presentationViews",
  { [id in IdsOf<P, "presentations">]: PresentationViewDef }
> &
  Field<ShapeIdsOf<P>, "items", { [id in ShapeIdsOf<P>]: ItemUi<ItemPropsOf<P, id>, ItemContentOf<P, id>> }> &
  Field<ConnectorIdsOf<P>, "connectors", { [id in ConnectorIdsOf<P>]: ConnectorUi }> &
  Field<IdsOf<P, "settings">, "settingViews", { [id in IdsOf<P, "settings">]: SettingUi }> & {
    userSettingViews?: { [id in IdsOf<P, "userSettings">]?: UserSettingUi }
  } & Field<
    IdsOf<P, "dialogs">,
    "dialogViews",
    { [id in IdsOf<P, "dialogs">]: ComponentType<DialogProps<DialogArgsOfPlugin<P, id>>> }
  > &
  Field<IdsOf<P, "tools">, "toolIcons", { [id in IdsOf<P, "tools">]: ReactNode }>

// ウィジェットが受け取る値（そのウィジェットのコンポーネントの props）
type WidgetProps<W extends WidgetId> = WidgetTable[W] extends { view: (props: infer P) => ReactNode } ? P : never

// ほかのプラグインのビューとウィジェットの差し替え。core/catalog.ts にある id だけ（ウィジェットは置けるスロットを変えず、描くコンポーネントだけを替える）
export interface Overrides {
  presentationViews?: { [id in PresentationId]?: PresentationViewDef }
  dialogViews?: { [id in DialogId]?: ComponentType<DialogProps<DialogArgsOf<id>>> }
  widgets?: { [id in WidgetId]?: (props: WidgetProps<id>) => ReactNode }
}

// 列挙の値のアイコン: 絵 1 つ。開け閉めのある物（フォルダなど）は、閉じた絵と開いた絵
export type EnumValueIcon = ReactNode | { readonly closed: ReactNode; readonly open: ReactNode }

// widgets はこのプラグインのウィジェット、commandIcons はメニューなどに出すコマンドのアイコン（無ければ名前の文字だけを出す）、
// pageTypeIcons はページのタイプのアイコン（ページタブの頭に出す。名乗らないタイプは、通常のファイルの絵）、
// enumValueIcons は自分が足した列挙の値のアイコン（絵を使う列挙の宣言側が読む。無ければ宣言側が決めた絵）、
// contextMenuRows は自分のメニューが自分で出す行（機能台帳から決まる一覧など。UI マッピングのコマンドの並びの前に出る）
export type UiParts<P> = PluginViews<P> & {
  widgets?: readonly AnyWidgetDef[]
  commandIcons?: { [id in IdsOf<P, "commands">]?: ReactNode }
  pageTypeIcons?: { [id in IdsOf<P, "pageTypes">]?: ReactNode }
  enumValueIcons?: { [id in IdsOf<P, "enumValues">]?: EnumValueIcon }
  contextMenuRows?: { [M in OwnContextMenuId<P>]?: ContextMenuRows<M> }
  overrides?: Overrides
}

// プラグイン P が ContextMenuTable に書き足した、自分のメニューの id
type OwnContextMenuId<P> = P extends { id: infer Id extends string } ? ContextMenuId & `${Id}:${string}` : never

// メニューが自分で出す行: コマンドと、その引数・名前・アイコン。出すか・押せるかは、その引数でのコマンドが決める
export interface ContextMenuRow {
  command: CommandId
  args?: unknown
  label: string
  icon?: ReactNode
  iconLook?: "line" | "picture" // アイコンの見せ方（line は線の絵でスキンの色、picture は絵の元の色。書かなければ line）
}

// メニュー M の行を、開いたときに受け取った物 target から出すフック（中で文言や機能台帳のフックを使える）
export type ContextMenuRows<M extends ContextMenuId = ContextMenuId> = (
  target: ContextMenuTable[M],
) => readonly ContextMenuRow[]
export type PluginUi<P extends Plugin> = P & { ui: UiParts<P> }
// 見た目を結んだプラグインのどれか
export type AnyPluginUi = Plugin & { ui: object }

// 無効にしたプラグインの見た目: 名乗りと文言だけで、見た目の部品は無い（store/plugin.ts の withoutParts）
export const withoutUi = (p: AnyPluginUi): AnyPluginUi => ({ ...withoutParts(p), ui: {} })

export const definePluginUi = <const P extends Plugin>(plugin: P, ui: UiParts<P>): PluginUi<P> => ({ ...plugin, ui })

// インスタンスの見た目の表
export interface UiCatalog {
  presentationViews: ReadonlyMap<string, PresentationViewDef>
  items: ReadonlyMap<string, ItemUi>
  connectors: ReadonlyMap<string, ConnectorUi>
  settingViews: ReadonlyMap<string, SettingUi>
  userSettingViews: ReadonlyMap<string, UserSettingUi>
  dialogViews: ReadonlyMap<string, AnyDialogView>
  widgets: ReadonlyMap<string, AnyWidgetDef>
  commandIcons: ReadonlyMap<string, ReactNode>
  toolIcons: ReadonlyMap<string, ReactNode>
  pageTypeIcons: ReadonlyMap<string, ReactNode>
  enumValueIcons: ReadonlyMap<string, EnumValueIcon>
  contextMenuRows: ReadonlyMap<string, (target: never) => readonly ContextMenuRow[]>
}

interface LooseUi {
  presentationViews?: Record<string, PresentationViewDef>
  items?: Record<string, ItemUi>
  connectors?: Record<string, ConnectorUi>
  settingViews?: Record<string, SettingUi>
  userSettingViews?: Record<string, UserSettingUi>
  dialogViews?: Record<string, AnyDialogView>
  widgets?: readonly AnyWidgetDef[]
  commandIcons?: Record<string, ReactNode>
  toolIcons?: Record<string, ReactNode>
  pageTypeIcons?: Record<string, ReactNode>
  enumValueIcons?: Record<string, EnumValueIcon>
  contextMenuRows?: Record<string, (target: never) => readonly ContextMenuRow[]>
  overrides?: {
    presentationViews?: Record<string, PresentationViewDef>
    dialogViews?: Record<string, AnyDialogView>
    widgets?: Record<string, (props: never) => ReactNode>
  }
}

// プラグインの見た目を 1 つの表にする。見た目を結んでいないプラグイン・ビューの無い id・知らない id の差し替え・2 つの差し替えは error。
// 表はプラグインの配列ごとに覚え、同じ配列なら組み直さない（画面の入口と MatomezuProvider が同じインスタンスの plugins を渡す）
const assembled = new WeakMap<readonly Plugin[], UiCatalog>()
export function assembleUi(plugins: readonly Plugin[]): UiCatalog {
  const known = assembled.get(plugins)
  if (known) return known
  const ui = buildUi(plugins)
  assembled.set(plugins, ui)
  return ui
}

function buildUi(plugins: readonly Plugin[]): UiCatalog {
  const presentationViews = new Map<string, PresentationViewDef>()
  const items = new Map<string, ItemUi>()
  const connectors = new Map<string, ConnectorUi>()
  const settingViews = new Map<string, SettingUi>()
  const userSettingViews = new Map<string, UserSettingUi>()
  const dialogViews = new Map<string, AnyDialogView>()
  const widgets = new Map<string, AnyWidgetDef>()
  const commandIcons = new Map<string, ReactNode>()
  const contextMenuRows = new Map<string, (target: never) => readonly ContextMenuRow[]>()
  const toolIcons = new Map<string, ReactNode>()
  const pageTypeIcons = new Map<string, ReactNode>()
  const enumValueIcons = new Map<string, EnumValueIcon>()
  const uis = plugins.map(p => {
    const ui = (p as Partial<AnyPluginUi>).ui as LooseUi | undefined
    if (!ui) return fail("E203", { plugin: p.id })
    return { p, ui }
  })
  for (const { p, ui } of uis) {
    const need = <V>(
      kind: string,
      defs: readonly { id: string }[] | undefined,
      views: Record<string, V> | undefined,
      into: Map<string, V>,
    ) => {
      for (const d of defs ?? []) {
        const v = views?.[d.id]
        if (!v) return fail("E204", { plugin: p.id, kind, id: d.id })
        into.set(d.id, v)
      }
    }
    need("presentation", p.presentations, ui.presentationViews, presentationViews)
    need(
      "item",
      p.items?.filter(i => i.kind === "shape"),
      ui.items,
      items,
    )
    need(
      "connector",
      p.items?.filter(i => i.kind === "connector"),
      ui.connectors,
      connectors,
    )
    need("setting", p.settings, ui.settingViews, settingViews)
    for (const d of p.userSettings ?? []) {
      const v = ui.userSettingViews?.[d.id]
      if (v) userSettingViews.set(d.id, v)
    }
    need("dialog", p.dialogs, ui.dialogViews, dialogViews)
    need("tool", p.tools, ui.toolIcons, toolIcons)
    for (const w of ui.widgets ?? []) {
      if (!isOwnedBy(p.id, w.id)) fail("E301", { plugin: p.id, kind: "widget", id: w.id })
      if (w.forKind !== undefined && !isOwnedBy(p.id, w.forKind))
        fail("E312", { plugin: p.id, id: w.id, kind: w.forKind })
      if (widgets.has(w.id)) fail("E001", { kind: "widget", id: w.id })
      widgets.set(w.id, w)
    }
    const own = new Set((p.commands ?? []).map(c => c.id))
    for (const [id, icon] of Object.entries(ui.commandIcons ?? {})) {
      if (!own.has(id)) fail("E307", { plugin: p.id, command: id })
      commandIcons.set(id, icon)
    }
    for (const [id, rows] of Object.entries(ui.contextMenuRows ?? {})) {
      if (!isOwnedBy(p.id, id)) fail("E315", { plugin: p.id, id })
      contextMenuRows.set(id, rows)
    }
    const ownTypes = new Set((p.pageTypes ?? []).map(t => t.id))
    for (const [id, icon] of Object.entries(ui.pageTypeIcons ?? {})) {
      if (!ownTypes.has(id)) fail("E313", { plugin: p.id, id })
      pageTypeIcons.set(id, icon)
    }
    const ownValues = new Set((p.enumValues ?? []).map(v => v.id))
    for (const [id, icon] of Object.entries(ui.enumValueIcons ?? {})) {
      if (!ownValues.has(id)) fail("E314", { plugin: p.id, id })
      enumValueIcons.set(id, icon)
    }
  }
  const overridden = new Set<string>()
  for (const { p, ui } of uis)
    for (const [kind, views, into] of [
      ["presentation", ui.overrides?.presentationViews, presentationViews],
      ["dialog", ui.overrides?.dialogViews, dialogViews],
    ] as const)
      for (const [id, view] of Object.entries(views ?? {})) {
        if (!into.has(id)) fail("E205", { plugin: p.id, kind, id })
        if (overridden.has(`${kind}:${id}`)) fail("E206", { plugin: p.id, kind, id })
        overridden.add(`${kind}:${id}`)
        ;(into as Map<string, unknown>).set(id, view)
      }
  for (const { p, ui } of uis)
    for (const [id, view] of Object.entries(ui.overrides?.widgets ?? {})) {
      const w = widgets.get(id)
      if (!w) fail("E205", { plugin: p.id, kind: "widget", id })
      if (overridden.has(`widget:${id}`)) fail("E206", { plugin: p.id, kind: "widget", id })
      overridden.add(`widget:${id}`)
      widgets.set(id, { ...w, view })
    }
  return {
    presentationViews,
    items,
    connectors,
    settingViews,
    userSettingViews,
    dialogViews,
    widgets,
    commandIcons,
    toolIcons,
    pageTypeIcons,
    enumValueIcons,
    contextMenuRows,
  }
}
