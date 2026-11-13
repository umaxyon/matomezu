// チケットスクリーン: コントロールセンターの画面の上に全体を覆って重なる（スクリーンの重ね場所が右から滑り込ませる）。左にチケットの枠（番号・タグ・名前・起票日時と最終更新・担当・優先度・ナレッジ・履歴）、
// 右に本文（マークダウン）。本文は最初からプレビューで出ていて、ナレッジの「本文」で出し入れし、4 つの並べ方（編集・縦分割・横分割・プレビュー）を切り替える。本文の最大化で、左の枠は戻るボタンだけに畳む。
// チケット履歴の質問を押すと、質問の枠が右の領域の上に重なる。名前・本文・優先度は直したそばから反映する（本文は打つたびに送り、変換中は送らない）。
// ロック中のチケットは薄くして直せなくし、帯のロックで掛け外しする。直している間（名前の入力か本文の編集にフォーカスがある間）は、チケットに編集ロックを掛ける。画面の状態は、開いているチケットが替われば初めに戻る
import { type KeyboardEvent, useMemo, useState } from "react"
import {
  useActions,
  useAllowedOn,
  useMessages,
  usePluginState,
  useRecord,
  useRecords,
  useScreen,
  useScreens,
  useUpdatePluginState,
  useUserSetting,
} from "../../../plugin-api/ui"
import {
  IconButton,
  LockToggle,
  MARKDOWN_PANE_MODE_ICONS,
  MarkdownDocumentView,
  MaxButton,
  markdownDocumentOnSkin,
  useMarkdownDocument,
  useRecordEditLock,
} from "../../base/ui"
import { BackIcon, BookIcon, PencilIcon } from "../icons"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { PRIORITIES, TICKET, TICKET_NAME_MAX } from "../ticket"
import { TICKET_LOCK, TICKET_UNLOCK, TICKET_UPDATE } from "../ticket/actions"
import { assigneesOf } from "../ticket/assignees"
import { ticketLabel } from "../ticket/label"
import { tagsOf } from "../ticket/tags"
import { HISTORY } from "../ticket-history"
import { TICKET_SCREEN, TICKET_SCREEN_STATE, type TicketScreenState, viewOf } from "."
import { AssigneeBirds } from "./AssigneeBirds"
import { TagPicker } from "./TagPicker"
import { TicketHistoryTimeline } from "./TicketHistoryTimeline"
import styles from "./TicketScreen.module.css"
import { useBodyUpdateLine } from "./useBodyUpdateLine"
import { type HistoryRow, historyRows, whenOf } from "./view"
import { WriterBird } from "./WriterBird"

const WORKROOM = "@matomezu/base:workroom"

const MODES = [
  { mode: "source-only", label: "Source only" },
  { mode: "split-row", label: "Side by side" },
  { mode: "split-column", label: "Top and bottom" },
  { mode: "rendered-only", label: "Preview only" },
] as const

export function TicketScreen() {
  const t = useMessages(kit)
  const me = useScreen(TICKET_SCREEN)
  const id = me.props.ticket
  const { close: closeScreen } = useScreens()
  const close = () => closeScreen(me.id)
  const ticket = useRecord(TICKET.id, id)
  const project = useRecord(PROJECT.id, ticket?.project ?? "")
  const lines = useRecords(HISTORY.id, { where: [] })
  const workrooms = useRecords(WORKROOM, { where: [] })
  const { perform } = useActions()
  // 画面の状態は、開いたスクリーン 1 枚ごと（閉じると消えるので、開くたびに初めに戻る）
  const [now, update] = [
    usePluginState(kit, TICKET_SCREEN_STATE, me.id),
    useUpdatePluginState(kit, TICKET_SCREEN_STATE),
  ]
  const view = viewOf(now, id)
  const set = (patch: Partial<TicketScreenState>) => update(me.id, cur => ({ ...viewOf(cur, id), ...patch }))
  const [editing, setEditing] = useState(false) // 名前の入力か本文の編集にフォーカスがある間
  useRecordEditLock(TICKET.id, editing ? [id] : [])
  const allowed = useAllowedOn(TICKET_UPDATE.id, {}, { record: id })
  const locked = ticket?.locked === true
  const canEdit = allowed.ok && !locked
  const markBodyEdited = useBodyUpdateLine(ticket ? id : undefined)

  if (!ticket)
    return (
      <section className={styles.screen} aria-label={t("ticket screen")}>
        <div className={`${styles.ticket} ${styles.alone}`}>
          <div className={styles.band}>
            <IconButton label={t("Back")} onClick={close}>
              <BackIcon />
            </IconButton>
            <span className={styles.bandTitle}>{t("ticket screen")}</span>
          </div>
          <p className={styles.empty}>{t("The ticket is not there")}</p>
        </div>
      </section>
    )

  const edit = (patch: { name?: string; body?: string; priority?: (typeof PRIORITIES)[number]; tags?: string[] }) =>
    perform(TICKET_UPDATE.id, patch, { record: id })
  const tags = project ? tagsOf(project, ticket) : []
  const tagChoices = project?.tags.filter(tag => tag.enabled && !ticket.tags.includes(tag.id)) ?? []
  const rows = historyRows(ticket, lines)
  const question = rows.find(r => r.id === view.question)
  const assignees = assigneesOf(ticket, workrooms)
  const workroomNames = useMemo(() => Object.fromEntries(workrooms.map(w => [w.id, w.name])), [workrooms])
  return (
    <section className={styles.screen} aria-label={t("ticket screen")}>
      <div className={styles.ticket} data-folded={view.maximized} data-locked={locked}>
        <div className={styles.band}>
          <IconButton label={t("Back")} onClick={close}>
            <BackIcon />
          </IconButton>
          <span className={styles.bandTitle}>{t("ticket screen")}</span>
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
              {assignees.length > 0 ? <AssigneeBirds workrooms={assignees} /> : t("No assignees")}
            </span>
          </div>
          <PriorityField priority={ticket.priority} canEdit={canEdit} onChange={priority => edit({ priority })} />
          <div className={styles.sectionHead}>{t("Knowledge")}</div>
          <div className={styles.knowledge}>
            <button
              type="button"
              className={styles.item}
              aria-pressed={view.body}
              onClick={() => set({ body: !view.body, maximized: false })}
            >
              <span className={styles.itemIcon}>
                <BookIcon />
              </span>
              <span className={styles.itemName}>{t("Body")}</span>
            </button>
          </div>
          <div className={styles.sectionHead}>{t("History")}</div>
          <div className={styles.historyScroll}>
            <TicketHistoryTimeline
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
        <Side open={question !== undefined} title={t("Question")} className={styles.question}>
          {question ? <QuestionView row={question} onClose={() => set({ question: undefined })} /> : null}
        </Side>
      </div>
    </section>
  )
}

function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <span>
      <span className={styles.factName}>{name}</span>
      {children}
    </span>
  )
}

// 右の領域の枠: 閉じている間は右へ出し、操作も読み上げも受けない
function Side({
  open,
  title,
  className,
  children,
}: {
  open: boolean
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`${styles.side} ${className ?? ""}`} data-open={open} inert={!open} aria-label={title}>
      {children}
    </section>
  )
}

// チケットの名前: 鉛筆で直す。Enter かフォーカスが外れたら決め、Esc でやめる。空なら元の名前に戻す
function NameField({
  name,
  canEdit,
  onEditing,
  onRename,
}: {
  name: string
  canEdit: boolean
  onEditing: (on: boolean) => void
  onRename: (name: string) => void
}) {
  const t = useMessages(kit)
  const [draft, setDraft] = useState<string | null>(null)
  const finish = (save: boolean) => {
    if (save && draft !== null && draft.trim() !== "" && draft.trim() !== name) onRename(draft.trim())
    setDraft(null)
    onEditing(false)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) finish(true)
    if (e.key === "Escape") finish(false)
  }
  return (
    <div className={styles.titleRow}>
      {draft === null ? (
        <>
          <h2 className={styles.name}>{name}</h2>
          {canEdit ? (
            <IconButton
              small
              label={t("Edit the name")}
              onClick={() => {
                setDraft(name)
                onEditing(true)
              }}
            >
              <PencilIcon />
            </IconButton>
          ) : null}
        </>
      ) : (
        <input
          ref={el => el?.focus()}
          type="text"
          className={styles.nameInput}
          aria-label={t("Ticket name")}
          aria-invalid={draft.trim() === ""}
          maxLength={TICKET_NAME_MAX}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => finish(true)}
        />
      )}
    </div>
  )
}

const PRIORITY_NAMES = {
  lowest: "Lowest",
  low: "Low",
  medium: "Medium",
  high: "High",
  highest: "Highest",
} as const

// 優先度: 5 段のスライダー。つまみを動かしている間は値を持ち、離したとき（キーなら 1 段ごと）に送る
function PriorityField({
  priority,
  canEdit,
  onChange,
}: {
  priority: (typeof PRIORITIES)[number]
  canEdit: boolean
  onChange: (priority: (typeof PRIORITIES)[number]) => void
}) {
  const t = useMessages(kit)
  const [drag, setDrag] = useState<number | null>(null)
  const index = drag ?? PRIORITIES.indexOf(priority)
  const commit = () => {
    const next = drag === null ? undefined : PRIORITIES[drag]
    setDrag(null)
    if (next && next !== priority) onChange(next)
  }
  return (
    <label className={styles.priority}>
      <span className={styles.factName}>{t("Priority")}</span>
      <span className={styles.slider}>
        <input
          type="range"
          min={0}
          max={PRIORITIES.length - 1}
          step={1}
          value={index}
          disabled={!canEdit}
          aria-valuetext={t(PRIORITY_NAMES[PRIORITIES[index] ?? "medium"])}
          onChange={e => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <span className={styles.ticks} aria-hidden="true">
          {PRIORITIES.map((p, i) => (
            <span key={p} data-on={i === index}>
              {t(PRIORITY_NAMES[p])}
            </span>
          ))}
        </span>
      </span>
    </label>
  )
}

// 本文の枠: 帯（題・4 つの並べ方・最大化）と、編集（原文）とプレビュー
function BodyPanes({
  ticket,
  body,
  mode,
  maximized,
  canEdit,
  onMode,
  onMaximize,
  onEditing,
  onBody,
}: {
  ticket: string
  body: string
  mode: TicketScreenState["mode"]
  maximized: boolean
  canEdit: boolean
  onMode: (mode: TicketScreenState["mode"]) => void
  onMaximize: () => void
  onEditing: (on: boolean) => void
  onBody: (body: string) => void
}) {
  const t = useMessages(kit)
  const [composing, setComposing] = useState<string | null>(null) // 変換中の字（変換が決まるまで送らない）
  const document = useMarkdownDocument(body, ticket)
  const softBreak = useUserSetting("@matomezu/base:soft-break") === "space" ? "space" : "line-break"
  return (
    <>
      <div className={styles.band}>
        <span className={styles.bandTitle}>{t("Body")}</span>
        <div className={styles.modes} role="toolbar" aria-label={t("How to show the body")}>
          {MODES.map(m => (
            <button
              key={m.mode}
              type="button"
              className={styles.mode}
              aria-label={t(m.label)}
              title={t(m.label)}
              aria-pressed={mode === m.mode}
              onClick={() => onMode(m.mode)}
            >
              {MARKDOWN_PANE_MODE_ICONS[m.mode]}
            </button>
          ))}
        </div>
        <MaxButton maximized={maximized} onToggle={onMaximize} />
      </div>
      <div className={styles.panes} data-mode={mode}>
        {mode !== "rendered-only" ? (
          <textarea
            className={styles.source}
            aria-label={t("Body (markdown)")}
            readOnly={!canEdit}
            value={composing ?? body}
            onFocus={() => canEdit && onEditing(true)}
            onBlur={() => onEditing(false)}
            onCompositionStart={e => setComposing(e.currentTarget.value)}
            onCompositionEnd={e => {
              setComposing(null)
              onBody(e.currentTarget.value)
            }}
            onChange={e => (composing !== null ? setComposing(e.target.value) : onBody(e.target.value))}
          />
        ) : null}
        {mode !== "source-only" ? (
          <div className={styles.preview}>
            {body ? (
              <div className={styles.markdown} style={markdownDocumentOnSkin()}>
                <MarkdownDocumentView document={document} softBreak={softBreak} />
              </div>
            ) : (
              <p className={styles.empty}>{t("No body")}</p>
            )}
          </div>
        ) : null}
      </div>
    </>
  )
}

// チケット履歴の質問を開いた枠（右の領域の上に重ねる）: 質問した者の鳥・時刻・質問の文と、閉じるボタン
function QuestionView({ row, onClose }: { row: HistoryRow; onClose: () => void }) {
  const t = useMessages(kit)
  return (
    <>
      <div className={styles.band}>
        <span className={styles.bandTitle}>{t("Question")}</span>
        <WriterBird by={row.by} />
        <span className={styles.questionMeta}>
          {row.by.kind === "ai" ? row.by.workroom.name : t("User")} {whenOf(row.at)}
        </span>
        <span className={styles.bandEnd}>
          <button type="button" className={styles.close} onClick={onClose}>
            {t("Close")}
          </button>
        </span>
      </div>
      <p className={styles.questionText}>{row.text}</p>
    </>
  )
}
