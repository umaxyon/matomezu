// コマンドの文脈の、開いているページの決まり: 開いているかも中身も ctx.page だけで決める（ステージの開いている物から求め直さない）
import type { ItemPage } from "../../../core/placed"
import { type CommandContext, NO_PAGE } from "../../../store/commands/def"

// ctx のステージでページを開いていて、その中身が読めるか（通ったあとは ctx.page がページ）
export const hasOpenedPage = <C extends Pick<CommandContext, "page">>(ctx: C): ctx is C & { page: ItemPage } =>
  ctx.page !== NO_PAGE
