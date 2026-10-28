import { kit } from "../kit"
// ISO 216 の A 判と、北米のレター（8.5×11 インチ）・タブロイド（11×17 インチ）

export const A5 = kit.definePaper({ id: "a5", title: "A5", size: { w: 559, h: 794 } })
export const A4 = kit.definePaper({ id: "a4", title: "A4", size: { w: 794, h: 1123 } })
export const A3 = kit.definePaper({ id: "a3", title: "A3", size: { w: 1123, h: 1587 } })
export const LETTER = kit.definePaper({ id: "letter", title: "Letter", size: { w: 816, h: 1056 } })
export const TABLOID = kit.definePaper({ id: "tabloid", title: "Tabloid", size: { w: 1056, h: 1632 } })
