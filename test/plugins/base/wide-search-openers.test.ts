// 横断検索の開き方は、forKind（種類の持ち主だけが書ける。台帳アセンブルが E312 で確かめる）でだけ引く

import { expect, test } from "bun:test"
import { openerOf } from "../../../web/src/plugins/base/wide-search/openers"

const marker = (name: string) => ({ useOpen: () => () => {}, name })
const widgets = new Map<string, unknown>([
  ["@x/a:forged", { id: "@x/a:forged", wideSearchOpener: marker("forged") }], // forKind を書かずに名乗った物
  ["@x/a:first", { id: "@x/a:first", forKind: "@y/b:ticket", wideSearchOpener: marker("first") }],
  ["@x/a:second", { id: "@x/a:second", forKind: "@y/b:ticket", wideSearchOpener: marker("second") }],
])

test("forKind を書かずに wideSearchOpener だけ書いたウィジェットは、どの種類の開き方としても引かれない", () => {
  const found = (kind: string) => openerOf(["@x/a:forged"], widgets as never, kind)
  expect(found("@y/b:ticket")).toBeUndefined()
  expect(found("@x/a:forged")).toBeUndefined()
})

test("同じ種類に forKind を書いた物が 2 つあれば、並びの先の物を引く", () => {
  const opener = openerOf(["@x/a:forged", "@x/a:first", "@x/a:second"], widgets as never, "@y/b:ticket")
  expect((opener as unknown as { name: string }).name).toBe("first")
})
