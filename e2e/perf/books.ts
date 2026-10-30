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

// 根の下に 10 の枝、残りの節を枝へ順に配った木（節は根を入れて n 個）
export function treeBook(id: string, n: number) {
  const branches = Array.from({ length: 10 }, (_, b) => ({
    id: `n${b}`,
    caption: `枝 ${b + 1}`,
    children: [] as { id: string; caption: string }[],
  }))
  for (let i = 0; i < n - 11; i++) branches[i % 10]!.children.push({ id: `n${10 + i}`, caption: `葉 ${i + 1}` })
  return {
    type: "@matomezu/tree:tree",
    id,
    title: `節 ${n}`,
    pages: [
      {
        id: PAGE,
        title: "ページ 1",
        paper: "@matomezu/base:a3",
        orientation: "landscape",
        root: { id: "root", caption: "根", children: branches },
      },
    ],
  }
}

// 根のフォルダの下に 10 のフォルダ、残りのファイルをフォルダへ順に配った構成（中身は根を入れて n 個）
export function dirBook(id: string, n: number) {
  const folders = Array.from({ length: 10 }, (_, f) => ({
    id: `d${f}`,
    kind: "folder" as const,
    name: `folder${f + 1}`,
    children: [] as { id: string; kind: "file"; name: string }[],
  }))
  for (let i = 0; i < n - 11; i++)
    folders[i % 10]!.children.push({ id: `f${i}`, kind: "file", name: `file${i + 1}.ts` })
  return {
    type: "@matomezu/dir:dir",
    id,
    title: `中身 ${n}`,
    pages: [
      {
        id: PAGE,
        title: "ページ 1",
        paper: "@matomezu/base:a3",
        orientation: "portrait",
        root: { id: "root", kind: "folder", name: "root", children: folders },
      },
    ],
  }
}
