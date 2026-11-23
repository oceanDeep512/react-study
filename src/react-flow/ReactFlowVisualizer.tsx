import { useEffect, useMemo, useRef, useState } from "react";
import "./react-flow.css";
import { SCENES } from "./scenes";
import type { Phase, TreeNode } from "./types";
import { lineView } from "./types";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "事件 / 准备",
  render: "render",
  reconcile: "reconcile",
  commit: "commit",
  layout: "layoutEffect",
  paint: "paint 绘制",
  effect: "useEffect",
  cleanup: "cleanup",
  unmount: "卸载",
  update: "更新",
};

/** 阶段泳道图：把一个步骤归到 6 个核心阶段之一 */
const PHASE_BLOCKS: { id: string; label: string; sub: string; of: Phase[] }[] =
  [
    {
      id: "render",
      label: "render",
      sub: "执行组件函数",
      of: ["idle", "render", "update"],
    },
    {
      id: "reconcile",
      label: "reconcile",
      sub: "对比元素树",
      of: ["reconcile"],
    },
    {
      id: "commit",
      label: "commit",
      sub: "写入真实 DOM",
      of: ["commit", "unmount"],
    },
    {
      id: "layout",
      label: "layout",
      sub: "layoutEffect / cleanup",
      of: ["layout", "cleanup"],
    },
    { id: "paint", label: "paint", sub: "浏览器绘制", of: ["paint"] },
    { id: "effect", label: "effect", sub: "useEffect", of: ["effect"] },
  ];

const NODE_W = 132;
const NODE_H = 40;

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
  return (
    <svg
      className="rf-tree-svg"
      viewBox="0 0 560 196"
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
            <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={9} />
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
  const nextStep = scene.steps[stepIndex + 1];

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
    const row = wrap?.querySelector<HTMLElement>(".rf-row.is-current");
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
    <div className="rf-app">
      <header className="rf-header">
        <div>
          <div className="rf-kicker">REACT RUNTIME · STEP BY STEP</div>
          <h1>React 生命周期 · 代码逐步执行</h1>
          <p>
            一份实例代码、多个组件，一步一步看：哪几行正在执行、哪几行被跳过、组件树怎么变、下一步轮到谁，以及每一步之后的真实
            DOM 结果。
          </p>
        </div>
        <div className="rf-legend">
          <span>
            <i className="rf-chip rf-chip-done" />
            已执行过
          </span>
          <span>
            <i className="rf-chip rf-chip-active" />
            当前执行
          </span>
          <span>
            <i className="rf-chip rf-chip-skip" />
            本步跳过
          </span>
          <span>
            <i className="rf-chip rf-chip-next" />
            下一步
          </span>
          <span>
            <i className="rf-chip rf-chip-never" />
            尚未轮到
          </span>
        </div>
      </header>

      <nav className="rf-scenes" aria-label="场景列表">
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            className={`rf-scene-btn ${i === sceneIndex ? "is-active" : ""}`}
            onClick={() => selectScene(i)}
            title={s.summary}
          >
            <span className="rf-scene-tag">{s.tag}</span>
            <span className="rf-scene-title">{s.title}</span>
          </button>
        ))}
      </nav>

      <main className="rf-main">
        <section className="rf-left">
          <div className="rf-panel rf-code-panel">
            <div className="rf-panel-head">
              <span>实例代码 · 执行状态</span>
              <span className="rf-hint">行号 1-based · 虚线 = 下一步</span>
            </div>
            <div className="rf-code-scroll">
              {scene.code.map((line, i) => {
                const n = i + 1;
                const focused = view.focus.includes(n);
                const skipped = view.skipped.includes(n);
                const executed = view.executed[i] ?? false;
                const previewed =
                  view.preview.includes(n) && !focused && !skipped;
                const status = focused
                  ? "is-active"
                  : skipped
                    ? "is-skip"
                    : executed
                      ? "is-done"
                      : "is-never";
                const flag = focused
                  ? "▶"
                  : skipped
                    ? "跳过"
                    : previewed
                      ? "↓"
                      : executed
                        ? "✓"
                        : "·";
                return (
                  <div
                    className={`rf-line ${status} ${previewed ? "is-preview" : ""}`}
                    key={n}
                  >
                    <span className="rf-ln">{String(n).padStart(2, "0")}</span>
                    <span className="rf-flag">{flag}</span>
                    <code>{line || " "}</code>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rf-right">
          <div className="rf-panel rf-phase-panel">
            <div className="rf-panel-head">
              <span>执行阶段泳道图</span>
              <span className={`rf-phase rf-phase-${step.phase}`}>
                {PHASE_LABEL[step.phase]}
              </span>
            </div>
            <div className="rf-phase-chart">
              {PHASE_BLOCKS.map((b, i) => (
                <div
                  key={b.id}
                  className={`rf-phase-block ${b.id === activeBlock ? "is-active" : ""} ${pastBlocks.has(b.id) ? "is-past" : ""}`}
                >
                  <span className="rf-phase-index">{i + 1}</span>
                  <b>{b.label}</b>
                  <small>{b.sub}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="rf-panel rf-tree-panel">
            <div className="rf-panel-head">
              <span>组件树关系图</span>
              <span className="rf-hint">蓝=当前 · 绿=已走过 · 虚线=已卸载</span>
            </div>
            <TreeChart
              tree={scene.tree}
              current={currentNodes}
              done={doneNodes}
              mounted={mountedNodes}
            />
          </div>

          <div className="rf-panel rf-step-panel">
            <div className="rf-panel-head">
              <span>第 {stepIndex + 1} 步 · 详细解释</span>
              <span className="rf-hint">{scene.tag}</span>
            </div>
            <h2>{step.title}</h2>
            <p className="rf-detail">{step.detail}</p>
            {step.note && (
              <div className="rf-note">
                <b>要点</b>
                {step.note}
              </div>
            )}
            <div className="rf-next">
              <b>下一步 →</b>
              <span>{step.next}</span>
              {nextStep && (
                <small>
                  {nextStep.title}
                  {view.preview.length > 0
                    ? ` · 预告行 ${Array.from(new Set(view.preview))
                        .sort((a, b) => a - b)
                        .map((n) => `L${n}`)
                        .join(", ")}`
                    : ""}
                </small>
              )}
            </div>
            <div className="rf-summary">{scene.summary}</div>
          </div>

          <div className="rf-panel rf-result-panel">
            <div className="rf-panel-head">
              <span>当前真实 DOM 结果</span>
              <span className="rf-hint">
                {stepIndex === last ? "最终结果" : "本步之后"}
              </span>
            </div>
            <div className="rf-browser">
              <div className="rf-browser-bar">
                <i />
                <i />
                <i />
              </div>
              <div className="rf-browser-body">{result}</div>
            </div>
          </div>

          <div className="rf-panel rf-table-panel">
            <div className="rf-panel-head">
              <span>执行顺序表（点击可跳转）</span>
              <span className="rf-hint">{scene.steps.length} 步</span>
            </div>
            <div className="rf-table-wrap" ref={tableRef}>
              <table className="rf-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>阶段</th>
                    <th>做了什么</th>
                    <th>执行行</th>
                    <th>结果</th>
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
                        className={`rf-row ${i === stepIndex ? "is-current" : ""} ${i < stepIndex ? "is-past" : ""}`}
                        onClick={() => jump(i)}
                      >
                        <td>{i + 1}</td>
                        <td>
                          <span className={`rf-mini p-${s.phase}`}>
                            {PHASE_LABEL[s.phase]}
                          </span>
                        </td>
                        <td>{s.title}</td>
                        <td className="rf-mono">
                          {lines.length
                            ? lines.map((n) => `L${n}`).join(" ")
                            : "—"}
                        </td>
                        <td className="rf-mono rf-cell-result">
                          {s.result ?? "—"}
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

      <footer className="rf-controls">
        <div className="rf-buttons">
          <button onClick={() => jump(0)}>重置</button>
          <button onClick={() => jump(Math.max(stepIndex - 1, 0))}>
            上一步
          </button>
          <button className="rf-primary" onClick={togglePlay}>
            {playing ? "暂停" : stepIndex >= last ? "重新播放" : "自动播放"}
          </button>
          <button onClick={() => jump(Math.min(stepIndex + 1, last))}>
            下一步
          </button>
          <label className="rf-speed">
            速度
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </label>
        </div>

        <div className="rf-timeline">
          <div className="rf-track">
            <div
              className="rf-track-fill"
              style={{
                width: `${((stepIndex + 1) / scene.steps.length) * 100}%`,
              }}
            />
          </div>
          <div className="rf-dots">
            {scene.steps.map((s, i) => (
              <button
                key={`${s.title}-dot-${i}`}
                className={`rf-dot ${i === stepIndex ? "is-current" : ""} ${i < stepIndex ? "is-past" : ""}`}
                title={`${i + 1}. ${s.title}`}
                onClick={() => jump(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
        <div className="rf-counter">
          步骤 <b>{stepIndex + 1}</b> / {scene.steps.length}
          <span className="rf-hint">← → 单步 · 空格 播放</span>
        </div>
      </footer>
    </div>
  );
}
