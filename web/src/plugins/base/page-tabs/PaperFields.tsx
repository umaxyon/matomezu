// 紙のサイズと向きを選ぶ 2 つの入力Form（ページの設定・新しいページ・バインダの設定のダイアログで使う）。
// 選べる紙 papers と向き orientations の中から選ぶ。選べる物が 1 つだけか、locked なら押せない
import type { Orientation } from "../../../core/def/paper"
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { controlClass, Field } from "../dialog-host/FormParts"
import { kit } from "../kit"

// 向きの名前
const ORIENTATION_TITLES = { portrait: "Portrait", landscape: "Landscape" } as const satisfies Record<
  Orientation,
  string
>

interface Props {
  papers: readonly string[]
  orientations: readonly Orientation[]
  paper: string
  orientation: Orientation
  locked?: boolean
  onPaper: (paper: string) => void
  onOrientation: (orientation: Orientation) => void
}

export function PaperFields({
  papers,
  orientations,
  paper,
  orientation,
  locked = false,
  onPaper,
  onOrientation,
}: Props) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  return (
    <>
      <Field label={t("Paper size")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={paper}
            disabled={locked || papers.length < 2}
            onChange={e => onPaper(e.target.value)}
          >
            {papers.map(p => {
              const def = catalog.papers.get(p)
              return (
                <option key={p} value={p}>
                  {def ? t(def.title) : t("Unknown paper")}
                </option>
              )
            })}
          </select>
        )}
      </Field>
      <Field label={t("Orientation")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={orientation}
            disabled={locked || orientations.length < 2}
            onChange={e => onOrientation(orientations.find(o => o === e.target.value) ?? orientation)}
          >
            {orientations.map(o => (
              <option key={o} value={o}>
                {t(ORIENTATION_TITLES[o])}
              </option>
            ))}
          </select>
        )}
      </Field>
    </>
  )
}
