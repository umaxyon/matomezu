// チケットサイズを選ぶボタンの並び: プロジェクトは L・M・S から 1 つ、レーンは左端の「継承」（プロジェクトのサイズに従う）と L・M・S から 1 つ
import { useMessages } from "../../../plugin-api/ui"
import { Choices, ChoiceText, InheritChoices, NO_CHOICE } from "../../base/ui"
import { kit } from "../kit"
import { CARD_SIZES, type CardSize, INHERIT_CARD_SIZE } from "../project"

const LETTERS: Record<CardSize, string> = { large: "L", medium: "M", small: "S" }
const TITLES = { large: "Card size large", medium: "Card size medium", small: "Card size small" } as const

function useOptions() {
  const t = useMessages(kit)
  return CARD_SIZES.map(size => ({
    value: size,
    label: t(TITLES[size]),
    icon: <ChoiceText>{LETTERS[size]}</ChoiceText>,
  }))
}

export function ProjectCardSizeChoices({ value, onChange }: { value: CardSize; onChange: (size: CardSize) => void }) {
  const t = useMessages(kit)
  return <Choices label={t("Ticket size")} value={value} options={useOptions()} onChange={onChange} />
}

export function LaneCardSizeChoices({
  value,
  onChange,
}: {
  value: CardSize | typeof INHERIT_CARD_SIZE
  onChange: (size: CardSize | typeof INHERIT_CARD_SIZE) => void
}) {
  const t = useMessages(kit)
  return (
    <InheritChoices
      label={t("Ticket size")}
      inherit={{ label: t("Inherit"), title: t("Follow the project's ticket size") }}
      value={value === INHERIT_CARD_SIZE ? NO_CHOICE : value}
      options={useOptions()}
      onChange={size => onChange(size === NO_CHOICE ? INHERIT_CARD_SIZE : size)}
    />
  )
}
