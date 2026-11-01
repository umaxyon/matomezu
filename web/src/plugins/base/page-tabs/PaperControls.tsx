// 紙・向き・伸びるかの入力Form（ページを作るダイアログと、ページの設定のダイアログ）。選べる紙と向きはブックのタイプの規定で決まり（1 つしか無ければ選べない）、
// 伸びるかは、タイプが伸びられる向きを宣言したときだけ出す。ページの設定では、変えた項目だけをアクション page-update に渡し、形が紙に入らなければ問題にする
import { useState } from "react"
import { type PagedBook, putPage } from "../../../core/book"
import type { Orientation } from "../../../core/def/paper"
import type { Page } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { controlClass, Field, rowClass, Switch } from "../dialog-host/FormParts"
import { kit } from "../kit"
import type { PageProblem } from "./page-problems"
import { canGrow, defaultPaper, paperChoices, paperChoicesFor, shapesFit } from "./pages"

// 向きの名前
const ORIENTATION_TITLES = { portrait: "Portrait", landscape: "Landscape" } as const satisfies Record<
  Orientation,
  string
>

// 選んでいる紙・向き・伸びるか
export interface PaperValue {
  paper: string
  orientation: Orientation
  grows: boolean
}

// page はページの設定なら変えるページ、ページを作るなら null（タイプの規定の既定から始める）
export function usePaperControls(book: PagedBook | undefined, page: Page | null) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const [value, setValue] = useState<PaperValue | null>(() => {
    if (!book) return null
    const from = page ?? defaultPaper(catalog, book)
    return { paper: from.paper, orientation: from.orientation, grows: page?.grows === true }
  })
  if (!book || !value) return { controls: null, value: null, patch: {}, draft: (p: Page) => p, problems: [] }
  const { papers, orientations } = page ? paperChoicesFor(catalog, book, page.id) : paperChoices(catalog, book)
  // 変えた項目（ページを作るなら全部）
  const patch = {
    ...(!page || value.paper !== page.paper ? { paper: value.paper } : {}),
    ...(!page || value.orientation !== page.orientation ? { orientation: value.orientation } : {}),
    ...(!page || value.grows !== (page.grows === true) ? { grows: value.grows } : {}),
  }
  // 選んでいる紙を重ねたページ
  const draft = (p: Page): Page => {
    const { grows: _, ...rest } = p
    return { ...rest, paper: value.paper, orientation: value.orientation, ...(value.grows ? { grows: true } : {}) }
  }
  const fits = !page || Object.keys(patch).length === 0 || shapesFit(catalog, putPage(book, draft(page)), page.id)
  const problems: { page: Page; problem: PageProblem }[] =
    page && !fits ? [{ page, problem: { message: kit.message("The shapes do not fit on the paper") } }] : []
  const controls = (
    <>
      <Field label={t("Paper size")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={value.paper}
            disabled={papers.length < 2}
            onChange={e => setValue({ ...value, paper: e.target.value })}
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
            value={value.orientation}
            disabled={orientations.length < 2}
            onChange={e => setValue({ ...value, orientation: e.target.value as Orientation })}
          >
            {orientations.map(o => (
              <option key={o} value={o}>
                {t(ORIENTATION_TITLES[o])}
              </option>
            ))}
          </select>
        )}
      </Field>
      {canGrow(catalog, book) && (
        <div className={rowClass}>
          <span>{t("Grow the page")}</span>
          <Switch label={t("Grow the page")} checked={value.grows} onChange={grows => setValue({ ...value, grows })} />
        </div>
      )}
    </>
  )
  return { controls, value, patch, draft, problems }
}
