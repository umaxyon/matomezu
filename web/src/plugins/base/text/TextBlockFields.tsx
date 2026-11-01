// 文字の領域の入力Formのコンポーネント: キャプション（と寄せ）・区切り線・本文（と寄せ。装飾できる）を、別々のコンポーネントにする（並べ方は使うダイアログが決める）。
// どれも文字の項目の下書き text を受け、変えた下書きを onChange で返す。区切り線は本文が空の間は押せず、本文を書き始めると入る。本文は BODY_MAX 字まで
import type { ReactNode } from "react"
import { useMessages } from "../../../ui/i18n"
import { Choices, controlClass, Field, rowClass, Switch } from "../dialog-host/FormParts"
import { useAligns } from "../item-parts/parts"
import { kit } from "../kit"
import { type Align, BODY_MAX } from "./fields"
import { RichBody } from "./RichBody"
import styles from "./TextBlockFields.module.css"

export interface TextDraft {
  caption: string
  rule: boolean
  body: string
  captionAlign: Align
  bodyAlign: Align
}

// キャプション: aside は、寄せの隣に並べるほかの選択（無ければ寄せだけ）。本文を持たない物（形・リストの名前など）も使える
export function CaptionField<T extends Pick<TextDraft, "caption" | "captionAlign">>({
  text,
  onChange,
  aside,
}: {
  text: T
  onChange: (text: T) => void
  aside?: ReactNode
}) {
  const t = useMessages(kit)
  const aligns = useAligns()
  return (
    <Field
      label={t("Caption")}
      aside={
        <span className={styles.aligns}>
          <Choices
            label={t("Caption alignment")}
            value={text.captionAlign}
            options={aligns}
            onChange={captionAlign => onChange({ ...text, captionAlign })}
          />
          {aside}
        </span>
      }
    >
      {id => (
        <input
          id={id}
          className={controlClass}
          value={text.caption}
          onChange={e => onChange({ ...text, caption: e.target.value })}
        />
      )}
    </Field>
  )
}

export function DividerField<T extends TextDraft>({ text, onChange }: { text: T; onChange: (text: T) => void }) {
  const t = useMessages(kit)
  return (
    <div className={rowClass}>
      <span>{t("Divider")}</span>
      <Switch
        label={t("Divider")}
        checked={text.rule}
        disabled={text.body === ""}
        onChange={rule => onChange({ ...text, rule })}
      />
    </div>
  )
}

// 本文: stage は色を決めるブックを開いているステージ、rows は入力Formの高さの行の数
export function BodyField<T extends TextDraft>({
  stage,
  text,
  onChange,
  rows,
}: {
  stage: string
  text: T
  onChange: (text: T) => void
  rows: number
}) {
  const t = useMessages(kit)
  const aligns = useAligns()
  return (
    <Field
      label={t("Body")}
      aside={
        <Choices
          label={t("Body alignment")}
          value={text.bodyAlign}
          options={aligns}
          onChange={bodyAlign => onChange({ ...text, bodyAlign })}
        />
      }
    >
      {id => (
        <RichBody
          id={id}
          stage={stage}
          label={t("Body")}
          rows={rows}
          maxLength={BODY_MAX}
          value={text.body}
          onChange={body => onChange({ ...text, body, rule: text.body === "" && body !== "" ? true : text.rule })}
        />
      )}
    </Field>
  )
}
