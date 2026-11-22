// 古い版の画面のダイアログのウィジェット: 根に置く
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { StaleBuildDialog } from "./StaleBuildDialog"

export const STALE_BUILD = defineWidget({ id: kit.name("stale-build"), slots: ["root"], view: StaleBuildDialog })
