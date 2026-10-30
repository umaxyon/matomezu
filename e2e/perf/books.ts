// 測るブック: A3 の横の紙 1 枚に、箱を格子に並べ、線で順につなぐ（行の中は右の箱へ、行の右端からは次の行の左端へ）。
// 線でつながる横の間は 40（線の間隔の下限 32 より広く）、縦の間は 12（つながらない箱の下限 8 より広く）
const BOX = { w: 64, h: 40 }
const PITCH = { x: BOX.w + 40, y: BOX.h + 12 }
const MARGIN = 16
const COLUMNS = 15 // A3 の横（1587 幅）に入る列の数

// n 番目（0 から）の箱の左上
export const boxAt = (n: number) => ({
  x: MARGIN + (n % COLUMNS) * PITCH.x,
  y: MARGIN + Math.floor(n / COLUMNS) * PITCH.y,
})
export const BOX_SIZE = BOX

export const PAGE = "p1"

// 箱 n 個と線 n - 1 本のブック
export function gridBook(id: string, n: number) {
  const boxes = Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    ...boxAt(i),
    item: "@matomezu/box:shape-nest-box",
    ...BOX,
    props: { caption: String(i + 1) },
  }))
  const lines = Array.from({ length: n - 1 }, (_, i) => ({
    id: `l${i}`,
    item: "@matomezu/line:connector-line",
    from: `b${i}`,
    to: `b${i + 1}`,
    props: {},
  }))
  return {
    type: "@matomezu/drawing:drawing",
    id,
    title: `箱 ${n}`,
    pages: [
      {
        id: PAGE,
        title: "ページ 1",
        paper: "@matomezu/base:a3",
        orientation: "landscape",
        items: [...boxes, ...lines],
      },
    ],
  }
}
