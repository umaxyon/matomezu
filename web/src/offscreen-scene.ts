// ほかのブック・描いていないページを、画面の外で実際に並べる。データだけの近似（data-scene.ts の dataScene）では、
// 線が中心どうしの直線になり、子（リストの行など）も描けないため、見えない所に図を 1 つ作って並べ、その配置を読んで捨てる。
// - 縮図（マスターの窓とリンクの箱の窓。D26）: layoutScene。読めなければ近似に戻す
// - 配置の要約（matomezu check で、カレントの画面が表示していないページ。D30。docs/NOTIFY-plan.md）: layoutGeometry
// - 開くときの判定（matomezu open・set の確かめ。docs/PAPER-plan.md の 4.6 の 7）: layoutMisfits
// 作る図には保存・同期・認知（D31）・履歴のつなぎ先を渡さない（並べて読むだけで、ファイルにも画面にも何も起こさない）。
// 並べるのは 1 冊ずつ順に（同時に幾つも作らない）
import { DEFAULTS, createGraph } from "./graph";
import { dataScene } from "./data-scene";
import { type Scene, sceneOf } from "./preview-art";
import type { Misfit } from "./paper-misfit";
import type { Geometry } from "./report";
import type { Diagram, WorldInfo } from "./types";

type Graph = ReturnType<typeof createGraph>;

let queue: Promise<unknown> = Promise.resolve();

// 縮図の見えない図の大きさ（画面の図と同じくらい）
const SCENE_SIZE = { w: 1200, h: 800 };

// 見えない所に size の大きさの図を作り、page を描いて read で読み、捨てる
// judgePages は、描かないページも判定するか（graph.ts の GraphOptions。縮図は描くページだけ）
function offscreen<T>(data: Diagram, page: string | null, size: { w: number; h: number }, read: (g: Graph) => T, judgePages = true): Promise<T> {
  const run = (): T => {
    const host = document.createElement("div");
    // 文字を測るので display: none にはしない（見えない所に置くだけ）
    host.style.cssText = `position: fixed; left: -30000px; top: 0; width: ${size.w}px; height: ${size.h}px; visibility: hidden; overflow: hidden; pointer-events: none;`;
    document.body.appendChild(host);
    try {
      const g = createGraph(host, data, { judgePages });
      try {
        if (page != null) g.setPage(page);
        return read(g);
      } finally {
        g.destroy();
      }
    } finally {
      host.remove();
    }
  };
  const p = queue.then(run);
  queue = p.catch(() => {});
  return p;
}

// without があれば、その箱を描かずに中身だけの縮図にする（リストの子の中身の縮図。D13）
export function layoutScene(data: Diagram, page: string | null = null, without?: string): Promise<Scene> {
  return offscreen(data, page, SCENE_SIZE, g => sceneOf(g.geometry(), (g.info(null) as WorldInfo).backgroundPaint, without), false)
    .catch(() => dataScene(data, page ?? "", DEFAULTS));
}

// 表示領域が size の画面で page を開いたときの配置（要約の元）。開いたときと同じ配置になるよう、画面の図と同じ大きさで並べる
export function layoutGeometry(data: Diagram, page: string | null, size: { w: number; h: number }): Promise<Geometry> {
  return offscreen(data, page, size, g => g.geometry());
}

// 開いたときと同じに全部のページを並べ、紙の外の箱を押し込んでも紙に収まらないページ（graph.ts の load。無ければ空）
export function layoutMisfits(data: Diagram, size: { w: number; h: number }): Promise<Misfit[]> {
  return offscreen(data, null, size, g => g.misfits());
}
