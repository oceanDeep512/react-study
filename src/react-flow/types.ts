/** React 一次更新中会经过的阶段 */
export type Phase =
  | "idle"
  | "render"
  | "reconcile"
  | "commit"
  | "layout"
  | "paint"
  | "effect"
  | "cleanup"
  | "unmount"
  | "update";

export type NodeKind = "root" | "component" | "dom" | "hook";

/** 组件树图上的一个节点，x/y 是 SVG 里矩形的左上角坐标 */
export interface TreeNode {
  id: string;
  label: string;
  parent?: string | null;
  kind: NodeKind;
  x: number;
  y: number;
}

/** 一个执行步骤。exec / focus / skip 里的数字都是 1-based 代码行号 */
export interface FStep {
  phase: Phase;
  title: string;
  /** 这一步到底发生了什么 */
  detail: string;
  /** 下一步要执行什么代码 / 什么阶段 */
  next: string;
  /** 当前正在执行或受影响的组件树节点 */
  active: string[];
  /** 当前仍挂载的节点；不传表示全部挂载。用于演示卸载与重挂载 */
  mounted?: string[];
  /** 本步执行到的代码行 */
  exec?: number[];
  /** 本步最该关注的代码行（蓝色高亮） */
  focus?: number[];
  /** 本步明确没有执行、被跳过的代码行 */
  skip?: number[];
  /** 当前真实 DOM 的样子 */
  result?: string;
  /** 额外要点 */
  note?: string;
}

export interface FScene {
  id: string;
  tag: string;
  title: string;
  summary: string;
  code: string[];
  tree: TreeNode[];
  steps: FStep[];
  finalResult: string;
}

export interface LineView {
  /** 累计到当前步，哪些行被执行过 */
  executed: boolean[];
  /** 当前步正在执行/关注的行 */
  focus: number[];
  /** 当前步明确跳过的行 */
  skipped: number[];
  /** 下一步将高亮的行，用于「下一步执行什么」预告 */
  preview: number[];
}

export function lineView(scene: FScene, upto: number): LineView {
  const executed = scene.code.map(() => false);
  for (let i = 0; i <= upto && i < scene.steps.length; i++) {
    const s = scene.steps[i];
    if (!s) continue;
    for (const n of s.exec ?? []) {
      const idx = n - 1;
      if (idx >= 0 && idx < executed.length) executed[idx] = true;
    }
  }
  const cur = scene.steps[upto];
  const next = scene.steps[upto + 1];
  return {
    executed,
    focus: cur?.focus ?? [],
    skipped: cur?.skip ?? [],
    preview: upto < scene.steps.length - 1
      ? [...(next?.focus ?? []), ...(next?.exec ?? [])]
      : [],
  };
}
