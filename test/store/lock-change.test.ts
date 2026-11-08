// 設定のダイアログの確定でロックを切り替えながら変える（base/utils/lock.ts の changeWithLock）: 外すなら先に外し、変更が断られたら掛け直す。掛けるなら変更のあとに掛ける

import { expect, test } from "bun:test"
import { changeWithLock } from "../../web/src/plugins/base/utils/lock"

function run(was: boolean, want: boolean, over: { unlock?: boolean; change?: boolean } = {}) {
  const calls: string[] = []
  const done = changeWithLock(
    was,
    want,
    () => (calls.push("lock"), true),
    () => (calls.push("unlock"), over.unlock ?? true),
    () => (calls.push("change"), over.change ?? true),
  )
  return { done, calls }
}

test("ロックを外すなら先に外してから変え、掛けるなら変えてから掛ける。ロックの扱いが変わらなければ変えるだけ", () => {
  expect(run(true, false)).toEqual({ done: true, calls: ["unlock", "change"] })
  expect(run(false, true)).toEqual({ done: true, calls: ["change", "lock"] })
  expect(run(true, true)).toEqual({ done: true, calls: ["change"] })
  expect(run(false, false)).toEqual({ done: true, calls: ["change"] })
})

test("ロックが外せなければ何も変えず、外したあとに変更が断られたら掛け直す。掛ける前の変更が断られたら掛けない", () => {
  expect(run(true, false, { unlock: false })).toEqual({ done: false, calls: ["unlock"] })
  expect(run(true, false, { change: false })).toEqual({ done: false, calls: ["unlock", "change", "lock"] })
  expect(run(false, true, { change: false })).toEqual({ done: false, calls: ["change"] })
  expect(run(true, true, { change: false })).toEqual({ done: false, calls: ["change"] })
})
