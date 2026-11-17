// 同じ名前: 書庫ホームとフォルダの直下では、名前を重ねない（ゴミ箱の直下は許す）。作る・名前を変える・戻すで重なれば、断りの種類 title-taken で断る
import { expect, test } from "bun:test"
import { TITLE_TAKEN } from "../../web/src/core/entries"
import { TRASH_ID } from "../../web/src/core/folders"
import { newStore } from "../support"

const CREATE = "@matomezu/base:book-create"
const taken = { ok: false, reason: "refused", kind: TITLE_TAKEN }

function ready() {
  const store = newStore()
  const made = store.actions.perform(CREATE, { title: "同じ" })
  if (!made.ok) throw new Error(made.reason)
  return { ...store, first: made.result.book }
}

test("同じフォルダに同じ名前のブックは作れず、名前も変えられない。断りの種類は title-taken", () => {
  const { state, actions, first } = ready()
  const count = Object.keys(state.getState().books).length
  expect(actions.perform(CREATE, { title: "同じ" })).toMatchObject(taken)
  expect(Object.keys(state.getState().books)).toHaveLength(count)
  const other = actions.perform(CREATE, { title: "別" })
  if (!other.ok) throw new Error(other.reason)
  expect(actions.perform("@matomezu/base:book-update", { title: "同じ" }, { book: other.result.book })).toMatchObject(
    taken,
  )
  expect(state.getState().books[other.result.book]?.title).toBe("別")
  // 自分の名前のまま書き直すのは、重なりでない
  expect(actions.perform("@matomezu/base:book-update", { title: "同じ" }, { book: first }).ok).toBe(true)
})

test("ゴミ箱の直下は同じ名前を許す。戻す先に同じ名前の物が出来ていれば、戻せない", () => {
  const { state, actions, first } = ready()
  expect(actions.perform("@matomezu/base:book-trash", { book: first }).ok).toBe(true)
  const again = actions.perform(CREATE, { title: "同じ" })
  if (!again.ok) throw new Error(again.reason)
  expect(actions.perform("@matomezu/base:book-trash", { book: again.result.book }).ok).toBe(true)
  expect(state.getState().folders[TRASH_ID]?.lineup.map(r => r.id)).toEqual([first, again.result.book])
  expect(actions.perform("@matomezu/base:book-restore", { book: first }).ok).toBe(true)
  expect(actions.perform("@matomezu/base:book-restore", { book: again.result.book })).toMatchObject(taken)
  expect(again.result.book in state.getState().trash).toBe(true)
})
