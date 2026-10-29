// シェイプの絵: 絵ごとの大きさ（px）と、SVG の部品の並び（描く順）。部品は役割で塗り分ける（ArtView.module.css）:
//   body … 形の色で塗る / light … 形の色を明るくして塗る（立体の上面や光る所） / dark … 形の色を暗くして塗る（側面や台座）
//   line … 塗らずに線だけ（溝やひげ） / dot … 線の色で塗りつぶし、線は引かない（目やランプ） / figure … 線だけの人の絵（スティックマン）
export type PicturePart = "body" | "light" | "dark" | "line" | "dot" | "figure"
export type PictureElement = readonly [
  PicturePart,
  "path" | "rect" | "circle" | "ellipse",
  Readonly<Record<string, string>>,
]

export interface Picture {
  size: { w: number; h: number }
  parts: readonly PictureElement[]
}

export const PICTURES = {
  person: {
    size: { w: 36, h: 52 },
    parts: [
      ["figure", "circle", { cx: "18", cy: "8", r: "6.5" }],
      ["figure", "path", { d: "M18 14.5V33M5 21.5H31M18 33 7 50M18 33 29 50" }],
    ],
  },
  db: {
    size: { w: 40, h: 52 },
    parts: [
      ["body", "path", { d: "M3 9V43A17 6 0 0 0 37 43V9" }],
      ["light", "ellipse", { cx: "20", cy: "9", rx: "17", ry: "6" }],
    ],
  },
  server: {
    size: { w: 40, h: 52 },
    parts: [
      ["light", "path", { d: "M3 10 11 3H37L29 10Z" }],
      ["dark", "path", { d: "M29 10 37 3V43L29 50Z" }],
      ["body", "path", { d: "M3 10H29V50H3Z" }],
      ["line", "path", { d: "M7 16H25M7 21H25" }],
      ["dot", "circle", { cx: "23", cy: "28", r: "2" }],
    ],
  },
  pc: {
    size: { w: 52, h: 46 },
    parts: [
      ["dark", "path", { d: "M21 35H31L33 42H19Z" }],
      ["body", "rect", { x: "13", y: "41", width: "26", height: "4", rx: "1.5" }],
      ["body", "rect", { x: "2", y: "2", width: "48", height: "34", rx: "3" }],
      ["light", "rect", { x: "6", y: "6", width: "40", height: "25", rx: "1" }],
    ],
  },
  factory: {
    size: { w: 52, h: 46 },
    parts: [
      ["dark", "rect", { x: "38", y: "3", width: "8", height: "24" }],
      ["body", "path", { d: "M2 44V22L14 13V22L26 13V22L38 13V44Z" }],
      ["light", "rect", { x: "7", y: "29", width: "7", height: "6" }],
      ["light", "rect", { x: "19", y: "29", width: "7", height: "6" }],
      ["light", "rect", { x: "31", y: "29", width: "7", height: "6" }],
    ],
  },
  document: {
    size: { w: 40, h: 52 },
    parts: [
      ["body", "path", { d: "M4 2H27L36 11V50H4Z" }],
      ["light", "path", { d: "M27 2V11H36Z" }],
      ["line", "path", { d: "M10 20H30M10 27H30M10 34H30M10 41H22" }],
    ],
  },
  trash: {
    size: { w: 40, h: 52 },
    parts: [
      ["line", "path", { d: "M15 8V4H25V8" }],
      ["body", "path", { d: "M6 13H34L31 49H9Z" }],
      ["dark", "rect", { x: "3", y: "8", width: "34", height: "5", rx: "1.5" }],
      ["line", "path", { d: "M14 19 15 43M20 19V43M26 19 25 43" }],
    ],
  },
  robot: {
    size: { w: 44, h: 52 },
    parts: [
      ["line", "path", { d: "M22 4V9" }],
      ["dot", "circle", { cx: "22", cy: "3.5", r: "2.5" }],
      ["dark", "rect", { x: "2", y: "16", width: "5", height: "10", rx: "1.5" }],
      ["dark", "rect", { x: "37", y: "16", width: "5", height: "10", rx: "1.5" }],
      ["light", "rect", { x: "12", y: "35", width: "20", height: "15", rx: "3" }],
      ["body", "rect", { x: "7", y: "9", width: "30", height: "24", rx: "5" }],
      ["dot", "circle", { cx: "16", cy: "19", r: "3.5" }],
      ["dot", "circle", { cx: "28", cy: "19", r: "3.5" }],
      ["line", "path", { d: "M16 27H28" }],
    ],
  },
  cat: {
    size: { w: 48, h: 46 },
    parts: [
      ["body", "path", { d: "M7 22 8 2 21 13ZM41 22 40 2 27 13Z" }],
      ["light", "path", { d: "M10.5 16 11 7 17 12.5ZM37.5 16 37 7 31 12.5Z" }],
      ["body", "ellipse", { cx: "24", cy: "28", rx: "20", ry: "16" }],
      ["dot", "ellipse", { cx: "16.5", cy: "25", rx: "2.5", ry: "3.5" }],
      ["dot", "ellipse", { cx: "31.5", cy: "25", rx: "2.5", ry: "3.5" }],
      ["dot", "path", { d: "M21.5 31H26.5L24 34Z" }],
      ["line", "path", { d: "M24 34V36.5M24 36.5C22.5 38.5 20 38.5 19 37M24 36.5C25.5 38.5 28 38.5 29 37" }],
      ["line", "path", { d: "M2 30H12M3 36 12 34M46 30H36M45 36 36 34" }],
    ],
  },
  heart: {
    size: { w: 48, h: 44 },
    parts: [
      [
        "body",
        "path",
        { d: "M24 42C8 30 2 22 2 13 2 6 7 2 13 2 18 2 22 5 24 9 26 5 30 2 35 2 41 2 46 6 46 13 46 22 40 30 24 42Z" },
      ],
      ["light", "ellipse", { cx: "12", cy: "12", rx: "4", ry: "3", transform: "rotate(-35 12 12)" }],
    ],
  },
  bulb: {
    size: { w: 48, h: 52 },
    parts: [
      ["line", "path", { d: "M2 18H7M41 18H46M7 4 11 8M41 4 37 8" }],
      ["light", "path", { d: "M24 2C33 2 40 9 40 18 40 25 35 29 33 34H15C13 29 8 25 8 18 8 9 15 2 24 2Z" }],
      ["line", "path", { d: "M19 34V27L21 23 24 28 27 23 29 27V34" }],
      ["dark", "rect", { x: "15", y: "34", width: "18", height: "10", rx: "2" }],
      ["line", "path", { d: "M15 39H33" }],
      ["dark", "path", { d: "M19 44H29L27 49H21Z" }],
    ],
  },
  dog: {
    size: { w: 48, h: 46 },
    parts: [
      ["body", "ellipse", { cx: "24", cy: "25", rx: "16", ry: "17" }],
      ["dark", "path", { d: "M12 8C4 9 1 20 4 31 6 34 10 32 12 27ZM36 8C44 9 47 20 44 31 42 34 38 32 36 27Z" }],
      ["light", "ellipse", { cx: "24", cy: "34", rx: "8.5", ry: "6.5" }],
      ["dot", "circle", { cx: "17.5", cy: "22", r: "2.3" }],
      ["dot", "circle", { cx: "30.5", cy: "22", r: "2.3" }],
      ["dot", "ellipse", { cx: "24", cy: "30.5", rx: "3", ry: "2.2" }],
      ["line", "path", { d: "M24 32.7V35M24 35C22.5 37 20 37 19 35.5M24 35C25.5 37 28 37 29 35.5" }],
    ],
  },
  forest: {
    size: { w: 52, h: 46 },
    parts: [
      ["dark", "rect", { x: "11", y: "34", width: "4", height: "10" }],
      ["dark", "rect", { x: "37", y: "34", width: "4", height: "10" }],
      ["dark", "rect", { x: "24", y: "32", width: "4", height: "12" }],
      ["body", "path", { d: "M13 8 23 36H3Z" }],
      ["body", "path", { d: "M39 8 49 36H29Z" }],
      ["light", "path", { d: "M26 2 38 34H14Z" }],
    ],
  },
  house: {
    size: { w: 48, h: 46 },
    parts: [
      ["dark", "rect", { x: "33", y: "6", width: "6", height: "12" }],
      ["body", "path", { d: "M7 22V44H41V22" }],
      ["dark", "path", { d: "M2 24 24 4 46 24Z" }],
      ["light", "rect", { x: "11", y: "27", width: "9", height: "8" }],
      ["light", "rect", { x: "27", y: "29", width: "9", height: "15" }],
    ],
  },
  family: {
    size: { w: 52, h: 46 },
    parts: [
      ["body", "circle", { cx: "12", cy: "8", r: "6" }],
      ["body", "path", { d: "M3 44V24C3 18 7 16 12 16S21 18 21 24V44Z" }],
      ["body", "circle", { cx: "40", cy: "8", r: "6" }],
      ["body", "path", { d: "M31 44V24C31 18 35 16 40 16S49 18 49 24V44Z" }],
      ["light", "circle", { cx: "26", cy: "22", r: "4.5" }],
      ["light", "path", { d: "M19 44V33C19 29 22 28 26 28S33 29 33 33V44Z" }],
    ],
  },
} as const satisfies Record<string, Picture>

export type PictureName = keyof typeof PICTURES
