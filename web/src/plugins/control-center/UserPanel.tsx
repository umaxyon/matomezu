// 左の列の最上段: 題（全体設定の歯車）・あなた・郵便/書庫/プロジェクトのボタン。郵便は左サイドパネルの郵便箱を開閉し、全体設定は設定画面を開く
import type { ReactNode } from "react"
import { useCommand, useMessages, useUiCatalog } from "../../plugin-api/ui"
import { Band, IconButton, Panel, Tip, useMailboxPanel, useWideSearchPanel } from "../base/ui"
import type { FrontScreen } from "./control-center"
import { AvatarIcon, GearIcon, LibraryIcon, MailIcon, ProjectIcon, SearchIcon } from "./icons"
import { kit } from "./kit"
import styles from "./UserPanel.module.css"

// 巣箱のボタンのコマンドの id（別のプラグインの定義は id で選ぶ。絵を引くのに使う）
const BIRDHOUSE_COMMAND = "@matomezu/base:control-center-toggle"

type Tile = { label: string; icon: ReactNode; onClick: () => void; pressed: boolean }

export function UserPanel({ screen, onShow }: { screen: FrontScreen; onShow: (to: FrontScreen) => void }) {
  const t = useMessages(kit)
  const mailbox = useMailboxPanel()
  const wideSearch = useWideSearchPanel()
  const settings = useCommand("@matomezu/base:settings-open")
  // 題の左の巣箱の絵（見た目だけ。帯やフッターの巣箱のボタンと同じ絵を、そのコマンドの id で引く）
  const birdhouse = useUiCatalog().commandIcons.get(BIRDHOUSE_COMMAND)
  const tiles: Tile[] = [
    { label: t("Mailbox"), icon: <MailIcon />, onClick: mailbox.toggle, pressed: mailbox.open },
    { label: t("Library"), icon: <LibraryIcon />, onClick: () => onShow("library"), pressed: screen === "library" },
    { label: t("Projects"), icon: <ProjectIcon />, onClick: () => onShow("projects"), pressed: screen === "projects" },
    { label: t("Wide search"), icon: <SearchIcon />, onClick: wideSearch.toggle, pressed: wideSearch.open },
  ]
  return (
    <Panel>
      <Band spread>
        <h1 className={styles.title}>
          <span className={styles.birdhouse}>{birdhouse}</span>
          {t("Control center")}
        </h1>
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
