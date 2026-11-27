// 画像のプラグイン: 画像のフォルダの中と外を分ける認可ステップ in-images を、perform を通して確かめる。
// 画像のページは画像のフォルダとその下だけに作り・動かし、ほかの物は中へ入れず、中のフォルダは外へ出さない。ゴミ箱との間は行き来できる
import { expect, test } from "bun:test"
import { USER } from "../../../../web/src/core/actor"
import { type ActionContext, ANY_PAGE_TYPE } from "../../../../web/src/core/def/action"
import { HOME_ID } from "../../../../web/src/core/folders"
import { withChanges } from "../../../../web/src/core/folders-changes"
import { type PerformedIn, performIn, permittedIn, type World } from "../../../../web/src/core/perform-world"
import { BUILTIN_CONTROL_CENTER } from "../../../../web/src/plugins"
import { IMAGE, IMAGES, imageSizeOf, NO_IMAGE_SIZE } from "../../../../web/src/plugins/page-types/image/image"
import { worldOf } from "../../../../web/src/store/world"
import { CORE_CATALOG, newStore, sequence, settleIn } from "../../../support"

const NOW = "2026-11-27T01:00:00.000Z"
const DRAWING = "@matomezu/drawing:drawing"
const ASSET = "a".repeat(64)

const ctxOf = (): Omit<ActionContext, "naming"> => ({
  catalog: CORE_CATALOG,
  controlCenter: BUILTIN_CONTROL_CENTER,
  lang: "en",
  newId: sequence("n"),
  now: NOW,
  today: "2026-11-27",
  actor: USER,
})
const run = (world: World, id: string, args: unknown, on?: { book: string }): PerformedIn =>
  performIn(world, `@matomezu/base:${id}`, args, on, ctxOf())
const after = (world: World, done: PerformedIn): World => {
  if (!done.ok) throw new Error(`refused: ${JSON.stringify(done)}`)
  return { ...world, ...(done.changes ? withChanges(world, done.changes) : {}) }
}
const created = (done: PerformedIn): string => {
  if (!done.ok) throw new Error(`refused: ${JSON.stringify(done)}`)
  return (done.result as { page: string }).page
}

// 書庫ホームに、画像のフォルダ（中にフォルダ sub と画像のページ img）・フォルダ f（中にマークダウンのページ md）・ブック b が在る世界
function prepared() {
  const store = newStore({ now: () => NOW })
  settleIn(store)
  let world = worldOf(store.state.getState())
  const images = Object.values(world.folders).find(f => "systemFolder" in f && f.systemFolder === IMAGES.id)!.id
  const book = world.folders[HOME_ID]!.lineup.find(r => r.kind === "book")!.id
  world = after(world, run(world, "folder-create", { title: "sub", into: images }))
  const sub = Object.values(world.folders).find(f => (f as { title?: string }).title === "sub")!.id
  world = after(world, run(world, "folder-create", { title: "f", into: HOME_ID }))
  const f = Object.values(world.folders).find(f => (f as { title?: string }).title === "f")!.id
  const imgDone = run(world, "page-create", {
    folder: images,
    type: IMAGE.id,
    title: "img",
    fields: { asset: ASSET, width: 40, height: 20 },
  })
  const img = created(imgDone)
  world = after(world, imgDone)
  const mdDone = run(world, "page-create", { folder: f, type: "@matomezu/markdown:markdown", title: "md" })
  const md = created(mdDone)
  world = after(world, mdDone)
  return { world, images, sub, f, book, img, md }
}

test("画像のページは画像のフォルダの中にだけ作れ・動かせ、ほかの物は中へ入らず、中のフォルダは外へ出ない。ゴミ箱との間は行き来できる", () => {
  const { world, images, sub, f, book, img, md } = prepared()
  const trashed = after(world, run(world, "entry-trash", { entry: img }))
  const image = (folder: string) => ({ folder, type: IMAGE.id, fields: { asset: ASSET, width: 40, height: 20 } })
  const rows: [string, World, string, unknown, boolean][] = [
    ["画像のフォルダに画像のページを作る", world, "page-create", image(images), true],
    ["画像のフォルダの下のフォルダに画像のページを作る", world, "page-create", image(sub), true],
    ["書庫ホームに画像のページを作る", world, "page-create", image(HOME_ID), false],
    ["ほかのフォルダに画像のページを作る", world, "page-create", image(f), false],
    ["ブックに画像のページを作る", world, "page-create", image(book), false],
    [
      "フォルダを言わずに（日付のフォルダに）画像のページを作る",
      world,
      "page-create",
      { type: IMAGE.id, fields: { asset: ASSET, width: 40, height: 20 } },
      false,
    ],
    ["画像のフォルダに図面のページを作る", world, "page-create", { folder: images, type: DRAWING }, false],
    ["画像のフォルダにフォルダを作る", world, "folder-create", { title: "x", into: images }, true],
    ["画像のページを、画像のフォルダの下のフォルダへ動かす", world, "entry-move", { entry: img, into: sub }, true],
    ["画像のページを、ほかのフォルダへ動かす", world, "entry-move", { entry: img, into: f }, false],
    ["画像のページを、ブックへ動かす", world, "entry-move", { entry: img, into: book }, false],
    ["ほかのページを、画像のフォルダへ動かす", world, "entry-move", { entry: md, into: images }, false],
    ["ブックを、画像のフォルダへ動かす", world, "entry-move", { entry: book, into: images }, false],
    ["フォルダを、画像のフォルダへ動かす", world, "entry-move", { entry: f, into: images }, false],
    ["画像のフォルダの下のフォルダを、外へ動かす", world, "entry-move", { entry: sub, into: HOME_ID }, false],
    ["画像のページを写す（同じフォルダに並ぶ）", world, "entry-duplicate", { entry: img }, true],
    ["画像のページをゴミ箱に入れる", world, "entry-trash", { entry: img }, true],
    ["ゴミ箱の画像のページを元の所へ戻す", trashed, "entry-restore", { entry: img }, true],
    [
      "ブックに、画像のページの参照を置く",
      world,
      "library-reference-add",
      { book, of: { kind: "page", id: img } },
      true,
    ],
  ]
  // 断るのは、どれも in-images
  const by = (r: PerformedIn) => (r.ok ? true : "permission" in r && r.permission)
  for (const [what, w, id, args, ok] of rows)
    expect([what, by(run(w, id, args))]).toEqual([what, ok || "@matomezu/image:in-images"])
  // ブックのページを足すアクションでも、画像のページは足せない
  const added = performIn(
    world,
    "@matomezu/base:page-add",
    { type: IMAGE.id, fields: { asset: ASSET, width: 40, height: 20 } },
    { book },
    ctxOf(),
  )
  expect(added.ok).toBe(false)
})

test("画像のページが指すアセットは、ページの asset（ページの型が答える assetsOf）", () => {
  const { world, img } = prepared()
  const page = world.pages[img]!
  expect(IMAGE.assetsOf?.(page)).toEqual([ASSET])
})

test("タイプがまだ決まらないページを作るのは、画像のフォルダの中でも問える（書庫の「新しいページ…」）。決まったタイプは、画像のページだけが通る", () => {
  const { world, images } = prepared()
  const asked = (type: string) => {
    const r = permittedIn(world, "@matomezu/base:page-create", { folder: images, type }, undefined, ctxOf())
    return r.ok ? true : "permission" in r && r.permission
  }
  expect(asked(ANY_PAGE_TYPE)).toBe(true)
  expect(asked(IMAGE.id)).toBe(true)
  expect(asked(DRAWING)).toBe("@matomezu/image:in-images")
})

test("画像のページは、作るときに画像の幅と高さを受ける（無ければ作らない）。imageSizeOf はそれを答える", () => {
  const { world, images, img } = prepared()
  expect(run(world, "page-create", { folder: images, type: IMAGE.id, fields: { asset: ASSET } }).ok).toBe(false)
  expect(imageSizeOf(world.pages[img]!)).toEqual({ w: 40, h: 20 })
  expect(imageSizeOf({})).toBe(NO_IMAGE_SIZE)
})
