// バックヤードの決まりを core が守る: 中のブックは名前を変えない。中にブックを新しく作れるのは、持ち主のプラグインのアクションだけ（どちらも in-backyard で断る）
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../web/src/core/actor"
import type { CoreCatalog } from "../../web/src/core/core-catalog"
import type { ActionContext, ActionDef } from "../../web/src/core/def/action"
import { placedInBackyard } from "../../web/src/core/entries"
import type { Library } from "../../web/src/core/folders"
import { withBook } from "../../web/src/core/folders-books"
import { backyardBreach } from "../../web/src/core/perform-library"
import { performIn } from "../../web/src/core/perform-world"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { TICKETS_HISTORY } from "../../web/src/plugins/base/library/backyards"
import { roomKey, WORKROOM, yardCtx, yardWorld } from "../backyard"
import { CORE_CATALOG } from "../support"

const PARTICIPANT = "@matomezu/base:participant"

import { drawingPage, testBook } from "../lineup"

test("バックヤードのブックは、書庫が対象のアクションでもブックが対象のアクションでも、利用者も名前を変えられない。中のページの名前は変えられる", () => {
  const rename = (entry: string) =>
    performIn(yardWorld(), "@matomezu/base:entry-rename", { entry, title: "別" }, undefined, yardCtx(USER))
  expect(rename("b1")).toMatchObject({ ok: false, reason: "refused", kind: "in-backyard" })
  expect(rename("p1").ok).toBe(true)
  const update = performIn(yardWorld(), "@matomezu/base:book-update", { title: "別" }, { book: "b1" }, yardCtx(USER))
  expect(update).toMatchObject({ ok: false, reason: "refused", kind: "in-backyard" })
})

test("バックヤードに新しいブックを作れるのは、持ち主のプラグインのアクションだけ", () => {
  const w = yardWorld()
  const was: Library = { pages: w.pages, folders: w.folders }
  const now = placedInBackyard(
    withBook(was, testBook("b9", "九", [drawingPage("n1")])),
    "b9",
    TICKETS_HISTORY.id,
    roomKey("r9"),
  ) as Library
  const by = (id: string) => backyardBreach({ id } as ActionDef, was, now)
  expect(by("@matomezu/base:worker-page-add")).toBeNull()
  expect(by("@matomezu/taskboard:x")).toBe("only the plugin that owns a backyard makes books in it")
})

test("書庫が対象のアクションは、readsSubjects に書いた種類のレコードだけを ctx.record と ctx.find で読む（ほかは none と空）", () => {
  const id = "@matomezu/base:test-reads"
  const def = {
    id,
    target: "library",
    permissionScope: "unknown",
    args: z.strictObject({}),
    readsSubjects: () => [WORKROOM],
    run: (library: Library, _args: unknown, ctx: ActionContext) => ({
      next: library,
      result: [
        ctx.record?.(WORKROOM, "r1"),
        ctx.record?.(PARTICIPANT, "p1"),
        ctx.find?.(WORKROOM, []).length,
        ctx.find?.(PARTICIPANT, []).length,
      ],
    }),
  } as unknown as ActionDef
  const center = CORE_CATALOG.controlCenters.get(BUILTIN_CONTROL_CENTER)!
  const catalog = {
    ...CORE_CATALOG,
    actions: new Map([...CORE_CATALOG.actions, [id, def]]),
    controlCenters: new Map([[BUILTIN_CONTROL_CENTER, { ...center, actions: [...center.actions, id] }]]),
  } as unknown as CoreCatalog
  const room = { id: "r1", name: "r1", bird: "sparrow", createdAt: "2026-11-22T00:00:00.000Z" }
  const world = { ...yardWorld(), records: { [WORKROOM]: { r1: room }, [PARTICIPANT]: { p1: { id: "p1" } } } }
  const done = performIn(world as never, id, {}, undefined, yardCtx(USER, { catalog }))
  expect(done).toMatchObject({ ok: true, result: [room, "none", 1, 0] })
})
