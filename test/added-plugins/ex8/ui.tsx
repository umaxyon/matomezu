// ex8 の見た目を結ぶ: カードの見せ方のビュー（開いたページのカードを並べ、自分でスクロールする）と、印刷区画 1 つのビュー（ページのカードを紙に並べる）
import { type BookViewProps, definePluginUi, type PrintSheetProps, useMessages, usePage } from "matomezu/ui"
import { EX8 } from "."
import { CARDS } from "./deck"
import { kit } from "./kit"

// ページのフィールド cards（ページの型にはタイプのフィールドが無いので、在るかを確かめて読む）
const cardsOf = (page: object | null): readonly string[] =>
  page && "cards" in page && Array.isArray(page.cards) ? page.cards : []

function Cards({ cards }: { cards: readonly string[] }) {
  return (
    <ul style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: 0, padding: 24, listStyle: "none" }}>
      {cards.map((word, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 同じ言葉のカードもあり、並びの位置で区別する
        <li key={i} data-ex8-card style={{ border: "1px solid currentColor", borderRadius: 8, padding: "16px 24px" }}>
          {word}
        </li>
      ))}
    </ul>
  )
}

function CardsView({ stage }: BookViewProps) {
  const t = useMessages(kit)
  const cards = cardsOf(usePage(stage))
  return (
    <div data-ex8-deck style={{ height: "100%", overflow: "auto" }}>
      {cards.length > 0 ? <Cards cards={cards} /> : <p style={{ padding: 24 }}>{t("no cards")}</p>}
    </div>
  )
}

// 可変ページでないので、ページ 1 つが印刷区画 1 つ（column・row は 0）
function CardsSheet({ page }: PrintSheetProps) {
  return <Cards cards={cardsOf(page)} />
}

export const EX8_UI = definePluginUi(EX8, {
  presentationViews: { [CARDS.id]: { view: CardsView, printSheet: CardsSheet } },
})

export default EX8_UI
