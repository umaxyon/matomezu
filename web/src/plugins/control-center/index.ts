// コントロールセンターのプラグイン: ビルトインのコントロールセンター。
// インスタンスのコントロールセンターにすると（createMatomezu の controlCenter: CONTROL_CENTER.id）、ブックの一覧などを変えるアクションを許す
import { defineBuiltin } from "../../plugin-api/builtin"
import {
  ASK_REFRESH_DIALOG,
  CONTENT_AREA,
  CONTROL_CENTER,
  CONTROL_CENTER_SCREEN,
  LIBRARY_MAXIMIZED,
  MAILBOX_MAXIMIZED,
  PICKED,
  VISITOR_LEAVE_DIALOG,
  WORKROOM_LEAVE_DIALOG,
} from "./control-center"
import { kit } from "./kit"

export {
  ASK_REFRESH_DIALOG,
  CONTENT_AREA,
  CONTROL_CENTER,
  CONTROL_CENTER_SCREEN,
  LIBRARY_MAXIMIZED,
  MAILBOX_MAXIMIZED,
  PICKED,
  type Picked,
  VISITOR_LEAVE_DIALOG,
  WORKROOM_LEAVE_DIALOG,
} from "./control-center"

export const CONTROL_CENTER_PLUGIN = defineBuiltin(
  kit.plugin({
    controlCenters: [CONTROL_CENTER],
    screens: [CONTROL_CENTER_SCREEN],
    pluginStates: [CONTENT_AREA, PICKED, LIBRARY_MAXIMIZED, MAILBOX_MAXIMIZED],
    dialogs: [WORKROOM_LEAVE_DIALOG, VISITOR_LEAVE_DIALOG, ASK_REFRESH_DIALOG],
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
    "@matomezu/control-center:content-area": typeof CONTENT_AREA
    "@matomezu/control-center:picked": typeof PICKED
    "@matomezu/control-center:library-maximized": typeof LIBRARY_MAXIMIZED
    "@matomezu/control-center:mailbox-maximized": typeof MAILBOX_MAXIMIZED
  }
  interface DialogTable {
    "@matomezu/control-center:workroom-leave": typeof WORKROOM_LEAVE_DIALOG
    "@matomezu/control-center:visitor-leave": typeof VISITOR_LEAVE_DIALOG
    "@matomezu/control-center:ask-refresh": typeof ASK_REFRESH_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
