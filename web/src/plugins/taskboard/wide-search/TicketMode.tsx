// 横断検索のチケットモード: 入力の言葉（題名・番号・チケット履歴・本文）に当たったチケットと、プロジェクト・タグ・優先度の選びで、タスクボードのチケットを絞る。
// 絞りは窓の状態に持ち、パネルを閉じても残る（タスクボードの上の印の × で外す）。言葉は打つのを待ってから、チケットとチケット履歴の両方をホストで探す。
// 言葉も選びも空なら絞らない
import { useEffect, useRef, useState } from "react"
import {
  useMessages,
  usePluginState,
  useRecords,
  useSetPluginStateById,
  useUpdatePluginState,
} from "../../../plugin-api/ui"
import { ActionButton, useWideSearch, WIDE_SEARCH_LIMIT_MAX, type WideSearchModeProps } from "../../base/ui"
import { orderedProjects, PRIORITIES, shownProjects } from "../board/shown"
import { useBoardSettings } from "../board/useBoardSettings"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { HISTORY } from "../ticket-history"
import { TICKET_FILTER } from "."
import {
  filterTickets,
  isFiltering,
  NO_FILTER,
  NO_TAGS,
  searchTerms,
  type TicketFilter,
  ticketIdsOf,
  toggled,
} from "./filter"
import styles from "./TicketMode.module.css"

const WAIT_MS = 250
// コントロールセンターのスクリーンの定義の id（書き先のスクリーン）
const CONTROL_CENTER_SCREEN = "@matomezu/control-center:screen"
// コントロールセンターの宣言 front-screen（コンテンツエリアに出す表示。値は projects か library）の id
const FRONT_SCREEN_STATE = "@matomezu/control-center:front-screen"

export function TicketMode({ term, setTerm }: WideSearchModeProps) {
  const t = useMessages(kit)
  const search = useWideSearch()
  const filter = usePluginState(kit, TICKET_FILTER)
  const update = useUpdatePluginState(kit, TICKET_FILTER)
  const allProjects = useRecords(PROJECT.id, { where: [] })
  const projects = orderedProjects(allProjects, [])
  const settings = useBoardSettings()
  const setPluginStateById = useSetPluginStateById()
  const tickets = useRecords(TICKET.id, { where: [] })
  const [failed, setFailed] = useState(false)
  const latest = useRef(0) // 最後に頼んだ問い合わせの番号（それ以外の返りは捨てる）
  const first = useRef(true)
  const change = (f: (now: TicketFilter) => TicketFilter) => update(now => f(now ?? NO_FILTER))
  // biome-ignore lint/correctness/useExhaustiveDependencies: 言葉が変わったときだけ探す
  useEffect(() => {
    // 開き直したとき、絞りに言葉が残っていれば入力に戻す（言葉が空のまま、残っている絞りを消さない）
    const kept = filter?.term ?? ""
    if (first.current) {
      first.current = false
      if (term === "" && kept !== "") {
        setTerm(kept)
        return
      }
    }
    const words = term.trim()
    const n = ++latest.current
    if (words === "") {
      setFailed(false)
      update(now => (now && (now.term !== "" || now.hits !== null) ? { ...now, term: "", hits: null } : now))
      return
    }
    const timer = setTimeout(() => {
      void searchAll(search, words).then(
        ids => {
          if (n !== latest.current) return
          setFailed(false)
          change(now => ({ ...now, term: words, hits: ids }))
        },
        () => {
          if (n === latest.current) setFailed(true)
        },
      )
    }, WAIT_MS)
    return () => clearTimeout(timer)
  }, [term])
  const f = filter ?? NO_FILTER
  const active = isFiltering(f)
  const matched = active ? filterTickets(tickets, f) : []
  const count = active ? matched.length : tickets.length
  // 絞りが有効になったら、コントロールセンターのコンテンツエリアをプロジェクトの表示（タスクボード）にする（書庫の表示なら引っ込む）。
  // コントロールセンターのコードは読まず、画面の場所に入れる宣言 front-screen の id と値で土台に頼む。同じ値なら何も起きない。開き直しただけでは頼まない
  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current)
      setPluginStateById(FRONT_SCREEN_STATE, "projects", { screenDef: CONTROL_CENTER_SCREEN })
    wasActive.current = active
  }, [active, setPluginStateById])
  // 絞りに合うチケットのプロジェクトと、選びで指したプロジェクトは、出すタスクボードに足す（利用者の設定。絞りを外しても戻さない）
  const shownIds = shownProjects(orderedProjects(allProjects, settings.order), settings.shown).map(p => p.id)
  const missing = [...new Set([...f.projects, ...matched.map(tk => tk.project)])].filter(
    id => allProjects.some(p => p.id === id && !p.closed) && !shownIds.includes(id),
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: 足りない物が変わったときだけ書く
  useEffect(() => {
    if (active && missing.length > 0 && settings.canChange) settings.setShown([...shownIds, ...missing])
  }, [active, missing.join("|"), settings.canChange])
  return (
    <div className={styles.panel}>
      <Group title={t("Filter projects")}>
        {projects.map(p => (
          <ActionButton
            key={p.id}
            pressed={f.projects.includes(p.id)}
            onClick={() => change(now => ({ ...now, projects: toggled(now.projects, p.id) }))}
          >
            {p.name}
          </ActionButton>
        ))}
      </Group>
      <Group title={t("Filter tags")}>
        <ActionButton
          pressed={f.tags.includes(NO_TAGS)}
          onClick={() => change(now => ({ ...now, tags: toggled(now.tags, NO_TAGS) }))}
        >
          {t("No tag")}
        </ActionButton>
        {projects.flatMap(p =>
          p.tags.map(tag => (
            <ActionButton
              key={`${p.id}/${tag.id}`}
              pressed={f.tags.includes(tag.id)}
              onClick={() => change(now => ({ ...now, tags: toggled(now.tags, tag.id) }))}
            >
              {`${p.name} / ${tag.name}`}
            </ActionButton>
          )),
        )}
      </Group>
      <Group title={t("Filter priorities")}>
        {PRIORITIES.map(p => (
          <ActionButton
            key={p}
            pressed={f.priorities.includes(p)}
            onClick={() => change(now => ({ ...now, priorities: toggled(now.priorities, p) }))}
          >
            {t(`priority ${p}`)}
          </ActionButton>
        ))}
      </Group>
      <p className={styles.note}>{failed ? t("Could not search") : t("{n} tickets", { n: count })}</p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{title}</legend>
      <div className={styles.buttons}>{children}</div>
    </fieldset>
  )
}

// チケットとチケット履歴の両方から言葉を探し、当たったチケットの id を返す（上限で切れたら、続きも全部取る）
async function searchAll(search: ReturnType<typeof useWideSearch>, words: string): Promise<string[]> {
  const terms = searchTerms(words)
  const hits = []
  for (let offset: number | undefined = 0; offset !== undefined; ) {
    const answer = await search({
      terms,
      kinds: [TICKET.id, HISTORY.id],
      limit: WIDE_SEARCH_LIMIT_MAX,
      offset,
      unlisted: "include",
    })
    hits.push(...answer.hits)
    offset = answer.next
  }
  return ticketIdsOf(hits, TICKET.id)
}
