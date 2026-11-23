// チケットスクリーン: コントロールセンターの画面の上に全体を覆って重なる（スクリーンの重ね場所が右から滑り込ませる）。左にチケットの枠（番号・タグ・名前・起票日時と最終更新・担当・優先度・ナレッジ・履歴）、
// 右に本文（マークダウン）。本文は最初からプレビューで出ていて、ナレッジの「本文」で出し入れし、4 つの並べ方（編集・縦分割・横分割・プレビュー）を切り替える。本文の最大化で、左の枠は戻るボタンだけに畳む。
// チケット履歴の質問を押すと、質問の枠が右の領域の上に重なる。名前・本文・優先度は直したそばから反映する（本文は打つたびに送り、変換中は送らない）。
// ロック中のチケットは薄くして直せなくし、帯のロックで掛け外しする。直している間（名前の入力か本文の編集にフォーカスがある間）は、チケットに編集ロックを掛ける。画面の状態は、開いているチケットが替われば初めに戻る
import { useMemo, useState } from "react"
import {
  useActions,
  useAllowedOn,
  useMessages,
  usePluginState,
  useRecord,
  useRecords,
  useScreen,
  useUpdatePluginState,
} from "../../../plugin-api/ui"
import { NO_WORKER_BOOK } from "../../base"
import {
  LockToggle,
  useRecordEditLock,
  useShowBook,
  useWorkerBook,
  BookIcon as WorkerBookIcon,
  WorkerBookPages,
} from "../../base/ui"
import { WORKROOM_SUBJECT } from "../by"
import { useWorkingOn } from "../current-ticket/useCurrentTickets"
import { BookIcon } from "../icons"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { PRIORITIES, TICKET, type Ticket, VOLUMES } from "../ticket"
import { TICKET_LOCK, TICKET_UNLOCK, TICKET_UPDATE } from "../ticket/actions"
import { assigneesOf } from "../ticket/assignees"
import { ticketLabel } from "../ticket/label"
import { tagsOf } from "../ticket/tags"
import { HISTORY } from "../ticket-history"
import { TICKET_SCREEN, TICKET_SCREEN_STATE, type TicketScreenState, viewOf } from "."
import { AssigneeBirds } from "./AssigneeBirds"
import { BackBar } from "./BackBar"
import { OpenChoiceHost } from "./OpenChoice"
import { TagPicker } from "./TagPicker"
import { Fact, NameField, StepSlider } from "./TicketFacts"
import { TicketHistoryTimeline } from "./TicketHistoryTimeline"
import styles from "./TicketScreen.module.css"
import { BodyPanes, QuestionView, Side } from "./TicketSide"
import { useBodyUpdateLine } from "./useBodyUpdateLine"
import { type HistoryRow, historyRows, whenOf } from "./view"

export function TicketScreen() {
  const t = useMessages(kit)
  const id = useScreen(TICKET_SCREEN).props.ticket
  const ticket = useRecord(TICKET.id, id)
  if (!ticket)
    return (
      <section className={styles.screen} aria-label={t("ticket screen")}>
        <div className={`${styles.ticket} ${styles.alone}`}>
          <div className={styles.band}>
            <BackBar />
          </div>
          <p className={styles.empty}>{t("The ticket is not there")}</p>
        </div>
      </section>
    )
  return <TicketBody ticket={ticket} />
}

// あるチケット ticket の画面
function TicketBody({ ticket }: { ticket: Ticket }) {
  const t = useMessages(kit)
  const id = ticket.id
  const project = useRecord(PROJECT.id, ticket.project)
  const lines = useRecords(HISTORY.id, { where: [] })
  const workrooms = useRecords(WORKROOM_SUBJECT, { where: [] })
  const workroomNames = useMemo(() => Object.fromEntries(workrooms.map(w => [w.id, w.name])), [workrooms])
  const { perform } = useActions()
  // 画面の状態は、開いたスクリーン 1 枚ごと（閉じると消えるので、開くたびに初めに戻る）
  const [now, update] = [usePluginState(kit, TICKET_SCREEN_STATE), useUpdatePluginState(kit, TICKET_SCREEN_STATE)]
  const view = viewOf(now, id)
  const set = (patch: Partial<TicketScreenState>) => update(cur => ({ ...viewOf(cur, id), ...patch }))
  const [editing, setEditing] = useState(false) // 名前の入力か本文の編集にフォーカスがある間
  useRecordEditLock(TICKET.id, editing ? [id] : [])
  const allowed = useAllowedOn(TICKET_UPDATE.id, {}, { record: id })
  const locked = ticket.locked === true
  const canEdit = allowed.ok && !locked
  const markBodyEdited = useBodyUpdateLine(id)
  const working = useWorkingOn(ticket)
  // このチケットのワーカーブック（ページが在るときだけ作業履歴を押せる）
  const found = useWorkerBook(useMemo(() => ({ subject: TICKET.id, id }), [id]))
  const workPages = found === NO_WORKER_BOOK ? [] : found.pages
  const shower = useShowBook()

  const edit = (patch: {
    name?: string
    body?: string
    priority?: (typeof PRIORITIES)[number]
    volume?: (typeof VOLUMES)[number]
    tags?: string[]
  }) => perform(TICKET_UPDATE.id, patch, { record: id })
  const tags = project ? tagsOf(project, ticket) : []
  const tagChoices = project?.tags.filter(tag => tag.enabled && !ticket.tags.includes(tag.id)) ?? []
  const rows = historyRows(ticket, lines)
  const question = rows.find(r => r.id === view.question)
  const assignees = assigneesOf(ticket, workrooms)
  return (
    <OpenChoiceHost>
      <section className={styles.screen} aria-label={t("ticket screen")}>
        <div className={styles.ticket} data-folded={view.maximized} data-locked={locked}>
          <div className={styles.band}>
            <BackBar folded={view.maximized} />
            <span className={styles.bandEnd}>
              <LockToggle
                locked={locked}
                label={locked ? t("Unlock the ticket") : t("Lock the ticket")}
                onChange={next => perform(next ? TICKET_LOCK.id : TICKET_UNLOCK.id, {}, { record: id })}
              />
            </span>
          </div>
          <div className={styles.content} inert={view.maximized}>
            <div className={styles.head}>
              <span className={styles.id}>{ticketLabel(project?.prefix ?? "", ticket.number)}</span>
              <TagPicker tags={tags} choices={tagChoices} canEdit={canEdit} onChange={next => edit({ tags: next })} />
            </div>
            <NameField name={ticket.name} canEdit={canEdit} onEditing={setEditing} onRename={name => edit({ name })} />
            <div className={styles.dates}>
              <Fact name={t("Filed at")}>{whenOf(ticket.createdAt)}</Fact>
              <Fact name={t("Last changed")}>{whenOf(ticket.updatedAt)}</Fact>
            </div>
            <div className={styles.assignees}>
              <span className={styles.factName}>{t("Assignees")}</span>
              <span className={styles.assigneeList}>
                {assignees.length > 0 ? <AssigneeBirds workrooms={assignees} working={working} /> : t("No assignees")}
              </span>
            </div>
            <div className={styles.steps}>
              <StepSlider
                title={t("Priority")}
                steps={PRIORITIES}
                value={ticket.priority}
                nameOf={p => t(`priority ${p}`)}
                canEdit={canEdit}
                onChange={priority => edit({ priority })}
              />
              <StepSlider
                title={t("Volume")}
                steps={VOLUMES}
                value={ticket.volume}
                nameOf={v => t(`volume ${v}`)}
                canEdit={canEdit}
                onChange={volume => edit({ volume })}
              />
            </div>
            <div className={styles.sectionHead}>{t("Knowledge")}</div>
            <div className={styles.knowledge}>
              <button
                type="button"
                className={styles.item}
                aria-pressed={view.body}
                onClick={() => set({ body: !view.body, workBook: false, maximized: false })}
              >
                <span className={styles.itemIcon}>
                  <BookIcon />
                </span>
                <span className={styles.itemName}>{t("Body")}</span>
              </button>
              <button
                type="button"
                className={styles.item}
                aria-pressed={view.workBook === true}
                disabled={found === NO_WORKER_BOOK || workPages.length === 0}
                data-work-history
                // クリックで右の一覧を出し入れし、ダブルクリックで全画面で開く（最初のページ）。2 回目のクリックでは出し入れしない
                onClick={e => {
                  if (found === NO_WORKER_BOOK) return
                  if (e.detail <= 1) set({ workBook: !view.workBook, body: false, maximized: false })
                  else if (e.detail === 2) shower.full(found.book, workPages[0])
                }}
              >
                <span className={styles.itemIcon}>
                  <WorkerBookIcon />
                </span>
                <span className={styles.itemName}>{t("Work history")}</span>
              </button>
            </div>
            <div className={styles.sectionHead}>{t("History")}</div>
            <div className={styles.historyScroll}>
              <TicketHistoryTimeline
                ticket={id}
                rows={rows}
                openQuestion={view.question}
                onOpenQuestion={(row: HistoryRow) => set({ question: row.id })}
                workroomNames={workroomNames}
              />
            </div>
          </div>
        </div>
        <div className={styles.right}>
          <Side open={view.body} title={t("Body")}>
            <BodyPanes
              ticket={id}
              body={ticket.body}
              mode={view.mode}
              maximized={view.maximized}
              canEdit={canEdit}
              onMode={mode => set({ mode })}
              onMaximize={() => set({ maximized: !view.maximized })}
              onEditing={setEditing}
              onBody={body => {
                if (edit({ body }).ok) markBodyEdited()
              }}
            />
          </Side>
          <Side open={view.workBook === true && found !== NO_WORKER_BOOK} title={t("Work history")}>
            <div className={styles.band}>
              <span className={styles.bandTitle}>{t("Work history")}</span>
              <span className={styles.bandEnd}>
                <button type="button" className={styles.close} onClick={() => set({ workBook: false })}>
                  {t("Close")}
                </button>
              </span>
            </div>
            {found !== NO_WORKER_BOOK ? <WorkerBookPages found={found} keepHere /> : null}
          </Side>
          <Side open={question !== undefined} title={t("Question")} className={styles.question}>
            {question ? <QuestionView ticket={id} row={question} onClose={() => set({ question: undefined })} /> : null}
          </Side>
        </div>
      </section>
    </OpenChoiceHost>
  )
}
