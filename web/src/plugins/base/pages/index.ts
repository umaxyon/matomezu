// ページとバインダ: ブックの並びのページとバインダを足す・動かす・消す・変える・複製するアクションと、参照エントリを置く・消すアクションと、ページのフィールド・ページの問題・可変ページのノーマライズステップ。
// ページタブ・ページ一覧・ダイアログとそれを開くコマンドは page-tabs/
export { addPageIn } from "./add-page"
export { BINDER_DUPLICATE, BINDER_MOVE, BINDER_REMOVE, BINDER_UPDATE } from "./binders"
export { PAGE_ADD } from "./page-add"
export { PAGE_DUPLICATE, UNRENEWABLE_SHAPE } from "./page-duplicate"
export { type PageFieldsWay, pageFieldsWay } from "./page-fields"
export { PAGE_MOVE } from "./page-move"
export type { PageProblem } from "./page-problems"
export { PAGE_REMOVE } from "./page-remove"
export { PAGE_UPDATE } from "./page-update"
export { REFERENCE_ADD, REFERENCE_MOVE, REFERENCE_REMOVE } from "./references"
export { VARIABLE_PAGES } from "./variable-pages"
