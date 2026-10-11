// 配置: 重なりの判定と直し方、読み込み時の配置。節点ごとの大きさの決め方とツリーの並べ方は node-kinds.ts。
// 状態（ボックスや線の一覧）は ctx から読む。
//
// 読み込み・外部の変更の読み直し・設定変更・子のサイズをそろえる・ドラッグで手を離した・箱を消したときは、settle が
// 場面ごとの設定値（policy.ts の SCENES）に従って決め直す。場面ごとの違い（何を保つか、誰が動くか、大きい相手に譲るか、
// 子を詰め直す向き、はみ出しを調整するか、置いた位置を本来いたい位置にするか）は SCENES の 1 行の値の差。
// 設定を変える処理（子のサイズをそろえるときは alignChildren）は apply として settle に渡す。
//
// SCENES の外にある決まり（どの場面でも同じか、表の値では表せない手順のもの）:
//   - ぶつかった相手は、同じ x のまま下へ、相手の端のちょうど gap 先へずらす（placeGroup + spotBelow + slide）
//   - 位置の無い箱は、最上位なら円形に並べてから近くの空きへ（placeAutoRoots + findFreeSpot）、グループの中なら左上から格子状に空きを探す（findGridSpot）
//   - 押し下げられた箱は、上が空いたら本来いたい高さ（intendedY）へ戻す
//   - 文字の箱が右の大きい兄弟にはみ出すときは、ずらさずにその手前まで狭めて折り返す（fitToRow）
//   - ツリーとリストの子の並べ方は node-kinds.ts（子の位置は自分では決めない）
//   - ドラッグ中は settle を使わず、drag.ts の DragSession が開始時の写しから毎回決め直す（入れ替えは 4 分の 1 食い込んでから）。
//     手を離したときに重なりが残っていれば、settle(SCENES.drop) で直す

import {
  type Box, type Container, type Edge, type World,
  ancestors, descendants, inNest, isIconShape, other, setSpec, shapeOf, sizeOf,
} from "../model";
import type { TextMeasurer } from "./measure";
import { BODY_GAP, createNodeKinds } from "./node-kinds";
import { type Scene, createAnchorRules } from "./policy";
import { layoutStats } from "./stats";
import { GROUP_MIN } from "../validate";

export { layoutStats };

export interface LayoutOptions {
  gap: number;
  padding: number;
  header: number;
  treeGapX: number;
  treeGapY: number;
}

export interface LayoutContext {
  opt: LayoutOptions;
  world: World;
  worldEl: HTMLElement;
  container: HTMLElement;
  measurer: TextMeasurer;
  roots(): Box[];
  edges(): Edge[];
  zoom?(): number; // ワールドにかけている倍率（プレビュー。無ければ 1）
  // 開いたときのはみ出しの調整（fitToViewport）で移した（表示だけ。ファイルには無い位置）
  fitted?(n: Box): void;
}

export type Layout = ReturnType<typeof createLayout>;

export function createLayout(ctx: LayoutContext) {
  const { opt, world, worldEl, container } = ctx;
  const roots = () => ctx.roots();
  const edges = () => ctx.edges();

  const containerOf = (n: Box): Container => n.parent ?? world;
  const siblings = (n: Box) => containerOf(n).children;
  // n につながる線
  const incident = (n: Box) => edges().filter(e => e.a === n || e.b === n);

  // 見出しの下の本文の分（本文が無ければ 0）
  const bodyTop = (n: Box) => { const h = kindOf(n).name === "nest" ? bodyHeightTop(n) : 0; return h ? h + BODY_GAP : 0; };

  // 子を置ける領域の内側の余白
  function innerArea(c: Container) {
    return {
      left: opt.padding,
      // 内包する箱に本文があれば、その下から（docs/BODY-plan.md）
      top: c.isWorld ? opt.padding : opt.header + bodyTop(c),
      right: opt.padding,
      bottom: opt.padding,
    };
  }

  // 大きさが固定されている方向。子を持つ箱はつねに子に合わせて伸びるので、固定されるのはワールドだけ（docs/SIZE-plan.md）。
  // ワールドは幅を固定し、高さは指定が無ければ下へ伸ばせる（横スクロールより縦スクロールの方が見やすい）
  function fixedSize(c: Container): { w: number | null; h: number | null } {
    if (c.isWorld) return { w: world.w, h: world.src.height ? world.h : null };
    return { w: null, h: null };
  }

  // 表示領域の中身（スクロールバーを除く）の幅と高さ。clientWidth / clientHeight は小数を四捨五入するので、
  // 実際の幅が 836.6 のとき 837 になり、それに合わせたワールドが 0.4px はみ出して、動かせないスクロールバーが出る
  // （Windows の表示倍率などで幅に小数が出る）。小数まで測って切り捨てる
  // ワールドに倍率をかけていれば（プレビュー）、ワールドの座標での広さにする（縮小しても、ワールドの背景が表示領域を埋めるように）
  function viewport() {
    const r = container.getBoundingClientRect();
    const z = ctx.zoom?.() ?? 1;
    return {
      w: Math.floor((r.width - (container.offsetWidth - container.clientWidth)) / z),
      h: Math.floor((r.height - (container.offsetHeight - container.clientHeight)) / z),
    };
  }

  // 指定が無ければ、表示領域と置かれているボックスの範囲の大きい方にする。
  // 表示領域が狭くなってもボックスは動かさず、はみ出た分はスクロールで見る
  function syncWorld() {
    const s = world.src;
    let right = 0, bottom = 0;
    for (const n of roots()) {
      if (!n.hasPos || !n.w) continue;
      right = Math.max(right, n.x + n.w + opt.padding);
      bottom = Math.max(bottom, n.y + n.h + opt.padding);
    }
    const v = viewport();
    world.w = Number(s.width) || Math.max(v.w, right);
    world.h = Number(s.height) || Math.max(v.h, bottom);
    worldEl.style.width = world.w + "px";
    worldEl.style.height = world.h + "px";
  }

  // ---- 大きさ ----

  // 節点の種類（文字の箱、非表示、内包、ツリー）ごとの、大きさの決め方と線がつながる範囲
  const { kindOf, bodyTop: bodyHeightTop } = createNodeKinds({
    opt, measure: (n, w, captionOnly) => ctx.measurer.measure(n, w, captionOnly), body: (n, w) => ctx.measurer.body(n, w),
    caption: n => ctx.measurer.caption(n),
  });

  // 自分の大きさと本体の矩形を決める（子の大きさと、内包なら子の位置はもう決まっていること）
  const fit = (n: Box) => kindOf(n).measure(n);
  // 同じ階層との線をつなぐ範囲（ボックスの左上からの位置）。ツリーで見せていれば枠全体、それ以外は本体
  const anchorRect = (n: Box) => kindOf(n).anchorRect(n);
  // 大きさが変わったとき、どこを保つか（policy.ts）
  const anchors = createAnchorRules({ anchorRect });
  // 線がつながる範囲の横の中心（親の中での位置）
  const centerX = (n: Box) => { const a = anchorRect(n); return n.x + a.x + a.w / 2; };

  // 置く処理（placeGroup、compress）の途中で、まだ置いていないボックス。重なりの判定の相手にしない。
  // 置く処理の外（ドラッグ中など）では空で、すべてのボックスが相手になる
  const unplaced = new Set<Box>();
  const isPlaced = (o: Box) => !unplaced.has(o);

  function refitAncestors(n: Box) {
    for (const p of ancestors(n)) fit(p);
  }

  // ---- 重なり判定 ----

  // 親の中に収まる位置に寄せる（大きさが固定されていない方向は、親が伸びるので上限なし）
  function clamp(n: Box, x: number, y: number): [number, number] {
    if (!inNest(n)) return [x, y]; // ツリーの子は自動で並ぶ
    const c = containerOf(n);
    const a = innerArea(c);
    // ワールドにも、グループと同じ余白を残す
    const pad = opt.padding;
    const minX = a.left;
    const minY = a.top;
    const f = fixedSize(c);
    const maxX = f.w != null ? f.w - pad - n.w : Infinity;
    const maxY = f.h != null ? f.h - pad - n.h : Infinity;
    return [
      Math.max(minX, Math.min(maxX, x)),
      Math.max(minY, Math.min(maxY, y)),
    ];
  }

  // 文字の箱（と、本体だけを見せる非表示）が、同じ段の右にいる自分より大きい兄弟にはみ出すなら、その手前まで
  // 狭めて折り返す（大きい相手には自分がずれる決まり（stepAside）だと、空きを探して離れた所へ飛んでしまうため）。
  // 右端を相手の手前にそろえる。center を渡すと（設定を変えた最上位の箱を置き直すとき）、その中心を保つ幅にする
  // （文字を戻すと同じ中心から縮んで元の位置に戻る。左に空きが足りなければ左端に寄せる）。渡さなければ左端を保つ。
  // 右端が相手の手前にそろっているので、左端を保って何度計算し直しても（Undo や読み直しを含む）同じ幅になる。
  // 自分以下の大きさの兄弟は今までどおり押し下げ、左の大きい相手とぶつかるときは stepAside に任せる。
  // 幅の指定がある箱、位置の無い箱は変えない。最小の幅でも収まらなければ狭めない
  function fitToRow(n: Box, center?: number) {
    const kind = kindOf(n).name;
    if (!n.hasPos || !inNest(n) || (kind !== "text" && kind !== "hidden") || (kind === "text" && n.specW)) return;
    if (n.capW) { n.capW = 0; fit(n); }
    const g = opt.gap, c = containerOf(n);
    const cx = n.x + n.w / 2, top = n.y, bottom = n.y + n.h, area = n.w * n.h;
    const row = siblings(n).filter(o =>
      o !== n && o.hasPos && o.w * o.h > area && o.y < bottom + g && o.y + o.h + g > top);
    const ahead = row.filter(o => o.x + o.w / 2 >= cx);
    if (!ahead.length) return;
    const right = Math.min(...ahead.map(o => o.x - g));
    if (n.x + n.w <= right + 0.5) return;
    const left = Math.max(innerArea(c).left,
      ...row.filter(o => o.x + o.w / 2 < cx).map(o => o.x + o.w + g));
    const x = center == null ? n.x : Math.max(left, 2 * center - right); // 中心を保つ幅の左端（足りなければ left）
    if (x >= right) return;
    n.capW = right - x;
    fit(n);
    if (n.w > n.capW + 0.5) { n.capW = 0; fit(n); return; } // 最小の幅でも収まらない
    n.x = right - n.w;
  }

  function overlaps(n: Box, x: number, y: number, o: Box) {
    layoutStats.overlapChecks++;
    const g = opt.gap;
    return x < o.x + o.w + g && x + n.w + g > o.x &&
           y < o.y + o.h + g && y + n.h + g > o.y;
  }

  function collides(n: Box, x: number, y: number) {
    if (!inNest(n)) return false;
    return siblings(n).some(o => o !== n && isPlaced(o) && overlaps(n, x, y, o));
  }

  // ---- 配置 ----

  // 親の中で、左上から格子状に空きを探す
  function findGridSpot(n: Box): [number, number] {
    const c = containerOf(n);
    const sibs = siblings(n);
    const a = innerArea(c);
    const cw = Math.max(...sibs.map(s => s.w)) + opt.gap;
    const ch = Math.max(...sibs.map(s => s.h)) + opt.gap;
    const f = fixedSize(c);
    let cols = Math.max(1, Math.ceil(Math.sqrt(sibs.length)));
    if (f.w != null) cols = Math.max(1, Math.min(cols, Math.floor((f.w - a.left - a.right + opt.gap) / cw)));
    for (let i = 0; i < 10000; i++) {
      const x = a.left + (i % cols) * cw;
      const y = a.top + Math.floor(i / cols) * ch;
      if (!collides(n, x, y)) return [x, y];
    }
    return [a.left, a.top];
  }

  // ワールド内で (x, y) に近い空きを探す
  function findFreeSpot(n: Box, x: number, y: number): [number, number] {
    const maxR = Math.max(world.w, world.h);
    for (let r = 0; r <= maxR; r += 16) {
      const step = r === 0 ? 360 : Math.max(5, 360 / (r / 4));
      for (let a = 0; a < 360; a += step) {
        const [cx, cy] = clamp(n,
          x + r * Math.cos((a * Math.PI) / 180),
          y + r * Math.sin((a * Math.PI) / 180));
        if (!collides(n, cx, cy)) return [cx, cy];
      }
    }
    // 探す範囲（ワールドの幅か高さ）で見つからなければ、同じ x のまま下へずらす。ワールドは下へ伸ばせるので必ず空きがある
    // （表示領域が狭いと、大きいボックスを縦に積む場所が範囲の外になり、重ねて置いていた）。
    // 高さが指定されていて下にも入らないときだけ、重なりを許容する
    const [sx, sy] = clamp(n, x, y);
    const f = fixedSize(world);
    return slide(n, sx, sy, "down", f.h != null ? f.h - opt.padding - n.h : Infinity) ?? [x, y];
  }

  // 位置指定のあるものを優先して1つずつ置き、重なるものは空きへ逃がす（押し下げる。本来いたい高さは変えない）。
  // first を指定すると、それを最初に置く（変更したボックスをその場に残し、相手の方をずらすため）。
  // 本来いたい高さより下にいるボックスは、ほかを置いたあとで、本来いたい高さから今の高さまでの一番上の空きへ戻す
  // （押し下げた相手が縮んだら戻るように）
  function placeGroup(list: Box[], spot: (n: Box) => [number, number], first?: Box) {
    for (const n of list) unplaced.add(n);
    const rest = list.filter(n => n !== first);
    const below = (n: Box) => n.hasPos && n.y > n.intendedY + 0.5;
    const pushed = rest.filter(below).sort((a, b) => a.intendedY - b.intendedY);
    const order = (first && list.includes(first) ? [first] : [])
      .concat(rest.filter(n => n.hasPos && !below(n)), pushed, rest.filter(n => !n.hasPos));
    for (const n of order) {
      // 押し下げは同じ x のまま下へずらすものなので、戻すときも今の x のまま上へ戻すだけにする
      if (n !== first && below(n)) {
        const back = slide(n, n.x, clamp(n, n.x, n.intendedY)[1], "down", n.y);
        if (back) [n.x, n.y] = back;
      }
      [n.x, n.y] = clamp(n, n.x, n.y);
      if (!n.hasPos || collides(n, n.x, n.y)) {
        const wasPlaced = n.hasPos;
        [n.x, n.y] = spot(n);
        if (!wasPlaced) n.intendedY = n.y; // 位置の無いボックスは、空きに置いた位置が本来いたい位置
      }
      unplaced.delete(n);
      n.hasPos = true;
    }
  }

  // 子から順に大きさと配置を決める
  // keep は変更したボックスとその祖先。重なったときはこれらをその場に残し、相手の方をずらす。
  // 位置のある子が重なったら同じ x のまま下へずらし、位置の無い子は左上から空きを探す
  function settleNode(n: Box, keep?: Set<Box>) {
    n.children.forEach(c => settleNode(c, keep));
    if (kindOf(n).holdsChildren) {
      n.children.forEach(c => fitToRow(c));
      placeGroup(n.children, c => (c.hasPos ? spotBelow(c) : findGridSpot(c)), n.children.find(c => keep?.has(c)));
    }
    fit(n);
  }

  // 位置のあるボックスが重なったら、同じ x のまま下へずらす（周りを探すより元の並びが崩れにくい）。
  // 位置の無いボックスは、置こうとした場所の近くの空きを探す
  function settleRoots(first?: Box) {
    placeGroup(roots(), n => (n.hasPos ? spotBelow(n) : findFreeSpot(n, n.x, n.y)), first);
  }

  // n を (x, y) から dir の向きへ、兄弟とぶつからなくなるまでずらした位置を返す。ぶつかった相手の端のちょうど
  // opt.gap 先へ一度に進めるので、押し下げた相手との間隔はいつも opt.gap になる（ドラッグの pushAway と同じ。
  // 少しずつずらすと、止まる位置が刻みに引っ張られて間隔がばらつく）。
  // その向きの位置が limit を越えたら null（呼び出し側で別の置き方をする）。
  // 読み込み・設定変更のあと（spotBelow）、子のサイズをそろえる（compress）、最初に開いたとき（fitToViewport）で使う
  function slide(n: Box, x: number, y: number, dir: "down" | "right" = "down", limit = Infinity): [number, number] | null {
    const g = opt.gap;
    for (;;) {
      if ((dir === "down" ? y : x) > limit) return null;
      const hits = siblings(n).filter(o => o !== n && isPlaced(o) && overlaps(n, x, y, o));
      if (!inNest(n) || !hits.length) return [x, y];
      if (dir === "down") y = Math.max(...hits.map(o => o.y + o.h + g));
      else x = Math.max(...hits.map(o => o.x + o.w + g));
    }
  }

  function spotBelow(n: Box): [number, number] {
    // 親の高さが決まっていれば（ワールドの高さの指定や、切り詰める枠）、下にも限りがある
    const c = containerOf(n);
    const f = fixedSize(c);
    const maxY = f.h != null ? f.h - opt.padding - n.h : Infinity;
    return slide(n, n.x, n.y, "down", maxY) ?? (c.isWorld ? findFreeSpot(n, n.x, n.y) : findGridSpot(n));
  }

  // 広がった n が、自分より大きい兄弟にぶつかったら、n の方が動く量の一番少ない向きへずれる
  // （大きい方を動かすと全体が崩れるため）。自分より小さい兄弟は、このあと settle の中で下へずらされる
  function stepAside(n: Box) {
    if (!inNest(n)) return;
    const area = (b: Box) => b.w * b.h;
    const g = opt.gap;
    for (let i = 0; i < 8; i++) {
      const hit = siblings(n).find(o => o !== n && area(o) >= area(n) && overlaps(n, n.x, n.y, o));
      if (!hit) return;
      const cands: [number, number][] = [
        [hit.x + hit.w + g, n.y], [hit.x - g - n.w, n.y], [n.x, hit.y + hit.h + g], [n.x, hit.y - g - n.h],
      ].map(([x, y]) => clamp(n, x!, y!));
      const dist = ([x, y]: [number, number]) => Math.hypot(x - n.x, y - n.y);
      // 大きい兄弟とは重ならない位置のうち、一番近いもの
      const ok = cands
        .filter(([x, y]) => !siblings(n).some(o => o !== n && area(o) >= area(n) && overlaps(n, x, y, o)))
        .sort((a, b) => dist(a) - dist(b))[0];
      if (!ok) return;
      [n.x, n.y] = ok;
    }
  }

  // 位置の無い最上位のボックスを円形に並べる（開いたときと、外部の変更で増えたとき）
  function placeAutoRoots() {
    const auto = roots().filter(n => !n.hasPos);
    const R = Math.min(world.w, world.h) * 0.3 + 40;
    auto.forEach((n, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / auto.length;
      n.x = world.w / 2 + R * Math.cos(a) - n.w / 2;
      n.y = world.h / 2 + R * Math.sin(a) - n.h / 2;
    });
  }

  // 場面の方針（policy.ts の SCENES の1行）に従って、全体の大きさと位置を決め直す。
  // changed は変えた節点、apply はその変更。変える前に保つ位置を覚えてから apply を呼ぶ
  // （先に変えると、変わったあとの大きさで覚えてしまう）
  function settle(scene: Scene, changed?: Box, apply?: () => void) {
    const anchored = changed && scene.anchor && inNest(changed) ? changed : undefined;
    const keepAt = anchored && anchors[anchored.parent ? scene.anchor!.inGroup : scene.anchor!.topLevel](anchored);
    let wantY = anchored?.y ?? 0; // 自分の設定を変えたとき、保とうとした高さ（押し戻しやずれの前）
    apply?.();
    if (anchored && keepAt) {
      settleNode(anchored);
      const want = keepAt.x(anchored);
      wantY = keepAt.y(anchored);
      [anchored.x, anchored.y] = clamp(anchored, want, wantY);
      // 最上位は、押し戻される前の本来の中心を保って狭める（グループの中は左上を保つので左端を保つ）
      fitToRow(anchored, anchored.parent ? undefined : want + anchored.w / 2);
      if (scene.giveWayToLarger) stepAside(anchored);
    }
    // 変えた節点と祖先はその場に残し、ぶつかる相手の方を動かす（others）。later なら後から置くものが動く
    const keep = changed && scene.yieldTo === "others" ? new Set([changed, ...ancestors(changed)]) : undefined;
    roots().forEach(r => settleNode(r, keep));
    roots().forEach(r => fitToRow(r));
    syncWorld();
    placeAutoRoots();
    settleRoots(keep ? (ancestors(changed!).pop() ?? changed) : undefined);
    syncWorld();
    if (scene.fitViewport) fitToViewport();
    if (scene.adoptPlaced) for (const b of roots().flatMap(r => [r, ...descendants(r)])) b.intendedY = b.y;
    // 自分の設定を変えたボックスは、保とうとした高さが本来いたい高さになる（押し下げられていれば、その位置）
    if (anchored) anchored.intendedY = wantY;
    // まだ本来いたい中心が決まっていない最上位（データから置いたばかり）は、今の中心にする
    for (const r of roots()) if (!Number.isFinite(r.intendedCX)) r.intendedCX = centerX(r);
  }

  // 読み込んだ直後だけ、表示領域の右にはみ出した最上位のボックスを下へ移す（横スクロールより縦の方が見やすい）。
  // つながる相手が表示領域に収まっていれば、その真下に中心をそろえて置く。無ければ全体の一番下の左端に置く。
  // 表示の上だけで動かし、ファイルには次に編集したときに保存される。
  // ワールドの幅が指定されている、表示領域より大きい、または左端が表示領域の左半分にあるボックスは動かさない
  // （左から始まる大きなボックスが少しはみ出しただけなら、動かすと全体の並びが崩れる）
  function fitToViewport() {
    const limit = viewport().w - opt.padding;
    if (world.src.width || limit <= 0) return;
    const inside = (n: Box) => n.x + n.w <= limit;
    const centerOffset = (n: Box) => { const r = anchorRect(n); return r.x + r.w / 2; };
    const over = roots()
      .filter(n => !inside(n) && n.w <= limit - opt.padding && n.x >= limit / 2)
      .sort((a, b) => a.x - b.x);
    if (!over.length) return;
    for (const n of over) {
      const anchor = incident(n).map(e => other(e, n)).find(o => !o.parent && inside(o));
      const minX = opt.padding, maxX = limit - n.w;
      const x = anchor
        ? Math.max(minX, Math.min(maxX, anchor.x + centerOffset(anchor) - centerOffset(n)))
        : minX;
      const y = anchor
        ? anchor.y + anchor.h + opt.treeGapY
        : Math.max(...roots().filter(o => o !== n && inside(o)).map(o => o.y + o.h), 0) + opt.treeGapY;
      // ぶつかれば下へずらす
      [n.x, n.y] = slide(n, x, y)!;
      n.intendedY = n.y;
      n.intendedCX = centerX(n);
      ctx.fitted?.(n);
    }
    syncWorld();
  }

  // ---- 子の大きさをそろえる ----

  // そろえられる子（内包か文字の箱）。S は高さが固定で小さい、スティックマンは文字で幅が決まり、
  // ツリーや非表示で子を見せているボックスは子の並びで大きさが決まるので除く
  function sizable(n: Box): Box[] {
    if (!kindOf(n).holdsChildren) return [];
    return n.children.filter(k => {
      const kind = kindOf(k).name;
      return (kind === "nest" || kind === "text") && sizeOf(k) !== "S" && !isIconShape(shapeOf(k));
    });
  }

  // 大きさの指定を外して、今の中身の配置のまま収まる大きさを測る（文字だけのボックスは既定の大きさ）
  function naturalSize(k: Box, dim: "w" | "h") {
    const [sw, sh] = [k.specW, k.specH];
    if (dim === "w") k.specW = 0;
    else k.specH = 0;
    fit(k);
    const v = dim === "w" ? k.w : k.h;
    [k.specW, k.specH] = [sw, sh];
    fit(k);
    return v;
  }

  // 中身を詰め直してもこれより小さくできない大きさ（一番大きい中身が入る大きさ）
  function minimumSize(k: Box, dim: "w" | "h") {
    if (!kindOf(k).holdsChildren) return naturalSize(k, dim);
    const a = innerArea(k);
    return dim === "w"
      ? Math.max(GROUP_MIN.w, a.left + a.right + Math.max(...k.children.map(g => g.w)))
      : Math.max(GROUP_MIN.h, a.top + a.bottom + Math.max(...k.children.map(g => g.h)));
  }

  // 内包している k の中身を、大きさ limit に収まるよう詰め直す。はみ出す中身を内側へ寄せ、
  // 重なったら dir の向き（場面の表の repack。幅なら下、高さなら右）へずらす
  function compress(k: Box, dim: "w" | "h", limit: number, dir: "down" | "right") {
    if (!kindOf(k).holdsChildren) return;
    const a = innerArea(k);
    const kids = [...k.children].sort((p, q) => (dim === "w" ? p.y - q.y || p.x - q.x : p.x - q.x || p.y - q.y));
    for (const g of kids) {
      if (dim === "w" && g.x + g.w > limit - a.right) g.x = Math.max(a.left, limit - a.right - g.w);
      if (dim === "h" && g.y + g.h > limit - a.bottom) g.y = Math.max(a.top, limit - a.bottom - g.h);
      unplaced.add(g);
    }
    for (const g of kids) {
      [g.x, g.y] = slide(g, g.x, g.y, dir)!;
      g.intendedY = g.y; // 詰め直した位置が、本来いたい位置になる
      unplaced.delete(g);
    }
    fit(k);
  }

  // 内包している n の子の幅や高さを、今いちばん小さい子に合わせてそろえる。縮める方向にしか働かない
  // （ボックスは中身に合わせた大きさが正解なので、そろえるために大きくはしない）。
  // 広い子は中身を詰め直して縮め、中身の都合で目標まで縮められない子は、縮められるところまで縮める。
  // グループに大きさの指定（width, height）を付けるのは、目標にぴったり合わせるのに要るときだけ。
  // 両方なら幅を先にそろえる。settle(SCENES.fitChildren, n, apply) の apply として呼ぶ。
  // そろえた子の数と、目標まで縮められなかった子があったかを返す
  function alignChildren(n: Box, what: "width" | "height" | "both", scene: Scene) {
    const kids = sizable(n);
    let partial = false;
    const align = (dim: "w" | "h") => {
      const cur = (k: Box) => (dim === "w" ? k.w : k.h);
      const target = Math.min(...kids.map(cur));
      for (const k of kids) {
        // 両方そろえるとき、グループの高さは詰め直さない（横へ並べ直すと、そろえた幅が崩れる。グループは大きさの指定で幅を保てない）
        if (dim === "h" && what === "both" && kindOf(k).holdsChildren) {
          if (k.h > target + 0.5) partial = true;
          continue;
        }
        const t = Math.round(Math.max(target, minimumSize(k, dim)));
        if (t > target + 0.5) partial = true;
        compress(k, dim, t, scene.repack![dim]);
        // 文字のボックスには大きさを指定する。グループは大きさの指定を使わない（中身を詰め直した大きさになる。docs/SIZE-plan.md）
        setSpec(k, dim, kindOf(k).holdsChildren ? 0 : t);
        fit(k);
      }
    };
    if (what !== "height") align("w");
    if (what !== "width") align("h");
    return { count: kids.length, partial };
  }

  return {
    containerOf, siblings, incident, innerArea, fixedSize, syncWorld,
    kindOf, anchorRect, centerX, fit, refitAncestors,
    clamp, overlaps, collides, isPlaced,
    findGridSpot, findFreeSpot, placeGroup, settleNode, settleRoots, spotBelow, stepAside,
    settle, fitToViewport, viewport,
    sizable, alignChildren,
  };
}
