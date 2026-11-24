// 郵便箱の画面（郵便箱のスクリーンと、コントロールセンターのコンテンツエリアが描く）: 左に受信トレイ（タブ「AI｜人」・ゴミ箱・届いた郵便の行）、右に選んだ郵便の本文と行き先のボタン。
// 行は 2 行（未読の印・送り手・時刻と、題・種類の印）。行を押すと選んで見たことにする（mail-seen）。行の左のチェックボックスでチェックした郵便は、ゴミ箱から確かめてまとめて消す（同じアクションバルク）。
// 受信トレイは INBOX_ROWS 通ずつ出し、下の帯で新しい方・古い方の範囲へ送る（範囲はこの見た目だけが持ち、履歴に積まない。外から選ばれた郵便が範囲の外なら、その範囲を出す）。
// チェックはタブと範囲ごとで、タブか範囲を替えると外れる。選んでいる郵便とタブはスクリーンの範囲のプラグイン状態（今のタブに無い・消えた郵便は、選んでいないのと同じ）。
// 行き先のボタンは、上下に並んでいるブックスクリーンのカレントのステージを起点に「開く／分割で開く／左に開く／右に開く」、並んでいなければ「開く」1 つ（ブックを窓に出す）。開いても閉じない
import { useState } from "react"
import { NO_STATE } from "../../../core/def/plugin-state"
import { screenOfStage } from "../../../core/window"
import { NO_STAGE } from "../../../store/dialogs"
import { useMessages } from "../../../ui/i18n"
import { usePluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { NO_KIND_VIEW, useKindView } from "../../../ui/Slot"
import { useScreenIdHere } from "../../../ui/screen-context"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { useActions, useAllowedOn, useCoreCatalog, useUserSetting } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { TRASH } from "../library/icons"
import { MarkdownDocumentView } from "../markdown/MarkdownDocumentView"
import { markdownDocumentOnSkin } from "../markdown/on-skin"
import { SOFT_BREAK, softBreakOf } from "../markdown/soft-break"
import { useMarkdownDocument } from "../markdown/use-markdown-document"
import { clampChars } from "../text/text"
import { IconButton } from "../utils/IconButton"
import { refusalMessage } from "../utils/refusal"
import { shownTime } from "../utils/shown-time"
import { Tip } from "../utils/Tip"
import { showBookInUpperRow, stageAboveLower } from "../window/lower-row"
import { MAIL_REMOVE, MAIL_SEEN, MAIL_VISITED } from "./actions"
import { useMailbox, useShowMailPlaceAt } from "./hooks"
import { FIRST_SHOWN, INBOX_ROWS, type InboxShown, inboxFrom, inboxOf, unreadOf } from "./inbox"
import own from "./Mail.module.css"
import styles from "./MailboxView.module.css"
import type { Mail, MailSenderKind } from "./mail"
import { type OpenChoice, type OpenChoices, openChoices, openStageOf } from "./open-choices"
import { GONE, mailPlace, placeNow } from "./place"
import { MAILBOX_SCOPE } from "./screen"
import { shownOf } from "./shown"
import { MAIL_ACTIONS } from "./slots"
import { MAILBOX_PICKED, MAILBOX_SENDER_TAB } from "./states"

const TITLE_CHARS = 60 // 行に出す題の字数
const NEWER = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M10 3 5 8l5 5" />
  </svg>
)
const OLDER = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="m6 3 5 5-5 5" />
  </svg>
)
const TABS: readonly { kind: MailSenderKind; title: "Sender AI" | "Sender people" }[] = [
  { kind: "ai", title: "Sender AI" },
  { kind: "user", title: "Sender people" },
]
const CHOICE_TITLES = {
  here: "Open",
  split: "Open in split",
  left: "Open on the left",
  right: "Open on the right",
} as const satisfies Record<OpenChoice, string>
// 上下に並んでいるブックスクリーンが無いときの行き先のボタン（ブックを窓に出す 1 つ）
const WINDOW_CHOICES: OpenChoices = { opens: ["here"], primary: "here" }

export function MailboxView({ className }: { className?: string }) {
  const t = useMessages(kit)
  const mailbox = useMailbox()
  const tab = usePluginState(kit, MAILBOX_SENDER_TAB)
  const setTab = useSetPluginState(kit, MAILBOX_SENDER_TAB)
  const pickedState = usePluginState(kit, MAILBOX_PICKED)
  const setPicked = useSetPluginState(kit, MAILBOX_PICKED)
  const { perform } = useActions()
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [shown, setShown] = useState<InboxShown>(FIRST_SHOWN)
  const rows = inboxOf(mailbox, tab)
  const from = inboxFrom(rows, pickedState, shown)
  // 今のタブに無い・消えた郵便は、選んでいないのと同じ
  const picked = pickedState === NO_STATE ? undefined : rows.find(m => m.id === pickedState)
  const pick = (m: Mail) => {
    setPicked(m.id)
    if (!m.seenAt) perform(MAIL_SEEN.id, {}, { record: m.id })
  }
  const switchTab = (kind: MailSenderKind) => {
    setTab(kind)
    setShown(FIRST_SHOWN)
    setChecked(new Set())
  }
  const toggleCheck = (id: string) =>
    setChecked(now => {
      const next = new Set(now)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const showFrom = (to: number) => {
    setShown({ from: to, anchor: pickedState })
    setChecked(new Set())
  }
  // チェックした郵便のうち、まだ今のタブにある物
  const checkedRows = rows.filter(m => checked.has(m.id))
  const now = new Date()
  return (
    <section
      className={`${styles.pane} ${className ?? ""}`}
      aria-label={t("Mailbox")}
      data-key-scope={MAILBOX_SCOPE}
      tabIndex={-1}
    >
      <section className={styles.inbox} aria-label={t("Inbox")}>
        <div className={styles.head}>
          <div className={styles.tabs} role="tablist">
            {TABS.map(({ kind, title }) => {
              const count = unreadOf(mailbox, kind)
              return (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={tab === kind}
                  className={styles.tab}
                  onClick={() => switchTab(kind)}
                >
                  {t(title)}
                  {count > 0 && <span className={styles.count}>{count}</span>}
                </button>
              )
            })}
          </div>
          <RemoveChecked mails={checkedRows} onRemoved={() => setChecked(new Set())} />
        </div>
        {rows.length === 0 ? (
          <p className={styles.empty}>{t("No mail")}</p>
        ) : (
          <ul className={styles.rows}>
            {rows.slice(from, from + INBOX_ROWS).map(m => (
              <Row
                key={m.id}
                mail={m}
                now={now}
                picked={m.id === picked?.id}
                checked={checked.has(m.id)}
                onPick={() => pick(m)}
                onCheck={() => toggleCheck(m.id)}
              />
            ))}
          </ul>
        )}
        {rows.length > INBOX_ROWS && (
          <div className={styles.range}>
            <IconButton small label={t("Newer mail")} disabled={from === 0} onClick={() => showFrom(from - INBOX_ROWS)}>
              {NEWER}
            </IconButton>
            <span>
              {t("{first}–{last} of {count}", {
                first: from + 1,
                last: Math.min(from + INBOX_ROWS, rows.length),
                count: rows.length,
              })}
            </span>
            <IconButton
              small
              label={t("Older mail")}
              disabled={from + INBOX_ROWS >= rows.length}
              onClick={() => showFrom(from + INBOX_ROWS)}
            >
              {OLDER}
            </IconButton>
          </div>
        )}
      </section>
      <section className={styles.reader}>{picked && <Reader mail={picked} />}</section>
    </section>
  )
}

function Row(p: { mail: Mail; now: Date; picked: boolean; checked: boolean; onPick: () => void; onCheck: () => void }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const m = p.mail
  const shown = shownOf(catalog, m, t)
  const title = clampChars(shown?.title ?? t("Mail"), TITLE_CHARS)
  // 消せなければ（認可ステップが止めたなど）、チェックできない
  const removable = useAllowedOn(MAIL_REMOVE.id, {}, { record: m.id }).ok
  return (
    <li className={styles.row} data-picked={p.picked} data-read={!!m.seenAt}>
      <input
        type="checkbox"
        className={styles.check}
        checked={p.checked}
        disabled={!removable}
        aria-label={t("Check {title}", { title })}
        onChange={p.onCheck}
      />
      <button type="button" className={styles.open} aria-current={p.picked} onClick={p.onPick}>
        <span className={styles.line}>
          <span className={own.unread} data-unread={!m.seenAt} />
          <span className={styles.from}>{m.from}</span>
          <time className={styles.time}>{shownTime(m.sentAt, p.now)}</time>
        </span>
        <span className={styles.line}>
          <span className={styles.title}>{title}</span>
          {shown?.mark && <span className={own.mark}>{shown.mark}</span>}
        </span>
      </button>
    </li>
  )
}

// ゴミ箱: チェックした郵便があるときだけ押せ、確かめてからまとめて消す（同じ同期の処理で続けて行うので、1 つのアクションバルク。どれかが断られれば、どれも消えない）
function RemoveChecked({ mails, onRemoved }: { mails: readonly Mail[]; onRemoved: () => void }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const { perform, showToast } = useActions()
  const [asking, setAsking] = useState(false)
  const remove = () => {
    setAsking(false)
    const refused = mails.map(m => perform(MAIL_REMOVE.id, {}, { record: m.id })).find(done => !done.ok)
    if (refused && !refused.ok) {
      showToast({ kind: "warn", message: refusalMessage(catalog, refused, kit.message("Could not remove the mail")) })
      return
    }
    onRemoved()
  }
  return (
    <>
      <Tip text={t("Remove the checked mail")}>
        <IconButton
          label={t("Remove the checked mail")}
          title={undefined}
          disabled={mails.length === 0}
          onClick={() => setAsking(true)}
        >
          {TRASH}
        </IconButton>
      </Tip>
      {asking && (
        <Confirm
          message={t("Remove {count} mail?", { count: mails.length })}
          ok={t("Remove")}
          cancel={t("Cancel")}
          onOk={remove}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  )
}

// 選んだ郵便の題・送り手・届いた時刻・本文（マークダウン）と、行き先のボタン（種類が下の行のウィジェットを置いていれば、その代わりにそれを描く）
function Reader({ mail }: { mail: Mail }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const shown = shownOf(catalog, mail, t)
  const books = useMatomezuState(s => s.books)
  const place = mailPlace(mail, books)
  const to = place === GONE ? undefined : (place ?? undefined)
  const open = useOpenPlace(mail)
  const kindView = useKindView(MAIL_ACTIONS, mail.mail)
  const Actions = kindView === NO_KIND_VIEW ? undefined : kindView
  return (
    <article className={styles.letter}>
      <h3 className={styles.subject}>{shown?.title ?? t("Mail")}</h3>
      <p className={own.meta}>
        {mail.from} · <time>{new Date(mail.sentAt).toLocaleString()}</time>
      </p>
      {shown?.body && <Body text={shown.body} of={mail.id} />}
      {place === GONE && <p className={own.gone}>{t("The place is not there")}</p>}
      <div className={own.buttons}>
        {Actions ? (
          <Actions mail={mail} showPlace={() => open.run(open.choices.primary)} />
        ) : (
          to &&
          open.choices.opens.map(c => (
            <ActionButton key={c} primary={c === open.choices.primary} onClick={() => open.run(c)}>
              {t(CHOICE_TITLES[c])}
            </ActionButton>
          ))
        )}
      </div>
    </article>
  )
}

function Body({ text, of }: { text: string; of: string }) {
  const document = useMarkdownDocument(text, of)
  const softBreak = softBreakOf(useUserSetting(SOFT_BREAK.id))
  return (
    <div className={styles.body} style={markdownDocumentOnSkin()}>
      <MarkdownDocumentView document={document} softBreak={softBreak} />
    </div>
  )
}

// 郵便 mail の行き先を開くボタンの並びと、押したボタンで開く関数。起点は、描いているスクリーンと上下に並んでいるブックスクリーンのカレントのステージ（上の行がブックスクリーンでなければ「開く」1 つ）
function useOpenPlace(mail: Mail): { choices: OpenChoices; run: (choice: OpenChoice) => void } {
  const here = useScreenIdHere()
  const start = useMatomezuState(s =>
    here === undefined
      ? NO_STAGE
      : stageAboveLower(
          s.window.screens.map(sc => ({ id: sc.id, currentStage: sc.stages?.current ?? NO_STAGE })),
          s.window.arrangementValue,
          here,
        ),
  )
  const stages = useMatomezuState(s => (start === NO_STAGE ? undefined : screenOfStage(s.window, start)?.stages))
  const read = useReadState()
  const actions = useStoreActions()
  const showPlace = useShowMailPlaceAt()
  const choices = (stages && openChoices(stages, start)) ?? WINDOW_CHOICES
  const run = (choice: OpenChoice) => {
    const to = placeNow(mail, read().books)
    if (!to) return
    if (start !== NO_STAGE && choice === "split") actions.split(start)
    const ws = start === NO_STAGE ? undefined : screenOfStage(read().window, start)?.stages
    // 「開く」は、行き先のブックを窓に出す（下の行に並べていれば、上の行の物をそのブックのブックスクリーンに替えて、替えた物は開いたまま見えなくなる）。ほかは起点のステージの並びに開く
    const target =
      choice === "here" || !ws
        ? here === undefined
          ? actions.showBookStage(to.book)
          : showBookInUpperRow(actions, () => read().window, here, to.book)
        : openStageOf(ws, start, choice)
    if (!target || target === NO_STAGE) return
    showPlace(target, mail)
    if (!mail.visitedAt) actions.perform(MAIL_VISITED.id, {}, { record: mail.id })
  }
  return { choices, run }
}
