// 選択の決まり: Mod+クリックで足す・外す、つまみなど 1 つの物だけに出すものはその物 1 つだけを選んでいるときに出し、
// いくつか選んだ中の物へのメニューは 1 つの物向けの項目を出さない

// 選択 selection の物 id を、足すか外した選択
export const toggledSelection = (selection: readonly string[], id: string): readonly string[] =>
  selection.includes(id) ? selection.filter(s => s !== id) : [...selection, id]

// 物 id 1 つだけを選んでいるか
export const onlySelected = (selection: readonly string[], id: string): boolean =>
  selection.length === 1 && selection[0] === id

// 物 id が、いくつか選んでいる物の 1 つか（右クリックのメニューを、選んでいる物全部に向けるか）
export const amongSelected = (selection: readonly string[], id: string): boolean =>
  selection.length > 1 && selection.includes(id)
