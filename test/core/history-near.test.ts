// 書庫の変更の、近くのフォルダ（core の foldersNear）: このどれかを書庫の画面が見せていれば、その変更は見えたとする
import { expect, test } from "bun:test"
import { HOME_ID } from "../../web/src/core/folders"
import { foldersNear } from "../../web/src/core/history"
import { newStore, sequence } from "../support"

const settled = () => Promise.resolve()
const RENAME = "@matomezu/base:entry-rename"

test("近くのフォルダ: 並びの変わったフォルダはそのフォルダ、名前の変わった物・足した物は入れ物のフォルダ（中身の変化は、入れ物の上のフォルダでは見えない）", async () => {
  const there = newStore({ newId: sequence() })
  const folders = () => there.state.getState().folders
  const made = there.actions.perform("@matomezu/base:folder-create", { title: "箱" })
  await settled()
  const box = (made as { result: { folder: string } }).result.folder
  const rowsBetween = (was: ReturnType<typeof folders>, now: ReturnType<typeof folders>) => ({
    pages: {},
    folders: Object.fromEntries(
      [...new Set([...Object.keys(was), ...Object.keys(now)])]
        .filter(id => was[id] !== now[id])
        .map(id => [id, { before: was[id] ?? ("none" as const), after: now[id] ?? ("none" as const) }]),
    ),
  })
  // ブックを箱へ動かす: 出た所（書庫ホーム）と入った所（箱）
  let was = folders()
  there.actions.perform("@matomezu/base:entry-move", { entry: "b1", into: box })
  await settled()
  expect(foldersNear(rowsBetween(was, folders()), was, folders()).sort()).toEqual([box, HOME_ID].sort())
  // 箱の中のブックの名前を変える: 箱だけ（書庫ホームでは見えない）
  was = folders()
  there.actions.perform(RENAME, { entry: "b1", title: "箱の中の名前" })
  await settled()
  expect(foldersNear(rowsBetween(was, folders()), was, folders())).toEqual([box])
  // 箱の名前を変える: 箱を入れている書庫ホーム
  was = folders()
  there.actions.perform(RENAME, { entry: box, title: "別の箱" })
  await settled()
  expect(foldersNear(rowsBetween(was, folders()), was, folders())).toEqual([HOME_ID])
})
