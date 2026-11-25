// ボードで見る入り口（ワークルームの枠の［ボードで見る］・参加者の行の照準）の、押せるかと押したときの動き: コントロールセンターのコンテンツエリアを
// プロジェクトの画面にしてから（書庫・郵便箱の画面ではタスクボードが隠れているため）、ワークルームの鳥をチケットカードへ見に行かせる。
// 画面の替えはコントロールセンターのコードを読まず、画面の場所に入れる宣言 content-area の id と値で土台に頼む（同じ値なら何も起きない）
import { useRecords, useSetPluginState, useSetPluginStateById } from "../../../plugin-api/ui"
import { CONTENT_AREA_STATE, CONTROL_CENTER_SCREEN } from "../control-center-ids"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { CARD_VISIT } from "."
import { orderedProjects, shownProjects } from "./shown"
import { useBoardSettings } from "./useBoardSettings"
import { canVisit } from "./visit"

export interface BoardVisit {
  can: boolean
  visit: () => void
}

// ワークルーム workroom の鳥を、プロジェクト project のチケット ticket のチケットカードへ
export function useBoardVisit(workroom: string, ticket: string, project: string): BoardVisit {
  const projects = useRecords(PROJECT.id, { where: [] })
  const settings = useBoardSettings()
  const setVisit = useSetPluginState(kit, CARD_VISIT)
  const setPluginStateById = useSetPluginStateById()
  const shown = shownProjects(orderedProjects(projects, settings.order), settings.shown).map(p => p.id)
  return {
    can: canVisit(shown, project, settings.canChange),
    visit: () => {
      setPluginStateById(CONTENT_AREA_STATE, "projects", { screenDef: CONTROL_CENTER_SCREEN })
      setVisit({ seq: Date.now(), ticket, workroom, phase: "seeking" })
    },
  }
}
