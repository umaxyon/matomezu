// コマンドが変える所: 呼ばれたステージで開いているページ（コマンドの touches に使う。ページを開いていなければ分からない）
import type { Where } from "../../../core/def/action"
import type { CommandContext } from "../../../store/commands/def"

export const openedPage = (ctx: CommandContext): Where =>
  ctx.stage.opened?.page ? { page: ctx.stage.opened.page } : {}
