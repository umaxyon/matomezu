// 紙・向き・可変ページかの入力Form（ページを作るダイアログと、ページの設定のダイアログ）。選べる紙と向きはブックのタイプの規定で決まり（1 つしか無ければ選べない）、
// 可変ページかは、タイプが増やす向きの決め方を持つときだけ出す（利用者が向きを選ぶタイプなら、可変ページにすると増やす向きも選べる）。ページの設定では、変えた項目だけをアクション page-update に渡し、形が紙に入らなければ問題にする
import { useState } from "react"
import { type PagedBook, putPage } from "../../../core/book"
import type { GrowChoice, Orientation } from "../../../core/def/paper"
import type { Page } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { controlClass, Field, rowClass, Switch } from "../dialog-host/FormParts"
import { kit } from "../kit"
import type { PageProblem } from "./page-problems"
import { canGrow, defaultPaper, growChoices, paperChoices, paperChoicesFor, settledPage, withGrows } from "./pages"

// 向きの名前
const ORIENTATION_TITLES = { portrait: "Portrait", landscape: "Landscape" } as const satisfies Record<
  Orientation,
  string
>

// 増やす向きの名前
const GROW_TITLES = {
  "right-down": "Right and down",
  right: "Right only",
  down: "Down only",
  all: "All ways",
} as const satisfies Record<GrowChoice, string>

// 選んでいる紙・向き・可変ページか（ページの grows の値。可変ページでなければ undefined）
export interface PaperValue {
  paper: string
  orientation: Orientation
  grows: Page["grows"]
}

// page はページの設定なら変えるページ、ページを作るなら null（タイプの規定の既定から始める）
export function usePaperControls(book: PagedBook | undefined, page: Page | null) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const [value, setValue] = useState<PaperValue | null>(() => {
    if (!book) return null
    const from = page ?? defaultPaper(catalog, book)
    const choices = growChoices(catalog, book)
    const grows = page?.grows === true && choices[0] ? choices[0] : page?.grows
    return { paper: from.paper, orientation: from.orientation, grows }
  })
  if (!book || !value) return { controls: null, value: null, patch: {}, draft: (p: Page) => p, problems: [] }
  const { papers, orientations } = page ? paperChoicesFor(catalog, book, page.id) : paperChoices(catalog, book)
  const choices = growChoices(catalog, book)
  const chosen = value.grows === true ? undefined : value.grows // 選んでいる増やす向き
  // 変えた項目（ページを作るなら全部）
  const patch = {
    ...(!page || value.paper !== page.paper ? { paper: value.paper } : {}),
    ...(!page || value.orientation !== page.orientation ? { orientation: value.orientation } : {}),
    ...(!page || value.grows !== page.grows ? { grows: value.grows ?? false } : {}),
  }
  // 選んでいる紙を重ねたページ。増やす向きに合わせた中身のずらしと、形が紙に入るかは、アクションのあとの整えステップと同じ settledPage で見る
  const chosenPage = (p: Page): Page =>
    withGrows({ ...p, paper: value.paper, orientation: value.orientation }, value.grows)
  const settle = (p: Page): Page | null => {
    const next = chosenPage(p)
    return settledPage(catalog, book, putPage(book, next), next)
  }
  const draft = (p: Page): Page => settle(p) ?? chosenPage(p)
  const fits = !page || Object.keys(patch).length === 0 || settle(page) !== null
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
          <span>{t("Variable page")}</span>
          <Switch
            label={t("Variable page")}
            checked={value.grows !== undefined}
            onChange={on => setValue({ ...value, grows: on ? (choices[0] ?? true) : undefined })}
          />
        </div>
      )}
      {choices.length > 0 && chosen && (
        <Field label={t("Grow toward")}>
          {id => (
            <select
              id={id}
              className={controlClass}
              value={chosen}
              onChange={e => setValue({ ...value, grows: e.target.value as GrowChoice })}
            >
              {choices.map(c => (
                <option key={c} value={c}>
                  {t(GROW_TITLES[c])}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
    </>
  )
  return { controls, value, patch, draft, problems }
}
