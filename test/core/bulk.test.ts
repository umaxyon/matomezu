// アクションバルク（core/bulk.ts の performBulk）: 順に行い、変わった物を 1 つに合わせる。どれかが断られたら何も変えない。前のアクションが書いたレコードは、あとのアクションから見える
import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { type BulkAction, performBulk } from "../../web/src/core/bulk"
import type { World } from "../../web/src/core/perform"
import { sourceOf } from "../../web/src/core/record-source"
import { MAIL } from "../../web/src/plugins/base/mail"
import { worldOf } from "../../web/src/store/world"
import { CORE_CATALOG, newStore, sequence } from "../support"

const CTX = {
  catalog: CORE_CATALOG,
  controlCenter: "@matomezu/control-center:control-center",
  lang: "ja" as const,
  actor: USER,
}
const ids = sequence("n")
const step = (action: string, args: unknown, on?: BulkAction["on"]): BulkAction => ({
  action,
  args,
  ...(on ? { on } : {}),
  newId: ids,
  now: "2026-11-17T00:00:00.000Z",
})
const X: Record<string, number> = { 一: 100, 二: 400 }
const place = (caption: string) =>
  step(
    "@matomezu/paper:item-place",
    { item: "@matomezu/box:shape-nest-box", at: { x: X[caption] ?? 100, y: 100 }, props: { caption } },
    { page: "p1" },
  )
const send = (title: string) => step("@matomezu/base:mail-send", { from: "test", title })
const world = (): World => worldOf(newStore().state.getState())
const itemsIn = (row: unknown) =>
  ((row as { items?: { props: { caption: string } }[] }).items ?? []).map(i => i.props.caption)

test("ページを変えるアクションとレコードを作るアクションは、順に行い、ページは最後の後、レコードは作った物を 1 つの結果に合わせる", () => {
  const done = performBulk(world(), [place("一"), place("二"), send("届いた")], CTX)
  if (!done.ok) throw new Error(done.reason)
  expect(done.results.length).toBe(3)
  expect(itemsIn(done.changes?.pages.p1)).toEqual(["一", "二"])
  expect(done.records?.map(r => r.subject)).toEqual([MAIL.id])
  expect(JSON.stringify(done.records?.[0]?.record)).toContain("届いた")
})

test("途中の 1 つが断られたら、何番目かと断りを返し、前のアクションの変更も返さない", () => {
  const done = performBulk(
    world(),
    [place("一"), step("@matomezu/base:page-update", { title: "x" }, { page: "无" })],
    CTX,
  )
  expect(done).toMatchObject({ ok: false, reason: "no-page", at: 1 })
  expect("changes" in done).toBe(false)
})

test("バルクの中で作って消したページは、変更に持たない", () => {
  const fixed = (id: string) => () => id
  const add = {
    ...step("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing" }, { book: "b1" }),
    newId: fixed("np"),
  }
  const added = performBulk(world(), [add], CTX)
  if (!added.ok) throw new Error(added.reason)
  const page = (added.results[0] as { page: string }).page
  const both = performBulk(world(), [add, step("@matomezu/base:page-remove", { page }, { book: "b1" })], CTX)
  if (!both.ok) throw new Error(both.reason)
  expect(Object.keys(added.changes?.pages ?? {})).toContain(page)
  expect(Object.keys(both.changes?.pages ?? {})).not.toContain(page)
})

test("前のアクションが作ったレコード・消したレコードは、ホストの読み口（受けたレコードの外から引く）でも、あとのアクションから見える", () => {
  // ホストのエンジンと同じく、受けたレコードは空で、読み口が置き場所（ここでは空）から引く
  const host: World = { ...world(), records: {}, source: sourceOf({}) }
  const sent = performBulk(host, [send("一")], CTX)
  if (!sent.ok) throw new Error(sent.reason)
  const mail = (sent.results[0] as { mail: string }).mail
  // 同じ id の振り方で作り直し、続けて既読にする
  const again = (more: BulkAction[]) => {
    const fixed = [mail]
    return performBulk(host, [{ ...send("一"), newId: () => fixed.shift() ?? ids() }, ...more], CTX)
  }
  const seen = again([step("@matomezu/base:mail-seen", {}, { record: mail })])
  expect(seen.ok).toBe(true)
  if (!seen.ok) return
  expect(seen.records?.length).toBe(1)
  expect(seen.records?.[0]?.record).toMatchObject({ seenAt: expect.any(String) })
  const gone = again([
    step("@matomezu/base:mail-remove", {}, { record: mail }),
    step("@matomezu/base:mail-seen", {}, { record: mail }),
  ])
  expect(gone).toMatchObject({ ok: false, reason: "no-record", at: 2 })
  // 作って消したレコードは、変更に持たない
  const removed = again([step("@matomezu/base:mail-remove", {}, { record: mail })])
  expect(removed.ok).toBe(true)
  expect(removed.ok && removed.records).toBeUndefined()
})

test("断る所 check は、アクションごとにその前と後の世界を受け、断れば何も変えない", () => {
  const seen: number[] = []
  const done = performBulk(world(), [place("一"), place("二")], CTX, (i, before, after) => {
    seen.push(i)
    expect(before).not.toBe(after)
    return i === 1 ? { ok: false as const, reason: "being-edited" as const } : undefined
  })
  expect(seen).toEqual([0, 1])
  expect(done).toMatchObject({ ok: false, reason: "being-edited", at: 1 })
})

test("書庫の画面の履歴に入るアクションが変えたページとフォルダは、library に挙げる（ブックが対象・置き直しのアクションの分は挙げない）", () => {
  const rename = step("@matomezu/base:entry-rename", { entry: "b1", title: "別の名前" })
  const mixed = performBulk(world(), [place("一"), rename], CTX)
  if (!mixed.ok) throw new Error(mixed.reason)
  expect(Object.keys(mixed.changes?.pages ?? {})).toEqual(["p1"])
  // 前と後は、名前を変えたアクションの前と後（ページを足した分は入らない）
  expect(mixed.library?.pages).toEqual({})
  expect(Object.keys(mixed.library?.folders ?? {})).toEqual(["b1"])
  const sides = mixed.library?.folders.b1 as { before: { title: string }; after: { title: string } }
  expect(sides.after.title).toBe("別の名前")
  expect({ ...sides.after, title: sides.before.title }).toEqual(sides.before)
  // ブックが対象のアクションだけなら、持たない
  const inBook = performBulk(world(), [place("一")], CTX)
  expect(inBook.ok && inBook.library).toBeUndefined()
  // 置き直し（書庫が対象で、画面の履歴に入れない）の分も、挙げない
  const revert = step("@matomezu/base:library-revert", {
    pages: {},
    folders: { b1: { fields: { title: { set: "置き直した名前" } } } },
  })
  const reverted = performBulk(world(), [revert], CTX)
  if (!reverted.ok) throw new Error(reverted.reason)
  expect(Object.keys(reverted.changes?.folders ?? {})).toEqual(["b1"])
  expect(reverted.library).toBeUndefined()
})
