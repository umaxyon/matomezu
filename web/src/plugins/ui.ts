// ビルトインプラグインの一覧（画面のあるインスタンス用。どのプラグインにも見た目を結んだもの）と、それを渡したインスタンスの既定の配置
import { defineLayout } from "../ui/layout"
import { BASE_UI } from "./base/ui"
import { DRAWING_UI } from "./books/drawing/ui"
import { MASTER_UI } from "./books/master/ui"
import { BOX_UI } from "./items/box/ui"
import { LINE_UI } from "./items/line/ui"
import { LIST_UI } from "./items/list/ui"
import { PAPER_UI } from "./paper/ui"

export const BUILTIN_UI = [BASE_UI, MASTER_UI, PAPER_UI, BOX_UI, LIST_UI, LINE_UI, DRAWING_UI] as const

// 既定の配置（今の画面の形）。インスタンスは MatomezuProvider にこれか、これを写して直したものを渡す
export const DEFAULT_LAYOUT = defineLayout({
  id: "default",
  slots: {
    root: ["workspace", "dialog-host", "menu-host", "tool-picker"],
    "stage.top": ["tool-switch", "toolbox"],
    "stage.body": ["book-view"],
    "stage.bottom": ["book-name", "page-tabs"],
    "stage.corner": ["close-button"],
  },
  menus: {
    "stage.menu": ["stage.home", { either: ["stage.split", "stage.unsplit"] }, "book.open", "book.settings"],
  },
  contextMenus: {
    "paper.context": ["page.settings", "book.settings"],
    "item.context": ["paper.edit", "-", "paper.delete"],
    "row.context": ["list.editRow", "-", "list.deleteRow"],
    "line.context": ["line.edit", "-", "paper.delete"],
  },
})
