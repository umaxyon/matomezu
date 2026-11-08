// コントロールセンターの定義: ブックでない、利用者に 1 つの入口。ブックの一覧・利用者の設定・郵便箱・参加者の表を変えるアクション
// （どれもブックが対象でない）を許すかと、利用者の設定の項目のうち変えさせない物を決める。ブックのタイプの actions とは別で、ブックのタイプはこれを知らない
import type { ActionId } from "../catalog"

export interface ControlCenterDef {
  id: string
  actions: readonly ActionId[] // 許す、ブックが対象でないアクション（ここに無いものは断る）
  // 利用者の設定の項目のうち変えさせない物の id（利用者にも AI にも。組織のコントロールセンターで決める）
  fixedUserSettings?: readonly string[]
}

export function defineControlCenter<const T extends ControlCenterDef>(def: T): T {
  return def
}
