// ゴミ箱から戻す先の選び
import { expect, test } from "bun:test"
import { type Folders, HOME_ID, type PlainFolder, TRASH_ID } from "../../../web/src/core/folders"
import { restoreTargetOf } from "../../../web/src/plugins/base/library/entries"

const NOW = "2026-10-29T01:00:00.000Z"

test("戻す先は、元いたフォルダ。無ければ・ゴミ箱の中ならその上のフォルダをたどり、どれも無ければ書庫ホーム", () => {
  const folder = (id: string, ...lineup: string[]): PlainFolder => ({
    folderRole: "folder",
    id,
    title: id,
    lineup: lineup.map(l => ({ kind: "folder", id: l })),
  })
  // 書庫ホーム > a > c、ゴミ箱 > d
  const folders: Folders = {
    [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [{ kind: "folder", id: "a" }] },
    a: folder("a", "c"),
    c: folder("c"),
    d: folder("d"),
    [TRASH_ID]: {
      folderRole: "trash",
      id: TRASH_ID,
      lineup: [{ kind: "folder", id: "d", trashed: NOW, from: ["a", HOME_ID] }],
    },
  }
  expect(restoreTargetOf(folders, ["c", "a", HOME_ID])).toBe("c")
  expect(restoreTargetOf(folders, ["gone", "c", "a", HOME_ID])).toBe("c")
  expect(restoreTargetOf(folders, ["d", "a", HOME_ID])).toBe("a")
  expect(restoreTargetOf(folders, [TRASH_ID, "gone"])).toBe(HOME_ID)
  expect(restoreTargetOf(folders, [])).toBe(HOME_ID)
})
