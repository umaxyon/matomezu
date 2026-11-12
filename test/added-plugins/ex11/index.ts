// ex11: ほかのプラグイン（タスクボード）が宣言した列挙に、値を足す追加プラグイン。タスクボードのチケット履歴の題に「レビュー」を足し、チケットの履歴にその題で書けるようにする
import { definePlugin } from "matomezu"
import { kit } from "./kit"

export const TOPIC_REVIEW = kit.defineEnumValue({
  id: "topic-review",
  enum: "@matomezu/taskboard:history-topic",
  title: "review",
  aiDescription: "The result of reviewing the work of a ticket.",
  data: { color: "secondary" },
})

export const EX11 = definePlugin(kit.plugin({ enumValues: [TOPIC_REVIEW] }))

export default EX11

declare module "matomezu/catalog" {
  interface EnumValueTable {
    "ex11:topic-review": typeof TOPIC_REVIEW
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
