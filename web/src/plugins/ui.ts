// ビルトインプラグインの一覧（画面のあるインスタンス用。どのプラグインにも見た目を結んだもの）と、それを渡したインスタンスの既定の配置
import { defineLayout } from "../plugin-api/ui"
import { BASE_UI } from "./base/ui"
import { DIR_UI } from "./books/dir/ui"
import { DRAWING_UI } from "./books/drawing/ui"
import { FLOWCHART_UI } from "./books/flowchart/ui"
import { MASTER_UI } from "./books/master/ui"
import { TREE_UI } from "./books/tree/ui"
import { ART_UI } from "./items/art/ui"
import { BOX_UI } from "./items/box/ui"
import { LINE_UI } from "./items/line/ui"
import { LIST_UI } from "./items/list/ui"
import { SHAPE_UI } from "./items/shape/ui"
import { PAPER_UI } from "./paper/ui"

export const BUILTIN_UI = [
  BASE_UI,
  MASTER_UI,
  PAPER_UI,
  BOX_UI,
  LIST_UI,
  LINE_UI,
  SHAPE_UI,
  ART_UI,
  DRAWING_UI,
  FLOWCHART_UI,
  TREE_UI,
  DIR_UI,
] as const

// 既定の配置（今の画面の形）。インスタンスは MatomezuProvider にこれか、これを写して直したものを渡す
export const DEFAULT_LAYOUT = defineLayout({
  id: "default",
  slots: {
    root: [
      "@matomezu/base:workspace",
      "@matomezu/base:dialog-host",
      "@matomezu/base:menu-host",
      "@matomezu/base:toast-host",
      "@matomezu/base:tool-picker",
    ],
    "@matomezu/base:stage-top": ["@matomezu/base:tool-switch"],
    "@matomezu/base:stage-body": ["@matomezu/base:book-view"],
    "@matomezu/base:stage-bottom": ["@matomezu/base:book-name", "@matomezu/base:page-tabs"],
    "@matomezu/base:stage-corner": ["@matomezu/base:close-button"],
    "@matomezu/base:drawer-map": ["@matomezu/base:drawer-minimap"],
    "@matomezu/base:drawer-history": ["@matomezu/base:history-buttons"],
    "@matomezu/base:drawer-basics": ["@matomezu/base:stage-menu-buttons"],
    "@matomezu/base:drawer-book-tools": ["@matomezu/base:toolbox"],
  },
  menus: {
    "@matomezu/base:stage-menu": [
      "@matomezu/base:stage-home",
      { either: ["@matomezu/base:stage-split", "@matomezu/base:stage-unsplit"] },
      "@matomezu/base:book-open",
      "@matomezu/base:book-settings",
    ],
  },
  contextMenus: {
    "@matomezu/paper:paper-context": [
      "@matomezu/base:page-settings",
      "@matomezu/base:book-settings",
      "-",
      "@matomezu/flowchart:page-align",
    ],
    "@matomezu/dir:dir-context": ["@matomezu/base:page-settings", "@matomezu/base:book-settings"],
    "@matomezu/dir:entry-context": [
      "@matomezu/dir:entry-settings",
      "@matomezu/dir:folder-sort-asc",
      "@matomezu/dir:folder-sort-desc",
      "-",
      "@matomezu/dir:entry-delete",
    ],
    "@matomezu/tree:tree-context": ["@matomezu/base:page-settings", "@matomezu/base:book-settings"],
    "@matomezu/tree:node-context": [
      "@matomezu/tree:node-edit",
      "@matomezu/tree:node-color-edit",
      "@matomezu/tree:node-size-edit",
      "-",
      "@matomezu/tree:node-delete",
    ],
    "@matomezu/paper:item-context": ["@matomezu/paper:paper-edit", "-", "@matomezu/paper:paper-delete"],
    "@matomezu/list:row-context": ["@matomezu/list:list-edit-row", "-", "@matomezu/list:list-delete-row"],
    "@matomezu/line:line-context": ["@matomezu/line:line-edit", "-", "@matomezu/paper:paper-delete"],
  },
})
