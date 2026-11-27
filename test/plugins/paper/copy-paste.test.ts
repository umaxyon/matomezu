// コピーして貼る: 選びから写しを作り（clipOf）、アクション item-paste が id を振り直して置く

import { expect, test } from "bun:test"
import { pagesOf } from "../../../web/src/core/book"
import { connectorsOf, type ItemPage, PAGE_ITSELF, shapesOf, walkShapes } from "../../../web/src/core/placed"
import type { Book } from "../../../web/src/core/schema/book"
import { screenOf } from "../../../web/src/core/window"
import { type Clip, clipOf, nearestPaste } from "../../../web/src/plugins/paper/placing/clip"
import { CORE_CATALOG, newStore, pageOf, shapeOf, sizedStore } from "../../support"

const NEST = "@matomezu/box:shape-nest-box"
const BOX = "@matomezu/art:shape-pc"
const DATA = "@matomezu/data:shape-data"

type Store = ReturnType<typeof newStore>
const book = (store: Store) => store.state.getState().books.b1 as Book
const page = (store: Store) => pagesOf(book(store))[0] as unknown as ItemPage
const run = (store: Store, action: string, args: object) =>
  store.actions.perform(action as never, args as never, { page: "p1" } as never)
const place = (store: Store, item: string, args: object = {}) => {
  const done = run(store, "@matomezu/paper:item-place", { item, w: 120, h: 80, ...args })
  if (!done.ok) throw new Error(`could not place ${item}: ${done.reason}`)
  return (done.result as { item: string }).item
}
const clipFrom = (store: Store, ids: string[]): Clip => {
  const clip = clipOf(CORE_CATALOG, page(store), ids)
  if (clip === null || clip === "uncopyable") throw new Error(`no clip: ${clip}`)
  return clip
}
const paste = (store: Store, clip: Clip, args: object = {}) =>
  run(store, "@matomezu/paper:item-paste", { shapes: clip.shapes, connectors: clip.connectors, crowd: "push", ...args })
const ids = (store: Store) => walkShapes(page(store)).map(s => s.shape.id)

test("形を写して貼ると、新しい id の形が増え、元の形はそのまま。同じ写しを続けて貼っても id は重ならない", () => {
  const store = newStore()
  const a = place(store, BOX, { at: { x: 0, y: 0 } })
  const clip = clipFrom(store, [a])
  const first = paste(store, clip, { at: { x: 300, y: 0 } })
  const second = paste(store, clip, { at: { x: 500, y: 0 } })
  expect(first.ok && second.ok).toBe(true)
  const made = [first, second].map(d => (d.ok ? (d.result as { items: string[] }).items[0] : "") as string)
  expect(new Set([a, ...made]).size).toBe(3)
  expect(ids(store).sort()).toEqual([a, ...made].sort())
  expect(shapeOf(page(store), made[0] as string).at).toEqual({ x: 300, y: 0 })
})

test("子孫と中の線を一緒に写し、写した形どうしの線に付け替える。外の形への線は写さない", () => {
  const store = newStore()
  const a = place(store, BOX, { at: { x: 0, y: 0 } })
  const b = place(store, BOX, { at: { x: 0, y: 200 } })
  const c = place(store, BOX, { at: { x: 400, y: 0 } })
  expect(run(store, "@matomezu/line:line-connect", { from: a, to: b }).ok).toBe(true)
  expect(run(store, "@matomezu/line:line-connect", { from: a, to: c }).ok).toBe(true)
  const clip = clipFrom(store, [a, b])
  expect(clip.connectors).toHaveLength(1)
  const done = paste(store, clip, { at: { x: 600, y: 0 } })
  expect(done.ok).toBe(true)
  const lines = connectorsOf(page(store))
  expect(lines).toHaveLength(3)
  const added = lines.filter(l => ![a, b, c].includes(l.from) && ![a, b, c].includes(l.to))
  expect(added).toHaveLength(1)
  const roots = (done.ok ? (done.result as { items: string[] }).items : []) as string[]
  expect(roots).toContain(added[0]?.from as string)
  expect(roots).toContain(added[0]?.to as string)
})

test("入れ物の中の子ごと写し、貼ると子の id も新しく、子は貼った入れ物の子になる", () => {
  const store = newStore()
  const a = place(store, NEST, { at: { x: 0, y: 0 }, w: 300, h: 200 })
  const child = place(store, NEST, { parent: a, at: { x: 20, y: 60 }, w: 80, h: 40 })
  const clip = clipFrom(store, [a])
  const done = paste(store, clip, { at: { x: 400, y: 0 } })
  expect(done.ok).toBe(true)
  const copy = (done.ok ? (done.result as { items: string[] }).items[0] : "") as string
  const kids = walkShapes(page(store)).filter(s => s.parent === copy)
  expect(kids).toHaveLength(1)
  expect(kids[0]?.shape.id).not.toBe(child)
})

test("祖先も選んでいる形は根にしない。子だけ選んだときは、その子を紙の上の位置で根の形にして写す", () => {
  const store = newStore()
  const a = place(store, NEST, { at: { x: 100, y: 100 }, w: 300, h: 200 })
  const child = place(store, NEST, { parent: a, at: { x: 20, y: 60 }, w: 80, h: 40 })
  expect(clipFrom(store, [a, child]).shapes.map(s => s.id)).toEqual([a])
  const only = clipFrom(store, [child])
  expect(only.shapes.map(s => s.id)).toEqual([child])
  expect(only.shapes[0]).toMatchObject({
    x: shapeOf(page(store), child).at.x,
    y: shapeOf(page(store), child).at.y,
  })
})

test("入れ物を選んで貼ると、その入れ物の中に入る", () => {
  const store = newStore()
  const a = place(store, BOX, { at: { x: 0, y: 0 } })
  const nest = place(store, NEST, { at: { x: 400, y: 0 }, w: 300, h: 200 })
  const done = paste(store, clipFrom(store, [a]), { parent: nest })
  expect(done.ok).toBe(true)
  const made = (done.ok ? (done.result as { items: string[] }).items[0] : "") as string
  expect(shapeOf(page(store), made).parent).toBe(nest)
})

test("写せない形（データ）を含めば、写しにならず、貼るアクションも断る", () => {
  const store = newStore()
  const data = place(store, DATA, { at: { x: 0, y: 0 } })
  const nest = place(store, NEST, { at: { x: 400, y: 0 }, w: 300, h: 200 })
  expect(clipOf(CORE_CATALOG, page(store), [data])).toBe("uncopyable")
  expect(clipOf(CORE_CATALOG, page(store), [nest])).not.toBe("uncopyable")
  const raw = shapeOf(page(store), data).shape
  expect(paste(store, { shapes: [{ ...raw, x: 0, y: 300 }], connectors: [] } as never).ok).toBe(false)
})

test("使えないアイテム・壊れた形・形の外を指す線は断る。何も増えない", () => {
  const store = newStore()
  const a = place(store, BOX, { at: { x: 0, y: 0 } })
  const clip = clipFrom(store, [a])
  const before = shapesOf(page(store)).length
  expect(
    paste(store, { shapes: [{ ...clip.shapes[0], item: "@matomezu/nowhere:shape" }], connectors: [] } as never).ok,
  ).toBe(false)
  expect(
    paste(store, { shapes: [{ id: "x", item: BOX, x: 0, y: 0, props: { nothing: 1 } }], connectors: [] } as never).ok,
  ).toBe(false)
  const stray = { id: "l1", item: "@matomezu/line:connector-line", from: a, to: "elsewhere", props: {} }
  expect(paste(store, { shapes: clip.shapes, connectors: [stray] } as never).ok).toBe(false)
  expect(shapesOf(page(store))).toHaveLength(before)
})

test("貼る場所を渡さなければ空きに貼る。ほかの形を動かすことになるなら、crowd を書かない貼り付けは断る", () => {
  const store = newStore()
  const a = place(store, BOX, { at: { x: 0, y: 0 } })
  const clip = clipFrom(store, [a])
  const free = run(store, "@matomezu/paper:item-paste", { shapes: clip.shapes, connectors: clip.connectors })
  expect(free.ok).toBe(true)
  const pressed = run(store, "@matomezu/paper:item-paste", {
    shapes: clip.shapes,
    connectors: clip.connectors,
    at: { x: 4, y: 0 },
  })
  expect(pressed.ok).toBe(false)
})

test("紙に収まらない場所は、収まる一番近い場所へ寄せる（nearestPaste）。収まる場所はそのまま", () => {
  const store = newStore()
  const a = place(store, BOX, { at: { x: 0, y: 0 } })
  const clip = clipFrom(store, [a])
  const paged = pageOf(book(store), "p1")
  expect(nearestPaste(CORE_CATALOG, paged, clip, PAGE_ITSELF, { x: 300, y: 300 })).toEqual({ x: 300, y: 300 })
  const near = nearestPaste(CORE_CATALOG, paged, clip, PAGE_ITSELF, { x: -500, y: -500 })
  expect(near).not.toBeNull()
  expect(near?.x).toBeGreaterThanOrEqual(0)
  expect(near?.y).toBeGreaterThanOrEqual(0)
})

// コマンド（キーとメニューから呼ぶ）。ステージ s1 でブック b1 のページを開いた store で、選んでから呼ぶ
const ready = () => sizedStore()
const selection = (store: ReturnType<typeof ready>) =>
  screenOf(store.state.getState().window).stages[0]?.selection ?? []
const toasts = (store: ReturnType<typeof ready>) => store.state.getState().toasts.length
const command = (store: ReturnType<typeof ready>, id: string) =>
  (store.actions.command as (stage: string, id: string) => boolean)("s1", `@matomezu/paper:${id}`)
const frameClip = (store: ReturnType<typeof ready>) =>
  store.state.getState().pluginValues.window["@matomezu/paper:clip"] as Clip | undefined

test("コピーは写しを置くだけでブックを変えない。選んでいなければコマンドは出ない。貼ると貼った形を選ぶ", () => {
  const store = ready()
  const a = place(store as never, NEST, { at: { x: 0, y: 0 } })
  store.actions.select("s1", [a])
  const before = JSON.stringify(book(store as never))
  expect(command(store, "paper-copy")).toBe(true)
  expect(JSON.stringify(book(store as never))).toBe(before)
  expect(frameClip(store)?.shapes.map(s => s.id)).toEqual([a])
  store.actions.select("s1", [])
  expect(command(store, "paper-copy")).toBe(false)
  expect(command(store, "paper-paste")).toBe(true)
  const now = shapesOf(page(store as never))
  expect(now).toHaveLength(2)
  expect(selection(store)).toEqual([now.find(s => s.id !== a)?.id as string])
})

test("切り取りは写してから消す。貼ると戻る", () => {
  const store = ready()
  const a = place(store as never, NEST, { at: { x: 0, y: 0 } })
  store.actions.select("s1", [a])
  expect(command(store, "paper-cut")).toBe(true)
  expect(shapesOf(page(store as never))).toHaveLength(0)
  expect(selection(store)).toEqual([])
  expect(command(store, "paper-paste")).toBe(true)
  expect(shapesOf(page(store as never))).toHaveLength(1)
})

test("貼るときに入れ物を 1 つ選んでいれば、その中に入る。入れ物でない形を選んでいれば、その隣（同じ親の中）に入る", () => {
  const store = ready()
  const a = place(store as never, NEST, { at: { x: 0, y: 0 } })
  const nest = place(store as never, NEST, { at: { x: 400, y: 0 }, w: 300, h: 200 })
  store.actions.select("s1", [a])
  command(store, "paper-copy")
  store.actions.select("s1", [nest])
  command(store, "paper-paste")
  const [made] = selection(store)
  expect(shapeOf(page(store as never), made as string).parent).toBe(nest)
  // 内包ボックスは入れ物なので、入れ物でない形（データ以外の leaf）を選ぶ代わりに、子の形（入れ物）の隣を見る
  const child = shapeOf(page(store as never), made as string)
  expect(child?.shape.item).toBe(NEST)
})

test("複製は、選んだ形を同じ親の中の少し右下に貼る。写しは置き換えない", () => {
  const store = ready()
  const a = place(store as never, NEST, { at: { x: 40, y: 40 }, w: 100, h: 64 })
  store.actions.select("s1", [a])
  expect(command(store, "paper-duplicate")).toBe(true)
  const [made] = selection(store)
  expect(made).not.toBe(a)
  expect(shapeOf(page(store as never), made as string).at).toEqual({ x: 56, y: 56 })
  expect(frameClip(store)).toBeUndefined()
})

test("データを含む選びはコピーせず、トーストで知らせる。写しは置き換えない", () => {
  const store = ready()
  const data = place(store as never, DATA, { at: { x: 0, y: 0 } })
  store.actions.select("s1", [data])
  expect(command(store, "paper-copy")).toBe(true)
  expect(frameClip(store)).toBeUndefined()
  expect(toasts(store)).toBe(1)
})

test("写した入れ物を選んだまま貼ると、その中でなく隣に貼る（自分の中には入れない）", () => {
  const store = ready()
  const a = place(store as never, NEST, { at: { x: 40, y: 40 }, w: 300, h: 200 })
  store.actions.select("s1", [a])
  command(store, "paper-copy")
  expect(command(store, "paper-paste")).toBe(true)
  const [made] = selection(store)
  expect(made).not.toBe(a)
  expect(shapesOf(page(store as never))).toHaveLength(2)
  expect(shapeOf(page(store as never), made as string).parent).toBe(PAGE_ITSELF)
})

// OS のクリップボード: キーはクリップボードのイベントを待ち、そのイベントの運ぶ物に書き・読む
const transfer = (files: File[] = []) => {
  const data = new Map<string, string>()
  return {
    data,
    getData: (format: string) => data.get(format) ?? "",
    setData: (format: string, value: string) => void data.set(format, value),
    files,
  }
}
const HOST = "http://localhost:1"

test("キーのコピーはクリップボードのイベントを待って OS のクリップボードに書き、別の窓のキーの貼り付けがそれを貼る", () => {
  const from = ready()
  const a = place(from as never, NEST, { at: { x: 0, y: 0 } })
  from.actions.select("s1", [a])
  expect(from.actions.pressKey("Mod+C", ["stage"])).toBe("waits")
  expect(frameClip(from)).toBeUndefined() // イベントが来るまで行わない
  const carried = transfer()
  expect(from.actions.clipboardEvent("copy", carried, HOST)).toBe(true)
  expect(frameClip(from)?.shapes.map(s => s.id)).toEqual([a])
  expect(JSON.parse(carried.data.get("application/x-matomezu") ?? "{}")).toMatchObject({
    host: HOST,
    kind: "@matomezu/paper:clip",
  })

  const to = ready()
  expect(to.actions.pressKey("Mod+V", ["stage"])).toBe("waits")
  expect(to.actions.clipboardEvent("paste", carried, HOST)).toBe(true)
  expect(shapesOf(page(to as never))).toHaveLength(1)
  expect(frameClip(to)?.shapes).toHaveLength(1) // 窓の写しにも置く（右クリックの貼り付けで貼れる）
})

test("ほかの常駐でコピーした物はトーストで断る。写しでない物にファイルがあれば、紙のビューに渡す", () => {
  const from = ready()
  from.actions.select("s1", [place(from as never, NEST, { at: { x: 0, y: 0 } })])
  from.actions.pressKey("Mod+C", ["stage"])
  const carried = transfer()
  from.actions.clipboardEvent("copy", carried, "http://other:1")

  const to = ready()
  to.actions.pressKey("Mod+V", ["stage"])
  expect(to.actions.clipboardEvent("paste", carried, HOST)).toBe(true)
  expect(shapesOf(page(to as never))).toHaveLength(0)
  expect(toasts(to)).toBe(1)

  const got: (readonly File[])[] = []
  const stop = to.actions.receivePastedFiles("s1", "@matomezu/paper:paper-paste-clipboard", files => got.push(files))
  const image = new File(["x"], "a.png", { type: "image/png" })
  to.actions.pressKey("Mod+V", ["stage"])
  to.actions.clipboardEvent("paste", transfer([image]), HOST)
  expect(got).toEqual([[image]])
  stop()
})

test("待っているコピーは、イベントが来ないまま次のタイマーで捨てる。待っていなければ、イベントは何もしない", async () => {
  const store = ready()
  store.actions.select("s1", [place(store as never, NEST, { at: { x: 0, y: 0 } })])
  expect(store.actions.clipboardEvent("copy", transfer(), HOST)).toBe(false)
  store.actions.pressKey("Mod+C", ["stage"])
  await new Promise(done => setTimeout(done, 0))
  expect(store.actions.clipboardEvent("copy", transfer(), HOST)).toBe(false)
  expect(frameClip(store)).toBeUndefined()
})

test("クリップボードのイベントの外で呼んだキーの貼り付け（イベントを起こさないキーに替えたとき）は、窓の写しを貼る", () => {
  const store = ready()
  store.actions.select("s1", [place(store as never, NEST, { at: { x: 0, y: 0 } })])
  expect(command(store, "paper-copy")).toBe(true)
  expect(command(store, "paper-paste-clipboard")).toBe(true)
  expect(shapesOf(page(store as never))).toHaveLength(2)
})
