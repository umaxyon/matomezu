// 描いた文書は紙の幅で描き、ペインが紙より狭いときだけ、紙の幅 width を幅 room に収める倍率で縮める（広げない）
export const shrinkTo = (room: number, width: number) => (width > 0 && room > 0 ? Math.min(room / width, 1) : 1)
