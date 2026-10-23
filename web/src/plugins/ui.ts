// 中の部品の一覧（画面のある app 用。どのプラグインにも見た目を結んだもの）と、それを渡した app の既定の配置
import { defineLayout } from "../ui/layout"
import { BASE_UI } from "./base/ui"
import { DRAWING_UI } from "./books/drawing/ui"
import { MASTER_UI } from "./books/master/ui"

export const BUILTIN_UI = [BASE_UI, MASTER_UI, DRAWING_UI] as const

// 既定の配置（今の画面の形）。app は MatomezuProvider にこれか、これを写して直したものを渡す
export const DEFAULT_LAYOUT = defineLayout({
  id: "default",
  slots: {
    app: ["workspace", "dialog-host", "menu-host", "tool-picker"],
    "stage.top": ["tool-switch", "toolbox"],
    "stage.body": ["book-view"],
    "stage.bottom": ["book-name", "page-tabs"],
    "stage.corner": ["close-button"],
  },
  menus: {
    "stage.menu": ["stage.home", { either: ["stage.split", "stage.unsplit"] }, "book.open", "drawing.settings"],
  },
  contextMenus: {
    "drawing.context": ["drawing.settings"],
    "item.context": ["drawing.edit", "-", "drawing.delete"],
    "row.context": ["list.editRow", "-", "list.deleteRow"],
    "line.context": ["drawing.delete"],
  },
})
