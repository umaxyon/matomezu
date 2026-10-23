// 線の編集のダイアログの選択肢のアイコン: 通り方（折れ線・直線）と線の種類（実線・破線）
export const ROUTE_ICONS = {
  elbow: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h8v12h8" />
    </svg>
  ),
  straight: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18L20 6" />
    </svg>
  ),
}

export const DASH_ICONS = {
  solid: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12h18" />
    </svg>
  ),
  dashed: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12h4M10 12h4M17 12h4" />
    </svg>
  ),
}
