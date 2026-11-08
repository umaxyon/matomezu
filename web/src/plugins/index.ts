// ビルトインプラグインの一覧（React を使わないインスタンス用）。matomezu が何でできているかは、ここの並びと、それぞれの index.ts で分かる
import { BASE } from "./base"
import { DIR_PLUGIN } from "./books/dir"
import { DRAWING_PLUGIN } from "./books/drawing"
import { FLOWCHART_PLUGIN } from "./books/flowchart"
import { MARKDOWN_PLUGIN } from "./books/markdown"
import { TREE_PLUGIN } from "./books/tree"
import { CONTROL_CENTER, CONTROL_CENTER_PLUGIN } from "./control-center"
import { ART_PLUGIN } from "./items/art"
import { BOX_PLUGIN } from "./items/box"
import { DATA_PLUGIN } from "./items/data"
import { LINE_PLUGIN } from "./items/line"
import { LIST_PLUGIN } from "./items/list"
import { SHAPE_PLUGIN } from "./items/shape"
import { PAPER_PLUGIN } from "./paper"

export const BUILTIN = [
  BASE,
  CONTROL_CENTER_PLUGIN,
  PAPER_PLUGIN,
  BOX_PLUGIN,
  LIST_PLUGIN,
  DATA_PLUGIN,
  LINE_PLUGIN,
  SHAPE_PLUGIN,
  ART_PLUGIN,
  DRAWING_PLUGIN,
  FLOWCHART_PLUGIN,
  TREE_PLUGIN,
  DIR_PLUGIN,
  MARKDOWN_PLUGIN,
] as const

// ビルトインのインスタンスの、コントロールセンター（画面とエンジンが同じものを使う）
export const BUILTIN_CONTROL_CENTER = CONTROL_CENTER.id
