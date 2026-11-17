// 全文のモード: 入力の文字を、打つのを待ってからホストに頼み（前の問い合わせの返りは捨てる）、結果をパネルの中に並べる。
// 1 回に出すのは PAGE 件で、続きは「ほかに N 件」で次の位置から取り足す。行を押すと、その種類の開き方で横断検索の当たりを開く（パネルは開いたまま）
import { useCallback, useEffect, useRef, useState } from "react"
import type { WideSearchAnswer, WideSearchHit } from "../../../core/wide-search"
import { useMessages, useT } from "../../../ui/i18n"
import { useLayout, useUiCatalog } from "../../../ui/store-context"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { type Choice, ChoiceBubble } from "../utils/ChoiceBubble"
import { highlightParts } from "./highlight"
import { useWideSearch } from "./hooks"
import { openerOf } from "./openers"
import { WIDE_SEARCH_OPENERS, type WideSearchModeProps } from "./slots"
import type { WideSearchOpened } from "./ui"
import styles from "./WideSearch.module.css"

const WAIT_MS = 250
const PAGE = 20

interface Shown {
  hits: readonly WideSearchHit[]
  more: number
  next: number
  failed: boolean
  loading: boolean
}
const NONE: Shown = { hits: [], more: 0, next: 0, failed: false, loading: false }

export function FullTextMode({ term }: WideSearchModeProps) {
  const t = useMessages(kit)
  const search = useWideSearch()
  const words = term.trim()
  const [shown, setShown] = useState<Shown>(NONE)
  const latest = useRef(0) // 最後に頼んだ問い合わせの番号（それ以外の返りは捨てる）
  const take = (n: number, ask: Promise<WideSearchAnswer>, before: readonly WideSearchHit[]) =>
    ask.then(
      answer => {
        if (n !== latest.current) return
        setShown({
          hits: [...before, ...answer.hits],
          more: answer.more ?? 0,
          next: answer.next ?? 0,
          failed: false,
          loading: false,
        })
      },
      () => {
        if (n === latest.current) setShown({ ...NONE, failed: true })
      },
    )
  // biome-ignore lint/correctness/useExhaustiveDependencies: 言葉が変わったときだけ頼む
  useEffect(() => {
    const n = ++latest.current
    if (words === "") {
      setShown(NONE)
      return
    }
    const timer = setTimeout(() => {
      setShown(was => ({ ...was, loading: true }))
      void take(n, search({ terms: [words], limit: PAGE, unlisted: "include" }), [])
    }, WAIT_MS)
    return () => clearTimeout(timer)
  }, [words, search])
  const rest = () => {
    const n = ++latest.current
    setShown(was => ({ ...was, loading: true }))
    void take(n, search({ terms: [words], limit: PAGE, offset: shown.next, unlisted: "include" }), shown.hits)
  }
  return (
    <div className={styles.results}>
      {shown.failed && <p className={styles.note}>{t("Could not search")}</p>}
      {!shown.failed && words !== "" && !shown.loading && shown.hits.length === 0 && (
        <p className={styles.note}>{t("No hits")}</p>
      )}
      <ul className={styles.list}>
        {shown.hits.map(hit => (
          <HitRow key={`${hit.kind}/${hit.id}/${hit.part}`} hit={hit} words={words} />
        ))}
      </ul>
      {shown.more > 0 && (
        <button type="button" className={styles.more} disabled={shown.loading} onClick={rest}>
          {t("Other {count} hits", { count: shown.more })}
        </button>
      )}
    </div>
  )
}

// 横断検索の当たり 1 行: 種類の題・何に当たったかの名前・当たった所の前後。種類の開き方があれば押せる
function HitRow({ hit, words }: { hit: WideSearchHit; words: string }) {
  const t = useT()
  const catalog = useCoreCatalog()
  const placed: readonly string[] = useLayout().slots[WIDE_SEARCH_OPENERS] ?? []
  const widgets = useUiCatalog().widgets
  const opener = openerOf(placed, widgets, hit.kind)
  const kind = catalog.subjects.get(hit.kind)
  const label = opener?.useLabel ? (
    <LabelOf useLabel={opener.useLabel} hit={hit} words={words} />
  ) : (
    <Marked text={hit.label ?? ""} words={words} />
  )
  const body = (
    <>
      {kind && <span className={styles.kind}>{t(kind.title)}</span>}
      <span className={styles.brief}>{label}</span>
      <span className={styles.snippet}>
        <Marked text={hit.snippet} words={words} />
      </span>
    </>
  )
  return (
    <li>
      {opener ? (
        <OpenableRow open={opener.useOpen} hit={hit}>
          {body}
        </OpenableRow>
      ) : (
        <div className={styles.row} aria-disabled="true">
          {body}
        </div>
      )}
    </li>
  )
}

function OpenableRow({
  open: useOpen,
  hit,
  children,
}: {
  open: () => (hit: WideSearchHit) => WideSearchOpened
  hit: WideSearchHit
  children: React.ReactNode
}) {
  const open = useOpen()
  // 開き方を選ばせるときの、選ぶ物と押した行
  const [asked, setAsked] = useState<{ choices: readonly Choice[]; from: Element } | null>(null)
  const close = useCallback(() => setAsked(null), [])
  return (
    <>
      <button
        type="button"
        className={styles.row}
        onClick={e => {
          const opened = open(hit)
          if (opened !== "opened") setAsked({ choices: opened, from: e.currentTarget })
        }}
      >
        {children}
      </button>
      {asked ? <ChoiceBubble from={asked.from} choices={asked.choices} onClose={close} /> : null}
    </>
  )
}

// 横断検索の当たりの名前を、種類の開き方が画面の持つ物から作る（無ければホストの label）。入力の言葉に当たった所は赤字にする
function LabelOf({
  useLabel,
  hit,
  words,
}: {
  useLabel: () => (hit: WideSearchHit) => string | undefined
  hit: WideSearchHit
  words: string
}) {
  const label = useLabel()
  return <Marked text={label(hit) ?? hit.label ?? ""} words={words} />
}

// 入力の言葉に当たった所を赤字（skin の danger の色）にして出す
function Marked({ text, words }: { text: string; words: string }) {
  return (
    <>
      {highlightParts(text, words).map((p, i) =>
        p.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同じ文字の並びの中の位置で見分ける
          <mark key={i} className={styles.hit}>
            {p.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同じ文字の並びの中の位置で見分ける
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}
