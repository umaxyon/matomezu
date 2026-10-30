// 編集のダイアログの、文字の領域を決める所: キャプション（寄せ）・区切り線・本文（寄せ。装飾できる）と、文字の領域の置き場所（上・下・出さない）。箱のダイアログと同じ並び
import { useMessages } from "../../../plugin-api/ui"
import { BODY_MAX } from "../../base"
import { Choices, controlClass, Field, RichBody, rowClass, Switch, useAligns } from "../../base/ui"
import { type DataProps, TEXT_ATS } from "./data"
import { kit } from "./kit"

export type TextDraft = Pick<DataProps, "caption" | "rule" | "body" | "captionAlign" | "bodyAlign" | "textAt">

const TEXT_AT_TITLES = { top: "Top", bottom: "Bottom", none: "Hidden" } as const

export function TextFields({
  stage,
  text,
  onChange,
}: {
  stage: string
  text: TextDraft
  onChange: (t: TextDraft) => void
}) {
  const t = useMessages(kit)
  const aligns = useAligns()
  const hasBody = text.body !== ""
  return (
    <>
      <Field
        label={t("Caption")}
        aside={
          <Choices
            label={t("Caption alignment")}
            value={text.captionAlign}
            options={aligns}
            onChange={captionAlign => onChange({ ...text, captionAlign })}
          />
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
      <div className={rowClass}>
        <span>{t("Divider")}</span>
        <Switch
          label={t("Divider")}
          checked={text.rule}
          disabled={!hasBody}
          onChange={rule => onChange({ ...text, rule })}
        />
      </div>
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
            rows={3}
            maxLength={BODY_MAX}
            value={text.body}
            onChange={body => onChange({ ...text, body, rule: !hasBody && body !== "" ? true : text.rule })}
          />
        )}
      </Field>
      <Field label={t("Text position")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={text.textAt}
            onChange={e => onChange({ ...text, textAt: e.target.value as TextDraft["textAt"] })}
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
