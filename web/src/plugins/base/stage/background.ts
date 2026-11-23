// 背景編集モードのコマンド: 背景（ページの slide。背景を持つタイプだけ）を直すモードに入る・出る、中身を隠す、背景の印刷の設定を変える。
// モードはステージが持つ（core/stage.ts の edits）。中身を隠しているかは base が持つステージのプラグイン状態（states.ts。モードを出ると戻る）

import { pageType } from "../../../core/core-catalog"
import { slideIsBackground } from "../../../core/def/page-type"
import { NO_STATE } from "../../../core/def/plugin-state"
import { editingBackground as isEditing } from "../../../core/stage"
import { type CommandActions, type CommandContext, NO_BOOK } from "../../../store/commands/def"
import { kit } from "../kit"
import { PAGE_UPDATE } from "../pages/page-update"
import { BACKGROUND_PRINT, type BackgroundPrint } from "../print-preview/settings"
import { hasOpenedPage } from "../utils/opened-page"
import { CONTENT_HIDDEN } from "./states"

const editingBackground = (ctx: CommandContext): boolean => isEditing(ctx.stage)

// 開いているページが、背景を持つタイプのページか
const hasBackground = (ctx: CommandContext): boolean => {
  return hasOpenedPage(ctx) && slideIsBackground(pageType(ctx.catalog, ctx.page.type))
}

// 背景編集モードに入ったとき、前に隠していた中身は見せる
const showContent = (a: CommandActions) => a.resetPluginState(CONTENT_HIDDEN)

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
    if (!hasOpenedPage(ctx) || ctx.page.id !== page) a.openPage(page)
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
  run: (_ctx, a) => a.updatePluginState(CONTENT_HIDDEN, now => (now ? NO_STATE : true)),
  when: editingBackground,
  active: ctx => ctx.pluginState(CONTENT_HIDDEN),
})

// 開いているページの背景の印刷の設定を変える（フッタの「印刷対象」）
export const BACKGROUND_PRINT_SET = kit.defineCommand({
  id: "background-print-set",
  performs: [PAGE_UPDATE.id],
  permissionScope: "opened-page",
  title: "Print background",
  run: (ctx, a, { mode }: { mode: BackgroundPrint }) => {
    if (!hasOpenedPage(ctx)) return
    a.perform(PAGE_UPDATE.id, { settings: { [BACKGROUND_PRINT.id]: mode } }, { page: ctx.page.id })
  },
  // ブックの外のページには印刷が無いので、出さない
  when: ctx => editingBackground(ctx) && ctx.book !== NO_BOOK,
})
