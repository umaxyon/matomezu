// ステージ 1 つ: 与えられた枠の中に、開いているページの紙を描く。ドラッグとホイールで紙をずらす（手のひら）
import { memo, type PointerEvent, type WheelEvent, useRef, useState } from "react";
import type { Point } from "../../core/geom";
import { DEFAULT_PAPER, PAPERS } from "../../core/paper";
import { clampPan, contentSize, paperOrigin } from "../../core/viewport";
import { useActions, useApp } from "../store-context";
import styles from "./Stage.module.css";
import { useViewSize } from "./use-view-size";

interface Drag { pointer: number; startX: number; startY: number; pan: Point }

export const Stage = memo(function Stage({ id }: { id: string }) {
  const stage = useApp(s => s.workspace.stages.find(st => st.id === id));
  const isCurrent = useApp(s => s.workspace.current === id);
  const isMulti = useApp(s => s.workspace.stages.length > 1);
  const { focusStage, panStage } = useActions();
  const ref = useRef<HTMLDivElement>(null);
  const view = useViewSize(ref);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  if (!stage) return null;

  const paper = PAPERS[DEFAULT_PAPER];
  const content = contentSize(paper, stage.zoom);
  const pan = view ? clampPan(view, content, stage.pan) : stage.pan;
  const origin = paperOrigin(pan);
  const panTo = (next: Point) => { if (view) panStage(id, clampPan(view, content, next)); };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    focusStage(id);
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointer: e.pointerId, startX: e.clientX, startY: e.clientY, pan };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    panTo({ x: d.pan.x + e.clientX - d.startX, y: d.pan.y + e.clientY - d.startY });
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const dx = e.shiftKey ? e.deltaY : e.deltaX;
    const dy = e.shiftKey ? e.deltaX : e.deltaY;
    panTo({ x: pan.x - dx, y: pan.y - dy });
  };

  return (
    <div
      ref={ref}
      className={styles.stage}
      role="region"
      aria-label="ステージ"
      data-current={isCurrent}
      data-multi={isMulti}
      data-dragging={dragging}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    >
      <div
        className={styles.paper}
        role="img"
        aria-label="紙"
        style={{
          width: paper.w,
          height: paper.h,
          transform: `translate(${origin.x}px, ${origin.y}px) scale(${stage.zoom})`,
        }}
      />
    </div>
  );
});
