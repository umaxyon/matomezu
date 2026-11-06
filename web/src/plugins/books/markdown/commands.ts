// ペインの並べ方のコマンドと、ソースのペインのテキストFormの中のキー（元に戻す・やり直すは base のコマンド）。
// 並べ方のコマンドは 4 つ（ソースだけ・左右に並べる・上下に並べる・プレビューだけ）で、ビューの上の行のボタンが押す。今の並べ方のコマンドは押した状態。
// 並べ方はこのプラグインのステージの画面の状態に持つ（panes.ts）
import type { CommandContext } from "../../../plugin-api"
import { kit } from "./kit"
import { MARKDOWN_PRESENTATION, SOURCE_KEYS_SCOPE } from "./markdown"
import { type PaneLayout, paneLayoutOf, sameLayout } from "./panes"

// 開いているブックのタイプが、マークダウンの見せ方で描くか
const onMarkdown = (ctx: CommandContext) =>
  ctx.book !== null && ctx.catalog.bookTypes.get(ctx.book.type)?.presentation === MARKDOWN_PRESENTATION.id

// 並べ方 layout にするコマンドの中身（今その並べ方なら押した状態）
const toLayout = (layout: PaneLayout) => ({
  run: (_ctx: CommandContext, a: { updateStageState(f: () => PaneLayout): void }) => a.updateStageState(() => layout),
  when: onMarkdown,
  active: (ctx: CommandContext) => sameLayout(paneLayoutOf(ctx.stageState), layout),
})

export const PANE_SHOW_SOURCE = kit.defineCommand({
  id: "pane-show-source",
  title: "Source only",
  ...toLayout({ split: null, shown: "source" }),
})

export const PANE_SPLIT_ROW = kit.defineCommand({
  id: "pane-split-row",
  title: "Side by side",
  ...toLayout({ split: "row" }),
})

export const PANE_SPLIT_COLUMN = kit.defineCommand({
  id: "pane-split-column",
  title: "Top and bottom",
  ...toLayout({ split: "column" }),
})

export const PANE_SHOW_RENDERED = kit.defineCommand({
  id: "pane-show-rendered",
  title: "Preview only",
  ...toLayout({ split: null, shown: "rendered" }),
})

// ビューの上の行に、この順で並べる
export const PANE_LAYOUT_COMMANDS = [PANE_SHOW_SOURCE, PANE_SPLIT_ROW, PANE_SPLIT_COLUMN, PANE_SHOW_RENDERED] as const

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
