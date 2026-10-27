// 置いた箱のデータの型
import type { PlacedOf } from "../../../plugin-api"
import type { BOX } from "./box"

export type PlacedBox = PlacedOf<typeof BOX.id>
