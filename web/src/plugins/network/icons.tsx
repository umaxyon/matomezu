// network の絵: ペアリングを解く（切れた鎖）・ホストの行を開く（右向きの山。開くと下向きに回す）
import { LineIcon } from "../base/ui"

export const UnpairIcon = () => (
  <LineIcon size={16} stroke={1.7}>
    <path d="M9.5 14.5l-2 2a3 3 0 0 1-4.2-4.2l2.6-2.6a3 3 0 0 1 3.6-.5" />
    <path d="M14.5 9.5l2-2a3 3 0 0 1 4.2 4.2l-2.6 2.6a3 3 0 0 1-3.6.5" />
    <path d="M5 5l2 2M19 19l-2-2M8 3v2M16 21v-2" />
  </LineIcon>
)

export const ChevronIcon = () => (
  <LineIcon size={12} stroke={1.8}>
    <path d="M9 6l6 6-6 6" />
  </LineIcon>
)
