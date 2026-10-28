// ダイアログ。定義は id と、開くときに渡す値の型だけを持ち、中身（ビュー）は ui が id に結ぶ（画面の無いインスタンスでも、コマンドがダイアログを開けるように）。
// 画面に出すダイアログは 1 つだけで、どれを出すかは id、どこから開いたかは stage、何について開いたかは args で決まる
import type { DialogExtras, DialogId, DialogTable } from "../core/catalog"
import type { ShapeAddArgs, ShapeEditArgs, ShapeItemDef } from "../core/def/item"

declare const ARGS: unique symbol

// A は開くときに渡す値の型（値を持たない印。渡さないダイアログは undefined）
export interface DialogDef<A = undefined> extends DialogExtras {
  id: string
  readonly [ARGS]?: A
}

// 値を渡さないダイアログ
export const defineDialog = <const Id extends string>(def: { id: Id }): DialogDef & { id: Id } => def

// 開くときに A の値を渡すダイアログ（defineDialogWith<渡す値の型>()({ id })）
export const defineDialogWith =
  <A>() =>
  <const Id extends string>(def: { id: Id }): DialogDef<A> & { id: Id } =>
    def

export type DialogArgsOf<Id extends DialogId> = DialogTable[Id] extends DialogDef<infer A> ? A : never
// ダイアログを開くときに渡す値の並び（値を渡さないダイアログには何も渡さない）
// 渡す値がちょうど A のダイアログの id
export type DialogTaking<A> = {
  [K in DialogId]: [DialogArgsOf<K>] extends [A] ? ([A] extends [DialogArgsOf<K>] ? K : never) : never
}[DialogId]
// 形の定義が名指す追加と編集のダイアログ（受ける値が ShapeAddArgs・ShapeEditArgs であることは definePlugin が型で、名指したダイアログがあることは組み立てが確かめる）
export function shapeDialogs(def: ShapeItemDef): {
  add?: DialogTaking<ShapeAddArgs>
  edit?: DialogTaking<ShapeEditArgs>
} {
  return (def.dialogs ?? {}) as { add?: DialogTaking<ShapeAddArgs>; edit?: DialogTaking<ShapeEditArgs> }
}

// ページの設定のダイアログが受ける値
export interface PageSettingsArgs {
  page: string
}

export type DialogArgs<Id extends DialogId> = [DialogArgsOf<Id>] extends [undefined] ? [] : [DialogArgsOf<Id>]

export interface OpenedDialog {
  id: DialogId
  stage: string // 開いたステージ。ダイアログの操作はこのステージに向ける
  args: unknown // 開くときに渡した値（id で型が決まる）
  submitted: number // 決めるように頼まれた回数（ダイアログの枠が見て、中身の form を送る）
  preview: DialogPreview | null // 選んだ値を、決める前に重ねて見せる下書き（このダイアログを閉じれば消える）
}

// ダイアログの下書き: ブック book のアイテム item の項目に props を重ねて描く（データは変えない。この窓の中だけ）。
// item が無く page があればそのページの、どちらも無ければブックの、設定の項目の変更が props（項目の id → 値。null は消す）
// content があれば、アイテムの中身のフィールド（フィールドの名前 → 値。リストの行など）をそれに替えて描く
export interface DialogPreview {
  book: string
  item?: string
  page?: string
  props: Readonly<Record<string, unknown>>
  content?: Readonly<Record<string, unknown>>
}
