// ダイアログ。定義は id と、開くときに渡す値の型だけを持ち、中身（ビュー）は ui が id に結ぶ（画面の無いインスタンスでも、コマンドがダイアログを開けるように）。
// 画面に出すダイアログは 1 つだけで、どれを出すかは id、どこから開いたかは stage、何について開いたかは args で決まる
import type { DialogExtras, DialogId, DialogTable } from "../core/catalog"
import type { ShapeAddArgs, ShapeEditArgs, ShapeItemDef } from "../core/def/item"
import { NO_STAGE } from "../core/stage"

declare const ARGS: unique symbol

// A は開くときに渡す値の型（値を持たない印。渡さないダイアログは undefined）
export interface DialogDef<A = undefined> extends DialogExtras<A> {
  id: string
  readonly [ARGS]?: A
}

// 値を渡さないダイアログ
export const defineDialog = <const Id extends string>(def: { id: Id } & DialogExtras): DialogDef & { id: Id } => def

// 開くときに A の値を渡すダイアログ（defineDialogWith<渡す値の型>()({ id })）
export const defineDialogWith =
  <A>() =>
  <const Id extends string>(def: { id: Id } & DialogExtras<A>): DialogDef<A> & { id: Id } =>
    def

export type DialogArgsOf<Id extends DialogId> = DialogTable[Id] extends DialogDef<infer A> ? A : never
// ダイアログを開くときに渡す値の並び（値を渡さないダイアログには何も渡さない）
// 渡す値がちょうど A のダイアログの id
export type DialogTaking<A> = {
  [K in DialogId]: [DialogArgsOf<K>] extends [A] ? ([A] extends [DialogArgsOf<K>] ? K : never) : never
}[DialogId]
// 形の定義が名指す追加と編集のダイアログ（受ける値が ShapeAddArgs・ShapeEditArgs であることは definePlugin が型で、名指したダイアログがあることは台帳アセンブルが確かめる）。
// 使うのはプラグインだけだが、土台に置く: 形の定義の dialogs は id の文字で、型の上で「その値を受けるダイアログ」とは書けない（DialogTaking はダイアログの表から作り、
// その表を作る材料に形の定義も入るので、形の定義の型に使うと型どうしが互いを参照する）。土台の確かめを根拠にした言い張りを、土台の関数に閉じておくため
// （ページのタイプが名指すダイアログを引く base の pageDialog も同じ作り）
export function shapeDialogs(def: ShapeItemDef): {
  add?: DialogTaking<ShapeAddArgs>
  edit?: DialogTaking<ShapeEditArgs>
} {
  return (def.dialogs ?? {}) as { add?: DialogTaking<ShapeAddArgs>; edit?: DialogTaking<ShapeEditArgs> }
}

// ページを作るダイアログが受ける値: 作るページのタイプと、作る先。作る先は、ステージのブックなら書かず（まとまるタイプのページを今あるバインダに足すときだけ、binder にその id）、
// 書庫のフォルダなら folder にその id（書庫ホーム・フォルダ・ブック・ブックの外のバインダ）
export interface NewPageDialogArgs {
  type: string
  binder?: string
  folder?: string
}

// ページの設定のダイアログが受ける値
export interface PageSettingsArgs {
  page: string
}

export type DialogArgs<Id extends DialogId> = [DialogArgsOf<Id>] extends [undefined] ? [] : [DialogArgsOf<Id>]

// ステージを持たずに開いたダイアログの stage の値は NO_STAGE（core/stage.ts）
export { NO_STAGE }

// ダイアログ・右クリックのメニューを開いた場所: 開いたステージ stage（ステージを持たないスクリーンから開いたなら NO_STAGE）と、
// 開いたスクリーン screen（ステージから開いたなら、そのステージを並べているスクリーン）
export interface OpenedPlace {
  stage: string
  screen: string
}

// 開いた場所の id（ステージの id。ステージを持たずに開いたら、スクリーンの id）。そこから、コマンドを呼び、操作を向ける
export const openedAt = (opened: OpenedPlace): string => (opened.stage !== NO_STAGE ? opened.stage : opened.screen)

// コマンドの文脈の dialog の、ダイアログを開いていないときの値
export const NO_DIALOG = "none"

export interface OpenedDialog {
  id: DialogId
  stage: string // 開いたステージ。ダイアログの操作はこのステージに向ける。ステージを持たないスクリーンから開いたなら NO_STAGE
  screen: string // 開いたスクリーンの id（ステージから開いたなら、そのステージを並べているスクリーン）
  args: unknown // 開くときに渡した値（id で型が決まる）
  submitted: number // 決めるように頼まれた回数（ダイアログの枠が見て、中身の form を送る）
  preview: DialogPreview | typeof NO_DIALOG_PREVIEW // 選んだ値を、決める前に重ねて見せる下書き（このダイアログを閉じれば消える。置いていなければ NO_DIALOG_PREVIEW）
}

// 開いているダイアログの preview の、下書きを置いていないときの値（previewDialog に渡すと、置いた下書きを消す）
export const NO_DIALOG_PREVIEW = "none"

// ダイアログの下書き: ステージエントリ outermost（ブックか、ブックの外のページ）のアイテム item の項目に props を重ねて描く（データは変えない。この窓の中だけ）。
// item が無く page があればそのページの、どちらも無ければブックの、設定の項目の変更が props（項目の id → 値。null は消す）
// content があれば、アイテムの中身のフィールド（フィールドの名前 → 値。リストの行など）をそれに替えて描く
export interface DialogPreview {
  outermost: string
  item?: string
  page?: string
  props: Readonly<Record<string, unknown>>
  content?: Readonly<Record<string, unknown>>
}
