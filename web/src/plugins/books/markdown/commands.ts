// ペインの分割のコマンドと、ソースのペインのテキストFormの中のキー（元に戻す・やり直すは base のコマンド）。
// ペインの分割のコマンドは、ペインのタブの右クリックのメニューに置く。1 つだけ見せているときは左右（縦分割）か上下（横分割）に並べ、
// 並べているときは、右クリックしたペインを閉じてもう一方を残す（ステージを閉じるのと同じ）。並べ方はこのプラグインのステージの画面の状態に持つ
import type { CommandContext } from "../../../plugin-api"
import { kit } from "./kit"
import { MARKDOWN_PRESENTATION, SOURCE_KEYS_SCOPE } from "./markdown"
import { type Pane, paneLayoutOf, unsplit } from "./panes"

// 開いているブックのタイプが、マークダウンの見せ方で描くか
const onMarkdown = (ctx: CommandContext) =>
  ctx.book !== null && ctx.catalog.bookTypes.get(ctx.book.type)?.presentation === MARKDOWN_PRESENTATION.id
const isSplit = (ctx: CommandContext) => paneLayoutOf(ctx.stageState).split !== null

export const PANE_SPLIT_ROW = kit.defineCommand({
  id: "pane-split-row",
  title: "Split vertically",
  run: (_ctx, a) => a.updateStageState(() => ({ split: "row" })),
  when: ctx => onMarkdown(ctx) && !isSplit(ctx),
})

export const PANE_SPLIT_COLUMN = kit.defineCommand({
  id: "pane-split-column",
  title: "Split horizontally",
  run: (_ctx, a) => a.updateStageState(() => ({ split: "column" })),
  when: ctx => onMarkdown(ctx) && !isSplit(ctx),
})

export const PANE_UNSPLIT = kit.defineCommand({
  id: "pane-unsplit",
  title: "Close split",
  run: (_ctx, a, { pane }: { pane: Pane }) => a.updateStageState(() => unsplit(pane)),
  when: ctx => onMarkdown(ctx) && isSplit(ctx),
})

export const SOURCE_KEYS = [
  kit.defineKey({ id: "source-undo-mod-z", key: "Mod+Z", command: "@matomezu/base:undo", scope: SOURCE_KEYS_SCOPE }),
  kit.defineKey({
    id: "source-redo-mod-shift-z",
    key: "Mod+Shift+Z",
    command: "@matomezu/base:redo",
    scope: SOURCE_KEYS_SCOPE,
  }),
  kit.defineKey({ id: "source-redo-mod-y", key: "Mod+Y", command: "@matomezu/base:redo", scope: SOURCE_KEYS_SCOPE }),
]
