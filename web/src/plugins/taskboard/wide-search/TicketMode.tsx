// 横断検索のチケットモード: 入力の言葉（題名・番号・チケット履歴・本文）に当たったチケットと、プロジェクト・タグ・優先度の選びで、タスクボードのチケットを絞る。
// 絞りは窓の状態に持ち、パネルを閉じても残る（パネルの印の × で外す）。絞りの状態が無い間は、ボードに出しているプロジェクトが選ばれた状態で始める。言葉は打つのを待ってから、チケットとチケット履歴の両方をホストで探す。
// 言葉も選びも空なら絞らない
import { useEffect, useRef, useState } from "react"
import {
  useMessages,
  usePluginState,
  useRecords,
  useSetPluginStateById,
  useUpdatePluginState,
} from "../../../plugin-api/ui"
import { ChoiceText, MultiChoices, useWideSearch, WIDE_SEARCH_LIMIT_MAX, type WideSearchModeProps } from "../../base/ui"
import { orderedProjects, PRIORITIES, shownProjects, VOLUMES } from "../board/shown"
import { useBoardSettings } from "../board/useBoardSettings"
import { CONTENT_AREA_STATE, CONTROL_CENTER_SCREEN } from "../control-center-ids"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { HISTORY } from "../ticket-history"
import { TICKET_FILTER } from "."
import { FilterBanner } from "./FilterBanner"
import { FilterChip } from "./FilterChip"
import {
  filterTickets,
  isFiltering,
  isInitialChoice,
  NO_FILTER,
  NO_TAGS,
  numberedTicketIds,
  searchTerms,
  type TicketFilter,
  ticketIdsOf,
  toggled,
} from "./filter"
import styles from "./TicketMode.module.css"

const WAIT_MS = 250

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
  // 出しているタスクボードのプロジェクト（絞りの状態が無い間、選びの初めの状態になる）
  const shownIds = shownProjects(orderedProjects(allProjects, settings.order), settings.shown).map(p => p.id)
  const change = (f: (now: TicketFilter) => TicketFilter) =>
    update(now => f(now ?? { ...NO_FILTER, projects: shownIds }))
  const latest = useRef(0) // 最後に頼んだ問い合わせの番号（それ以外の返りは捨てる）
  const first = useRef(true)
  const restored = useRef<string | null>(null) // 開き直したときに、絞りから入力に戻した言葉（それで問い合わせ直すまで）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 言葉が変わったときだけ探す
  useEffect(() => {
    // 開き直したとき、絞りに言葉が残っていれば入力に戻す（言葉が空のまま、残っている絞りを消さない）
    const kept = filter?.term ?? ""
    if (first.current) {
      first.current = false
      if (term === "" && kept !== "") {
        restored.current = kept
        setTerm(kept)
        return
      }
    }
    const words = term.trim()
    const n = ++latest.current
    const again = words === restored.current
    restored.current = null
    if (words === "") {
      setFailed(false)
      // 言葉を消して、選びが初めの状態（出しているプロジェクトだけ）のままなら、絞りごと解く
      update(now => {
        if (!now || (now.term === "" && now.hits === null)) return now
        const rest = { ...now, term: "", hits: null }
        return isInitialChoice(rest, shownIds) ? undefined : rest
      })
      return
    }
    const timer = setTimeout(() => {
      const terms = searchTerms(words)
      const prefixOf = (id: string) => allProjects.find(p => p.id === id)?.prefix ?? ""
      void searchAll(search, terms).then(
        found => {
          if (n !== latest.current) return
          setFailed(false)
          const ids = [...new Set([...found, ...numberedTicketIds(terms, tickets, prefixOf)])]
          // 戻した言葉で問い合わせ直した答えは、絞りがその言葉のまま残っているときだけ入れる（その間に解かれた絞りを戻さない）
          if (again) update(now => (now?.term === words ? { ...now, hits: ids } : now))
          else change(now => ({ ...now, term: words, hits: ids }))
        },
        () => {
          if (n === latest.current) setFailed(true)
        },
      )
    }, WAIT_MS)
    return () => clearTimeout(timer)
  }, [term])
  // 絞りの言葉がよそで消されたら（ろうとのボタン・「検索中」の ×）、入力の言葉も消す
  const keptTerm = filter?.term ?? ""
  const prevKept = useRef(keptTerm)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 絞りの言葉が変わったときだけ見る
  useEffect(() => {
    if (prevKept.current !== "" && keptTerm === "" && term.trim() !== "") setTerm("")
    prevKept.current = keptTerm
  }, [keptTerm])
  const f = filter ?? { ...NO_FILTER, projects: shownIds }
  const active = isFiltering(filter)
  const matched = active ? filterTickets(tickets, f) : []
  const count = isFiltering(f) ? filterTickets(tickets, f).length : tickets.length
  // 絞りが有効になったら、コントロールセンターのコンテンツエリアをプロジェクトの表示（タスクボード）にする（書庫の表示なら引っ込む）。
  // コントロールセンターのコードは読まず、画面の場所に入れる宣言 content-area の id と値で土台に頼む。同じ値なら何も起きない。開き直しただけでは頼まない
  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current)
      setPluginStateById(CONTENT_AREA_STATE, "projects", { screenDef: CONTROL_CENTER_SCREEN })
    wasActive.current = active
  }, [active, setPluginStateById])
  // 絞りに合うチケットのプロジェクトと、選びで指したプロジェクトは、出すタスクボードに足す（利用者の設定。絞りを外しても戻さない）
  const missing = [...new Set([...f.projects, ...matched.map(tk => tk.project)])].filter(
    id => allProjects.some(p => p.id === id && !p.closed) && !shownIds.includes(id),
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: 足りない物が変わったときだけ書く
  useEffect(() => {
    if (active && missing.length > 0 && settings.canChange) settings.setShown([...shownIds, ...missing])
  }, [active, missing.join("|"), settings.canChange])
  return (
    <div className={styles.panel}>
      <p className={styles.note}>{failed ? t("Could not search") : t("{n} tickets", { n: count })}</p>
      {isFiltering(filter) && <FilterBanner filter={filter} onClear={() => update(() => undefined)} />}
      <Group title={t("Filter projects")}>
        {projects.map(p => (
          <FilterChip
            key={p.id}
            pressed={f.projects.includes(p.id)}
            onClick={() => change(now => ({ ...now, projects: toggled(now.projects, p.id) }))}
          >
            {p.name}
          </FilterChip>
        ))}
      </Group>
      <Group title={t("Filter tags")}>
        <FilterChip
          pressed={f.tags.includes(NO_TAGS)}
          onClick={() => change(now => ({ ...now, tags: toggled(now.tags, NO_TAGS) }))}
        >
          {t("No tag")}
        </FilterChip>
      </Group>
      {projects
        .filter(p => p.tags.length > 0)
        .map(p => (
          <Group key={p.id} title={p.name} sub>
            {p.tags.map(tag => (
              <FilterChip
                key={tag.id}
                color={tag.color}
                pressed={f.tags.includes(tag.id)}
                onClick={() => change(now => ({ ...now, tags: toggled(now.tags, tag.id) }))}
              >
                {tag.name}
              </FilterChip>
            ))}
          </Group>
        ))}
      <Group title={t("Filter priorities")}>
        <MultiChoices
          label={t("Filter priorities")}
          values={f.priorities}
          options={PRIORITIES.map(p => ({
            value: p,
            label: t(`priority ${p}`),
            icon: <ChoiceText>{t(`priority ${p}`)}</ChoiceText>,
          }))}
          onChange={priorities => change(now => ({ ...now, priorities }))}
        />
      </Group>
      <Group title={t("Filter volumes")}>
        <MultiChoices
          label={t("Filter volumes")}
          values={f.volumes}
          options={VOLUMES.map(v => ({
            value: v,
            label: t(`volume ${v}`),
            icon: <ChoiceText>{t(`volume ${v}`)}</ChoiceText>,
          }))}
          onChange={volumes => change(now => ({ ...now, volumes }))}
        />
      </Group>
    </div>
  )
}

function Group({ title, sub, children }: { title: string; sub?: boolean; children: React.ReactNode }) {
  return (
    <fieldset className={styles.group} data-sub={sub || undefined}>
      <legend className={styles.legend}>{title}</legend>
      <div className={styles.buttons}>{children}</div>
    </fieldset>
  )
}

// チケットとチケット履歴の両方から言葉を探し、当たったチケットの id を返す（上限で切れたら、続きも全部取る）
async function searchAll(search: ReturnType<typeof useWideSearch>, terms: string[]): Promise<string[]> {
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
