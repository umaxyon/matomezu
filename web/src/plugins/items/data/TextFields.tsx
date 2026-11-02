// 編集のダイアログの、文字の領域を決める所: キャプション（寄せ）・区切り線・本文（寄せ。装飾できる。base の文字の領域の入力Formのコンポーネント）と、
// 文字の領域の置き場所（上・下・出さない）。箱のダイアログと同じ並び
import { useMessages } from "../../../plugin-api/ui"
import { BodyField, CaptionField, controlClass, DividerField, Field } from "../../base/ui"
import { type DataProps, TEXT_ATS } from "./data"
import { kit } from "./kit"

export type DataTextDraft = Pick<DataProps, "caption" | "rule" | "body" | "captionAlign" | "bodyAlign" | "textAt">

const TEXT_AT_TITLES = { top: "Top", bottom: "Bottom", none: "Hidden" } as const

export function TextFields({
  stage,
  text,
  onChange,
}: {
  stage: string
  text: DataTextDraft
  onChange: (t: DataTextDraft) => void
}) {
  const t = useMessages(kit)
  return (
    <>
      <CaptionField text={text} onChange={onChange} />
      <DividerField text={text} onChange={onChange} />
      <BodyField stage={stage} text={text} onChange={onChange} rows={3} />
      <Field label={t("Text position")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={text.textAt}
            onChange={e => onChange({ ...text, textAt: e.target.value as DataTextDraft["textAt"] })}
          >
            {TEXT_ATS.map(v => (
              <option key={v} value={v}>
                {t(TEXT_AT_TITLES[v])}
              </option>
            ))}
          </select>
        )}
      </Field>
    </>
  )
}
