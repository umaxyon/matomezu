// 文中のチケットの番号を見つける（ticket/refs.ts）: 今あるプロジェクトのプレフィクスと今ある番号だけ。大文字小文字・0 埋め・語の境目・今無い番号
import { expect, test } from "bun:test"
import { ticketRefFinder } from "../../../web/src/plugins/taskboard/ticket/refs"

const projects = [
  { id: "pm", prefix: "M-" },
  { id: "pt", prefix: "TT" },
]
const tickets = [
  { id: "m50", project: "pm", number: 50 },
  { id: "m7", project: "pm", number: 7 },
  { id: "t3", project: "pt", number: 3 },
]
const find = ticketRefFinder(projects, tickets)
const found = (text: string) => find(text).map(m => [text.slice(m.at, m.at + m.length), m.target])

test("今あるプレフィクスと今ある番号だけを見つけ、行き先はそのチケットの id。どのプロジェクトの物も 1 つに決まる", () => {
  expect(found("M-0050 の続きで TT3 も見る")).toEqual([
    ["M-0050", "m50"],
    ["TT3", "t3"],
  ])
})

test("プレフィクスの大文字小文字は分けず、0 埋めが無くても見つける", () => {
  expect(found("m-50 と M-7 と tt0003")).toEqual([
    ["m-50", "m50"],
    ["M-7", "m7"],
    ["tt0003", "t3"],
  ])
})

test("今無い番号・知らないプレフィクスは見つけない", () => {
  expect(found("M-0051 と X-0050 と M-")).toEqual([])
})

test("語の途中（前後が英数字）は見つけない。記号や空白、句読点のとなりは見つける", () => {
  expect(found("AM-0050 M-00500 M-0050x")).toEqual([])
  expect(found("(M-0050)、M-0007。")).toEqual([
    ["M-0050", "m50"],
    ["M-0007", "m7"],
  ])
})

test("プロジェクトが無ければ何も見つけない", () => {
  expect(ticketRefFinder([], tickets)("M-0050")).toEqual([])
})
