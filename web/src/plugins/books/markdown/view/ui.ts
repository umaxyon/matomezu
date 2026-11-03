// マークダウンのビュー: ペインを並べて描く。ペインのタブの右クリックでペインの分割のメニュー（pane-context）を開く
import type { BookViewDef } from "../../../../plugin-api/ui"
import { PANE_CONTEXT } from "../markdown"
import { MarkdownView } from "./MarkdownView"

export const MARKDOWN_VIEW = {
  view: MarkdownView,
  contextMenus: [PANE_CONTEXT],
} as const satisfies BookViewDef
