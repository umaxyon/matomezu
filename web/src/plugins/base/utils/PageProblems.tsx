// 設定のダイアログで選んでいる値（下書きを重ねたブック draft）で、問題の出るページの知らせ（ページ名と、タイプの文言。文言の無い問題は出さない）。
// 問題が 1 つでもあれば、ダイアログは確定のボタンを押せなくする（problems の数で決める）
import type { Book } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { Problem } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { pageProblems } from "../page-tabs/page-problems"

export function usePageProblems(draft: Book | undefined, pages?: readonly string[]) {
  const catalog = useCatalog().core
  return draft ? pageProblems(catalog, draft, pages) : []
}

export function PageProblemsView({ problems }: { problems: ReturnType<typeof usePageProblems> }) {
  const t = useMessages(kit)
  return problems.flatMap(({ page, problem }) =>
    problem.message
      ? [<Problem key={page.id}>{t("{page}: {problem}", { page: page.title, problem: t(problem.message) })}</Problem>]
      : [],
  )
}
