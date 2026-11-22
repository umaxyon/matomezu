// バックヤードのテストの用意: tickets-history に、ワークルーム r1 自身のワーカーブック b1（ページ p1）を置いた世界と、行う文脈
import type { Actor } from "../web/src/core/actor"
import type { ActionContext } from "../web/src/core/def/action"
import { backyardIdOf, HOME_ID } from "../web/src/core/folders"
import type { World } from "../web/src/core/perform-world"
import { BUILTIN_CONTROL_CENTER } from "../web/src/plugins"
import { TICKETS_HISTORY } from "../web/src/plugins/base/library/backyards"
import { drawingPage, testBook } from "./lineup"
import { CORE_CATALOG, libraryWith, sequence } from "./support"

export const WORKROOM = "@matomezu/base:workroom"
export const roomKey = (id: string) => ({ subject: WORKROOM, id })
export const YARD = backyardIdOf(TICKETS_HISTORY.id)

export function yardWorld(): World {
  const library = libraryWith([testBook("b1", "r1", [drawingPage("p1")])])
  return {
    pages: library.pages,
    folders: {
      ...library.folders,
      [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [] },
      [YARD]: {
        folderRole: "backyard",
        id: YARD,
        backyard: TICKETS_HISTORY.id,
        lineup: [{ kind: "book", id: "b1", workKey: roomKey("r1") }],
      },
    },
    settings: {},
    annotations: {},
    records: {},
    counters: {},
  }
}

export const yardCtx = (actor: Actor, given: Partial<ActionContext> = {}): Omit<ActionContext, "naming"> => ({
  catalog: CORE_CATALOG,
  controlCenter: BUILTIN_CONTROL_CENTER,
  lang: "en",
  newId: sequence("w"),
  now: "2026-11-22T00:00:00.000Z",
  today: "2026-11-22",
  actor,
  ...given,
})
