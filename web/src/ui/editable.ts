// 文字を書く・選ぶ入力Form（input・textarea・select と、書ける contenteditable）。書けないと明示した contenteditable="false" は含まない。
// この上の右クリックはブラウザのいつものメニューに任せ、ツールピッカーや物のメニューを出さない
const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])"

// 要素 el か、その祖先の入力Form（無ければ null）
export const editableOf = (el: Element | null): Element | null => el?.closest(EDITABLE) ?? null
