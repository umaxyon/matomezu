// 節点の種類ごとの振る舞い: 自分の大きさの決め方と、同じ階層との線がつながる範囲。
// 種類は子の有無と childView で決まる（文字の箱 / 非表示 / 内包 / ツリー / リスト）。
// 箱・スティックマン・円柱の形の違いは、文字の箱（と、本体を見せる非表示・ツリー）の本体の大きさの中で扱う
import type { LayoutOptions } from "./layout";
import { type Box, inList, overflowOf, shapeOf, sizeOf, treeDirOf, viewOf } from "../model";
import { GROUP_MIN, SIZES } from "../validate";

const PERSON_MIN_W = 64; // スティックマンの最小の幅

export interface Rect { x: number; y: number; w: number; h: number }

export interface NodeKind {
  readonly name: "text" | "hidden" | "nest" | "tree" | "list";
  // 子を自由に置けるか（内包だけ）。置いた子の位置で自分の大きさが決まる
  readonly holdsChildren: boolean;
  // 自分の大きさ（w, h）と本体の矩形（hx, hy, hw, hh）を決める。
  // 子の大きさと、内包なら子の位置はもう決まっていること
  measure(n: Box): void;
  // 同じ階層との線をつなぐ範囲（ボックスの左上からの位置）
  anchorRect(n: Box): Rect;
}

export interface KindContext {
  opt: LayoutOptions;
  measure(n: Box, width: number | null): [number, number]; // 文字の大きさ（width が null なら1行のまま）
}

export function createNodeKinds(ctx: KindContext) {
  const { opt, measure } = ctx;
  const headRect = (n: Box): Rect => ({ x: n.hx, y: n.hy, w: n.hw, h: n.hh });

  // ボックスとして見せるときの本体の大きさ。useSpec が false なら width, height, overflow を使わない。
  // 幅は width の指定か、文字に合わせてサイズの範囲（minW〜maxW）に収めたもの。長い文字はその幅で折り返す。
  // capW があれば（同じ段の兄弟にはみ出さないための上限。layout.ts の fitToRow）、それも上限にする
  function fitHead(n: Box, useSpec: boolean) {
    if (inList(n)) {
      // リストの子: 幅はリストがそろえた幅（まだ決まっていなければ自分の中身の幅）。高さは文字をその幅で折り返した高さ。
      // 大きさの指定や中身の扱いは使わない（docs/LIST-plan.md）
      const w = n.listW || listItemWidth(n);
      n.hw = w;
      n.hh = Math.max(SIZES.M.h, measure(n, w)[1]);
      return;
    }
    const z = SIZES[sizeOf(n)];
    const specW = useSpec ? n.specW : 0;
    const specH = useSpec ? n.specH : 0;
    const maxW = Math.min(z.maxW, n.capW || Infinity);
    const textW = () => Math.max(z.minW, Math.min(maxW, measure(n, null)[0]));
    if (shapeOf(n) === "person") {
      // 人の形と足元の文字。背景が無いので、最小の幅は使わない
      const w = Math.max(PERSON_MIN_W, Math.min(specW || maxW, measure(n, null)[0]));
      n.hw = w;
      n.hh = measure(n, w)[1];
      return;
    }
    const ov = useSpec ? overflowOf(n) : "wrap";
    if (ov === "clip") {
      // 切り詰める: 1行にして、width を幅の上限にする（文字が少なければ中身に合わせて縮み、多ければ上限の幅で … で切る）
      n.hw = Math.max(z.minW, Math.min(specW || maxW, measure(n, null)[0]));
      n.hh = specH || z.h;
      return;
    }
    const w = specW || textW();
    n.hw = w;
    n.hh = specH || (z.fixedH ? z.h : Math.max(z.h, measure(n, w)[1]));
  }

  // 本体だけを見せる（文字の箱と非表示）。非表示は子を持つので、大きさの指定（width, height, overflow）を使わない
  const headOnly = (name: "text" | "hidden"): NodeKind => ({
    name,
    holdsChildren: false,
    measure(n) {
      fitHead(n, name === "text");
      n.hx = 0; n.hy = 0;
      n.w = n.hw; n.h = n.hh;
    },
    anchorRect: headRect,
  });

  // 内包: 子に合わせる（指定サイズは最小値として扱う）
  const nest: NodeKind = {
    name: "nest",
    holdsChildren: true,
    measure(n) {
      const ov = overflowOf(n);
      const minW = n.specW || GROUP_MIN.w;
      const minH = n.specH || GROUP_MIN.h;
      let r = 0, b = 0;
      for (const c of n.children) {
        r = Math.max(r, c.x + c.w);
        b = Math.max(b, c.y + c.h);
      }
      n.w = ov === "grow" ? Math.max(minW, r + opt.padding) : minW;
      n.h = ov === "clip" ? minH : Math.max(minH, b + opt.padding);
      n.hx = 0; n.hy = 0;
      n.hw = n.w; n.hh = n.h;
    },
    anchorRect: headRect,
  };

  // ツリー: 子を組織図のように並べる。上下なら横一列、左右なら縦一列にして、親をその中央にそろえる。
  // 全体を薄い枠で囲むので、周りに余白を取る（同じ階層との線は、この枠のふちにつなぐ）。
  // 向きごとに書き分けず、子を置く向きを「主軸」、それに直交する向きを「副軸」として扱う
  const tree: NodeKind = {
    name: "tree",
    holdsChildren: false,
    measure(n) {
      fitHead(n, false);
      const kids = n.children;
      const dir = treeDirOf(n);
      const vertical = dir === "down" || dir === "up";
      const forward = dir === "down" || dir === "right"; // 子が親より後ろ（下か右）に来るか
      const P = opt.padding;
      const GAP = opt.treeGapX; // 子どうしの間隔（副軸）
      const DIST = opt.treeGapY; // 親と子の間隔（主軸）
      // [主軸, 副軸] の大きさ
      const headSize = vertical ? [n.hh, n.hw] : [n.hw, n.hh];
      const kidSize = (k: Box) => (vertical ? [k.h, k.w] : [k.w, k.h]);
      const crossTotal = kids.reduce((s, k) => s + kidSize(k)[1]!, 0) + GAP * (kids.length - 1);
      const cross = Math.max(headSize[1]!, crossTotal);
      const kidsMain = Math.max(...kids.map(k => kidSize(k)[0]!));

      // 主軸: 親、間隔、子の順（前向き）か、子、間隔、親の順（後ろ向き）。子は親に向いた側の端をそろえる
      const headMain = forward ? P : P + kidsMain + DIST;
      const headCross = P + (cross - headSize[1]!) / 2;
      let c = P + (cross - crossTotal) / 2;
      const place = (k: Box, main: number, crossPos: number) => {
        if (vertical) { k.x = crossPos; k.y = main; } else { k.x = main; k.y = crossPos; }
      };
      for (const k of kids) {
        const [km, kc] = kidSize(k);
        place(k, forward ? P + headSize[0]! + DIST : P + kidsMain - km!, c);
        c += kc! + GAP;
      }
      if (vertical) { n.hx = headCross; n.hy = headMain; } else { n.hx = headMain; n.hy = headCross; }
      const main = P + headSize[0]! + DIST + kidsMain + P;
      const crossAll = P + cross + P;
      if (vertical) { n.w = crossAll; n.h = main; } else { n.w = main; n.h = crossAll; }
    },
    anchorRect: n => ({ x: 0, y: 0, w: n.w, h: n.h }),
  };

  // リストの子の、中身に合わせた幅（1 行の文字の幅。最小は M の最小、上限は L の最大）
  const listItemWidth = (k: Box) => Math.max(SIZES.M.minW, Math.min(SIZES.L.maxW, measure(k, null)[0]));

  // リスト: 子を縦に並べ、幅をそろえる（spread）。幅は自分の幅の指定があればその中、無ければ一番広い子の中身の幅。
  // 子の高さは中身に合わせる。並び順は children の順（データの並び順）
  const list: NodeKind = {
    name: "list",
    holdsChildren: false,
    measure(n) {
      const P = opt.padding;
      const inner = n.specW
        ? Math.max(SIZES.M.minW, n.specW - 2 * P)
        : Math.max(GROUP_MIN.w - 2 * P, ...n.children.map(listItemWidth));
      let y = opt.header;
      for (const k of n.children) {
        k.listW = inner;
        kindOf(k).measure(k);
        k.x = P;
        k.y = y;
        y += k.h + opt.gap;
      }
      n.w = inner + 2 * P;
      n.h = Math.max(GROUP_MIN.h, y - opt.gap + P);
      n.hx = 0; n.hy = 0;
      n.hw = n.w; n.hh = n.h;
    },
    anchorRect: headRect,
  };

  const text = headOnly("text"), hidden = headOnly("hidden");

  function kindOf(n: Box): NodeKind {
    if (!n.children.length) return text;
    const view = viewOf(n);
    return view === "hidden" ? hidden : view === "tree" ? tree : view === "list" ? list : nest;
  }

  return { kindOf };
}
