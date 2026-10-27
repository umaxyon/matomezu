// 見た目のプラグイン: React を使わないプラグイン（store/plugin.ts）に、そのプラグインの見せ方・アイテム・設定の項目・ダイアログのビューを結び、
// ウィジェット（スロットに置けるコンポーネント）とコマンドのアイコンを足す。
// ビューは、そのプラグインの id を全部持たないと型の誤り。ほかのプラグインのビューを差し替えるのは overrides に書いたときだけ。
// 画面に置くインスタンスは、見た目を結んだプラグインだけで作る（MatomezuProvider が型と組み立てで確かめる）
import type { ComponentType, ReactNode } from "react"
import type { ContextMenuId, DialogId, PresentationId, WidgetId, WidgetTable } from "../core/catalog"
import { fail } from "../core/errors"
import type { Size } from "../core/geom"
import { isOwnedBy } from "../core/names"
import type { Book } from "../core/schema/book"
import type { DialogArgsOf, DialogDef } from "../store/dialogs"
import type { IdsOf, Plugin } from "../store/plugin"
import type { ConnectorUi } from "./connector"
import type { AnyWidgetDef } from "./layout"

// stage はステージの id（中身は useStage などのフックで引く）
export interface BookViewProps {
  stage: string
}
// ブックのビュー: 開いたブックのタイプが選んだ見せ方（core/def/presentation.ts）のコンポーネントで、ステージの真ん中に描く（配置には書かない）。
// ウィジェットと同じく、開く右クリックのメニュー（useContextMenu）を contextMenus に全部書く
export interface BookViewDef {
  view: ComponentType<BookViewProps>
  contextMenus?: readonly ContextMenuId[]
}
// A は開くときに渡された値の型（値を渡さないダイアログは undefined）
export interface DialogProps<A = undefined> {
  stage: string // 開いたステージ
  args: A
  onClose: () => void
}
// どのダイアログのビューも入る型（表に入れるときに使う。渡す値の型は id ごとに違うので、表の上では見ない）
// biome-ignore lint/suspicious/noExplicitAny: 関数コンポーネントとクラスコンポーネントの両方を受けるには any しかない
type AnyDialogView = ComponentType<DialogProps<any>>
// アイテムのビューに渡す値: 項目（props）・大きさ（紙の上の px）・アイテムの id・描いているステージ・
// 中身（形の定義の content に宣言したフィールドの名前 → その値。データに無いフィールドは undefined）・
// 今の倍率（紙の上の 1px が画面の何 px か。倍率を変えると、新しい値で描き直す）
export interface ItemViewProps<Props, Content = Readonly<Record<string, unknown>>> {
  props: Props
  size: Size
  id: string
  stage: string
  content: Content
  zoom: number
}

// アイテムのビューは、そのアイテムの項目（props）のデータを受け取る
export interface ItemUi<Props = never, Content = never> {
  view: ComponentType<ItemViewProps<Props, Content>>
  icon: ReactNode // ツールボックスなどに出すアイコン
  contextMenus?: readonly ContextMenuId[] // ビューが開く右クリックのメニュー
}

// 設定の項目（core/def/setting.ts）を変えるコンポーネントに渡す値。of はブックかページか、value はその段の値（無ければ undefined）、
// inherited は値が無いときに効く値（ページならブックの値か既定、ブックなら既定。既定の無い項目なら undefined のことがある）。onChange の undefined は値を消す（上の段を継ぐ）。
// book は、ダイアログで変えている項目を重ねたブック（ほかの項目の値で見せ方が変わるコンポーネントが読む）
export interface SettingControlProps<V = unknown> {
  of: "book" | "page"
  label: string
  value: V | undefined
  inherited: V | undefined
  book: Book
  onChange(value: V | undefined): void
}
// 設定の項目のビュー: 設定のダイアログに並べるコンポーネント
export interface SettingUi {
  // biome-ignore lint/suspicious/noExplicitAny: 値の型は項目ごとに違うので、表の上では見ない
  control: ComponentType<SettingControlProps<any>>
}

// 画面に置く形（kind が shape）のアイテムの id。線（connector）はブックのビューが描くので、アイテムのビューを持たない
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
  { [id in IdsOf<P, "presentations">]: BookViewDef }
> &
  Field<ShapeIdsOf<P>, "items", { [id in ShapeIdsOf<P>]: ItemUi<ItemPropsOf<P, id>, ItemContentOf<P, id>> }> &
  Field<ConnectorIdsOf<P>, "connectors", { [id in ConnectorIdsOf<P>]: ConnectorUi }> &
  Field<IdsOf<P, "settings">, "settingViews", { [id in IdsOf<P, "settings">]: SettingUi }> &
  Field<
    IdsOf<P, "dialogs">,
    "dialogViews",
    { [id in IdsOf<P, "dialogs">]: ComponentType<DialogProps<DialogArgsOfPlugin<P, id>>> }
  > &
  Field<IdsOf<P, "tools">, "toolIcons", { [id in IdsOf<P, "tools">]: ReactNode }>

// ウィジェットが受け取る値（そのウィジェットのコンポーネントの props）
type WidgetProps<W extends WidgetId> = WidgetTable[W] extends { view: (props: infer P) => ReactNode } ? P : never

// ほかのプラグインのビューとウィジェットの差し替え。core/catalog.ts にある id だけ（ウィジェットは置けるスロットを変えず、描くコンポーネントだけを替える）
export interface Overrides {
  presentationViews?: { [id in PresentationId]?: BookViewDef }
  dialogViews?: { [id in DialogId]?: ComponentType<DialogProps<DialogArgsOf<id>>> }
  widgets?: { [id in WidgetId]?: (props: WidgetProps<id>) => ReactNode }
}

// widgets はこのプラグインのウィジェット、commandIcons はメニューなどに出すコマンドのアイコン（無ければ名前の文字だけを出す）
export type UiParts<P> = PluginViews<P> & {
  widgets?: readonly AnyWidgetDef[]
  commandIcons?: { [id in IdsOf<P, "commands">]?: ReactNode }
  overrides?: Overrides
}
export type PluginUi<P extends Plugin> = P & { ui: UiParts<P> }
// 見た目を結んだプラグインのどれか
export type AnyPluginUi = Plugin & { ui: object }

export const definePluginUi = <const P extends Plugin>(plugin: P, ui: UiParts<P>): PluginUi<P> => ({ ...plugin, ui })

// インスタンスの見た目の表
export interface UiCatalog {
  presentationViews: ReadonlyMap<string, BookViewDef>
  items: ReadonlyMap<string, ItemUi>
  connectors: ReadonlyMap<string, ConnectorUi>
  settingViews: ReadonlyMap<string, SettingUi>
  dialogViews: ReadonlyMap<string, AnyDialogView>
  widgets: ReadonlyMap<string, AnyWidgetDef>
  commandIcons: ReadonlyMap<string, ReactNode>
  toolIcons: ReadonlyMap<string, ReactNode>
}

interface LooseUi {
  presentationViews?: Record<string, BookViewDef>
  items?: Record<string, ItemUi>
  connectors?: Record<string, ConnectorUi>
  settingViews?: Record<string, SettingUi>
  dialogViews?: Record<string, AnyDialogView>
  widgets?: readonly AnyWidgetDef[]
  commandIcons?: Record<string, ReactNode>
  toolIcons?: Record<string, ReactNode>
  overrides?: {
    presentationViews?: Record<string, BookViewDef>
    dialogViews?: Record<string, AnyDialogView>
    widgets?: Record<string, (props: never) => ReactNode>
  }
}

// プラグインの見た目を 1 つの表にする。見た目を結んでいないプラグイン・ビューの無い id・知らない id の差し替え・2 つの差し替えは誤り
export function assembleUi(plugins: readonly Plugin[]): UiCatalog {
  const presentationViews = new Map<string, BookViewDef>()
  const items = new Map<string, ItemUi>()
  const connectors = new Map<string, ConnectorUi>()
  const settingViews = new Map<string, SettingUi>()
  const dialogViews = new Map<string, AnyDialogView>()
  const widgets = new Map<string, AnyWidgetDef>()
  const commandIcons = new Map<string, ReactNode>()
  const toolIcons = new Map<string, ReactNode>()
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
    need("dialog", p.dialogs, ui.dialogViews, dialogViews)
    need("tool", p.tools, ui.toolIcons, toolIcons)
    for (const w of ui.widgets ?? []) {
      if (!isOwnedBy(p.id, w.id)) fail("E301", { plugin: p.id, kind: "widget", id: w.id })
      if (widgets.has(w.id)) fail("E001", { kind: "widget", id: w.id })
      widgets.set(w.id, w)
    }
    const own = new Set((p.commands ?? []).map(c => c.id))
    for (const [id, icon] of Object.entries(ui.commandIcons ?? {})) {
      if (!own.has(id)) fail("E307", { plugin: p.id, command: id })
      commandIcons.set(id, icon)
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
  return { presentationViews, items, connectors, settingViews, dialogViews, widgets, commandIcons, toolIcons }
}
