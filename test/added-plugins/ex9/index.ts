// ex9: アクションの対象の種類（対象の定義）を足す追加プラグイン。自分のレコード（カード）を、アクションが 1 件ずつ作る・直す・消す。番号は常駐が振る
import { definePlugin } from "matomezu"
import {
  CARD,
  CARD_ADD,
  CARD_LOCK,
  CARD_REMOVE,
  CARD_RENAME,
  CARD_UNLOCK,
  CLOSED_SHELF,
  SHELF,
  SHELF_ADD,
  SHELF_CLOSE,
} from "./cards"
import { kit } from "./kit"

export const EX9 = definePlugin(
  kit.plugin({
    subjects: [SHELF, CARD],
    actions: [SHELF_ADD, SHELF_CLOSE, CARD_ADD, CARD_RENAME, CARD_REMOVE, CARD_LOCK, CARD_UNLOCK],
    permissions: [CLOSED_SHELF],
  }),
)

export default EX9

declare module "matomezu/catalog" {
  interface SubjectTable {
    "ex9:shelf": typeof SHELF
    "ex9:card": typeof CARD
  }
  interface PermissionTable {
    "ex9:closed-shelf": typeof CLOSED_SHELF
  }
  interface ActionTable {
    "ex9:shelf-add": typeof SHELF_ADD
    "ex9:shelf-close": typeof SHELF_CLOSE
    "ex9:card-lock": typeof CARD_LOCK
    "ex9:card-unlock": typeof CARD_UNLOCK
    "ex9:card-add": typeof CARD_ADD
    "ex9:card-rename": typeof CARD_RENAME
    "ex9:card-remove": typeof CARD_REMOVE
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
