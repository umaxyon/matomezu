// ディレクトリ構成図を組み立てる計算（データを書き換えず、新しい根を返す）: 中身を足す・名前と色を替える・中身ごと消す・付け替える・
// フォルダを開け閉めする・フォルダの直下を名前で並べる・パスの並びから組み立てる
import { parseRich, plainOf } from "../../base"
import type { DirEntry, DirFolder } from "./entry"

// 中身を entries に替えたフォルダ（無くなれば children も消す）
function withKids(f: DirFolder, kids: DirEntry[]): DirFolder {
  const { children: _old, ...rest } = f
  return kids.length > 0 ? { ...rest, children: kids } : rest
}

// 中身 id と、そこまでのフォルダの並び（根から。根そのものなら空。無ければ null）
export function pathTo(root: DirFolder, id: string): DirFolder[] | null {
  if (root.id === id) return []
  const walk = (f: DirFolder, up: DirFolder[]): DirFolder[] | null => {
    for (const c of f.children ?? []) {
      if (c.id === id) return [...up, f]
      const found = c.kind === "folder" ? walk(c, [...up, f]) : null
      if (found) return found
    }
    return null
  }
  return walk(root, [])
}

// 中身 id（根も。無ければ null）
export function entryOf(root: DirFolder, id: string): DirEntry | null {
  if (root.id === id) return root
  return (
    pathTo(root, id)
      ?.at(-1)
      ?.children?.find(c => c.id === id) ?? null
  )
}

// 中身 id を f で替えた根（根も替えられる。無ければ null）
function mapEntry(root: DirFolder, id: string, f: (e: DirEntry) => DirEntry | null): DirFolder | null {
  const walk = (folder: DirFolder): DirFolder | null => {
    if (folder.id === id) {
      const next = f(folder)
      return next?.kind === "folder" ? next : null
    }
    const kids = folder.children ?? []
    for (const [i, c] of kids.entries()) {
      const next = c.id === id ? f(c) : c.kind === "folder" ? walk(c) : null
      if (next)
        return withKids(
          folder,
          kids.map((k, j) => (j === i ? next : k)),
        )
      if (c.id === id) return null
    }
    return null
  }
  return walk(root)
}

// フォルダ parent（根も）の中身の index の所（無ければ末尾）に entries を足した根（ファイル・無い所・index が範囲の外なら null）
export function addEntries(
  root: DirFolder,
  parent: string,
  entries: readonly DirEntry[],
  index?: number,
): DirFolder | null {
  return mapEntry(root, parent, e => {
    if (e.kind !== "folder") return null
    const kids = e.children ?? []
    const at = index ?? kids.length
    if (at < 0 || at > kids.length) return null
    return withKids(e, [...kids.slice(0, at), ...entries, ...kids.slice(at)])
  })
}

// 中身 id（根も）の名前と色を patch で替えた根（書いた所だけ替え、色の null は消す。無ければ null）
export function changeEntry(
  root: DirFolder,
  id: string,
  patch: { name?: string; color?: string | null },
): DirFolder | null {
  return mapEntry(root, id, e => {
    const { color: _color, ...rest } = e
    const color = patch.color === undefined ? e.color : (patch.color ?? undefined)
    return { ...rest, name: patch.name ?? e.name, ...(color ? { color } : {}) }
  })
}

// 中身 id を中身ごと消した根（根は消せない。無ければ null）
export function removeEntry(root: DirFolder, id: string): DirFolder | null {
  const parent = pathTo(root, id)?.at(-1)
  if (!parent) return null
  return mapEntry(root, parent.id, e =>
    e.kind === "folder"
      ? withKids(
          e,
          (e.children ?? []).filter(c => c.id !== id),
        )
      : null,
  )
}

// 中身 id を中身ごと、フォルダ parent（根も）の index の所（id を除いた並びで数える。無ければ末尾）へ移した根（付け替えと、並びの入れ替え）。
// 根・無い中身・ファイルの中へ・自分か自分の中へ・index が範囲の外なら null
export function moveEntry(root: DirFolder, id: string, parent: string, index?: number): DirFolder | null {
  const entry = entryOf(root, id)
  if (!entry || root.id === id || id === parent || pathTo(root, parent)?.some(f => f.id === id)) return null
  const removed = removeEntry(root, id)
  return removed && addEntries(removed, parent, [entry], index)
}

// フォルダ id（根も）を閉じた（closed）か開いた根（ファイル・無ければ null）
export function setClosed(root: DirFolder, id: string, closed: boolean): DirFolder | null {
  return mapEntry(root, id, e => {
    if (e.kind !== "folder") return null
    const { closed: _closed, ...rest } = e
    return closed ? { ...rest, closed: true } : rest
  })
}

// 名前の字（装飾の記号を除いた字）
export const plainName = (name: string): string => parseRich(name).map(plainOf).join(" ")

const DIGITS = /(\d+)/

// 名前の比べ方: 装飾の記号を除き、大文字と小文字を区別せず、数字の並びは数の大きさで比べる（file2 は file10 の前）。
// 同じなら元の字で比べる（どの環境でも同じ順になるよう、字の符号で比べる）
export function compareNames(a: string, b: string): number {
  const [pa, pb] = [plainName(a), plainName(b)]
  const [ta, tb] = [pa.toLowerCase().split(DIGITS), pb.toLowerCase().split(DIGITS)]
  for (let i = 0; i < Math.min(ta.length, tb.length); i++) {
    const [x, y] = [ta[i] ?? "", tb[i] ?? ""]
    if (x === y) continue
    if (i % 2 === 1) return Number(x) - Number(y) || (x < y ? -1 : 1)
    return x < y ? -1 : 1
  }
  if (ta.length !== tb.length) return ta.length - tb.length
  return pa < pb ? -1 : pa > pb ? 1 : 0
}

export type Order = "asc" | "desc"

// フォルダ id（根も）の直下を名前で並べた根（フォルダが先、ファイルが後。それぞれを order の順に。中のフォルダの並びは変えない。ファイル・無ければ null）
export function sortFolder(root: DirFolder, id: string, order: Order): DirFolder | null {
  const sign = order === "asc" ? 1 : -1
  return mapEntry(root, id, e => {
    if (e.kind !== "folder") return null
    const kids = [...(e.children ?? [])]
    kids.sort((a, b) => (a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : sign * compareNames(a.name, b.name)))
    return withKids(e, kids)
  })
}

// パス 1 つの区切り（/ で分け、空の区切りは除く）と、末尾が / ならフォルダ
function segmentsOf(path: string): { names: string[]; folder: boolean } {
  return { names: path.split("/").filter(s => s !== ""), folder: path.endsWith("/") }
}

// フォルダ parent（根も）の下に、パスの並び paths を組み立てた根と、パスごとに指す中身の id（paths と同じ順）。
// パスは parent から見た / 区切り（末尾が / ならフォルダ、ほかはファイル。途中の区切りはフォルダ）。
// 同じ名前（装飾の記号を除いた字）で同じ種類の物が parent の側にあれば、足さずにそれを使う（同じパスを 2 度渡しても増えない）。
// 足す物は、その中の末尾に足し、id は makeId で振る。閉じたフォルダの中にも足す（開けない）。ファイルの parent・無い parent・空のパスがあれば null
export function buildPaths(
  root: DirFolder,
  parent: string,
  paths: readonly string[],
  makeId: () => string,
): { root: DirFolder; ids: string[] } | null {
  const start = entryOf(root, parent)
  if (start?.kind !== "folder") return null
  let next: DirFolder = root
  const ids: string[] = []
  for (const path of paths) {
    const { names, folder } = segmentsOf(path)
    if (names.length === 0) return null
    let at = parent
    for (const [i, name] of names.entries()) {
      const kind = i < names.length - 1 || folder ? "folder" : "file"
      const here = entryOf(next, at)
      const same =
        here?.kind === "folder"
          ? here.children?.find(c => c.kind === kind && plainName(c.name) === plainName(name))
          : undefined
      if (same) {
        at = same.id
        continue
      }
      const id = makeId()
      const entry: DirEntry = kind === "folder" ? { id, kind: "folder", name } : { id, kind: "file", name }
      const added = addEntries(next, at, [entry])
      if (!added) return null
      next = added
      at = id
    }
    ids.push(at)
  }
  return { root: next, ids }
}

// 並べて見せる行の 1 つ: 中身と、根からの深さ（根は 0）
export interface Row {
  entry: DirEntry
  depth: number
}

// 見せる行の並び（上から。閉じたフォルダの中身は出さない）
export function rowsOf(root: DirFolder): Row[] {
  const rows: Row[] = []
  const walk = (e: DirEntry, depth: number) => {
    rows.push({ entry: e, depth })
    if (e.kind === "folder" && !e.closed) for (const c of e.children ?? []) walk(c, depth + 1)
  }
  walk(root, 0)
  return rows
}

// 選んでいる中身: ステージの選択の最初の物（見せている行に無ければ根）。鉛筆の間は、いつもどれかの行を選んでいる
export function selectedIn(root: DirFolder, selection: readonly string[]): string {
  const first = selection[0]
  return first !== undefined && rowsOf(root).some(r => r.entry.id === first) ? first : root.id
}

// 行 id から上（up）か下（down）の行（端なら id のまま）
export function rowFrom(root: DirFolder, id: string, to: "up" | "down"): string {
  const rows = rowsOf(root)
  const i = rows.findIndex(r => r.entry.id === id)
  return rows[to === "up" ? i - 1 : i + 1]?.entry.id ?? id
}

// 中身 id を消したあとに選ぶ行: すぐ上の行（根は消せないので、いつもある。無い中身は null）
export function afterRemove(root: DirFolder, id: string): string | null {
  if (root.id === id || !pathTo(root, id)) return null
  return rowFrom(root, id, "up")
}

// 足す所: フォルダ parent の index 番目（無ければ末尾）。open は先に開くフォルダ（閉じたフォルダの中に足すとき）
export interface AddAt {
  parent: string
  index?: number
  open?: string
}

// 行 id の＋と右クリックの「足す」の足す所: フォルダなら中の末尾（閉じていれば開く）、ファイルならすぐ下（無い中身は null）
export function addInto(root: DirFolder, id: string): AddAt | null {
  const e = entryOf(root, id)
  if (!e) return null
  if (e.kind === "folder") return { parent: id, ...(e.closed ? { open: id } : {}) }
  return addAfter(root, id)
}

// 行 id のすぐ下に兄弟として足す所（キーの d・f）。根には兄弟が無いので、根の中の末尾（閉じていれば開く。無い中身は null）
export function addAfter(root: DirFolder, id: string): AddAt | null {
  if (root.id === id) return { parent: id, ...(root.closed ? { open: id } : {}) }
  const parent = pathTo(root, id)?.at(-1)
  if (!parent) return null
  return { parent: parent.id, index: (parent.children ?? []).findIndex(c => c.id === id) + 1 }
}

// 中身 id の名前（無ければ空）
export const nameOf = (root: DirFolder, id: string): string => entryOf(root, id)?.name ?? ""

// その場の編集を終えたときにすること: 書いた字 text（取り消しなら null）で、中身 id を
// 消す（名前の空の中身が空のまま終わった。根は消さない）・名前を替える・何もしない（変わらない・今ある名前を空にした）
export type EditEnd = { kind: "remove" } | { kind: "rename"; name: string } | { kind: "none" }

export function editEnd(root: DirFolder, id: string, text: string | null): EditEnd {
  const old = nameOf(root, id)
  // 記号だけで字の無い名前（**** など）は空とみなす
  const written = text ?? old
  const next = plainName(written).trim() === "" ? "" : written
  if (next === "") return root.id !== id && plainName(old).trim() === "" ? { kind: "remove" } : { kind: "none" }
  return next === old ? { kind: "none" } : { kind: "rename", name: next }
}
