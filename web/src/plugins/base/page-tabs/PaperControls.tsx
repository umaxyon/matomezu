// 紙・向き・可変ページかの入力Form（ページを作るダイアログ usePaperControls と、ページの設定のダイアログ usePagePaperControls）。選べる紙と向きはページのタイプの規定で決まり（1 つしか無ければ選べない）、
// バインダに入るタイプ（スライド）は、そろえる相手のいる所（ページの設定と、今あるバインダに足すページ）では紙と向きを出さない（バインダの設定でまとめて変える）。
// 可変ページかは、タイプが増やす向きの決め方を持つときだけ出す（利用者が向きを選ぶタイプなら、可変ページにすると増やす向きも選べる）。ページの設定では、変えた項目だけをアクション page-update に渡し、形が紙に入らなければ問題にする

import { useState } from "react"
import { pageType } from "../../../core/core-catalog"
import type { GrowChoice, Orientation } from "../../../core/def/paper"
import type { Page, StageLineup } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { useBook } from "../../../ui/view-hooks"
import { controlClass, Field, rowClass, Switch } from "../dialog-host/FormParts"
import { kit } from "../kit"
import type { PageProblem } from "../pages/page-problems"
import {
  defaultPaper,
  normalizedPage,
  type PaperOptions,
  type PaperPlace,
  paperChoices,
  paperChoicesFor,
  typePaperChoices,
} from "../pages/pages"
import { canGrow, growChoices, withGrows } from "../place/grow"
import { PaperFields } from "./PaperFields"

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

// 選んでいる紙の入力Form と、変えた項目。page は変えるページ（ページを作るなら null）、options は選べる紙と向き
function usePaperForm(
  type: string | undefined,
  page: Page | null,
  start: () => PaperValue | null,
  options: PaperOptions | null,
  shared: boolean, // 紙と向きを、そろえる相手に任せるか
) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const [value, setValue] = useState<PaperValue | null>(start)
  if (!value || !options || type === undefined)
    return { controls: null, value: null, patch: {}, draft: (p: Page) => p, problems: [] }
  const { papers, orientations } = options
  const choices = growChoices(catalog, type)
  const chosen = value.grows === true ? undefined : value.grows // 選んでいる増やす向き
  // 変えた項目（ページを作るなら全部）
  const patch = {
    ...(!page || value.paper !== page.paper ? { paper: value.paper } : {}),
    ...(!page || value.orientation !== page.orientation ? { orientation: value.orientation } : {}),
    ...(!page || value.grows !== page.grows ? { grows: value.grows ?? false } : {}),
  }
  // 選んでいる紙を重ねたページ。増やす向きに合わせた中身のずらしと、形が紙に入るかは、アクションのあとのノーマライズステップと同じ normalizedPage で見る
  const chosenPage = (p: Page): Page =>
    withGrows({ ...p, paper: value.paper, orientation: value.orientation }, value.grows)
  const settle = (p: Page): Page | null => {
    const next = chosenPage(p)
    return normalizedPage(catalog, page ?? undefined, next)
  }
  const draft = (p: Page): Page => settle(p) ?? chosenPage(p)
  const fits = !page || Object.keys(patch).length === 0 || settle(page) !== null
  const problems: { page: Page; problem: PageProblem }[] =
    page && !fits ? [{ page, problem: { message: kit.message("The shapes do not fit on the paper") } }] : []
  const controls = (
    <>
      {!shared && (
        <PaperFields
          papers={papers}
          orientations={orientations}
          paper={value.paper}
          orientation={value.orientation}
          onPaper={paper => setValue({ ...value, paper })}
          onOrientation={orientation => setValue({ ...value, orientation })}
        />
      )}
      {canGrow(catalog, type) && (
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

// ページを作るダイアログの紙の入力Form: ブック book の所 place（紙をそろえる相手が決まる）に足す、タイプ type のページ。タイプの規定の既定から始める
export function usePaperControls(
  book: StageLineup | undefined,
  type: string | undefined,
  place: PaperPlace = "lineup",
) {
  const catalog = useCatalog().core
  const known = book && type !== undefined
  return usePaperForm(
    type,
    null,
    () => {
      if (!known) return null
      const from = defaultPaper(catalog, book, type, place)
      return { paper: from.paper, orientation: from.orientation, grows: undefined }
    },
    known ? paperChoices(catalog, book, type, place) : null,
    known ? pageType(catalog, type).grouping === "binder" && place !== "new-binder" : false,
  )
}

// ページの設定のダイアログの紙の入力Form: 今あるページ page。そろえる相手は、ページがブックに入っていればその中から引き、入っていなければ（ブックの外のページ）タイプの規定から選ぶ
export function usePagePaperControls(page: Page | null) {
  const catalog = useCatalog().core
  const book = useBook() // 確定したブック
  return usePaperForm(
    page?.type,
    page,
    () => {
      if (!page) return null
      const first = growChoices(catalog, page.type)[0]
      return {
        paper: page.paper,
        orientation: page.orientation,
        grows: page.grows === true && first ? first : page.grows,
      }
    },
    page ? (book ? paperChoicesFor(catalog, book, page) : typePaperChoices(catalog, page.type)) : null,
    page ? pageType(catalog, page.type).grouping === "binder" : false,
  )
}
