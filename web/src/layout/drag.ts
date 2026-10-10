// ドラッグ中の配置（設計は docs/DRAG-plan.md）。settle（場面の表）は使わず、ポインタが動くたびに compute で決め直す。決まり:
//   - つかんだボックスはポインタに追従する（親の固定された枠に収める分だけ寄せる）。兄弟とぶつかっても止まらない
//   - 進む向きの先にいた兄弟は、つかんだボックスの先端が正面からその兄弟の大きさ（進む向き）の半分まで食い込んだら
//     入れ替わる（2026-10-10 ユーザー。4 分の 1 でも速かった。その前は触れた瞬間で、敏感すぎた）: つかんだボックスの大きさ + opt.gap だけ
//     開始位置の側へずれる（並べ替えのリストで、通り過ぎた項目が空いた枠へずれるのと同じ）。ずれた先でほかの箱と
//     ぶつかる、親の枠からはみ出すときはずらさず、重なったまま通す。正面とは、進む向きを横切る軸で、小さい方の箱の
//     幅（か高さ）の半分以上重なっていること。角をかすめるだけでは入れ替えない（2026-10-03 ユーザー）。
//     入れ替えるのは、このドラッグの中で、進む向きの先端が実際にその兄弟まで来たことがあるときだけ（通り道を覚える）。
//     開始位置と今の位置だけで決めると、兄弟の上を回り込んで反対側へ出たときにも、通り抜けたのと同じに見えて入れ替わるため。
//     進む向きは今の動き（前に置けた位置から）で決め、入れ替える向きは兄弟ごとに、先端が来たときの向きにする
//     （縦に動いてから横からぶつけても、横に入れ替わるように）
//   - 食い込みが半分に届くまでは、兄弟を押さずに重なって通る（ドラッグしている箱は、ほかの箱を押さない）
//   - 手を離したとき、入れ替えた相手とまだ重なっていれば、つかんだボックスを相手の向こう側へ寄せる（入れ替えを
//     完成させる）。入れ替えるほど食い込んでいない相手と重なっていれば、つかんだボックスを相手の手前へ戻す
//     （相手は動かさない。2026-10-04 ユーザー）。それでも残った重なりは、場面の表の drop で直す
//   - 中身を動かして広がった祖先は、前に下にいた相手を下へ、右にいた相手を右へ（無理なら下へ）押す
//   - 毎回、ドラッグを始めたときの位置（写し）から計算し直す。押した結果を次の計算の起点にしないので、
//     つかんだボックスが離れれば、どいた相手は元の位置へ戻る。手を離したら、そのときの位置で確定する
//   - 祖先が押した結果、祖先が親の固定された枠からはみ出すなら、その向きへは押さない（ほかの向きか、重なったまま）
//   - つかんだボックス自身が祖先を枠からはみ出させるときだけは、その位置へ動かさない（はみ出さない所で止める）
import type { Layout, LayoutOptions } from "./layout";
import { type Box, ancestors } from "../model";

export type Drag = ReturnType<typeof createDrag>;
export type DragSession = ReturnType<Drag["begin"]>;

type Dir = "down" | "up" | "right" | "left";

// 入れ替えるのは、進む向きを横切る軸で、小さい方の箱の幅（か高さ）のこの割合以上重なっているとき（正面から触れたとき）
const FACE_RATIO = 0.5;
// 入れ替えるのは、進む向きの先端が、兄弟の大きさ（進む向き）のこの割合まで食い込んだとき
const DEPTH_RATIO = 0.5;

const OPPOSITE: Record<Dir, Dir> = { down: "up", up: "down", right: "left", left: "right" };
type Rect = { x: number; y: number; w: number; h: number };

export function createDrag(opt: LayoutOptions, L: Layout) {
  const { siblings, clamp, overlaps, collides, fit } = L;
  const g = opt.gap;

  // 親の中に収まる位置にあるか
  const clamped = (m: Box) => {
    const [cx, cy] = clamp(m, m.x, m.y);
    return Math.abs(cx - m.x) <= 0.5 && Math.abs(cy - m.y) <= 0.5;
  };

  // n をつかんで動かし始める。n と各祖先の兄弟（自分を含む）の位置と大きさを写しておく
  function begin(n: Box) {
    const snap = new Map<Box, Rect>();
    for (const m of [n, ...ancestors(n)]) {
      for (const o of siblings(m)) snap.set(o, { x: o.x, y: o.y, w: o.w, h: o.h });
    }
    const at = (o: Box) => snap.get(o)!;
    let last: [number, number] = [n.x, n.y]; // 前に置けた位置
    let travel: Dir = "down";                 // 今進んでいる向き（前に置けた位置から今の位置への動き）
    let swapped: Box[] = [];                  // 入れ替えた兄弟
    const met = new Map<Box, Dir>();          // このドラッグで、先端が正面から来たことのある兄弟と、来た向き（最後に来たとき）
    const backed = new Set<Box>();            // 引き返している途中の兄弟（そこを抜けるまで、来たことにしない）

    // o を、by に重ならないよう dir の向きへ、by の端のちょうど gap 先へどける。
    // どいた先でぶつかる相手のうち、写しで o より dir の先にいたものを、同じ向きに続けてどける。
    // 動かした箱の動かす前の位置を undo に残す（失敗したら呼び出し側で戻す）
    function push(o: Box, dir: Dir, by: Box, mover: Box, undo: Map<Box, [number, number]>, depth: number): boolean {
      if (depth > 50) return false;
      if (!undo.has(o)) undo.set(o, [o.x, o.y]);
      if (dir === "down") o.y = by.y + by.h + g;
      else if (dir === "up") o.y = by.y - g - o.h;
      else if (dir === "right") o.x = by.x + by.w + g;
      else o.x = by.x - g - o.w;
      if (!clamped(o)) return false;
      const s = at(o);
      for (const p of siblings(o)) {
        if (p === o || p === mover || !overlaps(o, o.x, o.y, p)) continue;
        const q = at(p);
        const ahead = dir === "down" ? q.y >= s.y - 0.5
          : dir === "up" ? q.y <= s.y + 0.5
          : dir === "right" ? q.x >= s.x - 0.5
          : q.x <= s.x + 0.5;
        if (!ahead || !push(p, dir, o, mover, undo, depth + 1)) return false;
      }
      return true;
    }

    // mover の祖先が、親の枠に収まっているか（測り直してから確かめる）
    function ancestorsFit(mover: Box) {
      for (const m of ancestors(mover)) {
        fit(m);
        if (!clamped(m)) return false;
      }
      return true;
    }

    // mover に重なる兄弟を、dirsFor の向きを順に試してどける。order は処理する順（手前から）。
    // どいた結果、祖先が親の枠からはみ出すなら、その向きは無理とする（つかんだボックスを止めないため）。
    // どれも無理な相手は、その場に残す（重なったまま）
    function resolve(mover: Box, dirsFor: (o: Box) => Dir[], order: (a: Rect, b: Rect) => number) {
      const others = siblings(mover).filter(o => o !== mover).sort((a, b) => order(at(a), at(b)));
      for (const o of others) {
        if (!overlaps(mover, mover.x, mover.y, o)) continue;
        for (const dir of dirsFor(o)) {
          const undo = new Map<Box, [number, number]>();
          if (push(o, dir, mover, mover, undo, 0) && ancestorsFit(mover)) break;
          for (const [b, [bx, by]] of undo) { b.x = bx; b.y = by; }
        }
      }
    }

    // 横切る軸で、正面から n と重なっているか（d の向きに進むとき。小さい方の幅か高さの FACE_RATIO 以上。
    // 斜めにかすめるだけなら入れ替えない）
    function facing(r: Rect, d: Dir) {
      const vertical = d === "down" || d === "up";
      const overlap = vertical
        ? Math.min(r.x + r.w, n.x + n.w) - Math.max(r.x, n.x)
        : Math.min(r.y + r.h, n.y + n.h) - Math.max(r.y, n.y);
      return overlap >= (vertical ? Math.min(r.w, n.w) : Math.min(r.h, n.h)) * FACE_RATIO;
    }

    // d の向きに進む n の先端が、前に置けた位置（last）から今の位置までのあいだに、兄弟のところ（DEPTH_RATIO まで
    // 食い込んだところから、兄弟の向こうの端の手前まで）を通ったか。今の位置だけで見ると、速く動かして 1 回で
    // そこを飛び越えたときに入れ替わらない
    function arrived(r: Rect, d: Dir) {
      const dh = r.h * DEPTH_RATIO, dw = r.w * DEPTH_RATIO;
      const [px, py] = last;
      return d === "down" ? n.y + n.h > r.y + dh && py + n.h < r.y + r.h
        : d === "up" ? n.y < r.y + r.h - dh && py > r.y
        : d === "right" ? n.x + n.w > r.x + dw && px + n.w < r.x + r.w
        : n.x < r.x + r.w - dw && px > r.x;
    }

    // d の向きから来た n の先端が、兄弟に DEPTH_RATIO まで食い込んでいるか、もう越えているか
    function engaged(r: Rect, d: Dir) {
      return d === "down" ? n.y + n.h > r.y + r.h * DEPTH_RATIO
        : d === "up" ? n.y < r.y + r.h * (1 - DEPTH_RATIO)
        : d === "right" ? n.x + n.w > r.x + r.w * DEPTH_RATIO
        : n.x < r.x + r.w * (1 - DEPTH_RATIO);
    }

    // 入れ替え: 今進んでいる向き（travel）で、先端が正面から来た兄弟を、その向きと一緒に覚える（met）。
    // 覚えた兄弟は、来た向きで正面に重なり、先端がまだそこまで来ているか越えているあいだ、n の大きさ + gap だけ
    // 来た側（逆向き）へずらす。下がって離れれば元に戻る
    function swap() {
      const cands: Box[] = [];
      for (const o of siblings(n)) {
        if (o === n) continue;
        const r = at(o);
        if (facing(r, travel) && arrived(r, travel)) {
          // 来た向きと逆から来たのは、引き返したということなので、覚えた向きを忘れる（逆向きに入れ替えない）。
          // 兄弟のところを抜けるまでは、来たことにしない（抜ける前に、逆向きに来たと数え直さないように）
          if (met.get(o) === OPPOSITE[travel]) { met.delete(o); backed.add(o); }
          else if (!backed.has(o)) met.set(o, travel);
        } else {
          backed.delete(o);
        }
        const d = met.get(o);
        if (!d || !facing(r, d) || !engaged(r, d)) continue;
        if (d === "down") o.y = r.y - (n.h + g);
        else if (d === "up") o.y = r.y + n.h + g;
        else if (d === "right") o.x = r.x - (n.w + g);
        else o.x = r.x + n.w + g;
        cands.push(o);
      }
      // ずれた先でほかの箱（n は除く）とぶつかる、枠からはみ出すものは戻す（戻したことでぶつかるものも続けて戻す）
      const moved = new Set(cands);
      for (let again = true; again;) {
        again = false;
        for (const o of moved) {
          if (clamped(o) && !siblings(n).some(p => p !== o && p !== n && overlaps(o, o.x, o.y, p))) continue;
          o.x = at(o).x; o.y = at(o).y;
          moved.delete(o);
          again = true;
        }
      }
      swapped = [...moved];
    }

    // 目標位置 (tx, ty) に置いて、全体を写しから決め直す。keepTravel なら進む向きを決め直さない
    // （手を離したときに手前へ戻すのを、引き返したと数えないように）
    function place(tx: number, ty: number, keepTravel = false) {
      for (const [o, r] of snap) { o.x = r.x; o.y = r.y; }
      [n.x, n.y] = clamp(n, tx, ty);
      // 進む向きは、開始位置からではなく、前に置けた位置からの今の動きで決める（縦に動いてから横からぶつけたときに、
      // 縦の入れ替えにならないように）。止まっていれば前の向きのまま
      const dx = n.x - last[0], dy = n.y - last[1];
      if (!keepTravel && Math.hypot(dx, dy) >= 1) travel = Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? "down" : "up") : (dx > 0 ? "right" : "left");
      swap();
      // 広がった祖先は、前に下にいた相手を下へ、右にいた相手を右へ（無理なら下へ）押す
      for (const m of ancestors(n)) {
        fit(m);
        if (!clamped(m)) return false;
        const before = at(m);
        resolve(m, o => {
          const r = at(o);
          if (r.y >= before.y + before.h - 0.5) return ["down"];
          if (r.x >= before.x + before.w - 0.5) return ["right", "down"];
          return [];
        }, (a, b) => a.y - b.y || a.x - b.x);
      }
      return true;
    }

    return {
      n,
      swapped: () => swapped, // 今入れ替えている兄弟
      // 目標位置へ動かす。祖先が親の枠からはみ出して置けなければ、前に置けた位置から目標へ向かって置ける所まで
      // （二分探索で 1px 未満まで詰める）動かして false
      compute(tx: number, ty: number): boolean {
        if (place(tx, ty)) { last = [n.x, n.y]; return true; }
        const [lx, ly] = last;
        let lo = 0, hi = 1;
        while ((hi - lo) * Math.hypot(tx - lx, ty - ly) > 1) {
          const t = (lo + hi) / 2;
          if (place(lx + (tx - lx) * t, ly + (ty - ly) * t)) lo = t; else hi = t;
        }
        place(lx + (tx - lx) * lo, ly + (ty - ly) * lo);
        last = [n.x, n.y];
        return false;
      },
      // 手を離したとき: 入れ替えた相手とまだ重なっていれば、n を相手の向こう側へ寄せる。
      // 寄せた先でまた入れ替わる相手がいれば、それも越える（数回まで）。置けなければ寄せない。
      // 最後に、入れ替えるほど食い込んでいない相手と重なっていれば、n を相手の手前へ戻す（retreat）
      finish() {
        for (let i = 0; i < 5; i++) {
          const all = swapped.filter(o => overlaps(n, n.x, n.y, o));
          if (!all.length) return this.retreat();
          // 入れ替えた向き（来た向き）ごとに寄せる。向きの違う相手が混ざっていれば、最初の相手の向きにそろえる
          const d = met.get(all[0]!)!;
          const hits = all.filter(o => met.get(o) === d);
          const [x, y] = [n.x, n.y];
          const tx = d === "right" ? Math.max(...hits.map(o => o.x + o.w + g))
            : d === "left" ? Math.min(...hits.map(o => o.x - g - n.w)) : x;
          const ty = d === "down" ? Math.max(...hits.map(o => o.y + o.h + g))
            : d === "up" ? Math.min(...hits.map(o => o.y - g - n.h)) : y;
          const [cx, cy] = clamp(n, tx, ty);
          if (Math.abs(cx - tx) > 0.5 || Math.abs(cy - ty) > 0.5 || !place(tx, ty)) { place(x, y); return; }
        }
      },
      // 入れ替えていない兄弟のうち、n が重なっている（間隔を含む）が入れ替えるほど食い込んでいないものがあれば、n をその手前
      // （間隔 gap を空けた所）へ戻す。相手は動かさない。手前とは、相手ごとに n が近づいてきた側: このドラッグで先端が来た向き（met）、
      // 無ければドラッグを始めた位置との位置関係（左にいたなら左へ）。最後の動きの向き（travel）では決めない（横から近づいて、
      // 離す直前に少し縦に動くと、横の相手を手前へ戻さず、drop で相手を押し下げてしまっていた。2026-10-10）。
      // 戻した先でほかと重なる、枠に収まらないなら戻さない。食い込んだのにずれた先がふさがっていて入れ替えなかった相手は、
      // drop に任せる（相手が下へ）
      retreat() {
        const s = at(n);
        const cameFrom = (o: Box): Dir | null => {
          const d = met.get(o);
          if (d) return d;
          const r = at(o);
          return s.x >= r.x + r.w ? "left" : s.x + s.w <= r.x ? "right" : s.y >= r.y + r.h ? "up" : s.y + s.h <= r.y ? "down" : null;
        };
        const ahead = siblings(n)
          .filter(o => o !== n && !swapped.includes(o) && overlaps(n, n.x, n.y, o))
          .map(o => ({ o, d: cameFrom(o) }))
          .filter((a): a is { o: Box; d: Dir } => a.d != null && !engaged(at(a.o), a.d));
        if (!ahead.length) return;
        const d = ahead[0]!.d;
        const hits = ahead.filter(a => a.d === d).map(a => a.o);
        const [x, y] = [n.x, n.y];
        const tx = d === "right" ? Math.min(...hits.map(o => o.x - g - n.w))
          : d === "left" ? Math.max(...hits.map(o => o.x + o.w + g)) : x;
        const ty = d === "down" ? Math.min(...hits.map(o => o.y - g - n.h))
          : d === "up" ? Math.max(...hits.map(o => o.y + o.h + g)) : y;
        const [cx, cy] = clamp(n, tx, ty);
        const ok = Math.abs(cx - tx) <= 0.5 && Math.abs(cy - ty) <= 0.5 && place(tx, ty, true) && !collides(n, n.x, n.y);
        if (!ok) place(x, y, true);
      },
      // 重なりが残っているか（手を離したときに解決する）
      overlapping: () => [...snap.keys()].some(o => collides(o, o.x, o.y)),
      // 写しから位置が変わった箱（つかんだボックスは除く）
      displaced: () => [...snap].filter(([o, r]) => o !== n && (o.x !== r.x || o.y !== r.y)).map(([o]) => o),
    };
  }

  return { begin };
}
