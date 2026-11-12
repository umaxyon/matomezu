// ex11: 自分の列挙を宣言し、ほかのプラグイン（タスクボード）が宣言した列挙にも値を足す追加プラグイン。タスクボードのチケット履歴の題に「レビュー」を足し、チケットの履歴にその題で書けるようにする
import { definePlugin, z } from "matomezu"
import { kit } from "./kit"

// 自分の列挙（宣言）と、その値を足す
export const LEVEL = kit.defineEnum({
  id: "level",
  title: "level",
  aiDescription: "Levels of a review.",
  value: z.strictObject({ weight: z.number() }),
})
export const LEVEL_LOW = kit.defineEnumValue({
  id: "level-low",
  enum: LEVEL.id,
  title: "low",
  aiDescription: "A light review.",
  data: { weight: 1 },
})

// ほかのプラグインの列挙に値を足す
export const TOPIC_REVIEW = kit.defineEnumValue({
  id: "topic-review",
  enum: "@matomezu/taskboard:history-topic",
  title: "review",
  aiDescription: "The result of reviewing the work of a ticket.",
  data: { color: "secondary" },
})

export const EX11 = definePlugin(kit.plugin({ enums: [LEVEL], enumValues: [LEVEL_LOW, TOPIC_REVIEW] }))

export default EX11

declare module "matomezu/catalog" {
  interface EnumTable {
    "ex11:level": typeof LEVEL
  }
  interface EnumValueTable {
    "ex11:level-low": typeof LEVEL_LOW
    "ex11:topic-review": typeof TOPIC_REVIEW
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
