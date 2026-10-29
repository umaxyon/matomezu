// 入力のダイアログのコンポーネント: 名前の付いた入力Formと、決めるボタンの行・見出しの行に置くボタン、区分・横に並べる行・名前と入力の組。
// 見た目の決まり（文字・余白・区分・ボタン）は Dialog.module.css の冒頭
import { type ReactNode, useId } from "react"
import styles from "./Dialog.module.css"

export const controlClass = styles.control
export const rowClass = styles.row
export const inlineClass = styles.inline // 横に並べる行（入らなければ次の行へ）
export const pairClass = styles.pair // 名前と入力の組
export const dividerClass = styles.divider // 横に並べた物の間の縦の線

// 区分: 見出しと右へ伸びる線、その下に入力Form（Dialog.module.css の冒頭の決まり）
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className={styles.section}>
      <legend className={styles.sectionTitle}>{title}</legend>
      {children}
    </fieldset>
  )
}

// 決められなかった理由の 1 行（決めるボタンを押して断られたとき）
export function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className={styles.problem}>
      {children}
    </p>
  )
}

// children は入力Formの id を受け取って、入力のコンポーネントを返す。aside は名前の行の右に置くコンポーネント
export function Field({
  label,
  aside,
  children,
}: {
  label: string
  aside?: ReactNode
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      {children(id)}
    </div>
  )
}

// 選択肢から 1 つを選ぶボタンの並び（名前は label。選択肢ごとに値・名前・中身のアイコン。中は見えないラジオボタン）
export function Choices<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: V
  options: readonly { value: V; label: string; icon: ReactNode }[]
  onChange: (value: V) => void
}) {
  const name = useId()
  return (
    <fieldset aria-label={label} className={styles.choices}>
      {options.map(o => (
        <label key={o.value} className={styles.choice} title={o.label}>
          <input
            type="radio"
            className={styles.radio}
            name={name}
            value={o.value}
            aria-label={o.label}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
          />
          {o.icon}
        </label>
      ))}
    </fieldset>
  )
}

// 文字の選択肢の中身（Choices の icon に渡す。ボタンは文字の幅だけ広がる）
export function ChoiceText({ children }: { children: ReactNode }) {
  return <span className={styles.choiceText}>{children}</span>
}

// 継承できる設定の、選択肢から 1 つを選ぶボタンの並び（ページの設定がブックの設定を継承するときなど）。左端に継承のボタン
// （文字で inherit.label、ポインタを乗せた名前は inherit.title。選ぶと値は undefined）を置き、続けて選択肢を Choices と同じに並べる
export function InheritChoices<V extends string>({
  label,
  inherit,
  value,
  options,
  onChange,
}: {
  label: string
  inherit: { label: string; title: string }
  value: V | undefined
  options: readonly { value: V; label: string; icon: ReactNode }[]
  onChange: (value: V | undefined) => void
}) {
  const all = [{ value: "" as const, label: inherit.title, icon: <ChoiceText>{inherit.label}</ChoiceText> }, ...options]
  return <Choices<V | ""> label={label} value={value ?? ""} options={all} onChange={v => onChange(v || undefined)} />
}

// 入力Formを並べた form。決めるボタンか、決めるキー（キーの割り当ての dialog-submit）で onSubmit。ready でなければ送らない。
// 1 行のテキストFormの Enter でブラウザが送る動き（暗黙の送信）は止める（Enter はキーの割り当てが受ける）。
// submit があれば最後の行の右に決めるボタンを置き、無ければ置かない（見出しの行に ActionButton で置くときは、id をその form に渡す）
export function Form({
  id,
  submit,
  ready,
  disabled = false,
  onSubmit,
  children,
}: {
  id?: string
  submit?: string
  ready: boolean
  disabled?: boolean // 中の項目を全部押せなくする（認可ステップが止めているときなど）
  onSubmit: () => void
  children: ReactNode
}) {
  return (
    <form
      id={id}
      className={styles.form}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault()
      }}
      onSubmit={e => {
        e.preventDefault()
        if (ready) onSubmit()
      }}
    >
      <fieldset className={styles.fields} disabled={disabled}>
        {children}
      </fieldset>
      {submit && (
        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={!ready}>
            {submit}
          </button>
        </div>
      )}
    </form>
  )
}

// 入り切りのスイッチ（名前は label。切れていて押せない間は、入っていても切れて見せる）
export function Switch({
  id,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  id?: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      className={styles.switch}
      aria-label={label}
      aria-checked={checked && !disabled}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  )
}

// 見出しの行などに置くボタン。form を渡すと、その form を送るボタンになる（primary は強調する）。
// pressed を渡すと、押すたびに入り切りする印のボタン（入っている間は強調の色の縁取り）。danger は消すなど取り消せない操作のボタン（赤い文字と縁）
export function ActionButton({
  form,
  primary = false,
  danger = false,
  disabled = false,
  pressed,
  onClick,
  children,
}: {
  form?: string
  primary?: boolean
  danger?: boolean
  disabled?: boolean
  pressed?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type={form ? "submit" : "button"}
      form={form}
      className={primary ? styles.submit : styles.plain}
      data-danger={danger || undefined}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// セレクトFormとボタンをつなげたコンポーネント: 選んだ値でボタンの動きをする（例: [最大行 ▾](にそろえる)）。label はセレクトFormの名前
export function SelectButton<V extends string>({
  label,
  value,
  options,
  button,
  onChange,
  onClick,
}: {
  label: string
  value: V
  options: readonly { value: V; label: string }[]
  button: string // ボタンの名前
  onChange: (value: V) => void
  onClick: () => void
}) {
  return (
    <span className={styles.selectButton}>
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value as V)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={onClick}>
        {button}
      </button>
    </span>
  )
}

// スイッチと、入れているときだけその下に開く枠（スイッチに属する入力Form。地の色を変えた四角い枠で、サブメニューと分かるように）。
// 開け閉めは高さを滑らかに変える。onChange はスイッチを押したとき（入れるか切るかは使う側が決める）
export function SwitchPanel({
  label,
  title,
  checked,
  onChange,
  children,
}: {
  label: string
  title?: string // 枠の中の見出し（区分の見出しと同じ見た目で、線は無い）
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <div className={styles.switchPanel} data-open={checked}>
      <div className={styles.row}>
        <span>{label}</span>
        <Switch label={label} checked={checked} onChange={onChange} />
      </div>
      <div className={styles.panelSlide} inert={!checked} aria-hidden={!checked}>
        <fieldset className={styles.panel}>
          {title && <legend className={styles.panelTitle}>{title}</legend>}
          {children}
        </fieldset>
      </div>
    </div>
  )
}
