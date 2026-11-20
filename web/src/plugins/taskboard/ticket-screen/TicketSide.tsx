// チケットスクリーンの右の領域: 出し入れする枠と、その中の本文の枠（4 つの並べ方・最大化・編集とプレビュー）とチケット履歴の質問の枠
import { useMemo, useState } from "react"
import { useMessages, useUserSetting } from "../../../plugin-api/ui"
import { wordLinksOf } from "../../base"
import {
  MARKDOWN_PANE_MODE_ICONS,
  MarkdownDocumentView,
  MaxButton,
  markdownDocumentOnSkin,
  useMarkdownDocument,
} from "../../base/ui"
import { kit } from "../kit"
import type { TicketScreenState } from "."
import { LinkedText } from "./LinkedText"
import styles from "./TicketScreen.module.css"
import { useTicketRefs } from "./useTicketRefs"
import { type HistoryRow, whenOf } from "./view"
import { WriterBird } from "./WriterBird"

const MODES = [
  { mode: "source-only", label: "Source only" },
  { mode: "split-row", label: "Side by side" },
  { mode: "split-column", label: "Top and bottom" },
  { mode: "rendered-only", label: "Preview only" },
] as const

// 右の領域の枠: 閉じている間は右へ出し、操作も読み上げも受けない
export function Side({
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

// 本文の枠: 帯（題・4 つの並べ方・最大化）と、編集（原文）とプレビュー
export function BodyPanes({
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
  // 本文の文中のチケットの番号は、今あるチケットのときだけリンクにする（原文は変えない）
  const refs = useTicketRefs(ticket)
  const wordLinks = useMemo(() => wordLinksOf(document, refs.find), [document, refs.find])
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
                <MarkdownDocumentView
                  document={document}
                  softBreak={softBreak}
                  wordLinks={wordLinks}
                  onWordLink={refs.open}
                />
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
export function QuestionView({ ticket, row, onClose }: { ticket: string; row: HistoryRow; onClose: () => void }) {
  const t = useMessages(kit)
  const refs = useTicketRefs(ticket)
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
      <p className={styles.questionText}>
        <LinkedText text={row.text} find={refs.find} open={refs.open} />
      </p>
    </>
  )
}
