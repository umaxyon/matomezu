// ワーカーブックのページの一覧（チケットのナレッジの「作業ブック」で出す）: ワーカーブック found のページを並べる（タイプのアイコンと題）。行はクリックで「開く／分割で開く」、ダブルクリックで全画面で開く（そのページ）。
// keepHere: 分けた並びの中から分割で開くとき、起点（この一覧を出しているスクリーン）を残してもう片方の段を替える
import { useShallow } from "zustand/react/shallow"
import { NO_OUTERMOST, outermostOf } from "../../../core/folders-tree"
import { useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { PAGE } from "../library/icons"
import { useBookOpenChoice } from "../window/useBookOpenChoice"
import styles from "./WorkerBookPages.module.css"
import type { FoundWorkerBook } from "./worker-book"

export function WorkerBookPages({ found, keepHere }: { found: FoundWorkerBook; keepHere?: boolean }) {
  // ページの題とタイプ（並びの順に、題・タイプ・題・タイプ…。ページメタで読む）
  const facts = useMatomezuState(
    useShallow(s =>
      found.pages.flatMap(id => {
        const row = s.pages[id]
        const outermost = outermostOf(s, id)
        return row && outermost !== NO_OUTERMOST && outermost.id === found.book ? [row.title, row.type] : ["", ""]
      }),
    ),
  )
  return (
    <ul className={styles.list}>
      {found.pages.map((page, i) => (
        <PageRow
          key={page}
          book={found.book}
          page={page}
          title={facts[i * 2] ?? ""}
          type={facts[i * 2 + 1] ?? ""}
          keepHere={keepHere}
        />
      ))}
    </ul>
  )
}

function PageRow({
  book,
  page,
  title,
  type,
  keepHere,
}: {
  book: string
  page: string
  title: string
  type: string
  keepHere: boolean | undefined
}) {
  const icon = useUiCatalog().pageTypeIcons.get(type)
  const choice = useBookOpenChoice({ book, page, ...(keepHere ? { keepHere } : {}) })
  return (
    <li>
      <button type="button" className={styles.row} data-worker-page={page} onClick={choice.onClick}>
        <span className={styles.icon}>{icon ?? PAGE}</span>
        <span className={styles.title}>{title}</span>
      </button>
      {choice.bubble}
    </li>
  )
}
