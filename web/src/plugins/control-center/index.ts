// コントロールセンターのプラグイン: ビルトインのコントロールセンター。
// インスタンスのコントロールセンターにすると（createMatomezu の controlCenter: CONTROL_CENTER.id）、ブックの一覧などを変えるアクションを許す
import { defineBuiltin } from "../../plugin-api/builtin"
import {
  CONTROL_CENTER,
  CONTROL_CENTER_SCREEN,
  FRONT_SCREEN,
  LIBRARY_MAXIMIZED,
  PICKED_ROOM,
  PICKED_VISITOR,
  VISITOR_LEAVE_DIALOG,
  WORKROOM_LEAVE_DIALOG,
} from "./control-center"
import { kit } from "./kit"

export {
  CONTROL_CENTER,
  CONTROL_CENTER_SCREEN,
  FRONT_SCREEN,
  LIBRARY_MAXIMIZED,
  PICKED_ROOM,
  PICKED_VISITOR,
  VISITOR_LEAVE_DIALOG,
  WORKROOM_LEAVE_DIALOG,
} from "./control-center"

export const CONTROL_CENTER_PLUGIN = defineBuiltin(
  kit.plugin({
    controlCenters: [CONTROL_CENTER],
    screens: [CONTROL_CENTER_SCREEN],
    pluginStates: [FRONT_SCREEN, PICKED_ROOM, PICKED_VISITOR, LIBRARY_MAXIMIZED],
    dialogs: [WORKROOM_LEAVE_DIALOG, VISITOR_LEAVE_DIALOG],
  }),
)

declare module "../../core/catalog" {
  interface ControlCenterTable {
    "@matomezu/control-center:control-center": typeof CONTROL_CENTER
  }
  interface ScreenTable {
    "@matomezu/control-center:screen": typeof CONTROL_CENTER_SCREEN
  }
  interface PluginStateTable {
    "@matomezu/control-center:front-screen": typeof FRONT_SCREEN
    "@matomezu/control-center:picked-room": typeof PICKED_ROOM
    "@matomezu/control-center:picked-visitor": typeof PICKED_VISITOR
    "@matomezu/control-center:library-maximized": typeof LIBRARY_MAXIMIZED
  }
  interface DialogTable {
    "@matomezu/control-center:workroom-leave": typeof WORKROOM_LEAVE_DIALOG
    "@matomezu/control-center:visitor-leave": typeof VISITOR_LEAVE_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
