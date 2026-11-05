// マークダウンのビュー: ペインを並べて描く。印刷では、測るだけのビューと印刷区画 1 つのビューが描く（MarkdownPrint.tsx）。ペインのタブの右クリックでペインの分割のメニュー（pane-context）を開く
import type { BookViewDef } from "../../../../plugin-api/ui"
import { PANE_CONTEXT } from "../markdown"
import { MarkdownMeasure, MarkdownSheet } from "./MarkdownPrint"
import { MarkdownView } from "./MarkdownView"

export const MARKDOWN_VIEW = {
  view: MarkdownView,
  printSheet: MarkdownSheet,
  printMeasure: MarkdownMeasure,
  contextMenus: [PANE_CONTEXT],
} as const satisfies BookViewDef
