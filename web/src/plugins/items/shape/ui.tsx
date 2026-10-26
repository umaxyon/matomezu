// 形の見た目: 形ごとのビューとアイコン、追加のダイアログ（形ごと）と編集のダイアログ（共通）
import { definePluginUi } from "../../../plugin-api/ui"
import { SHAPE_PLUGIN } from "."
import { shapeIcon } from "./icons"
import type { ShapeKind } from "./outline"
import { addShapeDialog, EditShapeDialog } from "./ShapeDialog"
import { shapeView } from "./ShapeView"
import {
  CIRCLE,
  DIAMOND,
  HEXAGON,
  PARALLELOGRAM,
  PARALLELOGRAM_REVERSED,
  ROUNDED,
  SHAPE_EDIT_DIALOG,
  TRAPEZOID,
  TRAPEZOID_REVERSED,
} from "./shapes"

const ui = (kind: ShapeKind) => ({ view: shapeView(kind), icon: shapeIcon(kind) })

export const SHAPE_UI = definePluginUi(SHAPE_PLUGIN, {
  items: {
    [ROUNDED.item.id]: ui(ROUNDED.kind),
    [DIAMOND.item.id]: ui(DIAMOND.kind),
    [PARALLELOGRAM.item.id]: ui(PARALLELOGRAM.kind),
    [PARALLELOGRAM_REVERSED.item.id]: ui(PARALLELOGRAM_REVERSED.kind),
    [TRAPEZOID.item.id]: ui(TRAPEZOID.kind),
    [TRAPEZOID_REVERSED.item.id]: ui(TRAPEZOID_REVERSED.kind),
    [HEXAGON.item.id]: ui(HEXAGON.kind),
    [CIRCLE.item.id]: ui(CIRCLE.kind),
  },
  dialogViews: {
    [ROUNDED.add.id]: addShapeDialog(ROUNDED.item.id),
    [DIAMOND.add.id]: addShapeDialog(DIAMOND.item.id),
    [PARALLELOGRAM.add.id]: addShapeDialog(PARALLELOGRAM.item.id),
    [PARALLELOGRAM_REVERSED.add.id]: addShapeDialog(PARALLELOGRAM_REVERSED.item.id),
    [TRAPEZOID.add.id]: addShapeDialog(TRAPEZOID.item.id),
    [TRAPEZOID_REVERSED.add.id]: addShapeDialog(TRAPEZOID_REVERSED.item.id),
    [HEXAGON.add.id]: addShapeDialog(HEXAGON.item.id),
    [CIRCLE.add.id]: addShapeDialog(CIRCLE.item.id),
    [SHAPE_EDIT_DIALOG.id]: EditShapeDialog,
  },
})
