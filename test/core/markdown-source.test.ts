// ソースのペインで書いた原文の送り方（markdown の source-edit.ts）・スクロールの付いて行き方（scroll-sync.ts）・Tab キーで書く字（tab-key.ts）
import { expect, test } from "bun:test"
import { followScroll, sourcePieces } from "../../web/src/plugins/books/markdown/scroll-sync"
import {
  caretMoved,
  followCaret,
  PAUSED,
  planWrite,
  sourceEdit,
  WRITING_PAUSE_MS,
  wrote,
} from "../../web/src/plugins/books/markdown/source-edit"
import { tabKeyText } from "../../web/src/plugins/books/markdown/tab-key"

test("変わった所を、原文の中でちょうど 1 か所になるまで前後に広げた find と replace にする", () => {
  expect(sourceEdit("abc", "abXc", "abc")).toEqual({ kind: "send", fields: { find: "b", replace: "bX" } })
  expect(sourceEdit("a a a", "a ab a", "a a a")).toEqual({ kind: "send", fields: { find: " a ", replace: " ab " } })
  expect(sourceEdit("abc", "abc", "abc")).toEqual({ kind: "same" })
  expect(sourceEdit("abc", "", "abc")).toEqual({ kind: "send", fields: { find: "abc", replace: "" } })
})

test("空のページには丸ごと送る。ほかの変更で 1 か所にならなければ送れない", () => {
  expect(sourceEdit("", "# T", "")).toEqual({ kind: "send", fields: { text: "# T" } })
  expect(sourceEdit("", "# T", "AI")).toEqual({ kind: "conflict" })
  expect(sourceEdit("ab", "aXb", "zz")).toEqual({ kind: "conflict" })
})

test("ほかから変わった原文に送るときは、その原文の中で 1 か所になる所まで広げる", () => {
  // AI が前に x を足した原文へ、真ん中の b の後ろに書いた字を送る（「b」は 2 か所、「ba」は 1 か所）
  expect(sourceEdit("abab", "abXab", "xabab")).toEqual({ kind: "send", fields: { find: "ba", replace: "bXa" } })
})

test("サロゲートペアの途中で切らない", () => {
  // 😀（D83D DE00）を 😁（D83D DE01）に替える: 同じ上位の字で切らずに、字ごと送る
  expect(sourceEdit("a😀b", "a😁b", "a😀b")).toEqual({ kind: "send", fields: { find: "😀", replace: "😁" } })
  // 広げるときも字ごと
  expect(sourceEdit("😀x😀", "😀xy😀", "😀x😀")).toEqual({ kind: "send", fields: { find: "x", replace: "xy" } })
  expect(sourceEdit("😀😀", "😀😀😀", "😀😀")).toEqual({ kind: "send", fields: { find: "😀😀", replace: "😀😀😀" } })
})

test("ほかから原文が変わったときの書く所: 変わった所より前はそのまま、後ろは長さの差だけ、中は変わった所の終わり", () => {
  expect(followCaret("abcdef", "abXYcdef", 1)).toBe(1)
  expect(followCaret("abcdef", "abXYcdef", 4)).toBe(6)
  expect(followCaret("abcdef", "aZf", 3)).toBe(2)
  expect(followCaret("abc", "abc", 2)).toBe(2)
})

const marks = (end: number, ...blocks: [number, number][]) => ({ blocks: new Map(blocks), end })

test("スクロール: 同じブロックの上端どうしを合わせ、その間は割合で結ぶ", () => {
  const source = marks(1000, [0, 0], [10, 100], [20, 300])
  const rendered = marks(2000, [0, 0], [10, 400], [20, 500])
  expect(followScroll(source, rendered, 100)).toBe(400)
  expect(followScroll(source, rendered, 200)).toBe(450)
  expect(followScroll(source, rendered, 50)).toBe(200)
  // 最後のブロックから下は、両方のいちばん下までを結ぶ
  expect(followScroll(source, rendered, 1000)).toBe(2000)
  expect(followScroll(source, rendered, 650)).toBe(1250)
})

test("スクロール: 片方に無いブロック・いちばん下より先のブロック・上へ戻る組は使わない", () => {
  const source = marks(100, [5, 20], [9, 40], [12, 300])
  const rendered = marks(100, [9, 10], [12, 50])
  // 5 は描いた文書に無く、12 はソースのいちばん下より先なので、9 だけを組にする
  expect(followScroll(source, rendered, 40)).toBe(10)
  expect(followScroll(source, rendered, 70)).toBe(55)
  expect(followScroll(marks(100, [1, 50], [2, 60]), marks(100, [1, 50], [2, 20]), 60)).toBe(60)
})

test("ソースの原文をブロックの始まりで切る（最初は 0 から。原文の外の位置は使わない）", () => {
  expect(sourcePieces("ab\n\ncd", [0, 4])).toEqual([
    { start: 0, text: "ab\n\n" },
    { start: 4, text: "cd" },
  ])
  expect(sourcePieces("\nab", [1, 9])).toEqual([
    { start: 0, text: "\n" },
    { start: 1, text: "ab" },
  ])
})

test("Tab キーで書く字は、Tab 文字か、覚えている数の半角スペース（形に合わなければ Tab 文字）", () => {
  expect(tabKeyText({ writes: "tab", spaces: 2 })).toBe("\t")
  expect(tabKeyText({ writes: "spaces", spaces: 2 })).toBe("  ")
  expect(tabKeyText({ writes: "spaces", spaces: 4 })).toBe("    ")
  expect(tabKeyText("spaces-2")).toBe("\t")
  expect(tabKeyText(undefined)).toBe("\t")
})

test("続けて書いているのは、前に送ってから WRITING_PAUSE_MS より短く、書く所が送ったあとの所のままの間", () => {
  const w = wrote(1000, 3)
  expect(planWrite("ab", "abc", "ab", w, 1000 + WRITING_PAUSE_MS - 1)).toMatchObject({ kind: "send", continues: true })
  expect(planWrite("ab", "abc", "ab", w, 1000 + WRITING_PAUSE_MS)).toMatchObject({ kind: "send", continues: false })
  expect(planWrite("ab", "abc", "ab", PAUSED, 1000)).toMatchObject({ kind: "send", continues: false })
  expect(planWrite("ab", "ab", "ab", w, 1000)).toEqual({ kind: "same" })
  expect(caretMoved(w, 3, 3)).toBe(w)
  expect(caretMoved(w, 1, 1)).toEqual(PAUSED)
  expect(caretMoved(w, 3, 4)).toEqual(PAUSED)
})
