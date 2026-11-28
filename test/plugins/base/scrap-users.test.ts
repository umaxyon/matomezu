// ページを使っている所のうち、スクラップの分（scrapUsersOf）: 常駐が書庫の全部の行から、消すページを指すスクラップを持つ見える所のページを引く

import { expect, test } from "bun:test"
import { HOME_ID, TRASH_ID } from "../../../web/src/core/folders"
import { scrapUsersOf } from "../../../web/src/plugins/base"
import { newStore } from "../../support"

const SCRAP = "@matomezu/scrap:shape-scrap-box"
const NEST = "@matomezu/box:shape-nest-box"
const DRAWING = "@matomezu/drawing:drawing"
const SLIDE = "@matomezu/slide-page:slide"

const scrapTo = (id: string, page: string) => ({
  id,
  item: SCRAP,
  x: 0,
  y: 0,
  props: { page, area: { x: 0, y: 0, w: 100, h: 100 }, scale: 1 },
})
const page = (id: string, type: string, more: Record<string, unknown>) => ({ id, type, title: id, version: 1, ...more })

function library() {
  const { catalog } = newStore()
  const pages = [
    page("t1", DRAWING, { items: [scrapTo("self", "t1")] }), // 消すページ（ゴミ箱の中）。自分を指しても数えない
    page("t2", DRAWING, {}), // 消すページ。だれも指さない
    page("p1", DRAWING, {
      items: [scrapTo("a", "t1"), { id: "n", item: NEST, x: 0, y: 0, props: {}, shapes: [scrapTo("b", "t1")] }],
    }), // 同じページを 2 つ指しても 1 つ。入れ子の中も
    page("s1", SLIDE, { slide: [scrapTo("c", "t1")] }), // スライドの並びの物
    page("tp", DRAWING, { items: [scrapTo("d", "t1")] }), // ゴミ箱の中のページの物は数えない
    page("wp", DRAWING, { items: [scrapTo("e", "t1")] }), // バックヤードのブックの物は数える
    page("o1", DRAWING, { items: [scrapTo("f", "other")] }), // 頼んでいないページを指す物
  ]
  const folders = [
    {
      id: HOME_ID,
      folderRole: "home",
      lineup: [
        { kind: "book", id: "b1" },
        { kind: "book", id: "b2" },
      ],
    },
    {
      id: "b1",
      folderRole: "book",
      title: "設計メモ",
      lineup: [
        { kind: "page", id: "p1" },
        { kind: "page", id: "o1" },
      ],
    },
    { id: "b2", folderRole: "book", title: "発表", lineup: [{ kind: "page", id: "s1" }] },
    {
      id: TRASH_ID,
      folderRole: "trash",
      lineup: [
        { kind: "page", id: "t1", trashed: "2026-11-28T00:00:00Z", from: [HOME_ID] },
        { kind: "page", id: "t2", trashed: "2026-11-28T00:00:00Z", from: [HOME_ID] },
        { kind: "page", id: "tp", trashed: "2026-11-28T00:00:00Z", from: [HOME_ID] },
      ],
    },
    { id: "yard", folderRole: "backyard", backyard: "x", lineup: [{ kind: "book", id: "wb" }] },
    { id: "wb", folderRole: "book", title: "M-0029", lineup: [{ kind: "page", id: "wp" }] },
  ]
  return { catalog: catalog.core, pages, folders }
}

test("消すページを指すスクラップを持つ見える所のページを、消すページごとに返す（図面の入れ子・スライドの並び・バックヤードの中も。ゴミ箱の中と自分は数えない）", () => {
  const { catalog, pages, folders } = library()
  expect(scrapUsersOf(catalog, pages, folders, ["t1", "t2"])).toEqual({
    users: { t1: ["p1", "s1", "wp"] },
    sure: true,
  })
})

test("見える所に、タイプが機能台帳に無いページがあれば sure を false にする。ゴミ箱の中のページなら数えないので、そのまま", () => {
  const { catalog, pages, folders } = library()
  const unknown = [...pages, page("u1", "@someone/gone:page", { items: [scrapTo("g", "t1")] })]
  const into = (holder: string) =>
    folders.map(f =>
      f.id === holder
        ? { ...f, lineup: [...f.lineup, { kind: "page", id: "u1", trashed: "2026-11-28T00:00:00Z", from: [HOME_ID] }] }
        : f,
    )
  expect(scrapUsersOf(catalog, unknown, into("b1"), ["t1"]).sure).toBe(false)
  expect(scrapUsersOf(catalog, unknown, into(TRASH_ID), ["t1"])).toEqual({
    users: { t1: ["p1", "s1", "wp"] },
    sure: true,
  })
})
