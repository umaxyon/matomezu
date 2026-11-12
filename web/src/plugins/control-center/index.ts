// コントロールセンターのプラグイン: ビルトインのコントロールセンター。
// インスタンスのコントロールセンターにすると（createMatomezu の controlCenter: CONTROL_CENTER.id）、ブックの一覧などを変えるアクションを許す
import { defineBuiltin } from "../../plugin-api/builtin"
import { CONTROL_CENTER, FRONT_SCREEN, LIBRARY_MAXIMIZED, PICKED_ROOM, WORKROOM_LEAVE_DIALOG } from "./control-center"
import { kit } from "./kit"

export {
  CONTROL_CENTER,
  FRONT_SCREEN,
  LIBRARY_MAXIMIZED,
  PICKED_ROOM,
  WORKROOM_LEAVE_DIALOG,
} from "./control-center"

export const CONTROL_CENTER_PLUGIN = defineBuiltin(
  kit.plugin({
    controlCenters: [CONTROL_CENTER],
    pluginStates: [FRONT_SCREEN, PICKED_ROOM, LIBRARY_MAXIMIZED],
    dialogs: [WORKROOM_LEAVE_DIALOG],
  }),
)

declare module "../../core/catalog" {
  interface ControlCenterTable {
    "@matomezu/control-center:control-center": typeof CONTROL_CENTER
  }
  interface PluginStateTable {
    "@matomezu/control-center:front-screen": typeof FRONT_SCREEN
    "@matomezu/control-center:picked-room": typeof PICKED_ROOM
    "@matomezu/control-center:library-maximized": typeof LIBRARY_MAXIMIZED
  }
  interface DialogTable {
    "@matomezu/control-center:workroom-leave": typeof WORKROOM_LEAVE_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
