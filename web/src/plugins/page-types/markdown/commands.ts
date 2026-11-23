// ペインの並べ方のコマンドと、ソースのペインのテキストFormの中のキー（元に戻す・やり直す・検索は base のコマンド）。
// 並べ方のコマンドは 4 つ（ソースだけ・左右に並べる・上下に並べる・プレビューだけ）で、ビューの上の行のボタンが押す。今の並べ方のコマンドは押した状態。
// 利用者が選んだ並べ方は画面の場所に入れるプラグイン状態に持つ（panes.ts の PANE_LAYOUT_STATE）。コマンドは並べ方（mode）だけを変え、選んだ並べ方にする
import type { CommandContext, NO_STATE } from "../../../plugin-api"
import { hasOpenedPage } from "../../base"
import { kit } from "./kit"
import { MARKDOWN_PRESENTATION, SOURCE_KEY_SCOPE } from "./markdown"
import {
  type ChosenLayout,
  chosenWith,
  PANE_LAYOUT_STATE,
  PANE_OPENING_STATE,
  type PaneMode,
  paneInputOf,
  paneLayoutOf,
} from "./panes"

// 開いているページのタイプが、マークダウンのプレゼンテーションで描くか
const onMarkdown = (ctx: CommandContext) =>
  hasOpenedPage(ctx) && ctx.catalog.pageTypes.get(ctx.page.type)?.presentation === MARKDOWN_PRESENTATION.id

// 開いているページの、ペインに渡す id と本文
function paneInputHere(ctx: CommandContext): { id: string; text: string } | null {
  return hasOpenedPage(ctx) ? paneInputOf(ctx.page) : null
}

// 並べ方 mode にするコマンドの中身（入れ替えた順と境目の割合はそのまま。今その並べ方なら押した状態）
const toMode = (mode: PaneMode) => ({
  run: (
    ctx: CommandContext,
    a: {
      updatePluginState(def: typeof PANE_LAYOUT_STATE, f: (now: ChosenLayout | typeof NO_STATE) => ChosenLayout): void
    },
  ) =>
    a.updatePluginState(PANE_LAYOUT_STATE, now =>
      chosenWith(now, paneLayoutOf(now, ctx.pluginState(PANE_OPENING_STATE), paneInputHere(ctx)), { mode }),
    ),
  when: onMarkdown,
  active: (ctx: CommandContext) =>
    paneLayoutOf(ctx.pluginState(PANE_LAYOUT_STATE), ctx.pluginState(PANE_OPENING_STATE), paneInputHere(ctx)).mode ===
    mode,
})

export const PANE_SHOW_SOURCE = kit.defineCommand({
  id: "pane-show-source",
  title: "Source only",
  ...toMode("source-only"),
})

export const PANE_SPLIT_ROW = kit.defineCommand({
  id: "pane-split-row",
  title: "Side by side",
  ...toMode("split-row"),
})

export const PANE_SPLIT_COLUMN = kit.defineCommand({
  id: "pane-split-column",
  title: "Top and bottom",
  ...toMode("split-column"),
})

export const PANE_SHOW_RENDERED = kit.defineCommand({
  id: "pane-show-rendered",
  title: "Preview only",
  ...toMode("rendered-only"),
})

// ビューの上の行に、この順で並べる
export const PANE_LAYOUT_COMMANDS = [PANE_SHOW_SOURCE, PANE_SPLIT_ROW, PANE_SPLIT_COLUMN, PANE_SHOW_RENDERED] as const

export const SOURCE_KEYS = [
  kit.defineKey({ id: "source-undo-mod-z", key: "Mod+Z", command: "@matomezu/base:undo", scope: SOURCE_KEY_SCOPE.id }),
  kit.defineKey({
    id: "source-redo-mod-shift-z",
    key: "Mod+Shift+Z",
    command: "@matomezu/base:redo",
    scope: SOURCE_KEY_SCOPE.id,
  }),
  kit.defineKey({ id: "source-redo-mod-y", key: "Mod+Y", command: "@matomezu/base:redo", scope: SOURCE_KEY_SCOPE.id }),
  // 書いている途中でも base の検索を開き、次・前へ移る（テキストFormの中のキーは、この範囲だけで引くため）
  kit.defineKey({
    id: "source-search-mod-f",
    key: "Mod+F",
    command: "@matomezu/base:search-open",
    scope: SOURCE_KEY_SCOPE.id,
  }),
  kit.defineKey({
    id: "source-search-book-mod-shift-f",
    key: "Mod+Shift+F",
    command: "@matomezu/base:search-open-book",
    scope: SOURCE_KEY_SCOPE.id,
  }),
  kit.defineKey({
    id: "source-search-replace-mod-alt-f",
    key: "Mod+Alt+F",
    command: "@matomezu/base:search-open-replace",
    scope: SOURCE_KEY_SCOPE.id,
  }),
  kit.defineKey({
    id: "source-search-next-f3",
    key: "F3",
    command: "@matomezu/base:search-next",
    scope: SOURCE_KEY_SCOPE.id,
  }),
  kit.defineKey({
    id: "source-search-previous-shift-f3",
    key: "Shift+F3",
    command: "@matomezu/base:search-previous",
    scope: SOURCE_KEY_SCOPE.id,
  }),
]
