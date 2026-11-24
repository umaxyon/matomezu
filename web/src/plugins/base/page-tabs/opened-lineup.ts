// ステージで開いている物の並び（ブックが対象のアクションの宛先になる物）と、それがブックかブックの外のバインダかで変わる事: 削除を出すか・バインダの設定の確定で行うアクション
import type { Orientation } from "../../../core/def/paper"
import type { BinderEntry, Book, StageLineup } from "../../../core/schema/book"
import { type CommandContext, NO_BOOK, NO_OUTSIDE_BINDER } from "../../../store/commands/def"
import { ENTRY_RENAME } from "../library/entry-move"
import { BINDER_UPDATE } from "../pages/binders"
import { leavesOutsideBinder } from "../pages/page-remove"

// 開いている物の並びが無いときの値（ブックもブックの外のバインダも開いていない）
export const NO_LINEUP = "none"

// 開いているブック book か、開いているブックの外のバインダ binder（その id と、そのバインダ 1 つだけの並び）
export function openedLineup(
  book: Book | typeof NO_BOOK,
  binder: BinderEntry | typeof NO_OUTSIDE_BINDER,
): StageLineup | typeof NO_LINEUP {
  if (book !== NO_BOOK) return book
  return binder === NO_OUTSIDE_BINDER ? NO_LINEUP : { id: binder.id, lineup: [binder] }
}

// コマンドの文脈 ctx のステージで開いている物の並び
export const lineupIn = (ctx: CommandContext): StageLineup | typeof NO_LINEUP =>
  openedLineup(ctx.book, ctx.outsideBinder)

// ページの削除を出すか: ブックのページか、ブックの外のバインダの最後の 1 枚でないページ（ブックの外のバインダは空にならない。ブックの外のページ 1 枚は、書庫で消す）
export const showsPageDelete = (book: Book | typeof NO_BOOK, binder: BinderEntry | typeof NO_OUTSIDE_BINDER): boolean =>
  book !== NO_BOOK || (binder !== NO_OUTSIDE_BINDER && leavesOutsideBinder(binder))

// バインダの設定で変えた項目（変えていない項目は無い）
export interface BinderSettingsPatch {
  title?: string
  paper?: string
  orientation?: Orientation
}

export type BinderSettingsStep =
  | { action: typeof ENTRY_RENAME.id; args: { entry: string; title: string } }
  | { action: typeof BINDER_UPDATE.id; args: { binder: string } & BinderSettingsPatch }

// バインダ binder の設定の確定で、順に行うアクション（断られたら、そこで止める。変えた項目が無ければ空）。
// ブックの中のバインダは、binder-update 1 回。ブックの外のバインダ（outside）は、名前を書庫の entry-rename で、紙と向きを binder-update で変える
export function binderSettingsSteps(
  binder: string,
  patch: BinderSettingsPatch,
  outside: boolean,
): BinderSettingsStep[] {
  const { title, ...paper } = patch
  const update = outside ? paper : patch
  return [
    ...(outside && title !== undefined ? [{ action: ENTRY_RENAME.id, args: { entry: binder, title } }] : []),
    ...(Object.keys(update).length > 0 ? [{ action: BINDER_UPDATE.id, args: { binder, ...update } }] : []),
  ]
}
