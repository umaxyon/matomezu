// 編集のダイアログの、見た目と軸を選ぶ所: 見た目（表・棒・折れ線・円・散布図）と、見た目ごとの軸。
// 棒・折れ線は横軸と値の列（いくつでも。数の列だけ）、円はラベルと値の列 1 つ、散布図は X・Y（数の列）と点のラベル（任意）。
// 棒は向き、棒と円は並べ方（表の順・多い順・少ない順）と、値が 2 つ以上なら並べる値も選ぶ
import { useMessages } from "../../../plugin-api/ui"
import { controlClass, Field } from "../../base/ui"
import styles from "./DataDialog.module.css"
import { DATA_VIEWS, type DataViewKind } from "./data"
import { type AxesDraft, type Draft, toggleValue, withView } from "./draft"
import { kit } from "./kit"

const VIEW_TITLES = {
  table: "Table",
  bar: "Bar chart",
  line: "Line chart",
  pie: "Pie chart",
  scatter: "Scatter chart",
} as const

// 列の位置の select の値（選んでいなければ空）
const indexValue = (i: number | null) => (i === null ? "" : String(i))
const indexOf = (v: string) => (v === "" ? null : Number(v))

export function AxesFields({
  draft,
  axes,
  onChange,
}: {
  draft: Draft
  axes: AxesDraft
  onChange: (a: AxesDraft) => void
}) {
  const t = useMessages(kit)
  const view = axes.view
  const columns = draft.columns.map((c, i) => ({ ...c, i }))
  const numbers = columns.filter(c => c.type === "number")
  const one = view === "pie" || view === "scatter"
  const choose = t("Choose")
  const xTitle = view === "pie" ? t("Labels") : view === "scatter" ? t("X") : t("Category axis")
  const xChoices = view === "scatter" ? numbers : columns
  return (
    <div className={styles.axes}>
      <Field label={t("Look")}>
        {id => (
          <select
            id={id}
            className={controlClass}
            value={view}
            onChange={e => onChange(withView(axes, draft, e.target.value as DataViewKind))}
          >
            {DATA_VIEWS.map(v => (
              <option key={v} value={v}>
                {t(VIEW_TITLES[v])}
              </option>
            ))}
          </select>
        )}
      </Field>
      {view !== "table" && (
        <>
          <Field label={xTitle}>
            {id => (
              <select
                id={id}
                className={controlClass}
                value={indexValue(axes.x)}
                onChange={e => onChange({ ...axes, x: indexOf(e.target.value) })}
              >
                <option value="">{choose}</option>
                {xChoices.map(c => (
                  <option key={c.i} value={c.i}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {one ? (
            <Field label={view === "scatter" ? t("Y") : t("Values")}>
              {id => (
                <select
                  id={id}
                  className={controlClass}
                  value={indexValue(axes.values[0] ?? null)}
                  onChange={e => {
                    const i = indexOf(e.target.value)
                    onChange({ ...axes, values: i === null ? [] : [i], charts: [undefined] })
                  }}
                >
                  <option value="">{choose}</option>
                  {numbers.map(c => (
                    <option key={c.i} value={c.i}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : (
            <fieldset className={styles.values}>
              <legend>{t("Values")}</legend>
              {numbers.map(c => (
                <label key={c.i}>
                  <input
                    type="checkbox"
                    checked={axes.values.includes(c.i)}
                    onChange={() => onChange(toggleValue(axes, c.i))}
                  />
                  {c.name}
                </label>
              ))}
            </fieldset>
          )}
          {view === "scatter" && (
            <Field label={t("Point labels")}>
              {id => (
                <select
                  id={id}
                  className={controlClass}
                  value={indexValue(axes.label)}
                  onChange={e => onChange({ ...axes, label: indexOf(e.target.value) })}
                >
                  <option value="">{t("None")}</option>
                  {columns.map(c => (
                    <option key={c.i} value={c.i}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {view === "bar" && (
            <Field label={t("Direction")}>
              {id => (
                <select
                  id={id}
                  className={controlClass}
                  value={axes.bar}
                  onChange={e => onChange({ ...axes, bar: e.target.value as AxesDraft["bar"] })}
                >
                  <option value="vertical">{t("Vertical")}</option>
                  <option value="horizontal">{t("Horizontal")}</option>
                </select>
              )}
            </Field>
          )}
          {(view === "bar" || view === "pie") && (
            <Field label={t("Order")}>
              {id => (
                <select
                  id={id}
                  className={controlClass}
                  value={axes.sort}
                  onChange={e => onChange({ ...axes, sort: e.target.value as AxesDraft["sort"] })}
                >
                  <option value="none">{t("Table order")}</option>
                  <option value="desc">{t("Largest first")}</option>
                  <option value="asc">{t("Smallest first")}</option>
                </select>
              )}
            </Field>
          )}
          {view === "bar" && axes.sort !== "none" && axes.values.length > 1 && (
            <Field label={t("Order by")}>
              {id => (
                <select
                  id={id}
                  className={controlClass}
                  value={indexValue(axes.sortBy ?? axes.values[0] ?? null)}
                  onChange={e => onChange({ ...axes, sortBy: indexOf(e.target.value) })}
                >
                  {axes.values.map(i => (
                    <option key={i} value={i}>
                      {draft.columns[i]?.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </>
      )}
    </div>
  )
}
