// ステージのメニューのボタン（ウィジェット stage-menu-buttons）: 配置のメニュー stage-menu の項目を横に並べる。項目はコマンドを呼び、ドロワーの中ならドロワーを下げる
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { type MenuCommandId, type MenuItem, menuCommands } from "../../../ui/layout"
import { useMenu, useMenuCommand } from "../../../ui/menu"
import { useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { useCloseDrawer } from "./drawer-context"
import { STAGE_MENU } from "./menu"
import styles from "./StageMenuButtons.module.css"

export function StageMenuButtons({ stage }: { stage: string }) {
  const items = useMenu(STAGE_MENU)
  return (
    <div className={styles.buttons}>
      {items.map(item => (
        <MenuEntry key={menuCommands(item).join(" ")} stage={stage} item={item} />
      ))}
    </div>
  )
}

// 項目 1 つ。切り替えなら出ているコマンドを出し、どれも出ていなければ描かない
function MenuEntry({ stage, item }: { stage: string; item: MenuItem }) {
  const id = useMenuCommand(stage, item)
  return id ? <MenuButton stage={stage} id={id} /> : null
}

// コマンドのボタン。アイコンが無ければ名前を出し、押されている状態はコマンドの active、押せるかは enabled
function MenuButton({ stage, id }: { stage: string; id: MenuCommandId }) {
  const command = useCommand(stage, id)
  const icon = useUiCatalog().commandIcons.get(id)
  const close = useCloseDrawer()
  const t = useMessages(kit)
  return (
    <button
      type="button"
      className={styles.item}
      aria-label={t(command.title)}
      aria-pressed={command.active}
      disabled={!command.enabled}
      onClick={() => {
        command.run()
        close?.()
      }}
    >
      {icon ?? t(command.title)}
    </button>
  )
}
