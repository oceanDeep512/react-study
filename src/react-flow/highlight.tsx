import type { ReactNode } from "react";

const KEYWORDS = new Set([
  "function",
  "const",
  "let",
  "var",
  "return",
  "if",
  "else",
  "true",
  "false",
  "null",
  "undefined",
  "new",
  "import",
  "from",
  "export",
  "default",
  "typeof",
  "instanceof",
]);

type Kind =
  | "cmt"
  | "str"
  | "kw"
  | "tag"
  | "attr"
  | "num"
  | "fn"
  | "plain";

function push(parts: { kind: Kind; text: string }[], kind: Kind, text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) last.text += text;
  else parts.push({ kind, text });
}

function readString(line: string, start: number): number {
  const quote = line[start]!;
  let j = start + 1;
  while (j < line.length) {
    if (line[j] === "\\") {
      j += 2;
      continue;
    }
    if (line[j] === quote) return j + 1;
    j += 1;
  }
  return line.length;
}

function readIdent(line: string, start: number): number {
  let j = start;
  while (j < line.length && /[\w$]/.test(line[j]!)) j += 1;
  return j;
}

/** 解析开标签内容（已消费过开头的 `<`） */
function tokenizeOpenTag(
  line: string,
  start: number,
  parts: { kind: Kind; text: string }[],
): number {
  let i = start;
  if (line[i] === ">") {
    push(parts, "tag", ">");
    return i + 1;
  }

  const nameEnd = readIdent(line, i);
  if (nameEnd > i) {
    push(parts, "tag", line.slice(i, nameEnd));
    i = nameEnd;
  }

  while (i < line.length) {
    if (line[i] === "/" && line[i + 1] === ">") {
      push(parts, "tag", "/>");
      return i + 2;
    }
    if (line[i] === ">") {
      push(parts, "tag", ">");
      return i + 1;
    }
    if (line[i] === "{") {
      // 花括号表达式：括号内按普通代码着色
      push(parts, "plain", "{");
      i += 1;
      let depth = 1;
      const exprStart = i;
      while (i < line.length && depth > 0) {
        if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
          i = readString(line, i);
          continue;
        }
        if (line[i] === "{") depth += 1;
        else if (line[i] === "}") depth -= 1;
        if (depth > 0) i += 1;
      }
      const inner = line.slice(exprStart, i);
      for (const p of tokenizeLine(inner)) push(parts, p.kind, p.text);
      if (line[i] === "}") {
        push(parts, "plain", "}");
        i += 1;
      }
      continue;
    }
    if (line[i] === '"' || line[i] === "'") {
      const end = readString(line, i);
      push(parts, "str", line.slice(i, end));
      i = end;
      continue;
    }
    if (/[A-Za-z_]/.test(line[i]!)) {
      const end = i + 1;
      let k = end;
      while (k < line.length && /[\w-]/.test(line[k]!)) k += 1;
      push(parts, "attr", line.slice(i, k));
      i = k;
      continue;
    }
    push(parts, "plain", line[i]!);
    i += 1;
  }
  return i;
}

/** 按行做轻量 JS/JSX 分词，足够教学示例用 */
export function tokenizeLine(line: string): { kind: Kind; text: string }[] {
  const parts: { kind: Kind; text: string }[] = [];
  let i = 0;

  while (i < line.length) {
    if (line[i] === "/" && line[i + 1] === "/") {
      push(parts, "cmt", line.slice(i));
      break;
    }

    if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
      const end = readString(line, i);
      push(parts, "str", line.slice(i, end));
      i = end;
      continue;
    }

    // </Tag> 或 </>
    if (line[i] === "<" && line[i + 1] === "/") {
      push(parts, "tag", "</");
      i += 2;
      const end = readIdent(line, i);
      if (end > i) {
        push(parts, "tag", line.slice(i, end));
        i = end;
      }
      if (line[i] === ">") {
        push(parts, "tag", ">");
        i += 1;
      }
      continue;
    }

    // <> 或 <Tag ...>
    if (
      line[i] === "<" &&
      (line[i + 1] === ">" || /[A-Za-z]/.test(line[i + 1] ?? ""))
    ) {
      push(parts, "tag", "<");
      i = tokenizeOpenTag(line, i + 1, parts);
      continue;
    }

    if (/\d/.test(line[i]!) && (i === 0 || /[^\w$]/.test(line[i - 1]!))) {
      let j = i;
      while (j < line.length && /[\d.]/.test(line[j]!)) j += 1;
      push(parts, "num", line.slice(i, j));
      i = j;
      continue;
    }

    if (/[A-Za-z_$]/.test(line[i]!)) {
      const end = readIdent(line, i);
      const word = line.slice(i, end);
      const pad = line.slice(end).match(/^\s*/)?.[0]?.length ?? 0;
      const after = line[end + pad];
      if (KEYWORDS.has(word)) push(parts, "kw", word);
      else if (after === "(") push(parts, "fn", word);
      else push(parts, "plain", word);
      i = end;
      continue;
    }

    push(parts, "plain", line[i]!);
    i += 1;
  }

  return parts;
}

export function highlightLine(line: string): ReactNode {
  if (!line) return " ";
  return tokenizeLine(line).map((p, idx) =>
    p.kind === "plain" ? (
      <span key={idx}>{p.text}</span>
    ) : (
      <span key={idx} className={`tk tk-${p.kind}`}>
        {p.text}
      </span>
    ),
  );
}
