import { useEffect, useMemo, useRef, useState } from "react";
import "./code-theme.css";
import { highlightLine } from "./highlight";
import { SCENES } from "./scenes";
import type { Phase, TreeNode } from "./types";
import { lineView } from "./types";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "事件",
  render: "render",
  reconcile: "reconcile",
  commit: "commit",
  layout: "layoutEffect",
  paint: "paint",
  effect: "useEffect",
  cleanup: "cleanup",
  unmount: "卸载",
  update: "更新",
};

const PHASE_BLOCKS: { id: string; label: string; sub: string; of: Phase[] }[] =
  [
    { id: "render", label: "render", sub: "跑组件函数", of: ["render", "update"] },
    { id: "reconcile", label: "reconcile", sub: "对比元素树", of: ["reconcile"] },
    { id: "commit", label: "commit", sub: "写入 DOM", of: ["commit"] },
    {
      id: "layout",
      label: "layout",
      sub: "layoutEffect",
      of: ["layout", "cleanup"],
    },
    { id: "paint", label: "paint", sub: "浏览器绘制", of: ["paint"] },
    { id: "effect", label: "effect", sub: "useEffect", of: ["effect"] },
  ];

const PHASE_PILL: Record<Phase, string> = {
  idle: "bg-slate-500/20 text-slate-300",
  paint: "bg-slate-500/20 text-slate-300",
  render: "bg-sky-500/20 text-sky-200",
  update: "bg-sky-500/20 text-sky-200",
  reconcile: "bg-violet-500/20 text-violet-200",
  commit: "bg-emerald-500/20 text-emerald-200",
  unmount: "bg-rose-500/20 text-rose-200",
  layout: "bg-amber-500/20 text-amber-200",
  cleanup: "bg-amber-500/20 text-amber-200",
  effect: "bg-purple-500/20 text-purple-200",
};

const NODE_W = 148;
const NODE_H = 36;

const panel =
  "overflow-hidden rounded-xl border border-rf-border bg-rf-panel/90";
const panelHead =
  "flex items-center justify-between gap-2 border-b border-rf-border px-3 py-2 text-xs font-bold text-sky-100";
const hint = "text-[11px] font-medium text-rf-dim";
const btn =
  "rounded-lg border border-rf-border bg-slate-800/90 px-3 py-2 text-xs text-slate-200 hover:border-sky-400/60 hover:text-white";
const btnPrimary =
  "min-w-[4.5rem] rounded-lg border-transparent bg-blue-500 px-3 py-2 text-xs font-bold text-white hover:bg-blue-400";

function TreeChart({
  tree,
  current,
  done,
  mounted,
}: {
  tree: TreeNode[];
  current: Set<string>;
  done: Set<string>;
  mounted: Set<string>;
}) {
  const byId = new Map(tree.map((n) => [n.id, n]));
  const maxY = tree.reduce((m, n) => Math.max(m, n.y + NODE_H), 0);
  const height = Math.max(maxY + 12, 120);
  return (
    <svg
      className="block h-auto w-full min-h-[120px] p-2"
      viewBox={`0 0 560 ${height}`}
      role="img"
      aria-label="组件树关系图"
    >
      {tree.map((n) => {
        const parent = n.parent ? byId.get(n.parent) : undefined;
        if (!parent) return null;
        const x1 = parent.x + NODE_W / 2;
        const y1 = parent.y + NODE_H;
        const x2 = n.x + NODE_W / 2;
        const y2 = n.y;
        const mid = (y1 + y2) / 2;
        const lit = current.has(n.id) || done.has(n.id);
        return (
          <path
            key={`edge-${n.id}`}
            className={`rf-tree-edge ${lit ? "is-lit" : ""} ${current.has(n.id) ? "is-current" : ""}`}
            d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
          />
        );
      })}
      {tree.map((n) => {
        const isCurrent = current.has(n.id);
        const isDone = done.has(n.id) && !isCurrent;
        const isGone = !mounted.has(n.id);
        const cls = [
          "rf-tree-node",
          isCurrent ? "is-current" : "",
          isDone ? "is-done" : "",
          isGone ? "is-gone" : "",
          `kind-${n.kind}`,
        ].join(" ");
        return (
          <g className={cls} key={n.id}>
            <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={8} />
            <text
              x={n.x + NODE_W / 2}
              y={n.y + NODE_H / 2 + 5}
              textAnchor="middle"
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ReactFlowVisualizer() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const tableRef = useRef<HTMLDivElement>(null);

  const scene = SCENES[sceneIndex] ?? SCENES[0]!;
  const step = scene.steps[stepIndex] ?? scene.steps[0]!;
  const last = scene.steps.length - 1;
  const view = useMemo(() => lineView(scene, stepIndex), [scene, stepIndex]);
  const result = step.result ?? scene.finalResult;

  const currentNodes = useMemo(() => new Set(step.active), [step]);
  const doneNodes = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < stepIndex; i++) {
      for (const id of scene.steps[i]?.active ?? []) set.add(id);
    }
    return set;
  }, [scene, stepIndex]);
  const mountedNodes = useMemo(
    () => new Set(step.mounted ?? scene.tree.map((n) => n.id)),
    [step, scene],
  );

  const activeBlock = PHASE_BLOCKS.find((b) => b.of.includes(step.phase))?.id;
  const pastBlocks = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < stepIndex; i++) {
      const p = scene.steps[i]?.phase;
      const block = PHASE_BLOCKS.find((b) => (p ? b.of.includes(p) : false));
      if (block) set.add(block.id);
    }
    return set;
  }, [scene, stepIndex]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => {
        if (stepIndex >= last) {
          setPlaying(false);
          return;
        }
        const next = stepIndex + 1;
        setStepIndex(next);
        if (next >= last) setPlaying(false);
      },
      Math.round(1800 / speed),
    );
    return () => window.clearTimeout(timer);
  }, [playing, speed, last, stepIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        setStepIndex((i) => Math.min(i + 1, last));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        setStepIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  useEffect(() => {
    const wrap = tableRef.current;
    const row = wrap?.querySelector<HTMLElement>("[data-current-row]");
    if (wrap && row) {
      wrap.scrollTop = Math.max(0, row.offsetTop - wrap.clientHeight / 2);
    }
  }, [stepIndex, sceneIndex]);

  const selectScene = (i: number) => {
    setSceneIndex(i);
    setStepIndex(0);
    setPlaying(false);
  };

  const togglePlay = () => {
    if (stepIndex >= last) setStepIndex(0);
    setPlaying((p) => !p);
  };

  const jump = (i: number) => {
    setPlaying(false);
    setStepIndex(i);
  };

  return (
    <div className="flex h-dvh max-h-dvh flex-col gap-2 overflow-hidden bg-[radial-gradient(720px_420px_at_8%_-8%,rgba(60,100,210,0.18),transparent_70%),var(--color-rf-bg)] px-3 pt-2.5 text-rf-text sm:gap-2.5 sm:px-4 sm:pt-3">
      <header className="shrink-0">
        <h1 className="m-0 text-lg font-semibold tracking-wide sm:text-xl">
          React 生命周期 · 逐步看
        </h1>
        <p className="m-0 text-xs leading-relaxed text-rf-dim">
          对照代码行、阶段和 DOM，一步步看 React 在干什么。
        </p>
      </header>

      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <label className="flex min-w-0 items-center gap-2 sm:max-w-[min(420px,48%)]">
          <span className="shrink-0 text-xs font-bold text-sky-200">案例</span>
          <select
            value={sceneIndex}
            onChange={(e) => selectScene(Number(e.target.value))}
            aria-label="选择案例"
            className="min-w-0 flex-1 cursor-pointer rounded-lg border border-rf-border bg-slate-900/90 px-2.5 py-2 text-xs text-rf-text"
          >
            {SCENES.map((s, i) => (
              <option key={s.id} value={i}>
                {s.tag} · {s.title}
              </option>
            ))}
          </select>
        </label>
        <p className="m-0 line-clamp-2 min-w-0 flex-1 text-xs leading-relaxed text-rf-dim sm:line-clamp-1 sm:truncate">
          {scene.summary}
        </p>
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2 lg:items-stretch lg:overflow-hidden">
        <section className="flex min-h-0 flex-col max-lg:shrink-0 lg:h-full lg:overflow-y-auto lg:overflow-hidden">
          <div className={`${panel} flex min-h-0 flex-1 flex-col`}>
            <div className={panelHead}>
              <span>实例代码</span>
              <span className={hint}>长行可横滑</span>
            </div>
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rf-border bg-slate-950/40 px-3 py-2 text-[11px] text-rf-dim"
              aria-label="代码图例"
            >
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm bg-rf-done" />
                已执行
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm bg-rf-active" />
                当前
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm bg-rf-skip" />
                跳过
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm bg-rf-next" />
                下一步
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-2 font-mono text-xs leading-5 max-lg:max-h-[38vh]">
              {scene.code.map((line, i) => {
                const n = i + 1;
                const focused = view.focus.includes(n);
                const skipped = view.skipped.includes(n);
                const executed = view.executed[i] ?? false;
                const previewed =
                  view.preview.includes(n) && !focused && !skipped;
                const border = focused
                  ? "border-rf-active bg-sky-500/15"
                  : skipped
                    ? "border-rf-skip/60 bg-amber-500/10"
                    : executed
                      ? "border-rf-done/55 bg-emerald-500/[0.04]"
                      : "border-transparent";
                const flag = focused
                  ? "text-sky-300"
                  : skipped
                    ? "text-rf-skip"
                    : previewed
                      ? "text-rf-next"
                      : executed
                        ? "text-rf-done"
                        : "text-slate-600";
                const flagText = focused
                  ? "▶"
                  : skipped
                    ? "跳过"
                    : previewed
                      ? "↓"
                      : executed
                        ? "✓"
                        : " ";
                return (
                  <div
                    key={n}
                    className={`flex items-start gap-2 border-l-[3px] px-3 ${border} ${skipped ? "opacity-80" : ""} ${!focused && !skipped && !executed ? "opacity-75" : ""} ${previewed ? "shadow-[inset_0_-1px_0_0_rgba(199,155,255,0.75)]" : ""}`}
                  >
                    <span className="h-5 w-5 shrink-0 text-right font-mono text-xs leading-5 text-slate-600 select-none">
                      {String(n).padStart(2, "0")}
                    </span>
                    <span
                      className={`h-5 w-7 shrink-0 font-mono text-[10px] leading-5 select-none ${flag}`}
                    >
                      {flagText}
                    </span>
                    <pre
                      className={`rf-code-text m-0 min-w-0 flex-1 break-words whitespace-pre-wrap bg-transparent p-0 font-mono text-xs leading-5 text-slate-300 [overflow-wrap:anywhere] ${skipped ? "line-through decoration-amber-500/40" : ""}`}
                    >
                      {highlightLine(line)}
                    </pre>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-3 max-lg:shrink-0 lg:h-full lg:overflow-y-auto">
          <div className={`${panel} shrink-0 pb-3`}>
            <div className={panelHead}>
              <span>
                第 {stepIndex + 1}/{scene.steps.length} 步
              </span>
              <span
                className={`rounded-full border border-rf-border px-2.5 py-0.5 text-[11px] ${PHASE_PILL[step.phase]}`}
              >
                {PHASE_LABEL[step.phase]}
              </span>
            </div>
            <h2 className="mx-3 mt-2.5 mb-1.5 text-base leading-snug">
              {step.title}
            </h2>
            <p className="mx-3 my-0 text-[13px] leading-relaxed text-slate-300">
              {step.detail}
            </p>
            {step.note && (
              <div className="mx-3 mt-2.5 rounded-r-lg border-l-[3px] border-rf-skip bg-amber-500/10 px-2.5 py-2 text-xs leading-relaxed text-amber-100">
                <b className="mr-2 text-rf-skip">要点</b>
                {step.note}
              </div>
            )}
            {stepIndex < last && (
              <div className="mx-3 mt-2.5 rounded-lg border border-dashed border-rf-next/50 bg-purple-500/10 px-2.5 py-2 text-xs leading-relaxed text-purple-100">
                <b className="mb-1 block text-rf-next">下一步</b>
                <span>{step.next}</span>
              </div>
            )}
          </div>

          <div className={`${panel} shrink-0`}>
            <div className={panelHead}>
              <span>执行阶段</span>
              <span className={hint}>render → … → effect</span>
            </div>
            <div className="flex gap-2 overflow-x-auto p-2.5">
              {PHASE_BLOCKS.map((b, i) => (
                <div
                  key={b.id}
                  className={`relative min-w-[78px] flex-1 rounded-lg border px-2.5 py-2 ${
                    b.id === activeBlock
                      ? "border-sky-300 bg-blue-500/30"
                      : pastBlocks.has(b.id)
                        ? "border-emerald-500/45 bg-slate-900/60"
                        : "border-rf-border bg-slate-900/60"
                  }`}
                >
                  {i < PHASE_BLOCKS.length - 1 && (
                    <span className="pointer-events-none absolute top-1/2 -right-2.5 z-10 -translate-y-1/2 text-xs text-slate-600">
                      →
                    </span>
                  )}
                  <span className="mb-0.5 block text-[9px] text-slate-500">
                    {i + 1}
                  </span>
                  <b
                    className={`block text-xs ${
                      b.id === activeBlock
                        ? "text-white"
                        : pastBlocks.has(b.id)
                          ? "text-emerald-200"
                          : "text-slate-300"
                    }`}
                  >
                    {b.label}
                  </b>
                  <small className="mt-0.5 block whitespace-nowrap text-[10px] text-slate-500">
                    {b.sub}
                  </small>
                </div>
              ))}
            </div>
          </div>

          <div className={`${panel} shrink-0`}>
            <div className={panelHead}>
              <span>页面结果</span>
              <span className={hint}>
                {stepIndex === last ? "最终" : "本步之后"}
              </span>
            </div>
            <div className="m-3 overflow-hidden rounded-[10px] border border-sky-500/20 bg-[#f7f9ff]">
              <div className="flex items-center gap-1.5 border-b border-slate-200 bg-[#e3e9f7] px-2.5 py-1.5">
                <i className="size-2 rounded-full bg-[#ff8b8b]" />
                <i className="size-2 rounded-full bg-[#ffc86b]" />
                <i className="size-2 rounded-full bg-[#71d6a8]" />
              </div>
              <div className="min-h-12 break-words px-3.5 py-3 font-mono text-sm font-semibold text-slate-800">
                {result}
              </div>
            </div>
          </div>

          <div className={`${panel} shrink-0`}>
            <div className={panelHead}>
              <span>组件树</span>
              <span className={hint}>蓝=当前 · 绿=走过 · 虚线=已卸</span>
            </div>
            <TreeChart
              tree={scene.tree}
              current={currentNodes}
              done={doneNodes}
              mounted={mountedNodes}
            />
          </div>

          <div className={`${panel} shrink-0`}>
            <div className={panelHead}>
              <span>步骤一览</span>
              <span className={hint}>点击跳转</span>
            </div>
            <div
              className="max-h-52 overflow-auto sm:max-h-56"
              ref={tableRef}
            >
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    {["#", "阶段", "做了什么", "行"].map((h) => (
                      <th
                        key={h}
                        className="sticky top-0 z-[1] border-b border-rf-border bg-[#111a2e] px-2 py-1.5 text-left font-semibold text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scene.steps.map((s, i) => {
                    const lines = Array.from(new Set(s.exec ?? [])).sort(
                      (a, b) => a - b,
                    );
                    return (
                      <tr
                        key={`${s.title}-${i}`}
                        data-current-row={i === stepIndex ? "" : undefined}
                        className={`cursor-pointer border-b border-sky-500/10 hover:bg-sky-500/10 ${
                          i === stepIndex
                            ? "bg-sky-500/20 text-white"
                            : i < stepIndex
                              ? "opacity-60"
                              : "text-slate-400"
                        }`}
                        onClick={() => jump(i)}
                      >
                        <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] ${PHASE_PILL[s.phase]}`}
                          >
                            {PHASE_LABEL[s.phase]}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">{s.title}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px]">
                          {lines.length
                            ? lines.map((n) => `L${n}`).join(" ")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer className="-mx-3 mt-auto grid shrink-0 grid-cols-1 items-center gap-2 border-t border-rf-border bg-rf-bg/95 px-3 py-2.5 backdrop-blur-md sm:-mx-4 sm:grid-cols-[auto_minmax(120px,1fr)_auto] sm:gap-3 sm:px-4 sm:py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex flex-wrap items-center gap-2 order-2 sm:order-1">
          <button type="button" className={btn} onClick={() => jump(0)}>
            重置
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => jump(Math.max(stepIndex - 1, 0))}
          >
            上一步
          </button>
          <button type="button" className={btnPrimary} onClick={togglePlay}>
            {playing ? "暂停" : stepIndex >= last ? "重播" : "播放"}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => jump(Math.min(stepIndex + 1, last))}
          >
            下一步
          </button>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-rf-dim">
            速度
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="cursor-pointer rounded-lg border border-rf-border bg-slate-800/90 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </label>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 order-1 sm:order-2">
          <div className="h-1 overflow-hidden rounded-full bg-slate-600/30">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
              style={{
                width: `${((stepIndex + 1) / scene.steps.length) * 100}%`,
              }}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {scene.steps.map((s, i) => (
              <button
                type="button"
                key={`${s.title}-dot-${i}`}
                title={`${i + 1}. ${s.title}`}
                onClick={() => jump(i)}
                className={`size-[22px] rounded-md border text-[10px] ${
                  i === stepIndex
                    ? "border-sky-300 bg-blue-500 text-white"
                    : i < stepIndex
                      ? "border-emerald-500/40 text-rf-done"
                      : "border-rf-border bg-slate-800/80 text-rf-dim"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden flex-col items-end gap-0.5 whitespace-nowrap text-xs text-rf-dim sm:flex order-3">
          <b className="text-sm text-white">
            {stepIndex + 1}/{scene.steps.length}
          </b>
          <span className={hint}>← → 单步 · 空格播放</span>
        </div>
      </footer>
    </div>
  );
}
