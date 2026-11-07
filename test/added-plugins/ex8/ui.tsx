// ex8 の見た目を結ぶ: カードの見せ方のビュー（開いたページのカードを並べ、自分でスクロールする。並べ替えるボタンと、押したカードを選ぶ）と、
// 印刷区画 1 つのビュー（ページのカードを紙に並べる）
import {
  type BookViewProps,
  definePluginUi,
  type PrintSheetProps,
  useMessages,
  usePage,
  useSetStageState,
  useStageState,
} from "matomezu/ui"
import { EX8 } from "."
import { CARDS, deckViewOf } from "./deck"
import { kit } from "./kit"
import styles from "./views.module.css"

// ページのフィールド cards（ページの型にはタイプのフィールドが無いので、在るかを確かめて読む）
const cardsOf = (page: object | null): readonly string[] =>
  page && "cards" in page && Array.isArray(page.cards) ? page.cards : []

function Cards({
  cards,
  picked = "none",
  onPick,
}: {
  cards: readonly string[]
  picked?: number | "none"
  onPick?: (i: number) => void
}) {
  return (
    <ul className={styles.cards}>
      {cards.map((word, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 同じ言葉のカードもあり、並びの位置で区別する
        <li key={i} className={styles.card} data-ex8-card data-picked={picked === i} onPointerDown={() => onPick?.(i)}>
          {word}
        </li>
      ))}
    </ul>
  )
}

function CardsView({ stage }: BookViewProps) {
  const t = useMessages(kit)
  const written = cardsOf(usePage(stage))
  const view = deckViewOf(useStageState(stage, kit))
  const setView = useSetStageState(kit)
  const cards = view.order === "sorted" ? [...written].sort() : written
  return (
    <div className={styles.deck} data-ex8-deck>
      <button
        type="button"
        aria-pressed={view.order === "sorted"}
        onClick={() => setView(stage, { ...view, order: view.order === "sorted" ? "written" : "sorted" })}
      >
        {t("sort cards")}
      </button>
      {cards.length > 0 ? (
        <Cards cards={cards} picked={view.picked} onPick={i => setView(stage, { ...view, picked: i })} />
      ) : (
        <p className={styles.empty}>{t("no cards")}</p>
      )}
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
