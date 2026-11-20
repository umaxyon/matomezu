// プロジェクト設定の一覧の行: 名前の重なり、入力Formを離れたときの片付け（空なら消す、重なれば新しい行は消し、もうある行は名前を戻す）、並べ替え、
// 行から作ったプロジェクトを直すアクションの引数（実際に行ってレコードを見る）、消したレーンのチケットが見えなくなるか

import { expect, test } from "bun:test"
import { PROJECT } from "../../../web/src/plugins/taskboard/project"
import {
  doneChoices,
  doneElsewhereOf,
  doneLaneBlocked,
  doneLaneOf,
  hidesTickets,
  type LaneRow,
  laneRowsOf,
  leaveRow,
  moveRow,
  repeatedKeys,
  sizedAsDone,
  type TagRow,
  tagRowsOf,
  updateArgsOf,
} from "../../../web/src/plugins/taskboard/project-settings/rows"
import { newStore } from "../../support"

type Project = Parameters<typeof laneRowsOf>[0]

function withProject() {
  const store = newStore()
  const perform = store.actions.perform as unknown as (
    id: string,
    args: unknown,
    on?: { record: string },
  ) => { ok: boolean }
  perform("@matomezu/taskboard:project-add", {})
  const project = () => Object.values(store.state.getState().records[PROJECT.id] ?? {})[0] as Project
  return { perform, project }
}

const lane = (key: string, name: string, was?: string): LaneRow => ({
  key,
  kind: "lane",
  name,
  prompt: "",
  cardSize: "inherit",
  working: false,
  ...(was === undefined ? {} : { id: key, was }),
})

test("名前の重なりは、前後の空白を除いて比べ、空の名前と未分類の行は数えない", () => {
  const rows: LaneRow[] = [
    lane("a", "x"),
    lane("b", " x "),
    lane("c", ""),
    lane("d", ""),
    { key: "u", kind: "unsorted", shown: true },
  ]
  expect([...repeatedKeys(rows)]).toEqual(["a", "b"])
})

test("入力Formを離れたとき: 空なら消す。重なれば、新しい行は消し、もうある行は開いたときの名前に戻す", () => {
  const rows = [lane("a", "x", "x"), lane("b", "x", "y"), lane("n", "x"), lane("e", "")]
  expect(leaveRow(rows, "e").map(r => r.key)).toEqual(["a", "b", "n"])
  expect(leaveRow(rows, "n").map(r => r.key)).toEqual(["a", "b", "e"])
  const back = leaveRow(rows, "b").find(r => r.key === "b")
  expect(back?.kind === "lane" && back.name).toBe("y")
  expect(leaveRow([lane("a", "x", "x"), lane("b", "z", "y")], "b")).toEqual([lane("a", "x", "x"), lane("b", "z", "y")])
})

test("並べ替えは、未分類の行も入れて動かす", () => {
  const rows: LaneRow[] = [lane("a", "a"), { key: "u", kind: "unsorted", shown: true }, lane("b", "b")]
  expect(moveRow(rows, "b", "a").map(r => r.key)).toEqual(["b", "a", "u"])
  expect(moveRow(rows, "u", "b").map(r => r.key)).toEqual(["a", "b", "u"])
})

test("行から作った引数でプロジェクトを直すと、残した行は id のまま、新しい行は新しい id で入り、消した行は無くなる", () => {
  const { perform, project } = withProject()
  const p = project()
  const lanes = laneRowsOf(p)
  const [first] = lanes
  const tags: TagRow[] = [
    ...tagRowsOf(p).slice(0, 1),
    { key: "new-1", name: " 調べ物 ", color: "success", enabled: true, prompt: "調べる" },
  ]
  const nextLanes: LaneRow[] = [...lanes.slice(0, 1), lane("new-2", "見直し"), lane("new-3", "  "), ...lanes.slice(-1)]
  const done = perform(
    "@matomezu/taskboard:project-update",
    updateArgsOf(" 新しい名前 ", "AB-", nextLanes, tags, "none", "large", { priority: false, volume: true }),
    {
      record: p.id,
    },
  )
  expect(done.ok).toBe(true)
  const q = project()
  expect(q.name).toBe("新しい名前")
  expect(q.cardSize).toBe("large")
  expect(q.cardShows).toEqual({ priority: false, volume: true })
  expect(q.lanes.map(l => (l.kind === "lane" ? l.name : l.kind))).toEqual([
    first?.kind === "lane" ? first.name : "",
    "見直し",
    "unsorted",
  ])
  expect(q.lanes.some(l => l.kind === "lane" && l.id.startsWith("new-"))).toBe(false)
  expect(q.tags.map(t => t.name)).toEqual([p.tags[0]?.name ?? "", "調べ物"])
  expect(q.tags.some(t => t.id.startsWith("new-"))).toBe(false)
})

test("チケットの入ったレーンを消すと、未分類を表示しないときだけ、チケットが見えなくなる", () => {
  const { project } = withProject()
  const p = project()
  const rows = laneRowsOf(p)
  const gone = rows.find(r => r.kind === "lane")
  const tickets = [{ project: p.id, lane: gone?.kind === "lane" ? (gone.id ?? "") : "" }]
  const without = rows.filter(r => r !== gone)
  const shown = (on: boolean) => without.map(r => (r.kind === "unsorted" ? { ...r, shown: on } : r))
  expect(hidesTickets(p, shown(false), tickets)).toBe(true)
  expect(hidesTickets(p, shown(true), tickets)).toBe(false)
  expect(hidesTickets(p, rows, tickets)).toBe(false)
  expect(hidesTickets(p, shown(false), [])).toBe(false)
})

test("完了のレーンは、名前のあるレーンの行から選ぶ。選んだ行の id（新しい行は名前）で指し、行が無ければ none。担当のいるチケットがあるレーンを新しく選ぶと保存できない", () => {
  const { project: current } = withProject()
  const project = current()
  const lanes = laneRowsOf(project)
  const first = lanes.find(l => l.kind === "lane") as Extract<LaneRow, { kind: "lane" }>
  const added: LaneRow[] = [...lanes, lane("new-1", "  見直し ")]
  expect(doneChoices(added).map(l => l.key)).toEqual([...lanes.filter(l => l.kind === "lane").map(l => l.key), "new-1"])
  expect(doneLaneOf(added, first.key)).toBe(first.id as string)
  expect(doneLaneOf(added, "new-1")).toBe("見直し")
  expect(doneLaneOf(added, "gone")).toBe("none")
  expect(doneLaneOf(added, "unsorted")).toBe("none")
  const tickets = [{ project: project.id, lane: first.id as string, assignees: ["r1"] }]
  expect(doneLaneBlocked(project, added, first.key, tickets)).toBe(true)
  expect(doneLaneBlocked(project, added, "new-1", tickets)).toBe(false)
  expect(doneLaneBlocked(project, added, first.key, [{ ...tickets[0]!, assignees: [] }])).toBe(false)
  expect(doneLaneBlocked({ ...project, doneLane: first.id as string }, added, first.key, tickets)).toBe(false)
})

test("行を完了のレーンにしようとしたとき、ほかの行が完了のレーンなら、その行の今の名前を返す（無いか自分なら null）", () => {
  const { project: current } = withProject()
  const lanes = laneRowsOf(current())
  const added: LaneRow[] = [...lanes, lane("new-1", "  見直し ")]
  const first = added.find(l => l.kind === "lane") as Extract<LaneRow, { kind: "lane" }>
  expect(doneElsewhereOf(added, "none", "new-1")).toBeNull()
  expect(doneElsewhereOf(added, "new-1", "new-1")).toBeNull()
  expect(doneElsewhereOf(added, "new-1", first.key)).toBe("見直し")
  expect(doneElsewhereOf(added, "unsorted", first.key)).toBeNull()
})

test("行を完了のレーンにすると、その行のチケットサイズだけを small にする", () => {
  const rows: LaneRow[] = [lane("a", "A"), lane("b", "B"), { key: "unsorted", kind: "unsorted", shown: false }]
  const sized = sizedAsDone(rows, "b")
  expect(sized.map(r => (r.kind === "lane" ? r.cardSize : r.kind))).toEqual(["inherit", "small", "unsorted"])
  expect(sizedAsDone(rows, "unsorted")).toEqual(rows)
})
