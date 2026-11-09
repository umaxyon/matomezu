// 背景編集モードのコマンドと画面の状態: 背景（ページの slide。背景を持つタイプだけ）を直すモードに入る・出る、中身を隠す、背景の印刷の設定を変える。
// モードはステージが持つ（core/stage.ts の edits）。中身を隠しているかは base が持つステージの画面の状態（モードを出ると戻る）
import { hasPages } from "../../../core/book"
import { bookType } from "../../../core/core-catalog"
import { slideIsBackground } from "../../../core/def/book-type"
import { editingBackground as isEditing } from "../../../core/stage"
import type { CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"
import { PAGE_UPDATE } from "../page-tabs/page-update"
import { BACKGROUND_PRINT, type BackgroundPrint } from "../print-preview/settings"
import { stageItem } from "../utils/stage-item"

// 中身（ページの普通のアイテム）を隠しているか（背景編集モードの間だけ効く）
export const CONTENT_HIDDEN = stageItem("contentHidden", false, hidden => !hidden)

const editingBackground = (ctx: CommandContext): boolean => isEditing(ctx.stage)

// 開いているページが、背景を持つタイプのページか
const hasBackground = (ctx: CommandContext): boolean =>
  ctx.book !== null &&
  hasPages(ctx.book) &&
  ctx.stage.opened?.page != null &&
  slideIsBackground(bookType(ctx.catalog, ctx.book.type))

// 背景編集モードに入ったとき、前に隠していた中身は見せる
const showContent = (a: { updateStageState(change: (now: unknown) => unknown): void }) =>
  a.updateStageState(now => CONTENT_HIDDEN.write(now, false))

// 背景編集モードに入る・出る（フッタのボタン。もう一度押すと出る）
export const BACKGROUND_TOGGLE = kit.defineCommand({
  id: "background-toggle",
  title: "Edit background",
  run: (ctx, a) => {
    if (editingBackground(ctx)) {
      a.endBackground(ctx.stage.id)
      return
    }
    showContent(a)
    a.startBackground(ctx.stage.id)
  },
  when: hasBackground,
  active: editingBackground,
})

// ページ page の背景を直す（ページの右クリックのメニュー。開いていないページなら、先にそのページを開く）
export const BACKGROUND_EDIT = kit.defineCommand({
  id: "background-edit",
  title: "Edit background",
  run: (ctx, a, { page }: { page: string }) => {
    if (ctx.stage.opened?.page !== page) a.openPage(ctx.stage.id, page)
    showContent(a)
    a.startBackground(ctx.stage.id)
  },
  when: ctx =>
    ctx.book !== null &&
    hasPages(ctx.book) &&
    !editingBackground(ctx) &&
    slideIsBackground(bookType(ctx.catalog, ctx.book.type)),
})

// 背景編集モードを出る（帯の「終了」。Escape は、何も置こうとしていなければ toolbox-cancel が同じことをする）
export const BACKGROUND_END = kit.defineCommand({
  id: "background-end",
  title: "End background editing",
  run: (ctx, a) => a.endBackground(ctx.stage.id),
  when: editingBackground,
})

// 中身を隠す・見せる（押している間は、ページの普通のアイテムを描かない。データは変えない）
export const BACKGROUND_HIDE_CONTENT = kit.defineCommand({
  id: "background-hide-content",
  title: "Hide content",
  run: (_ctx, a) => a.updateStageState(now => CONTENT_HIDDEN.write(now, !CONTENT_HIDDEN.read(now))),
  when: editingBackground,
  active: ctx => CONTENT_HIDDEN.read(ctx.stageState),
})

// 開いているページの背景の印刷の設定を変える（フッタの「印刷対象」）
export const BACKGROUND_PRINT_SET = kit.defineCommand({
  id: "background-print-set",
  performs: [PAGE_UPDATE.id],
  permissionScope: "opened-page",
  title: "Print background",
  run: (ctx, a, { mode }: { mode: BackgroundPrint }) => {
    const { opened } = ctx.stage
    if (!opened?.page || !ctx.book) return
    a.perform(PAGE_UPDATE.id, { page: opened.page, settings: { [BACKGROUND_PRINT.id]: mode } }, { book: opened.book })
  },
  when: editingBackground,
})
