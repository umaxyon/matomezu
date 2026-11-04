// 物の名前（base/note/labels.ts の anchorLabel と、定義の labelOf）: ブックのタイプ → 形 → キャプション → つなぐもの → 種類の名前の順に引き、装飾は外す
import { expect, test } from "bun:test"
import type { ItemPage } from "../../web/src/core/placed"
import type { Book } from "../../web/src/core/schema/book"
import { anchorLabel } from "../../web/src/plugins/base/note/labels"
import { CORE_CATALOG } from "../support"

const drawing = (items: unknown[]): Book =>
  ({
    type: "@matomezu/drawing:drawing",
    id: "b1",
    title: "見本",
    pages: [{ id: "p1", title: "1", paper: "@matomezu/base:a4", orientation: "landscape", items }],
  }) as unknown as Book
const label = (book: Book, id: string) => anchorLabel(CORE_CATALOG, book, id)

test("箱はキャプション、無ければ本文の最初の行。どちらも無ければ種類の名前。装飾は外す", () => {
  const book = drawing([
    { id: "a", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: "**太い**見出し", body: "" } },
    { id: "b", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: " ", body: "\n本文の行\n次" } },
    { id: "c", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: "", body: "" } },
  ] as ItemPage["items"])
  expect(label(book, "a")).toEqual({ text: "太い見出し" })
  expect(label(book, "b")).toEqual({ text: "本文の行" })
  expect(label(book, "c")).toEqual({ title: "@matomezu/box:Box" })
  expect(label(book, "x")).toBeNull()
})

test("リストはキャプション、行は行のキャプションか本文。線はキャプション、無ければ種類の名前。キャプションの項目しか無い形はキャプション", () => {
  const row = (id: string, props: object) => ({ id, item: "list.row", props })
  const book = drawing([
    {
      id: "l",
      item: "@matomezu/list:shape-list",
      x: 0,
      y: 0,
      props: { caption: "買う物" },
      children: [
        row("r1", { caption: "牛乳", body: "" }),
        row("r2", { caption: "", body: "パン" }),
        row("r3", { caption: "", body: "" }),
      ],
    },
    { id: "d", item: "@matomezu/shape:shape-diamond", x: 0, y: 0, props: { caption: "分かれ道" } },
    { id: "n1", item: "@matomezu/line:connector-line", from: "l", to: "d", props: { caption: "行く" } },
    { id: "n2", item: "@matomezu/line:connector-line", from: "d", to: "l", props: {} },
  ] as ItemPage["items"])
  expect(label(book, "l")).toEqual({ text: "買う物" })
  expect(label(book, "r1")).toEqual({ text: "牛乳" })
  expect(label(book, "r2")).toEqual({ text: "パン" })
  expect(label(book, "r3")).toEqual({ title: "@matomezu/list:List" })
  expect(label(book, "d")).toEqual({ text: "分かれ道" })
  expect(label(book, "n1")).toEqual({ text: "行く" })
  expect(label(book, "n2")).toEqual({ title: "@matomezu/line:Line" })
})

test("ツリーの節と、ディレクトリの行は、ブックのタイプの labelOf で引く", () => {
  const tree = {
    type: "@matomezu/tree:tree",
    id: "t",
    title: "木",
    pages: [
      {
        id: "p1",
        title: "1",
        paper: "@matomezu/base:a4",
        orientation: "landscape",
        root: { id: "root", caption: "根", children: [{ id: "k", caption: "{red:子}" }] },
      },
    ],
  } as unknown as Book
  expect(label(tree, "root")).toEqual({ text: "根" })
  expect(label(tree, "k")).toEqual({ text: "子" })
  const dir = {
    type: "@matomezu/dir:dir",
    id: "d",
    title: "構成",
    pages: [
      {
        id: "p1",
        title: "1",
        paper: "@matomezu/base:a4",
        orientation: "portrait",
        root: { id: "root", kind: "folder", name: "src", children: [{ id: "f", kind: "file", name: "main.ts" }] },
      },
    ],
  } as unknown as Book
  expect(label(dir, "root")).toEqual({ text: "src" })
  expect(label(dir, "f")).toEqual({ text: "main.ts" })
})
