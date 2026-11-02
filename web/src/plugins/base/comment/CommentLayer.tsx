// コメントのレイヤー（ウィジェット comment-layer）: 開いているブックのコメントを、付けた物の最後の 1 つのそばにスタンドで出す。
// 吹き出しを出すコメントは物の右に吹き出しを（幅は決まった幅で、上の辺をそろえて下へ伸びる）、たたんだコメントは物の右上の角にコメントの絵を出す。
// 絵か吹き出しを押すと、右サイドパネルにそのコメントを出す（吹き出しを出すかのデータは変えない）。
// コメントの下書き（commands.ts の COMMENT_DRAFT）があれば、その吹き出しも出す。吹き出しの色はスキンの bubble だけで、物やコメントの様子では変えない
import { useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useAnnotationsOf, usePerformOrToast } from "../annotation-hooks"
import type { AnchorTargets } from "../context-menu/anchor-targets"
import { useAnchorTargets, useSetAnchorTargets } from "../context-menu/use-anchor-targets"
import { kit } from "../kit"
import { useOpenRightSidePanel } from "../right-side-panel/hooks"
import { Stand } from "../utils/anchors"
import type { StageSlotProps } from "../workspace/ui"
import { COMMENT, COMMENT_ADD, type CommentProps } from "."
import styles from "./CommentLayer.module.css"
import { CommentThread, GrowingText } from "./CommentThread"
import { COMMENT_DRAFT } from "./commands"
import { COMMENT_THREAD_ID } from "./thread-id"

export function CommentLayer({ stage }: StageSlotProps) {
  const comments = useAnnotationsOf(stage, COMMENT.id)
  const draft = useAnchorTargets(stage, COMMENT_DRAFT)
  return (
    <>
      {comments.map(c => (
        <CommentStand
          key={c.id}
          stage={stage}
          id={c.id}
          anchor={c.anchors.at(-1) ?? ""}
          props={c.props as CommentProps}
        />
      ))}
      {draft && <DraftStand key={draft.anchors.join(" ")} stage={stage} draft={draft} />}
    </>
  )
}

function CommentStand({
  stage,
  id,
  anchor,
  props,
}: {
  stage: string
  id: string
  anchor: string
  props: CommentProps
}) {
  const t = useMessages(kit)
  const openPanel = useOpenRightSidePanel()
  const open = () => openPanel(stage, { widget: COMMENT_THREAD_ID, subject: id, anchor })
  if (props.bubble)
    return (
      <Stand anchor={anchor} side="right" label={t("Comment")}>
        <div className={styles.bubble}>
          <CommentThread stage={stage} id={id} props={props} onOpen={open} />
        </div>
      </Stand>
    )
  return (
    <Stand anchor={anchor} side="corner" label={t("Comment")}>
      <button type="button" className={styles.folded} aria-label={t("Open comment")} onClick={open}>
        <CommentIcon />
      </button>
    </Stand>
  )
}

// コメントの下書きの吹き出し: 文と、返事が欲しいか指すだけかを選び、付ける。Esc かキャンセルで、付けずに閉じる
function DraftStand({ stage, draft }: { stage: string; draft: AnchorTargets }) {
  const t = useMessages(kit)
  const run = usePerformOrToast(stage, "The comment was refused")
  const [text, setText] = useState("")
  const [ask, setAsk] = useState<CommentProps["ask"]>("reply")
  const setDraft = useSetAnchorTargets(COMMENT_DRAFT)
  const end = () => setDraft(stage, null)
  const add = () => {
    if (text.trim() !== "" && run(COMMENT_ADD.id, { anchors: [...draft.anchors], text, ask })) end()
  }
  return (
    <Stand anchor={draft.anchors.at(-1) ?? ""} side="right" label={t("Add comment")}>
      <div className={styles.bubble}>
        <GrowingText
          value={text}
          onChange={setText}
          placeholder={t("Comment…")}
          onSubmit={add}
          onEscape={end}
          label={t("Comment")}
          autoFocus
        />
        <fieldset className={styles.asks} aria-label={t("Asks for")}>
          {(["reply", "point"] as const).map(a => (
            <label key={a} className={ask === a ? styles.askOn : styles.ask}>
              <input
                type="radio"
                className={styles.radio}
                name={`${stage}-ask`}
                checked={ask === a}
                onChange={() => setAsk(a)}
              />
              {t(a === "reply" ? "Wants a reply" : "Only pointing")}
            </label>
          ))}
        </fieldset>
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} disabled={text.trim() === ""} onClick={add}>
            {t("Add")}
          </button>
          <button type="button" className={styles.button} onClick={end}>
            {t("Cancel")}
          </button>
        </div>
      </div>
    </Stand>
  )
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  )
}
