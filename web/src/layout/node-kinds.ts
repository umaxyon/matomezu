// 節点の種類ごとの振る舞い: 自分の大きさの決め方と、同じ階層との線がつながる範囲。
// 種類は子の有無と childView で決まる（文字の箱 / 非表示 / 内包 / ツリー / リスト）。
// 箱・スティックマン・円柱の形の違いは、文字の箱（と、本体を見せる非表示・ツリー）の本体の大きさの中で扱う
import type { LayoutOptions } from "./layout";
import { type Box, bodyOf, bodyWidthOf, bodyWrapW, dataSizeOf, inList, overflowOf, shapeOf, sizeOf, treeDirOf, viewOf } from "../model";
import { GROUP_MIN, SIZES } from "../validate";

const PERSON_MIN_W = 64; // スティックマンの最小の幅
const DIAMOND_TEXT = 0.6; // ひし形の文字を折り返す幅の上限（サイズの最大の幅に対する割合。ひし形はその 2 倍の幅になる）
const DIAMOND_PAD = 12;   // ひし形の文字と縁の間の余白（内側に収まる四角の、文字のまわり。縦横それぞれ 2 倍して足す）
export const BODY_GAP = 6; // 内包する箱の本文と、その下の子の並びとの間（docs/BODY-plan.md）
export const BODY_MIN_W = 160; // 本文を持つ箱の最小の幅。子を持つ箱でも効く（図が優先の唯一の例外。docs/SIZE-plan.md）

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
  measure(n: Box, width: number | null, captionOnly?: boolean): [number, number]; // 文字の大きさ（width が null なら1行のまま。captionOnly なら本文を除く）
  body(n: Box, width: number | null): [number, number]; // 本文だけの大きさ
  caption(n: Box): number; // グループの見出しを 1 行で出すのに要る幅
}

export function createNodeKinds(ctx: KindContext) {
  const { opt, measure, caption } = ctx;
  const headRect = (n: Box): Rect => ({ x: n.hx, y: n.hy, w: n.hw, h: n.hh });

  // 本文の幅（箱の幅として数える）を加えた、中身に合わせた幅（1 行のまま測った幅）。本文の幅の指定があれば、キャプションの幅と
  // その指定の大きい方。無ければ本文の中身も含めて測った幅（docs/BODY-plan.md の 4 章）
  const contentW = (n: Box): number => {
    const bw = bodyOf(n) ? bodyWidthOf(n) : 0;
    return bw ? Math.max(measure(n, null, true)[0], bw) : measure(n, null)[0];
  };

  // 本文を持つ箱の幅の下限（本文が無ければ 0）。内包する箱・リストの親では、本文はこれ以上箱を広げない（箱の幅は子の並びで決まり、
  // 本文はその幅で折り返す。docs/SIZE-plan.md）
  const bodyMinW = (n: Box): number => (bodyOf(n) ? BODY_MIN_W : 0);
  // 内包する箱・リストの親が幅 w のときの、見出しの下の本文の高さ（本文が無ければ 0）。つまみで幅を変えていれば、その幅で折り返す
  const bodyHeight = (n: Box, w: number) => (bodyOf(n) ? ctx.body(n, bodyWrapW(n, w) - 2 * opt.padding)[1] : 0);

  // 子を置くときの、見出しの下の本文の高さ（子を置ける領域の上端を決める）。まだ大きさを決めていなければ（初めて置くとき）、
  // 今の幅（無ければ本文が求める幅）で見込んで覚えておく。大きさを決めるとき（nest.measure）に本当の幅で測り直し、違えば子を動かす
  function bodyTop(n: Box): number {
    if (!bodyOf(n)) return (n.bodyH = 0);
    if (!n.bodyH) n.bodyH = bodyHeight(n, Math.max(n.w, bodyMinW(n)));
    return n.bodyH;
  }

  // ボックスとして見せるときの本体の大きさ。useSpec が false なら width, height, overflow を使わない。
  // 幅は width の指定か、文字に合わせてサイズの範囲（minW〜maxW）に収めたもの。長い文字はその幅で折り返す。
  // capW があれば（同じ段の兄弟にはみ出さないための上限。layout.ts の fitToRow）、それも上限にする
  function fitHead(n: Box, useSpec: boolean) {
    if (inList(n) && (!n.children.length || viewOf(n) === "hidden")) {
      // リストの葉の子（と非表示の子）: 幅はリストがそろえた幅（まだ決まっていなければ自分の中身の幅）。高さは文字をその幅で折り返した高さ
      // （最小はリストの中でそろえたサイズの高さ。S の高さの固定は使わない）。大きさの指定や中身の扱いは使わない（docs/LIST-plan.md、docs/SIZE-plan.md）
      const w = n.listW || listItemWidth(n);
      n.hw = w;
      n.hh = Math.max(SIZES[sizeOf(n)].h, measure(n, w)[1]);
      return;
    }
    const z = SIZES[sizeOf(n)];
    const specW = useSpec ? n.specW : 0;
    const specH = useSpec ? n.specH : 0;
    const maxW = Math.min(z.maxW, n.capW || Infinity);
    const textW = () => Math.max(z.minW, bodyMinW(n), Math.min(maxW, contentW(n)));
    if (shapeOf(n) === "diamond") {
      // ひし形（フローチャートの分岐）: 内側に収まる四角は縦横の半分なので、文字の大きさの 2 倍にする。文字はひし形の幅の半分で折り返す
      // （graph-style.ts の .mz-shape-diamond > .mz-text の max-width: 50%）。幅の指定があれば、その半分で折り返す
      // 測るときも文字は本体の幅の半分で折り返すので、本体の幅（文字の幅の 2 倍）で測る。測った高さが文字の高さ（余白は 0）
      const tw = specW ? specW / 2 - DIAMOND_PAD : Math.min(measure(n, null)[0], maxW * DIAMOND_TEXT);
      const w = specW || Math.max(z.minW, Math.ceil((tw + DIAMOND_PAD) * 2));
      n.hw = w;
      n.hh = Math.max(z.h, Math.ceil((measure(n, w)[1] + DIAMOND_PAD) * 2));
      return;
    }
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
    const w = Math.max(bodyMinW(n), specW || textW());
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

  // 内包: 子の並びに合わせて伸びる（大きさの指定・中身の扱い・サイズは使わない。本文があれば最小の幅だけ効く。docs/SIZE-plan.md）
  const nest: NodeKind = {
    name: "nest",
    holdsChildren: true,
    measure(n) {
      let r = 0;
      for (const c of n.children) r = Math.max(r, c.x + c.w);
      // リストの子なら、リストがそろえた幅まで広げる（子の並びは左に寄ったまま）
      n.w = Math.max(GROUP_MIN.w, bodyMinW(n), r + opt.padding, inList(n) ? n.listW : 0);
      // 本文は決まった幅で折り返す。高さが前と変わったら（子は前の高さの下に置いてある）、その分だけ子を上下に動かす。
      // 子の左右の位置は本文の高さに関わらないので、幅は先に決まる
      const bh = bodyHeight(n, n.w);
      const delta = (bh ? bh + BODY_GAP : 0) - (n.bodyH ? n.bodyH + BODY_GAP : 0);
      if (delta) for (const c of n.children) { c.y += delta; c.intendedY += delta; }
      n.bodyH = bh;
      let b = 0;
      for (const c of n.children) b = Math.max(b, c.y + c.h);
      const minH = Math.max(GROUP_MIN.h, bh ? opt.header + bh + BODY_GAP + opt.padding : 0);
      n.h = Math.max(minH, b + opt.padding);
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
      // リストの子なら、リストがそろえた幅まで枠を広げ、中身（親と子の並び）を真ん中に寄せる
      const extra = inList(n) ? n.listW - n.w : 0;
      if (extra > 0) {
        n.w += extra;
        n.hx += extra / 2;
        for (const k of kids) k.x += extra / 2;
      }
    },
    anchorRect: n => ({ x: 0, y: 0, w: n.w, h: n.h }),
  };

  // リストの葉の子の、中身に合わせた幅（1 行の文字の幅を、自分のデータのサイズの範囲に収める。本文があれば最小の幅も）
  const listItemWidth = (k: Box) => {
    const z = SIZES[dataSizeOf(k)];
    return Math.max(z.minW, bodyMinW(k), Math.min(z.maxW, contentW(k)));
  };

  // リスト: 子を縦に並べ、幅をそろえる（spread）。幅は一番広い子の幅（docs/SIZE-plan.md の決めごと 5）か、自分の見出しが入る幅
  // （上限は L の最大。見出しは長ければ … で切れる）の広い方。子の幅は、葉の子（と非表示の子）は自分のサイズの範囲で測った幅、
  // 子を持つ子（内包・ツリー・リスト）は子の並びで決まった幅（上限なし）。
  // 幅の指定（width）があれば、その幅にする（L の最大を超えても、狭くてもよい。葉の子はその幅で折り返す。2026-10-11 ユーザー）。
  // ただし、子を持つ子の幅・本文の最小の幅・親のリストがそろえた幅より狭くはしない。高さの指定は使わない。
  // 子の高さは中身に合わせる。並び順は children の順（データの並び順）
  const list: NodeKind = {
    name: "list",
    holdsChildren: false,
    measure(n) {
      const P = opt.padding;
      // 子を持つ子は、そろえる前の自分の幅（前にそろえた幅を外して測る）
      const own = (k: Box) => {
        if (kindOf(k).name === "text" || kindOf(k).name === "hidden") return listItemWidth(k);
        k.listW = 0;
        kindOf(k).measure(k);
        return k.w;
      };
      const leafLike = (k: Box) => kindOf(k).name === "text" || kindOf(k).name === "hidden";
      const widths = n.children.map(k => ({ leaf: leafLike(k), w: own(k) }));
      // 指定があっても狭められない幅（子を持つ子は、下から決まった幅より狭くできない）
      const floor = Math.max(GROUP_MIN.w - 2 * P, ...widths.filter(c => !c.leaf).map(c => c.w), bodyMinW(n) - 2 * P, inList(n) ? n.listW - 2 * P : 0);
      const inner = n.specW
        ? Math.max(floor, n.specW - 2 * P)
        : Math.max(floor, ...widths.map(c => c.w), Math.min(SIZES.L.maxW, caption(n) - 2 * P));
      n.bodyH = bodyHeight(n, inner + 2 * P);
      let y = opt.header + (n.bodyH ? n.bodyH + BODY_GAP : 0);
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

  return { kindOf, bodyTop };
}
