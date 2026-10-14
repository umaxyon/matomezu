// ほかのブック・描いていないページの縮図を、画面の外で実際に並べて作る（マスターの窓とリンクの箱の窓。D26）。データだけの近似（graph.ts の dataScene）では、
// 線が中心どうしの直線になり、子（リストの行など）も描けないため、見えない所に図を 1 つ作って並べ、その配置から縮図を作る。
// 並べるのは 1 冊ずつ順に（同時に幾つも作らない）。読めなければ近似に戻す
import { createGraph, dataScene } from "./graph";
import { type Scene, sceneOf } from "./preview-art";
import type { Diagram, WorldInfo } from "./types";

let queue: Promise<unknown> = Promise.resolve();

export function layoutScene(data: Diagram, page: string | null = null): Promise<Scene> {
  const run = (): Scene => {
    const host = document.createElement("div");
    // 文字を測るので display: none にはしない（見えない所に置くだけ）。大きさは画面の図と同じくらいにする
    host.style.cssText = "position: fixed; left: -30000px; top: 0; width: 1200px; height: 800px; visibility: hidden; overflow: hidden; pointer-events: none;";
    document.body.appendChild(host);
    try {
      const g = createGraph(host, data, {});
      try {
        if (page != null) g.setPage(page);
        return sceneOf(g.geometry(), (g.info(null) as WorldInfo).backgroundPaint);
      } finally {
        g.destroy();
      }
    } catch {
      return dataScene(data, page ?? "");
    } finally {
      host.remove();
    }
  };
  const p = queue.then(run);
  queue = p.catch(() => {});
  return p;
}
