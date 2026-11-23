// 初期テンプレ: プロジェクトを作るときに入れる、名前・レーン・チケットタグ（名前とプロンプト）。文は、作るときの言語の文を文言の表から写す（動いている間に訳すことは無い）。
// 組は 1 つ。レーンは未着手・作業中（作業中の印つき）・完了（未分類の行は最後に、表示しないで置く）、チケットタグはタスク・バグ
import type { z } from "zod"
import { translate } from "../../../plugin-api"
import { kit } from "../kit"
import {
  CARD_SHOWS_DEFAULT,
  type CardShows,
  type CardSize,
  DONE_LANE_CARD_SIZE,
  INHERIT_CARD_SIZE,
  LANE_SHOWS_DEFAULT,
  type LANES,
  type LaneShows,
  type TAGS,
} from "./project"

type Say = (key: Parameters<typeof translate>[2]) => string

// 言語 lang の文を引く関数（ctx.catalog.messages と ctx.lang から）
export const sayIn =
  (messages: Parameters<typeof translate>[0], lang: Parameters<typeof translate>[1]): Say =>
  key =>
    translate(messages, lang, key)

export const projectNameOf = (say: Say): string => say(kit.message("template project name"))

// 新しいプロジェクトのレーンの並びとタグ。id は newId で振る
export function templateOf(
  say: Say,
  newId: () => string,
): {
  lanes: z.output<typeof LANES>
  tags: z.output<typeof TAGS>
  doneLane: string
  cardSize: CardSize
  cardShows: CardShows
  laneShows: LaneShows
} {
  const done = newId()
  return {
    lanes: [
      {
        kind: "lane",
        id: newId(),
        name: say(kit.message("template lane todo")),
        prompt: say(kit.message("template lane todo prompt")),
        cardSize: INHERIT_CARD_SIZE,
      },
      {
        kind: "lane",
        id: newId(),
        name: say(kit.message("template lane doing")),
        prompt: say(kit.message("template lane doing prompt")),
        cardSize: INHERIT_CARD_SIZE,
        working: true,
      },
      {
        kind: "lane",
        id: done,
        name: say(kit.message("template lane done")),
        prompt: say(kit.message("template lane done prompt")),
        cardSize: DONE_LANE_CARD_SIZE,
      },
      { kind: "unsorted", shown: false },
    ],
    tags: [
      {
        id: newId(),
        name: say(kit.message("template tag task")),
        color: "primary",
        enabled: true,
        prompt: say(kit.message("template tag task prompt")),
      },
      {
        id: newId(),
        name: say(kit.message("template tag bug")),
        color: "danger",
        enabled: true,
        prompt: say(kit.message("template tag bug prompt")),
      },
    ],
    doneLane: done,
    cardSize: "medium",
    cardShows: CARD_SHOWS_DEFAULT,
    laneShows: LANE_SHOWS_DEFAULT,
  }
}
