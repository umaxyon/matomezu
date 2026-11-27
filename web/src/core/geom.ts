// 平面の点と大きさ
export interface Point {
  x: number
  y: number
}
export interface Size {
  w: number
  h: number
}
// 左上と大きさで決まる四角
export interface Rect extends Point, Size {}

// 点 p が、左上を原点にした広さ size の中か（縁も中）
export const within = (p: Point, size: Size): boolean => p.x >= 0 && p.y >= 0 && p.x <= size.w && p.y <= size.h
