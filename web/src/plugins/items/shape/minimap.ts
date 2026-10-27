// 形のミニマップの絵: 輪郭（outline.ts）を、置いた四角 rect の所に置いたもの（紙の座標）
import type { Point, Rect } from "../../../plugin-api"
import type { MinimapMark } from "../../base"
import { type Outline, SHAPE_RULES, type ShapeKind, SLANT } from "./outline"

// 多角形の点の並び（"x,y x,y …"）を、left・top だけずらした点にする
const shifted = (points: string, left: number, top: number): Point[] =>
  points
    .trim()
    .split(/\s+/)
    .map(p => {
      const [x = 0, y = 0] = p.split(",").map(Number)
      return { x: x + left, y: y + top }
    })

function markOf(o: Outline, r: Rect): MinimapMark {
  if (o.kind === "polygon") return { kind: "polygon", points: shifted(o.points, r.x, r.y) }
  if (o.kind === "ellipse") return { kind: "ellipse", x: r.x, y: r.y, w: o.w, h: o.h }
  return { kind: "rect", x: r.x, y: r.y, w: o.w, h: o.h, rx: o.rx }
}

// 形 kind を四角 rect に置いた絵。turned なら回した輪郭（回せる形だけ）
export function shapeMinimap(kind: ShapeKind, r: Rect, turned = false): MinimapMark[] {
  const rule = SHAPE_RULES[kind]
  const size = { w: r.w, h: r.h }
  const outline = turned && rule.turned ? rule.turned.outline(size) : rule.outline(size, SLANT)
  return [markOf(outline, r)]
}
