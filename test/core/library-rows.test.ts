// 書庫が対象のアクションのあとの確かめのうち、ブックの値に出ない所: フォルダごとゴミ箱に入れたときの中のブックと、書庫ホーム・ゴミ箱・フォルダの行の形
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../web/src/core/actor"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { defineAction } from "../../web/src/core/def/action"
import type { PermissionDef } from "../../web/src/core/def/permission"
import { isMoveRefusal, restoredEntry, trashedEntry } from "../../web/src/core/entries"
import {
  type Folder,
  HOME_ID,
  type HomeFolder,
  type Library,
  type PlainFolder,
  worldTablesOf,
} from "../../web/src/core/folders"
import { perform } from "../../web/src/core/perform"
import type { Book } from "../../web/src/core/schema/book"
import { drawingPage, testBook } from "../lineup"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

// どのエントリもゴミ箱に入れるアクションと、書庫ホームの行を形に合わない物に替えるアクション
const TRASH = defineAction({
  id: "t:entry-trash",
  title: "@matomezu/base:Move to trash",
  aiDescription: "Move an entry to the trash.",
  target: "library",
  permissionScope: "unknown",
  args: z.strictObject({ entry: z.string() }),
  run: (library, args, ctx) => {
    const next = trashedEntry(library, args.entry, ctx.now)
    return isMoveRefusal(next) ? null : { next, result: {} }
  },
})
const RESTORE = defineAction({
  id: "t:entry-restore",
  title: "@matomezu/base:Restore",
  aiDescription: "Bring an entry back from the trash to the home.",
  target: "library",
  permissionScope: "unknown",
  args: z.strictObject({ entry: z.string() }),
  run: (library, args) => {
    const next = restoredEntry(library, args.entry, HOME_ID)
    return isMoveRefusal(next) ? null : { next, result: {} }
  },
})
// ゴミ箱から出るブックを止める認可ステップ（受けた置き場所の変化を覚える）
const places: string[] = []
const STAY: PermissionDef = {
  id: "t:stay",
  title: "@matomezu/base:Restore",
  aiDescription: "Books stay in the trash.",
  denies: () => false,
  keeps: c => {
    if (c.kind !== "folder") return true
    places.push(`${c.before?.id}:${c.changes.place}`)
    return c.changes.place !== "restored"
  },
}
const BREAK = defineAction({
  id: "t:home-break",
  title: "@matomezu/base:Move to trash",
  aiDescription: "Write a home row that does not fit its form.",
  target: "library",
  permissionScope: "unknown",
  args: z.strictObject({}),
  run: library => ({
    next: {
      pages: library.pages,
      folders: { ...library.folders, [HOME_ID]: { ...library.folders[HOME_ID], title: "x" } as unknown as Folder },
    },
    result: {},
  }),
})

const CENTER = "@matomezu/control-center:control-center"
const center = CORE_CATALOG.controlCenters.get(CENTER)!
const catalog = buildCoreCatalog({
  ...BUILTIN_PARTS,
  actions: [...BUILTIN_PARTS.actions, TRASH, RESTORE, BREAK],
  permissions: [...BUILTIN_PARTS.permissions, STAY],
  controlCenters: [{ ...center, actions: [...center.actions, TRASH.id, RESTORE.id, BREAK.id] as never }],
})
const ctx = {
  catalog,
  controlCenter: CENTER,
  lang: "ja" as const,
  newId: () => "new",
  now: "2026-11-18T00:00:00.000Z",
  actor: USER,
}

// テストで足したアクションを行う（アクションの id の型に入っていないので、型を広げて呼ぶ）
const run = perform as unknown as (library: Library, id: string, args: unknown, c: typeof ctx) => unknown

// 書庫ホーム > フォルダ a（ブック b1）・ブック b2
function library(b1: Book) {
  const a: PlainFolder = { folderRole: "folder", id: "a", title: "a", lineup: [{ kind: "book", id: "b1" }] }
  const home: HomeFolder = {
    folderRole: "home",
    id: HOME_ID,
    lineup: [
      { kind: "folder", id: "a" },
      { kind: "book", id: "b2" },
    ],
  }
  return worldTablesOf([b1, testBook("b2", "二", [drawingPage("p2")])], [home, a])
}
const b1 = testBook("b1", "一", [drawingPage("p1")])

test("フォルダごとゴミ箱に入れると、中のブックも認可ステップが確かめる（ロックしたブック・ロックしたページを持つブックを中に持つフォルダは入れられない）", () => {
  expect(run(library(b1), TRASH.id, { entry: "a" }, ctx)).toMatchObject({ ok: true })
  for (const locked of [
    { ...b1, locked: true },
    testBook("b1", "一", [{ ...drawingPage("p1"), locked: true }]),
  ] as Book[])
    expect(run(library(locked), TRASH.id, { entry: "a" }, ctx)).toEqual({
      ok: false,
      reason: "denied",
      permission: "@matomezu/base:lock",
      book: "b1",
    })
})

test("置き場所が変わったブックは、値が変わらなくても認可ステップが確かめる（フォルダごとゴミ箱に入った中のブックは trashed、戻すと restored。変わらないブックは確かめない）", () => {
  places.length = 0
  const binned = run(library(b1), TRASH.id, { entry: "a" }, ctx) as { ok: true; next: Library }
  expect(places).toEqual(["b1:trashed"])
  places.length = 0
  expect(run(binned.next, RESTORE.id, { entry: "a" }, ctx)).toEqual({
    ok: false,
    reason: "denied",
    permission: "t:stay",
    book: "b1",
  })
  expect(places).toEqual(["b1:restored"])
})

test("書庫が対象のアクションが、形に合わない書庫ホームの行を返したら断る", () => {
  expect(run(library(b1), BREAK.id, {}, ctx)).toEqual({ ok: false, reason: "refused" })
})

test("ゴミ箱の外で動いたブックは、値が変わらなくても認可ステップが moved を受ける（フォルダごと動かした中のブックも。動かなかったブックには問わない）", () => {
  const b: PlainFolder = { folderRole: "folder", id: "b", title: "b", lineup: [] }
  const was = library(b1)
  const start: Library = {
    pages: was.pages,
    folders: {
      ...was.folders,
      b,
      [HOME_ID]: {
        ...was.folders[HOME_ID],
        lineup: [...was.folders[HOME_ID]!.lineup, { kind: "folder", id: "b" }],
      } as Folder,
    },
  }
  places.length = 0
  expect(run(start, "@matomezu/base:entry-move", { entry: "a", into: "b" }, ctx)).toMatchObject({ ok: true })
  expect(places).toEqual(["b1:moved"])
  places.length = 0
  expect(run(start, "@matomezu/base:entry-move", { entry: "b2", into: "b" }, ctx)).toMatchObject({ ok: true })
  expect(places).toEqual(["b2:moved"])
})
