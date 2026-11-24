// ブックスクリーンの箱が、並びの中で位置か大きさを動かしている間（CSS の transition が走っている間）か。中のステージが、その間は大きさを知らせずに待つため
import { createContext } from "react"

export const ScreenSlidingContext = createContext(false)
