// ビルトインプラグインの一覧（画面のあるインスタンス用。どのプラグインにも見た目を結んだもの）と、それを渡したインスタンスの既定の UI マッピング
import { defineLayout } from "../plugin-api/ui"
import { BASE_UI } from "./base/ui"
import { CONTROL_CENTER_UI } from "./control-center/ui"
import { ART_UI } from "./items/art/ui"
import { BOX_UI } from "./items/box/ui"
import { DATA_UI } from "./items/data/ui"
import { LINE_UI } from "./items/line/ui"
import { LIST_UI } from "./items/list/ui"
import { SCRAP_BOX_UI } from "./items/scrap/ui"
import { SHAPE_UI } from "./items/shape/ui"
import { SLIDE_UI } from "./items/slide/ui"
import { DIR_UI } from "./page-types/dir/ui"
import { DRAWING_UI } from "./page-types/drawing/ui"
import { FLOWCHART_UI } from "./page-types/flowchart/ui"
import { MARKDOWN_UI } from "./page-types/markdown/ui"
import { SLIDE_BOOK_UI } from "./page-types/slide-book/ui"
import { TREE_UI } from "./page-types/tree/ui"
import { PAPER_UI } from "./paper/ui"
import { TASKBOARD_UI } from "./taskboard/ui"

export const BUILTIN_UI = [
  BASE_UI,
  CONTROL_CENTER_UI,
  PAPER_UI,
  BOX_UI,
  LIST_UI,
  DATA_UI,
  LINE_UI,
  SHAPE_UI,
  ART_UI,
  SCRAP_BOX_UI,
  SLIDE_UI,
  DRAWING_UI,
  FLOWCHART_UI,
  TREE_UI,
  DIR_UI,
  MARKDOWN_UI,
  SLIDE_BOOK_UI,
  TASKBOARD_UI,
] as const

// 既定の UI マッピング。インスタンスは MatomezuProvider にこれか、これを写して直したものを渡す
export const DEFAULT_LAYOUT = defineLayout({
  id: "default",
  slots: {
    root: [
      "@matomezu/base:window",
      "@matomezu/base:dialog-host",
      "@matomezu/base:menu-host",
      "@matomezu/base:toast-host",
      "@matomezu/base:note-read-notice",
      "@matomezu/base:mail-bookmarks",
      "@matomezu/base:mail-watch",
      "@matomezu/base:edit-lock",
      "@matomezu/base:tool-picker",
      "@matomezu/base:search-dialog",
    ],
    "@matomezu/base:book-screen": ["@matomezu/base:workspace"],
    "@matomezu/base:library-screen": ["@matomezu/base:library-screen-view"],
    "@matomezu/control-center:screen": ["@matomezu/control-center:screen"],
    "@matomezu/taskboard:ticket-screen": ["@matomezu/taskboard:ticket-screen-view"],
    "@matomezu/control-center:side": ["@matomezu/taskboard:project-list"],
    "@matomezu/control-center:projects": ["@matomezu/taskboard:taskboard"],
    "@matomezu/control-center:workroom-columns": ["@matomezu/taskboard:workroom-columns"],
    "@matomezu/control-center:workroom-row-line": ["@matomezu/taskboard:workroom-current-line"],
    "@matomezu/base:one-screen": ["@matomezu/base:screens-view"],
    "@matomezu/base:split-rows": ["@matomezu/base:screens-view"],
    "@matomezu/base:control-center-footer": ["@matomezu/base:control-center-birdhouse"],
    "@matomezu/base:stage-top": ["@matomezu/base:tool-switch"],
    "@matomezu/base:stage-side": ["@matomezu/base:page-list"],
    "@matomezu/base:stage-body": ["@matomezu/base:book-view", "@matomezu/base:print-preview-scrollbars"],
    "@matomezu/base:book-layers": [
      "@matomezu/base:paper-layer",
      "@matomezu/base:print-area-layer",
      "@matomezu/slide:slide-layer",
      "@matomezu/base:book-content",
      "@matomezu/base:stand-layer",
      "@matomezu/base:note-layer",
      "@matomezu/base:mark-layer",
      "@matomezu/base:mail-layer",
      "@matomezu/base:background-band",
    ],
    "@matomezu/base:sheet-layers": ["@matomezu/slide:slide-sheet", "@matomezu/base:sheet-content"],
    "@matomezu/base:stage-bottom": ["@matomezu/base:book-name", "@matomezu/base:page-tabs"],
    "@matomezu/base:stage-corner": ["@matomezu/base:close-button"],
    "@matomezu/base:footer-menu-map": ["@matomezu/base:footer-menu-minimap"],
    "@matomezu/base:footer-menu-history": ["@matomezu/base:history-buttons"],
    "@matomezu/base:footer-menu-basics": [
      "@matomezu/base:stage-menu-buttons",
      "@matomezu/base:print-area-toggle",
      "@matomezu/base:background-button",
      "@matomezu/base:background-print-control",
      "@matomezu/base:print-preview-button",
      "@matomezu/base:mailbox-button",
    ],
    "@matomezu/base:footer-menu-book-tools": ["@matomezu/base:toolbox", "@matomezu/base:scrap-tray-button"],
    "@matomezu/base:right-side-panel": [
      "@matomezu/base:note-panel",
      "@matomezu/base:print-preview-panel",
      "@matomezu/base:print-check-panel",
    ],
    "@matomezu/base:settings-categories": [
      "@matomezu/base:settings-general",
      "@matomezu/markdown:settings",
      "@matomezu/base:settings-keys",
      "@matomezu/base:settings-plugins",
    ],
    "@matomezu/base:mail-actions": ["@matomezu/base:join-request-actions", "@matomezu/base:proposal-actions"],
    "@matomezu/base:wide-search-modes": [
      "@matomezu/taskboard:wide-search-ticket",
      "@matomezu/base:wide-search-full-text",
    ],
    "@matomezu/base:wide-search-openers": [
      "@matomezu/taskboard:wide-search-open-ticket",
      "@matomezu/taskboard:wide-search-open-history",
    ],
    "@matomezu/base:annotation-icon": ["@matomezu/base:note-icon", "@matomezu/base:mark-icon"],
    "@matomezu/base:corner-statuses": [
      "@matomezu/base:alert-status",
      "@matomezu/base:folded-note-status",
      "@matomezu/base:read-note-status",
    ],
  },
  menus: {
    "@matomezu/base:stage-menu": [
      "@matomezu/base:control-center-toggle",
      { either: ["@matomezu/base:stage-split", "@matomezu/base:stage-unsplit"] },
      "@matomezu/base:library-open",
      { either: ["@matomezu/base:binder-settings-opened", "@matomezu/base:page-settings"] },
    ],
  },
  // 押した物にアンカーがあれば、どの右クリックのメニューにも末尾に出す
  anchorMenu: ["@matomezu/base:note-new", "@matomezu/base:mark-new"],
  // 紙（何も無い所）の右クリックのメニューは、一番上にページ全体を収める・初めの位置に戻す・画面の分割（分割中は、右クリックしたステージを閉じる）を置き、区切り線で分ける
  contextMenus: {
    "@matomezu/paper:paper-context": [
      "@matomezu/base:zoom-fit",
      "@matomezu/base:zoom-reset",
      "@matomezu/base:stage-split",
      "@matomezu/base:stage-close",
      "-",
      "@matomezu/paper:paper-paste-at",
      "-",
      "@matomezu/base:scrap-cut",
      "@matomezu/base:page-settings",
      "@matomezu/base:book-settings",
      "-",
      "@matomezu/flowchart:page-align",
    ],
    "@matomezu/dir:dir-context": [
      "@matomezu/base:zoom-fit",
      "@matomezu/base:zoom-reset",
      "@matomezu/base:stage-split",
      "@matomezu/base:stage-close",
      "-",
      "@matomezu/base:scrap-cut",
      "@matomezu/base:page-settings",
      "@matomezu/base:book-settings",
    ],
    "@matomezu/dir:entry-context": [
      "@matomezu/dir:entry-settings",
      "@matomezu/dir:folder-sort-asc",
      "@matomezu/dir:folder-sort-desc",
      "-",
      "@matomezu/dir:entry-delete",
    ],
    "@matomezu/tree:tree-context": [
      "@matomezu/base:zoom-fit",
      "@matomezu/base:zoom-reset",
      "@matomezu/base:stage-split",
      "@matomezu/base:stage-close",
      "-",
      "@matomezu/base:scrap-cut",
      "@matomezu/base:page-settings",
      "@matomezu/base:book-settings",
    ],
    "@matomezu/markdown:pane-context": [
      "@matomezu/base:stage-split",
      "@matomezu/base:stage-close",
      "-",
      "@matomezu/base:scrap-cut",
      "@matomezu/base:page-settings",
      "@matomezu/base:book-settings",
    ],
    "@matomezu/tree:node-context": [
      "@matomezu/tree:node-edit",
      "@matomezu/tree:node-color-edit",
      "@matomezu/tree:node-size-edit",
      "-",
      "@matomezu/tree:node-delete",
    ],
    "@matomezu/paper:item-context": [
      "@matomezu/paper:paper-edit",
      "@matomezu/base:scrap-open-original",
      "-",
      "@matomezu/paper:paper-cut",
      "@matomezu/paper:paper-copy",
      "@matomezu/paper:paper-paste",
      "-",
      "@matomezu/paper:paper-delete",
    ],
    "@matomezu/base:library-entry-context": [
      "@matomezu/base:library-entry-open",
      "-",
      "@matomezu/base:library-book-new",
      "@matomezu/base:library-folder-new",
      "-",
      "@matomezu/base:library-entry-rename",
      "-",
      "@matomezu/base:library-entry-trash",
    ],
    "@matomezu/base:library-folder-context": ["@matomezu/base:library-book-new", "@matomezu/base:library-folder-new"],
    // 行は、メニューが自分で並べる（ページのタイプの一覧）
    "@matomezu/base:add-page-menu": [],
    "@matomezu/base:page-context": [
      "@matomezu/base:page-duplicate",
      "@matomezu/base:scrap-cut",
      "@matomezu/base:background-edit",
      "-",
      "@matomezu/base:page-delete",
    ],
    "@matomezu/base:binder-context": [
      "@matomezu/base:binder-settings",
      "@matomezu/base:binder-duplicate",
      "-",
      "@matomezu/base:binder-delete",
    ],
    "@matomezu/base:page-list-context": [
      "@matomezu/base:page-add-after",
      "@matomezu/base:page-duplicate",
      "@matomezu/base:scrap-cut",
      "@matomezu/base:background-edit",
      "@matomezu/base:page-settings-of",
      "-",
      "@matomezu/base:page-delete",
    ],
    "@matomezu/slide:item-context": [
      "@matomezu/slide:slide-to-front",
      "@matomezu/slide:slide-forward",
      "@matomezu/slide:slide-backward",
      "@matomezu/slide:slide-to-back",
      "-",
      "@matomezu/slide:slide-delete",
    ],
    "@matomezu/list:row-context": ["@matomezu/list:list-edit-row", "-", "@matomezu/list:list-delete-row"],
    "@matomezu/line:line-context": ["@matomezu/line:line-edit", "-", "@matomezu/paper:paper-delete"],
  },
})
