// タスクボードの画面で使う線画のアイコン（SVG。色は currentColor、大きさは各アイコンが決める）
import { LineIcon } from "../base/ui"

export const GripIcon = () => (
  <LineIcon size={14} stroke={0}>
    {[9, 15].flatMap(x => [6, 12, 18].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />))}
  </LineIcon>
)

export const MaximizeIcon = () => (
  <LineIcon size={16}>
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
  </LineIcon>
)

export const RestoreIcon = () => (
  <LineIcon size={16}>
    <rect x="4.5" y="8.5" width="11" height="11" rx="1.5" />
    <path d="M8.5 8.5v-3a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-3" />
  </LineIcon>
)

// 広げる（上下に分けた 1 枚を全画面に）: 外へ向かう 2 本の矢
export const ExpandIcon = () => (
  <LineIcon size={16}>
    <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
  </LineIcon>
)

export const ChevronIcon = ({ className }: { className?: string }) => (
  <LineIcon size={14} stroke={1.8} className={className}>
    <path d="M9 6l6 6-6 6" />
  </LineIcon>
)

export const SortIcon = () => (
  <LineIcon size={14} stroke={1.7}>
    <path d="M8 19V5M4.5 8.5L8 5l3.5 3.5M16 5v14M12.5 15.5L16 19l3.5-3.5" />
  </LineIcon>
)

// チケットスクリーンの線画のアイコン（16px の格子）
export const BackIcon = () => (
  <LineIcon size={16} stroke={2}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </LineIcon>
)

// 上下に分けた段を閉じる（右へ引っ込める）: 右向きの矢印
export const CloseRightIcon = () => (
  <LineIcon size={16} stroke={2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </LineIcon>
)

export const PencilIcon = () => (
  <LineIcon size={16} stroke={2}>
    <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
    <path d="M14 7l3 3" />
  </LineIcon>
)

export const BookIcon = () => (
  <LineIcon size={16} stroke={2}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" />
    <path d="M5 17a3 3 0 0 1 3-3h11" />
  </LineIcon>
)

// 利用者（鳥でない書いた者）の印
export const UserIcon = () => (
  <LineIcon size={16} stroke={2}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20c1.2-4 4-5.5 7.5-5.5s6.3 1.5 7.5 5.5" />
  </LineIcon>
)

// 照準（ボードで見る）
export const TargetIcon = () => (
  <LineIcon size={16} stroke={1.8}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="1.5" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </LineIcon>
)

export const CloseIcon = () => (
  <LineIcon size={10} stroke={2.4}>
    <path d="M6 6l12 12M18 6L6 18" />
  </LineIcon>
)

export const PlusIcon = () => (
  <LineIcon size={12} stroke={2}>
    <path d="M12 5v14M5 12h14" />
  </LineIcon>
)

// ろうと（絞り込み。検索で絞っている間の印）
export const FilterIcon = () => (
  <LineIcon size={16}>
    <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />
  </LineIcon>
)
