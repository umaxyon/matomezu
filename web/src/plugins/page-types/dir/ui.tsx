// ディレクトリ構成図のプラグインの見た目: ビュー・説明の見せ方の設定のスイッチ・ページを作るダイアログ・中身の設定のダイアログ・鉛筆の道具のアイコン。
// 末尾で、ビューが開く右クリックのメニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../../plugin-api/ui"
import { BookIcon, BookOpenIcon, FolderIcon, FolderOpenIcon } from "../../base/ui"
import { DIR_PLUGIN } from "."
import { DIR, DIR_PRESENTATION, NEW_DIR_PAGE_DIALOG, NODE_SETTINGS_DIALOG } from "./dir"
import { DIR_TOOL_ICONS } from "./icons"
import { NewDirPageDialog } from "./NewDirPageDialog"
import { NodeSettingsDialog } from "./NodeSettingsDialog"
import { NoteSetting } from "./NoteSetting"
import { ICON_BOOK, ICON_CLASS_DIAGRAM, ICON_DIRECTORY, ICON_FILE, ICON_FOLDER, ICON_HTML } from "./node-icon-enum"
import { ClassDiagramIcon, DirectoryIcon, FileIcon, HtmlIcon } from "./node-icons"
import { NOTES } from "./notes"
import { DIR_VIEW } from "./view/ui"

export const DIR_UI = definePluginUi(DIR_PLUGIN, {
  pageTypeIcons: { [DIR.id]: <DirectoryIcon /> },
  enumValueIcons: {
    [ICON_FOLDER.id]: { closed: <FolderIcon />, open: <FolderOpenIcon /> },
    [ICON_BOOK.id]: { closed: <BookIcon />, open: <BookOpenIcon /> },
    [ICON_FILE.id]: <FileIcon />,
    [ICON_DIRECTORY.id]: <DirectoryIcon />,
    [ICON_CLASS_DIAGRAM.id]: <ClassDiagramIcon />,
    [ICON_HTML.id]: <HtmlIcon />,
  },
  presentationViews: { [DIR_PRESENTATION.id]: DIR_VIEW },
  settingViews: {
    [NOTES.id]: { control: NoteSetting },
  },
  dialogViews: { [NEW_DIR_PAGE_DIALOG.id]: NewDirPageDialog, [NODE_SETTINGS_DIALOG.id]: NodeSettingsDialog },
  toolIcons: DIR_TOOL_ICONS,
})

declare module "../../../core/catalog" {
  interface ContextMenuTable {
    "@matomezu/dir:dir-context": Record<string, never> // 紙の画面（何も受け取らない）
    "@matomezu/dir:node-context": Record<string, never> // 行（右クリックした行を選んでから開くので、何も受け取らない）
  }
}
