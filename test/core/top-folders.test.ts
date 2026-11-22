import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  HOME_ID,
  isBookRole,
  isOpenRole,
  isTopRole,
  LIBRARY_TOP_IDS,
  TOP_FOLDERS,
  TOP_IDS,
  TRASH_ID,
  UNREADABLE_ID,
} from "../../web/src/core/folders"

const ROOT = join(import.meta.dir, "../..")

// Go の internal/storage/library.go の topFolders の行を、役・id・open・library に読む
function goTopFolders(): { role: string; id: string; open: boolean; library: boolean }[] {
  const text = readFileSync(join(ROOT, "internal/storage/library.go"), "utf8")
  const consts = new Map([...text.matchAll(/^\s*(?:const\s+)?(\w+)\s*=\s*"([^"]*)"/gm)].map(m => [m[1], m[2]]))
  const table = text.match(/var topFolders = \[\]topFolder\{([\s\S]*?)\n\}/)?.[1] ?? ""
  return [...table.matchAll(/\{(\w+), (\w+), (true|false), (true|false)\}/g)].map(m => ({
    role: consts.get(m[1]) ?? "",
    id: consts.get(m[2]) ?? "",
    open: m[3] === "true",
    library: m[4] === "true",
  }))
}

test("一番上のフォルダの表は、TS と Go で同じ役・id・属性を同じ順に持つ", () => {
  const ts = Object.entries(TOP_FOLDERS).map(([role, t]) => ({ role, ...t }))
  expect(goTopFolders()).toEqual(ts)
})

test("役の述語: 一番上・4 つとも持てる・ブックの役", () => {
  expect(["home", "trash", "unreadable"].every(isTopRole)).toBe(true)
  expect(["folder", "binder", "book", "", undefined, "x"].some(isTopRole)).toBe(false)
  expect(["home", "trash", "folder"].every(isOpenRole)).toBe(true)
  expect(["unreadable", "binder", "book", undefined].some(isOpenRole)).toBe(false)
  expect(["book", "", undefined, "x"].every(isBookRole)).toBe(true)
  expect(["home", "trash", "unreadable", "folder", "binder"].some(isBookRole)).toBe(false)
})

test("一番上のフォルダの id: 全部と、中の物が書庫に入る物（書庫ホームが先）", () => {
  expect(TOP_IDS).toEqual([HOME_ID, TRASH_ID, UNREADABLE_ID])
  expect(LIBRARY_TOP_IDS).toEqual([HOME_ID, TRASH_ID])
})
