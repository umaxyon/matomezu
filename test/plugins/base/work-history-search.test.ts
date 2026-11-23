// 書庫の検索の作業履歴（base の library/work-history-search）: tickets-history の中の、作業のレコードの名前を引けるワーカーブックから、
// 作業のレコードの名前に言葉を含むブックと、名前に言葉を含む中のバインダ・ページを探す
import { expect, test } from "bun:test"
import type { CoreCatalog } from "../../../web/src/core/core-catalog"
import { HOME_ID, type Library } from "../../../web/src/core/folders"
import { readerOf, sourceOf } from "../../../web/src/core/record-source"
import type { Records } from "../../../web/src/core/records"
import { workHistoryFoundOf } from "../../../web/src/plugins/base/library/work-history-search"
import { workNameReadsOf } from "../../../web/src/plugins/base/participant/activity"
import { roomKey, YARD } from "../../backyard"
import { DRAWING, drawingPage, testBinder, testBook } from "../../lineup"
import { CORE_CATALOG, libraryWith, NAMING } from "../../support"

// 種類 t（作業のレコード）は、レコードの n を番号にして、プロジェクト（種類 p）のプレフィクスを付けて短く呼ぶ
const catalog = {
  ...CORE_CATALOG,
  subjects: new Map<string, unknown>([
    [
      "t",
      {
        id: "t",
        workNameReads: ["p"],
        workName: (r: { n: number; name: string }, read: { record(s: string, id: string): unknown }) => {
          const p = read.record("p", "p1") as { prefix: string }
          return { label: `${p.prefix}${String(r.n).padStart(4, "0")}`, name: r.name }
        },
      },
    ],
    ["p", { id: "p" }],
  ]),
} as unknown as CoreCatalog
const records = {
  t: {
    t9: { n: 9, name: "書庫の検索" },
    t12: { n: 12, name: "閉じる手" },
    t9999: { n: 9999, name: "桁の前" },
    t10000: { n: 10000, name: "桁の後" },
  },
  p: { p1: { prefix: "M-" } },
} as unknown as Records
const read = readerOf(catalog, sourceOf(records), workNameReadsOf(catalog))

// tickets-history に、t9 のブック b9（ページ「絵の案」と、バインダ「閉じる絵」の中のページ「動き」と、ページの無いバインダ「閉じる空き」）・
// t12 のブック b12（ページ「閉じる」）・ワークルーム r1 自身のブック br（ページ「閉じる」）・t10000 と t9999 のブックを、作った順に置いた書庫
function library(): Library {
  const base = libraryWith([
    testBook("b9", "M-0009", [
      drawingPage("p9", { title: "絵の案" }),
      testBinder("bd", "閉じる絵", DRAWING, drawingPage("pd", { title: "動き" })),
      testBinder("be", "閉じる空き", DRAWING),
    ]),
    testBook("b10000", "M-10000", [drawingPage("p10000")]),
    testBook("b9999", "M-9999", [drawingPage("p9999")]),
    testBook("b12", "M-0012", [drawingPage("p12", { title: "閉じる" })]),
    testBook("br", "r1", [drawingPage("pr", { title: "閉じる" })]),
  ])
  return {
    ...base,
    folders: {
      ...base.folders,
      [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [] },
      [YARD]: {
        folderRole: "backyard",
        id: YARD,
        backyard: "@matomezu/base:tickets-history",
        lineup: [
          { kind: "book", id: "b9", workKey: { subject: "t", id: "t9" } },
          { kind: "book", id: "br", workKey: roomKey("r1") },
          { kind: "book", id: "b12", workKey: { subject: "t", id: "t12" } },
          { kind: "book", id: "b10000", workKey: { subject: "t", id: "t10000" } },
          { kind: "book", id: "b9999", workKey: { subject: "t", id: "t9999" } },
        ],
      },
    },
  }
}
const found = (word: string) =>
  workHistoryFoundOf(catalog, read, library(), word, NAMING).map(f => [f.row.kind, f.row.id, f.work.label, f.opens.id])

test("作業のレコードの短く呼ぶ名前・名前に当たったブックの行と、名前に当たった中の物の行。番号の新しい順で、ワークルーム自身のブックは出ない", () => {
  // 「閉じる」は、t12 の名前と、t12 のページ、t9 のバインダに当たる（ワークルーム自身のブックのページは出ない）。
  // 開くのは、ブック・ページはその物、バインダは中の最初のページ（ページの無いバインダはそのバインダ）
  expect(found("閉じる")).toEqual([
    ["book", "b12", "M-0012", "b12"],
    ["page", "p12", "M-0012", "p12"],
    ["binder", "bd", "M-0009", "pd"],
    ["binder", "be", "M-0009", "be"],
  ])
  // 短く呼ぶ名前（プレフィクスの付いた番号）に当たる。バインダの中のページも出る
  expect(found("m-0009")).toEqual([["book", "b9", "M-0009", "b9"]])
  expect(found("動き")).toEqual([["page", "pd", "M-0009", "pd"]])
  // 番号は数として比べる（桁が増えても新しい順）
  expect(found("桁の")).toEqual([
    ["book", "b10000", "M-10000", "b10000"],
    ["book", "b9999", "M-9999", "b9999"],
  ])
  expect(found("")).toEqual([])
})
