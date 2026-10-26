import { kit } from "../kit"
// ISO 216 の A 判

export const A5 = kit.definePaper({ id: "a5", title: "A5", size: { w: 559, h: 794 } })
export const A4 = kit.definePaper({ id: "a4", title: "A4", size: { w: 794, h: 1123 } })
export const A3 = kit.definePaper({ id: "a3", title: "A3", size: { w: 1123, h: 1587 } })
