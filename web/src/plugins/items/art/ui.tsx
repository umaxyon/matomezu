// シェイプの見た目: 絵ごとのビューとアイコン、追加のダイアログ（絵ごと）と編集のダイアログ（共通）
import { definePluginUi } from "../../../plugin-api/ui"
import { ART_PLUGIN } from "."
import { AddArtDialog, EditArtDialog } from "./ArtDialog"
import { artIcon, artView } from "./ArtView"
import { ART_EDIT_DIALOG, ARTS } from "./art"
import { PICTURES } from "./pictures"

export const ART_UI = definePluginUi(ART_PLUGIN, {
  items: Object.fromEntries(
    ARTS.map(a => [a.item.id, { view: artView(PICTURES[a.name]), icon: artIcon(PICTURES[a.name]) }]),
  ) as Record<
    (typeof ARTS)[number]["item"]["id"],
    { view: ReturnType<typeof artView>; icon: ReturnType<typeof artIcon> }
  >,
  dialogViews: {
    ...(Object.fromEntries(ARTS.map(a => [a.add.id, AddArtDialog])) as Record<
      (typeof ARTS)[number]["add"]["id"],
      typeof AddArtDialog
    >),
    [ART_EDIT_DIALOG.id]: EditArtDialog,
  },
})
