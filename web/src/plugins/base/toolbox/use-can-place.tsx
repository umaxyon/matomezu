// 描いている場所のステージで置けるか（toolbox.ts の canPlace）。ステージの外では置けない
import { useAt } from "../../../ui/scope"
import { useInstance, useMatomezuState } from "../../../ui/store-context"
import { canPlace } from "./toolbox"

export function useCanPlace(): boolean {
  const defs = useInstance()
  const at = useAt()
  return useMatomezuState(s => at !== null && canPlace(defs, s, at))
}
