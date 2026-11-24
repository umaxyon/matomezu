// 左の列の最上段: 題（全体設定の歯車）・あなた・郵便/書庫/プロジェクトのボタン。郵便箱はコンテンツエリアを郵便箱の画面に替え、全体設定は設定画面を開く。
// 新しい版があれば、題の左の巣箱が金色と元の色を行き来し、押すと設定画面の「更新」を開く
import type { ReactNode } from "react"
import { NO_NAME } from "../../plugin-api"
import { useCommand, useMessages, useUiCatalog } from "../../plugin-api/ui"
import {
  Band,
  GearIcon,
  IconButton,
  NO_UPDATE_STATUS,
  Panel,
  Tip,
  useOpenSettings,
  useUpdateStatus,
  useUserName,
  useWideSearchPanel,
} from "../base/ui"
import type { ContentArea } from "./control-center"
import { AvatarIcon, LibraryIcon, MailIcon, ProjectIcon, SearchIcon } from "./icons"
import { kit } from "./kit"
import styles from "./UserPanel.module.css"

// 巣箱のボタンのコマンドの id（別のプラグインの定義は id で選ぶ。絵を引くのに使う）
const BIRDHOUSE_COMMAND = "@matomezu/base:screen-toggle"
// 設定画面の「更新」の設定カテゴリの id
const UPDATE_CATEGORY = "@matomezu/base:settings-update"

type Tile = { label: string; icon: ReactNode; onClick: () => void; pressed: boolean }

export function UserPanel({ screen, onShow }: { screen: ContentArea; onShow: (to: ContentArea) => void }) {
  const t = useMessages(kit)
  const userName = useUserName()
  const wideSearch = useWideSearchPanel()
  const settings = useCommand("@matomezu/base:settings-open")
  // 題の左の巣箱の絵（見た目だけ。チケットの帯の巣箱のボタンと同じ絵を、そのコマンドの id で引く）
  const birdhouse = useUiCatalog().commandIcons.get(BIRDHOUSE_COMMAND)
  const update = useUpdateStatus()
  const newer = update !== NO_UPDATE_STATUS && update.state === "newer"
  const openUpdates = useOpenSettings(UPDATE_CATEGORY)
  const tiles: Tile[] = [
    { label: t("Mailbox"), icon: <MailIcon />, onClick: () => onShow("mailbox"), pressed: screen === "mailbox" },
    { label: t("Library"), icon: <LibraryIcon />, onClick: () => onShow("library"), pressed: screen === "library" },
    { label: t("Projects"), icon: <ProjectIcon />, onClick: () => onShow("projects"), pressed: screen === "projects" },
    { label: t("Wide search"), icon: <SearchIcon />, onClick: wideSearch.toggle, pressed: wideSearch.open },
  ]
  return (
    <Panel>
      <Band spread>
        <h1 className={styles.title}>
          {newer ? (
            <Tip text={t("An update is available")} align="start">
              <button
                type="button"
                className={styles.birdhouse}
                data-newer=""
                aria-label={t("An update is available")}
                onClick={openUpdates}
              >
                {birdhouse}
              </button>
            </Tip>
          ) : (
            <span className={styles.birdhouse}>{birdhouse}</span>
          )}
          {t("Control center")}
        </h1>
        <IconButton label={t("Global settings")} onClick={() => settings.run()}>
          <GearIcon />
        </IconButton>
      </Band>
      <div className={styles.me}>
        <AvatarIcon />
        <span className={styles.meName}>{userName === NO_NAME ? t("You") : userName}</span>
      </div>
      <div className={styles.tiles}>
        {tiles.map(tile => (
          <Tip key={tile.label} text={tile.label} align="start">
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
