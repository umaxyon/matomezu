// 中の部品の一覧（React を使わない app 用）。matomezu が何でできているかは、ここの並びと、それぞれの index.ts で分かる
import { BASE } from "./base"
import { DRAWING_PLUGIN } from "./books/drawing"
import { MASTER_PLUGIN } from "./books/master"
import { BOX_PLUGIN } from "./items/box"
import { LINE_PLUGIN } from "./items/line"
import { LIST_PLUGIN } from "./items/list"
import { PAPER_PLUGIN } from "./paper"

export const BUILTIN = [
  BASE,
  MASTER_PLUGIN,
  PAPER_PLUGIN,
  BOX_PLUGIN,
  LIST_PLUGIN,
  LINE_PLUGIN,
  DRAWING_PLUGIN,
] as const
