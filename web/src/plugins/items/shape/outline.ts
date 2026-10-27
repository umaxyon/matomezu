// 形の輪郭と、文字を置ける幅と、線のつなぎ口: 形の種類ごとの決まりは、この表に 1 行ずつ書く（ほかのファイルで種類の名前を比べない）。
// 輪郭は幅 w・高さ h の四角の中の SVG の図形。inset は文字の左右に空ける幅（斜めの辺や丸い縁に文字が掛からないように）
import type { Ports, Size } from "../../../plugin-api"

export const SHAPE_KINDS = [
  "rounded",
  "diamond",
  "parallelogram",
  "parallelogram-reversed",
  "trapezoid",
  "trapezoid-reversed",
  "hexagon",
  "circle",
] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

// 斜めの辺が横に食い込む幅（px）
export const SLANT = 14
// 回した形（向きが横の台形）の、斜めの辺が縦に食い込む幅（px。形の高さの 1/3 まで）
export const TURNED_SLANT = 10

// 線は、どの形も辺の真ん中（頂点）だけにつなぐ（辺の途中が形の外になるため）。
// 左右の辺の真ん中が四角より内側にある形（平行四辺形・台形）は、食い込みの半分だけ内側につなぐ
const VERTICES: Ports = { midpoints: true }
const INSET_VERTICES: Ports = { midpoints: true, insetX: SLANT / 2 }

export type Outline =
  | { kind: "polygon"; points: string }
  | { kind: "rect"; w: number; h: number; rx: number } // 角の丸い四角
  | { kind: "ellipse"; w: number; h: number }

interface ShapeRule {
  outline(size: Size, slant: number): Outline // slant は斜めの辺の食い込み（形は SLANT、アイコンは小さく）
  // 文字を置ける幅の、形の幅に対する割合（ひし形・円は中に収まる四角が狭い）と、左右に空ける幅
  textRatio: number
  inset: number
  size: Size // 置いたときの一番小さい大きさ（キャプションが短いとき）
  ports: Ports // つなぎ口
  // 反時計回りに 90 度回して描くときの輪郭とつなぎ口（回せる形だけ。上の辺が左に、下の辺が右に来る）
  turned?: { outline(size: Size): Outline; ports: Ports }
}

// 回した形の斜めの辺の食い込み
const turnedSlant = (h: number) => Math.min(TURNED_SLANT, h / 3)
// 回した台形は、上下の辺の真ん中が四角より内側にあるので、食い込みの半分だけ内側につなぐ
const TURNED_VERTICES: Ports = { midpoints: true, insetY: TURNED_SLANT / 2 }

const pts = (list: [number, number][]) => list.map(([x, y]) => `${x},${y}`).join(" ")

export const SHAPE_RULES: Record<ShapeKind, ShapeRule> = {
  rounded: {
    outline: ({ w, h }) => ({ kind: "rect", w, h, rx: h / 2 }),
    textRatio: 1,
    inset: 12,
    size: { w: 96, h: 40 },
    ports: VERTICES,
  },
  diamond: {
    outline: ({ w, h }) => ({
      kind: "polygon",
      points: pts([
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ]),
    }),
    textRatio: 0.5,
    inset: 0,
    size: { w: 112, h: 64 },
    ports: VERTICES,
  },
  parallelogram: {
    outline: ({ w, h }, s) => ({
      kind: "polygon",
      points: pts([
        [s, 0],
        [w, 0],
        [w - s, h],
        [0, h],
      ]),
    }),
    textRatio: 1,
    inset: SLANT,
    size: { w: 96, h: 40 },
    ports: INSET_VERTICES,
  },
  "parallelogram-reversed": {
    outline: ({ w, h }, s) => ({
      kind: "polygon",
      points: pts([
        [0, 0],
        [w - s, 0],
        [w, h],
        [s, h],
      ]),
    }),
    textRatio: 1,
    inset: SLANT,
    size: { w: 96, h: 40 },
    ports: INSET_VERTICES,
  },
  trapezoid: {
    outline: ({ w, h }, s) => ({
      kind: "polygon",
      points: pts([
        [s, 0],
        [w - s, 0],
        [w, h],
        [0, h],
      ]),
    }),
    textRatio: 1,
    inset: SLANT,
    size: { w: 96, h: 40 },
    ports: INSET_VERTICES,
    turned: {
      outline: ({ w, h }) => {
        const t = turnedSlant(h)
        return {
          kind: "polygon",
          points: pts([
            [0, t],
            [w, 0],
            [w, h],
            [0, h - t],
          ]),
        }
      },
      ports: TURNED_VERTICES,
    },
  },
  "trapezoid-reversed": {
    outline: ({ w, h }, s) => ({
      kind: "polygon",
      points: pts([
        [0, 0],
        [w, 0],
        [w - s, h],
        [s, h],
      ]),
    }),
    textRatio: 1,
    inset: SLANT,
    size: { w: 96, h: 40 },
    ports: INSET_VERTICES,
    turned: {
      outline: ({ w, h }) => {
        const t = turnedSlant(h)
        return {
          kind: "polygon",
          points: pts([
            [0, 0],
            [w, t],
            [w, h - t],
            [0, h],
          ]),
        }
      },
      ports: TURNED_VERTICES,
    },
  },
  hexagon: {
    outline: ({ w, h }, s) => ({
      kind: "polygon",
      points: pts([
        [s, 0],
        [w - s, 0],
        [w, h / 2],
        [w - s, h],
        [s, h],
        [0, h / 2],
      ]),
    }),
    textRatio: 1,
    inset: SLANT,
    size: { w: 96, h: 40 },
    ports: VERTICES,
  },
  circle: {
    outline: ({ w, h }) => ({ kind: "ellipse", w, h }),
    textRatio: Math.SQRT1_2,
    inset: 0,
    size: { w: 64, h: 64 },
    ports: VERTICES,
  },
}
