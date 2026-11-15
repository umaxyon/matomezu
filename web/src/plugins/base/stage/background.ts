// 背景編集モードのコマンド: 背景（ページの slide。背景を持つタイプだけ）を直すモードに入る・出る、中身を隠す、背景の印刷の設定を変える。
// モードはステージが持つ（core/stage.ts の edits）。中身を隠しているかは base が持つステージのプラグイン状態（states.ts。モードを出ると戻る）
import { pageType } from "../../../core/core-catalog"
import { slideIsBackground } from "../../../core/def/page-type"
import { editingBackground as isEditing, openedPage, shownPageId } from "../../../core/stage"
import type { CommandActions, CommandContext } from "../../../store/commands/def"
import { kit } from "../kit"
import { PAGE_UPDATE } from "../page-tabs/page-update"
import { BACKGROUND_PRINT, type BackgroundPrint } from "../print-preview/settings"
import { CONTENT_HIDDEN } from "./states"

const editingBackground = (ctx: CommandContext): boolean => isEditing(ctx.stage)

// 開いているページが、背景を持つタイプのページか
const hasBackground = (ctx: CommandContext): boolean => {
  const page = openedPage(ctx.stage.opened)
  return page !== null && slideIsBackground(pageType(ctx.catalog, page.type))
}

// 背景編集モードに入ったとき、前に隠していた中身は見せる
const showContent = (a: CommandActions) => a.updatePluginState(CONTENT_HIDDEN, () => undefined)

// 背景編集モードに入る・出る（フッタのボタン。もう一度押すと出る）
export const BACKGROUND_TOGGLE = kit.defineCommand({
  id: "background-toggle",
  title: "Edit background",
  run: (ctx, a) => {
    if (editingBackground(ctx)) {
      a.endBackground()
      return
    }
    showContent(a)
    a.startBackground()
  },
  when: hasBackground,
  active: editingBackground,
})

// ページ page の背景を直す（ページの右クリックのメニュー。開いていないページなら、先にそのページを開く）
export const BACKGROUND_EDIT = kit.defineCommand({
  id: "background-edit",
  title: "Edit background",
  run: (ctx, a, { page }: { page: string }) => {
    if (shownPageId(ctx.stage.opened ?? null) !== page) a.openPage(page)
    showContent(a)
    a.startBackground()
  },
  when: ctx => !editingBackground(ctx) && hasBackground(ctx),
})

// 背景編集モードを出る（帯の「終了」。Escape は、何も置こうとしていなければ toolbox-cancel が同じことをする）
export const BACKGROUND_END = kit.defineCommand({
  id: "background-end",
  title: "End background editing",
  run: (_ctx, a) => a.endBackground(),
  when: editingBackground,
})

// 中身を隠す・見せる（押している間は、ページの普通のアイテムを描かない。データは変えない）
export const BACKGROUND_HIDE_CONTENT = kit.defineCommand({
  id: "background-hide-content",
  title: "Hide content",
  run: (_ctx, a) => a.updatePluginState(CONTENT_HIDDEN, now => (now ? undefined : true)),
  when: editingBackground,
  active: ctx => ctx.pluginState(CONTENT_HIDDEN) ?? false,
})

// 開いているページの背景の印刷の設定を変える（フッタの「印刷対象」）
export const BACKGROUND_PRINT_SET = kit.defineCommand({
  id: "background-print-set",
  performs: [PAGE_UPDATE.id],
  permissionScope: "opened-page",
  title: "Print background",
  run: (ctx, a, { mode }: { mode: BackgroundPrint }) => {
    const opened = openedPage(ctx.stage.opened)
    if (!opened || !ctx.book) return
    a.perform(PAGE_UPDATE.id, { page: opened.page, settings: { [BACKGROUND_PRINT.id]: mode } }, { book: opened.book })
  },
  when: editingBackground,
})
