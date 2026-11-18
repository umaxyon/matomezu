// 書庫の画面が描く物（base/library/outline.ts）: フォルダの直下の行・パンくず・行を開いたときの行き先
import { expect, test } from "bun:test"
import { HOME_ID, TRASH_ID } from "../../../web/src/core/folders"
import { FOLDER_CREATE } from "../../../web/src/plugins/base/library/entry-move"
import {
  NO_TYPE,
  NOT_OPENED,
  openedFolderOf,
  openTargetOf,
  pathTo,
  rowsIn,
} from "../../../web/src/plugins/base/library/outline"
import { newStore } from "../../support"

const NOW = "2026-11-18T01:00:00.000Z"

function setup() {
  const store = newStore({ now: () => NOW })
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const made = perform(FOLDER_CREATE.id, { title: "仕事" })
  const folder = (made.result as { folder: string }).folder
  expect(perform("@matomezu/base:entry-move", { entry: "b2", into: folder }).ok).toBe(true)
  return { store, perform, folder, library: () => store.state.getState() }
}

test("フォルダの直下の行は、並びの順に、種類・名前・ページのタイプを持つ。無いフォルダは空", () => {
  const { library, folder } = setup()
  const home = rowsIn(library(), HOME_ID)
  expect(home.map(r => r.kind)).toContain("folder")
  expect(home.find(r => r.id === folder)).toEqual({
    kind: "folder",
    id: folder,
    title: "仕事",
    type: NO_TYPE,
    readable: true,
  })
  expect(home.some(r => r.id === "b2")).toBe(false)
  expect(rowsIn(library(), folder).map(r => [r.kind, r.id])).toEqual([["book", "b2"]])
  const pages = rowsIn(library(), "b1")
  expect(pages[0]).toMatchObject({ kind: "page", id: "p1", readable: true })
  expect(pages[0]?.type).not.toBe(NO_TYPE)
  expect(rowsIn(library(), "nothing")).toEqual([])
})

test("パンくずは、一番上のフォルダからそのフォルダまで。開いているフォルダは、無くなっていれば書庫ホーム", () => {
  const { library, folder } = setup()
  expect(pathTo(library().folders, HOME_ID)).toEqual([HOME_ID])
  expect(pathTo(library().folders, "b2")).toEqual([HOME_ID, folder, "b2"])
  expect(openedFolderOf(library().folders, folder)).toBe(folder)
  expect(openedFolderOf(library().folders, "nothing")).toBe(HOME_ID)
  expect(openedFolderOf(library().folders, undefined)).toBe(HOME_ID)
})

test("行を開くと、フォルダは中へ入り、ブックとその中のページはブックを窓に出す。ゴミ箱の中の物は開かない", () => {
  const { library, folder, perform } = setup()
  const row = (holder: string, id: string) => rowsIn(library(), holder).find(r => r.id === id)!
  expect(openTargetOf(library(), row(HOME_ID, folder))).toEqual({ to: "folder", folder })
  expect(openTargetOf(library(), row(folder, "b2"))).toEqual({ to: "book", book: "b2" })
  expect(openTargetOf(library(), row("b1", "p1"))).toEqual({ to: "book", book: "b1", page: "p1" })
  expect(perform("@matomezu/base:entry-trash", { entry: "b1" }).ok).toBe(true)
  expect(pathTo(library().folders, "b1")).toEqual([TRASH_ID, "b1"])
  expect(openTargetOf(library(), row(TRASH_ID, "b1"))).toBe(NOT_OPENED)
  expect(openTargetOf(library(), row("b1", "p1"))).toBe(NOT_OPENED)
})
