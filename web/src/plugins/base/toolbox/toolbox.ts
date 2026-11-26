// ツールボックス: ステージが直している並びで置けるアイテム（placeableIn）のうち、定義の toolbox で出すもの（並びはその順）。
// ボタンで出すものと、シェイプパネル（「形」のボタン 1 つから開く格子）に並べるものがある。どこにどう出すか（上の行・フッタメニューなど）はビューと UI マッピングが決める
import { type CoreCatalog, type ItemId, pageType } from "../../../core/core-catalog"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import { type EditList, type PageTypeDef, placeableOf, slideIsBackground } from "../../../core/def/page-type"
import { type CommandId, isPerformable, isPermitted } from "../../../store/commands"
import type { Assembled } from "../../../store/plugin"
import type { MatomezuState } from "../../../store/state"

// ツールボックスに出すか（定義オブジェクトの拡張ポイントに書き足す）。true はボタンで出し、"panel" はシェイプパネルに並べる。
// 出さない形（false）は、ほかの操作で置く。つなぐものは出さない（形どうしを結ぶ操作で引く）
declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    toolbox: boolean | "panel"
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    toolbox: false
  }
  // 置こうとしているアイテムを置くコマンドの印（そのコマンドを持つプラグインが書く）
  interface CommandExtras {
    placesItem?: true
  }
}

// 直している並び list で置けるアイテムの id。背景のタイプは、items なら items の候補、slide なら slide の候補。
// 背景でないタイプは、どちらでも置ける物全部（slide だけのタイプでは slide の候補）
export const placeableIn = (type: Pick<PageTypeDef, "items" | "slide">, list: EditList): readonly string[] =>
  slideIsBackground(type) ? (list === "slide" ? (type.slide?.allowed ?? []) : type.items.allowed) : placeableOf(type)

const placedBy = (catalog: CoreCatalog, type: string, how: true | "panel", edits: EditList): readonly ItemId[] =>
  placeableIn(pageType(catalog, type), edits).filter((id): id is ItemId => catalog.items.get(id)?.toolbox === how)

// タイプ type のページで、ボタンで出すアイテム（edits はステージが直している並び。背景編集モードの間は、背景に置く形だけ）
export const toolboxOf = (catalog: CoreCatalog, type: string, edits: EditList): readonly ItemId[] =>
  placedBy(catalog, type, true, edits)

// シェイプパネルに並べるアイテム
export const panelOf = (catalog: CoreCatalog, type: string, edits: EditList): readonly ItemId[] =>
  placedBy(catalog, type, "panel", edits)

// ステージ at で置けるか: 置くコマンド（placesItem）のうち、開いているページのタイプで行うアクションを使える物のどれかを、認可ステップが止めないか。
// 使える置くコマンドが無ければ止めない（置けるかは置くときに決まる）
export function canPlace(defs: Assembled, state: MatomezuState, at: string): boolean {
  const places = [...defs.catalog.store.commands]
    .filter(([, def]) => def.placesItem === true)
    .map(([id]) => id as CommandId)
  const usable = places.filter(id => isPerformable(defs, state, at, id))
  return usable.length === 0 || usable.some(id => isPermitted(defs, state, at, id))
}
