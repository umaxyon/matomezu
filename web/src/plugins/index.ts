// ビルトインプラグインの一覧（React を使わないインスタンス用）。matomezu が何でできているかは、ここの並びと、それぞれの index.ts で分かる
import { BASE } from "./base"
import { CONTROL_CENTER, CONTROL_CENTER_PLUGIN } from "./control-center"
import { ART_PLUGIN } from "./items/art"
import { BOX_PLUGIN } from "./items/box"
import { DATA_PLUGIN } from "./items/data"
import { LINE_PLUGIN } from "./items/line"
import { LIST_PLUGIN } from "./items/list"
import { SCRAP_BOX_PLUGIN } from "./items/scrap"
import { SHAPE_PLUGIN } from "./items/shape"
import { SLIDE_PLUGIN } from "./items/slide"
import { NETWORK_PLUGIN } from "./network"
import { DIR_PLUGIN } from "./page-types/dir"
import { DRAWING_PLUGIN } from "./page-types/drawing"
import { FLOWCHART_PLUGIN } from "./page-types/flowchart"
import { MARKDOWN_PLUGIN } from "./page-types/markdown"
import { SLIDE_PAGE_PLUGIN } from "./page-types/slide-page"
import { TREE_PLUGIN } from "./page-types/tree"
import { PAPER_PLUGIN } from "./paper"
import { TASKBOARD_PLUGIN } from "./taskboard"

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
  SCRAP_BOX_PLUGIN,
  SLIDE_PLUGIN,
  DRAWING_PLUGIN,
  FLOWCHART_PLUGIN,
  TREE_PLUGIN,
  DIR_PLUGIN,
  MARKDOWN_PLUGIN,
  SLIDE_PAGE_PLUGIN,
  TASKBOARD_PLUGIN,
  NETWORK_PLUGIN,
] as const

// ビルトインのインスタンスの、コントロールセンター（画面とエンジンが同じものを使う）
export const BUILTIN_CONTROL_CENTER = CONTROL_CENTER.id
