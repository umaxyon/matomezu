// 画像のプラグイン: 画像のページのタイプとそのプレゼンテーション、画像のフォルダ（システムフォルダ）と、画像のページをその中だけに置く認可ステップ、
// 書庫のメニューから画像を取り込むコマンドと、取り込むダイアログ（ページを作るのは base の page-create）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { IMPORT_IMAGES } from "./commands"
import { IMAGE, IMAGE_PRESENTATION, IMAGES, IMPORT_IMAGES_DIALOG } from "./image"
import { kit } from "./kit"
import { IN_IMAGES } from "./permission"

export const IMAGE_PLUGIN = defineBuiltin(
  kit.plugin({
    pageTypes: [IMAGE],
    presentations: [IMAGE_PRESENTATION],
    systemFolders: [IMAGES],
    permissions: [IN_IMAGES],
    commands: [IMPORT_IMAGES],
    dialogs: [IMPORT_IMAGES_DIALOG],
  }),
)

declare module "../../../core/catalog" {
  interface PageTypeTable {
    "@matomezu/image:image": typeof IMAGE
  }
  interface PresentationTable {
    "@matomezu/image:image": typeof IMAGE_PRESENTATION
  }
  interface SystemFolderTable {
    "@matomezu/image:images": typeof IMAGES
  }
  interface PermissionTable {
    "@matomezu/image:in-images": typeof IN_IMAGES
  }
  interface CommandTable {
    "@matomezu/image:import-images": typeof IMPORT_IMAGES
  }
  interface DialogTable {
    "@matomezu/image:import-images": typeof IMPORT_IMAGES_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
