// 左の列の最上段: 題（全体設定の歯車）・あなた・郵便/書庫/プロジェクトのボタン。郵便は左サイドパネルの郵便箱を開閉し、全体設定は設定画面を開く
import type { ReactNode } from "react"
import { useCommand, useMessages, useScreenId } from "../../plugin-api/ui"
import { Band, IconButton, Panel, Tip, useMailboxPanel } from "../base/ui"
import type { FrontScreen } from "./control-center"
import { AvatarIcon, GearIcon, LibraryIcon, MailIcon, ProjectIcon } from "./icons"
import { kit } from "./kit"
import styles from "./UserPanel.module.css"

type Tile = { label: string; icon: ReactNode; onClick: () => void; pressed: boolean }

export function UserPanel({ screen, onShow }: { screen: FrontScreen; onShow: (to: FrontScreen) => void }) {
  const t = useMessages(kit)
  const mailbox = useMailboxPanel()
  const settings = useCommand(useScreenId(), "@matomezu/base:settings-open")
  const tiles: Tile[] = [
    { label: t("Mailbox"), icon: <MailIcon />, onClick: mailbox.toggle, pressed: mailbox.open },
    { label: t("Library"), icon: <LibraryIcon />, onClick: () => onShow("library"), pressed: screen === "library" },
    { label: t("Projects"), icon: <ProjectIcon />, onClick: () => onShow("projects"), pressed: screen === "projects" },
  ]
  return (
    <Panel>
      <Band spread>
        <h1 className={styles.title}>{t("Control center")}</h1>
        <IconButton label={t("Global settings")} onClick={() => settings.run()}>
          <GearIcon />
        </IconButton>
      </Band>
      <div className={styles.me}>
        <AvatarIcon />
        <span className={styles.meName}>{t("You")}</span>
      </div>
      <div className={styles.tiles}>
        {tiles.map(tile => (
          <Tip key={tile.label} text={tile.label}>
            <button
              type="button"
              className={styles.tile}
              aria-label={tile.label}
              aria-pressed={tile.pressed}
              onClick={tile.onClick}
            >
              {tile.icon}
            </button>
          </Tip>
        ))}
      </div>
    </Panel>
  )
}
