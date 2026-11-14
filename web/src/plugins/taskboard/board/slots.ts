// タスクボードが開くスロットの名前（taskboard の ui.tsx で、core/catalog.ts の SlotTable に書き足す）
import { kit } from "../kit"

// プロジェクトのレーンの右に並べる、プラグインフレームを置くスロット。追加プラグインが、自分の描く枠を足す（レーンではなく、プロジェクトのデータに無い）。そのボードのプロジェクトの id を受け取る
export const PLUGIN_FRAMES = kit.name("plugin-frames")
