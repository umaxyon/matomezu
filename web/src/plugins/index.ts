// ビルトインプラグインの一覧（React を使わないインスタンス用）。matomezu が何でできているかは、ここの並びと、それぞれの index.ts で分かる
import { BASE } from "./base"
import { DIR_PLUGIN } from "./books/dir"
import { DRAWING_PLUGIN } from "./books/drawing"
import { FLOWCHART_PLUGIN } from "./books/flowchart"
import { MASTER_PLUGIN } from "./books/master"
import { TREE_PLUGIN } from "./books/tree"
import { BOX_PLUGIN } from "./items/box"
import { LINE_PLUGIN } from "./items/line"
import { LIST_PLUGIN } from "./items/list"
import { SHAPE_PLUGIN } from "./items/shape"
import { PAPER_PLUGIN } from "./paper"

export const BUILTIN = [
  BASE,
  MASTER_PLUGIN,
  PAPER_PLUGIN,
  BOX_PLUGIN,
  LIST_PLUGIN,
  LINE_PLUGIN,
  SHAPE_PLUGIN,
  DRAWING_PLUGIN,
  FLOWCHART_PLUGIN,
  TREE_PLUGIN,
  DIR_PLUGIN,
] as const
