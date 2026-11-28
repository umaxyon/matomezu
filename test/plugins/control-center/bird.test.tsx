// ワークルームの鳥（control-center/Bird.tsx）: 参加済みで生きていない参加者の鳥は眠っている形（目を閉じ、zz の吹き出し）。準備中と、生きている参加者は眠らない
import { afterEach, expect, setSystemTime, test } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import {
  NO_AI_UI,
  NO_BRANCH,
  NO_CONTEXT_USE,
  NO_MODEL,
  NO_OCCUPANT,
  NOT_CALLED,
  NOT_REQUESTED,
  type WorkroomRow,
} from "../../../web/src/plugins/base"
import { CONTROL_CENTER } from "../../../web/src/plugins/control-center"
import { Bird } from "../../../web/src/plugins/control-center/Bird"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"

afterEach(() => {
  cleanup()
  setSystemTime()
})

const NOW = "2026-11-25T12:00:00.000Z"
const row = (over: Partial<WorkroomRow>): WorkroomRow => ({
  room: { id: "r", name: "r", bird: "inko", createdAt: "t" },
  state: "ready",
  admin: false,
  participant: NO_OCCUPANT,
  model: NO_MODEL,
  branch: NO_BRANCH,
  aiUi: NO_AI_UI,
  calledAt: NOT_CALLED,
  wake: "none",
  requestedAt: NOT_REQUESTED,
  activity: "unknown",
  contextUse: NO_CONTEXT_USE,
  refreshable: false,
  ...over,
})

// 鳥を描き、眠っているか（data-asleep と zz の吹き出し）
function asleep(r: WorkroomRow): { marked: string | null; zzz: boolean } {
  const store = createMatomezu({ controlCenter: CONTROL_CENTER.id, books: [], lang: "ja", plugins: BUILTIN_UI })
  const { container } = render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Bird row={r} />
    </MatomezuProvider>,
  )
  const wrap = container.querySelector("[data-asleep]")
  return { marked: wrap?.getAttribute("data-asleep") ?? null, zzz: (wrap?.textContent ?? "").includes("zz") }
}

test("参加済みで、呼ばれてから参加の有効時間を過ぎ、起こす知らせを渡せる matomezu watch も無ければ眠っている", () => {
  setSystemTime(new Date(NOW))
  expect(asleep(row({ calledAt: "2026-11-25T10:00:00.000Z" }))).toEqual({ marked: "true", zzz: true })
  expect(asleep(row({}))).toEqual({ marked: "true", zzz: true })
})

test("最近呼ばれた・matomezu watch がつながっている・準備中の鳥は眠らない", () => {
  setSystemTime(new Date(NOW))
  expect(asleep(row({ calledAt: "2026-11-25T11:50:00.000Z" }))).toEqual({ marked: "false", zzz: false })
  expect(asleep(row({ calledAt: "2026-11-25T10:00:00.000Z", wake: "reaches" }))).toEqual({
    marked: "false",
    zzz: false,
  })
  expect(asleep(row({ state: "preparing" }))).toEqual({ marked: "false", zzz: false })
})
