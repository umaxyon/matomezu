// 見た目のプラグイン: React を使わないプラグイン（store/plugin.ts）に、そのプラグインのブックのタイプ・アイテム・ダイアログのビューを結び、
// ウィジェット（スロットに置ける部品）とコマンドのアイコンを足す。
// ビューは、そのプラグインの id を全部持たないと型の誤り。ほかのプラグインのビューを差し替えるのは overrides に書いたときだけ。
// 画面に置く app は、見た目を結んだプラグインだけで作る（MatomezuProvider が型と組み立てで確かめる）
import type { ComponentType, ReactNode } from "react"
import { fail } from "../core/errors"
import type { Size } from "../core/geom"
import type { Stage } from "../core/stage"
import type { BookTypeId } from "../core/tables"
import type { DialogArgsOf, DialogDef } from "../store/dialogs"
import { type IdsOf, isBuiltin, type Plugin } from "../store/plugin"
import type { DialogId } from "../store/tables"
import type { AnyWidgetDef } from "./layout"
import type { ContextMenuId, WidgetId, WidgetTable } from "./tables"

export interface BookViewProps {
  stage: Stage
}
// ブックのビュー: 開いたブックのタイプで決まる、ステージの真ん中に描く部品（配置には書かない）。
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
// biome-ignore lint/suspicious/noExplicitAny: 関数の部品とクラスの部品の両方を受けるには any しかない
type AnyDialogView = ComponentType<DialogProps<any>>
// アイテムのビューに渡す値: 項目（props）・大きさ（紙の上の px）・アイテムの id・描いているステージ・中身（中身を持つアイテムの children）
export interface ItemViewProps<Props> {
  props: Props
  size: Size
  id: string
  stage: string
  content: readonly unknown[]
}

// アイテムのビューは、そのアイテムの項目（props）のデータを受け取る
export interface ItemUi<Props = never> {
  view: ComponentType<ItemViewProps<Props>>
  icon: ReactNode // ツールボックスなどに出すアイコン
}

// 画面に置く形（kind が shape）のアイテムの id。線（connector）はブックのビューが描くので、アイテムのビューを持たない
type ShapeIdsOf<P> = P extends { items?: readonly (infer D)[] }
  ? D extends { id: infer I; kind: "shape" }
    ? I
    : never
  : never

type ItemPropsOf<P, Id> = P extends { items?: readonly (infer D)[] }
  ? D extends { id: Id; props: { _zod: { output: infer O } } }
    ? O
    : never
  : never

type DialogArgsOfPlugin<P, Id> = P extends { dialogs?: readonly (infer D)[] }
  ? D extends { id: Id } & DialogDef<infer A>
    ? A
    : never
  : never

// そのプラグインに id が無ければ、その欄は書かなくてよい
type Field<Ids, Name extends string, V> = [Ids] extends [never] ? { [n in Name]?: never } : { [n in Name]: V }

export type PluginViews<P> = Field<IdsOf<P, "bookTypes">, "bookViews", { [id in IdsOf<P, "bookTypes">]: BookViewDef }> &
  Field<ShapeIdsOf<P>, "items", { [id in ShapeIdsOf<P>]: ItemUi<ItemPropsOf<P, id>> }> &
  Field<
    IdsOf<P, "dialogs">,
    "dialogViews",
    { [id in IdsOf<P, "dialogs">]: ComponentType<DialogProps<DialogArgsOfPlugin<P, id>>> }
  >

// ウィジェットが受け取る値（そのウィジェットの部品の props）
type WidgetProps<W extends WidgetId> = WidgetTable[W] extends { view: (props: infer P) => ReactNode } ? P : never

// ほかのプラグインのビューとウィジェットの差し替え。型の表にある id だけ（ウィジェットは置けるスロットを変えず、描く部品だけを替える）
export interface Overrides {
  bookViews?: { [id in BookTypeId]?: BookViewDef }
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

// app の見た目の表
export interface UiDefs {
  bookViews: ReadonlyMap<string, BookViewDef>
  items: ReadonlyMap<string, ItemUi>
  dialogViews: ReadonlyMap<string, AnyDialogView>
  widgets: ReadonlyMap<string, AnyWidgetDef>
  commandIcons: ReadonlyMap<string, ReactNode>
}

interface LooseUi {
  bookViews?: Record<string, BookViewDef>
  items?: Record<string, ItemUi>
  dialogViews?: Record<string, AnyDialogView>
  widgets?: readonly AnyWidgetDef[]
  commandIcons?: Record<string, ReactNode>
  overrides?: {
    bookViews?: Record<string, BookViewDef>
    dialogViews?: Record<string, AnyDialogView>
    widgets?: Record<string, (props: never) => ReactNode>
  }
}

// プラグインの見た目を 1 つの表にする。見た目を結んでいないプラグイン・ビューの無い id・知らない id の差し替え・2 つの差し替えは誤り
export function assembleUi(plugins: readonly Plugin[]): UiDefs {
  const bookViews = new Map<string, BookViewDef>()
  const items = new Map<string, ItemUi>()
  const dialogViews = new Map<string, AnyDialogView>()
  const widgets = new Map<string, AnyWidgetDef>()
  const commandIcons = new Map<string, ReactNode>()
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
    need("bookType", p.bookTypes, ui.bookViews, bookViews)
    need(
      "item",
      p.items?.filter(i => i.kind === "shape"),
      ui.items,
      items,
    )
    need("dialog", p.dialogs, ui.dialogViews, dialogViews)
    for (const w of ui.widgets ?? []) {
      if (!isBuiltin(p) && !w.id.startsWith(`${p.id}/`)) fail("E301", { plugin: p.id, kind: "widget", id: w.id })
      if (widgets.has(w.id)) fail("E001", { kind: "widget", id: w.id })
      widgets.set(w.id, w)
    }
    for (const [id, icon] of Object.entries(ui.commandIcons ?? {})) commandIcons.set(id, icon)
  }
  const overridden = new Set<string>()
  for (const { p, ui } of uis)
    for (const [kind, views, into] of [
      ["bookType", ui.overrides?.bookViews, bookViews],
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
  return { bookViews, items, dialogViews, widgets, commandIcons }
}
