// 絵の形のプラグイン: 決まった大きさの絵と足元のキャプションを持つ 15 の形（スティックマン・DB・サーバー・パソコン・工場・書類・ゴミ箱・ロボット・猫・ハート・電球・犬・森・家・家族）と、その追加と編集のダイアログ。
// 形は使われる所を知らない。使うかはブックのタイプが選ぶ
import { defineBuiltin } from "../../../plugin-api/builtin"
import {
  ART_EDIT_DIALOG,
  ART_TOKENS,
  ARTS,
  type BULB,
  type CAT,
  type DB,
  type DOCUMENT,
  type DOG,
  type FACTORY,
  type FAMILY,
  type FOREST,
  type HEART,
  type HOUSE,
  type PC,
  type PERSON,
  type ROBOT,
  type SERVER,
  type TRASH,
} from "./art"
import { kit } from "./kit"

export const ART_PLUGIN = defineBuiltin(
  kit.plugin({
    items: ARTS.map(a => a.item),
    tokens: ART_TOKENS,
    dialogs: [...ARTS.map(a => a.add), ART_EDIT_DIALOG],
  }),
)

declare module "../../../core/catalog" {
  interface ItemTable {
    "@matomezu/art:shape-person": typeof PERSON.item
    "@matomezu/art:shape-db": typeof DB.item
    "@matomezu/art:shape-server": typeof SERVER.item
    "@matomezu/art:shape-pc": typeof PC.item
    "@matomezu/art:shape-factory": typeof FACTORY.item
    "@matomezu/art:shape-document": typeof DOCUMENT.item
    "@matomezu/art:shape-trash": typeof TRASH.item
    "@matomezu/art:shape-robot": typeof ROBOT.item
    "@matomezu/art:shape-cat": typeof CAT.item
    "@matomezu/art:shape-heart": typeof HEART.item
    "@matomezu/art:shape-bulb": typeof BULB.item
    "@matomezu/art:shape-dog": typeof DOG.item
    "@matomezu/art:shape-forest": typeof FOREST.item
    "@matomezu/art:shape-house": typeof HOUSE.item
    "@matomezu/art:shape-family": typeof FAMILY.item
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface DialogTable {
    "@matomezu/art:person-add": typeof PERSON.add
    "@matomezu/art:db-add": typeof DB.add
    "@matomezu/art:server-add": typeof SERVER.add
    "@matomezu/art:pc-add": typeof PC.add
    "@matomezu/art:factory-add": typeof FACTORY.add
    "@matomezu/art:document-add": typeof DOCUMENT.add
    "@matomezu/art:trash-add": typeof TRASH.add
    "@matomezu/art:robot-add": typeof ROBOT.add
    "@matomezu/art:cat-add": typeof CAT.add
    "@matomezu/art:heart-add": typeof HEART.add
    "@matomezu/art:bulb-add": typeof BULB.add
    "@matomezu/art:dog-add": typeof DOG.add
    "@matomezu/art:forest-add": typeof FOREST.add
    "@matomezu/art:house-add": typeof HOUSE.add
    "@matomezu/art:family-add": typeof FAMILY.add
    "@matomezu/art:art-edit": typeof ART_EDIT_DIALOG
  }
}
