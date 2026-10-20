// 見た目のプラグイン: React を使わないプラグイン（store/plugin.ts）に、そのプラグインのブックのタイプ・アイテム・ダイアログのビューを結ぶ。
// ビューは、そのプラグインの id を全部持たないと型の誤り。ほかのプラグインのビューを差し替えるのは overrides に書いたときだけ。
// 画面に置く app は、見た目を結んだプラグインだけで作る（MatomezuProvider が型と組み立てで確かめる）
import type { ComponentType, ReactNode } from "react"
import { fail } from "../core/errors"
import type { Stage } from "../core/stage"
import type { BookTypeId } from "../core/tables"
import type { IdsOf, Plugin } from "../store/plugin"
import type { DialogId } from "../store/tables"

export interface BookViewProps {
  stage: Stage
}
export interface DialogProps {
  stage: string // 開いたステージ
  onClose: () => void
}
// アイテムのビューは、そのアイテムの項目（props）のデータを受け取る
export interface ItemUi<Props = never> {
  view: ComponentType<{ props: Props }>
  icon: ReactNode // ツールボックスなどに出すアイコン
}

type ItemPropsOf<P, Id> = P extends { items?: readonly (infer D)[] }
  ? D extends { id: Id; props: { _zod: { output: infer O } } }
    ? O
    : never
  : never

// そのプラグインに id が無ければ、その欄は書かなくてよい
type Field<Ids, Name extends string, V> = [Ids] extends [never] ? { [n in Name]?: never } : { [n in Name]: V }

export type PluginViews<P> = Field<
  IdsOf<P, "bookTypes">,
  "bookViews",
  { [id in IdsOf<P, "bookTypes">]: ComponentType<BookViewProps> }
> &
  Field<IdsOf<P, "items">, "items", { [id in IdsOf<P, "items">]: ItemUi<ItemPropsOf<P, id>> }> &
  Field<IdsOf<P, "dialogs">, "dialogViews", { [id in IdsOf<P, "dialogs">]: ComponentType<DialogProps> }>

// ほかのプラグインのビューの差し替え。型の表にある id だけ
export interface Overrides {
  bookViews?: { [id in BookTypeId]?: ComponentType<BookViewProps> }
  dialogViews?: { [id in DialogId]?: ComponentType<DialogProps> }
}

export type UiParts<P> = PluginViews<P> & { overrides?: Overrides }
export type PluginUi<P extends Plugin> = P & { ui: UiParts<P> }
// 見た目を結んだプラグインのどれか
export type AnyPluginUi = Plugin & { ui: object }

export const definePluginUi = <const P extends Plugin>(plugin: P, ui: UiParts<P>): PluginUi<P> => ({ ...plugin, ui })

// app の見た目の表
export interface UiDefs {
  bookViews: ReadonlyMap<string, ComponentType<BookViewProps>>
  items: ReadonlyMap<string, ItemUi>
  dialogViews: ReadonlyMap<string, ComponentType<DialogProps>>
}

interface LooseUi {
  bookViews?: Record<string, ComponentType<BookViewProps>>
  items?: Record<string, ItemUi>
  dialogViews?: Record<string, ComponentType<DialogProps>>
  overrides?: {
    bookViews?: Record<string, ComponentType<BookViewProps>>
    dialogViews?: Record<string, ComponentType<DialogProps>>
  }
}

// プラグインの見た目を 1 つの表にする。見た目を結んでいないプラグイン・ビューの無い id・知らない id の差し替え・2 つの差し替えは誤り
export function assembleUi(plugins: readonly Plugin[]): UiDefs {
  const bookViews = new Map<string, ComponentType<BookViewProps>>()
  const items = new Map<string, ItemUi>()
  const dialogViews = new Map<string, ComponentType<DialogProps>>()
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
    need("item", p.items, ui.items, items)
    need("dialog", p.dialogs, ui.dialogViews, dialogViews)
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
  return { bookViews, items, dialogViews }
}
