// 利用者の設定の項目の行: 左に名前（幅をそろえる）、右に入力Form。項目のビュー（userSettingViews）も、この行で並びをそろえる。
// as を label にすると、行全体が入力Form の名前になる（入力Form が 1 つのとき）。help があれば名前の右に「？」を置く（label の中にボタンを置くと、
// ボタンが名前の指す相手になるので、そのときは行を div にし、名前を入力Form に結ぶのは入力Form の aria-label に任せる）
import type { ReactNode } from "react"
import type { SettingDef } from "../../../core/def/setting"
import type { MessageKey } from "../../../core/i18n/i18n"
import { NO_HELP } from "../../../ui/plugin"
import { HelpButton } from "../utils/HelpButton"
import styles from "./UserSettings.module.css"

export function SettingRow({
  label,
  help,
  as = "div",
  children,
}: {
  label: string
  help?: string | typeof NO_HELP
  as?: "div" | "label"
  children: ReactNode
}) {
  const Row = help === undefined || help === NO_HELP ? as : "div"
  return (
    <Row className={styles.row}>
      <span className={styles.label}>
        {label}
        {help !== undefined && help !== NO_HELP && <HelpButton text={help} label={label} />}
      </span>
      {children}
    </Row>
  )
}

// 設定の項目 def の説明を t で訳した文（help が無ければ NO_HELP）。設定のコンポーネントに渡す。文言にあることは台帳アセンブルで確かめてある（OPTION_TITLES_CHECK）
export const helpOf = (def: SettingDef, t: (key: MessageKey) => string): string | typeof NO_HELP =>
  def.help === undefined ? NO_HELP : t(def.help as MessageKey)
