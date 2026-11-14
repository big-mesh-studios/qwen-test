const FENCE_RE = /^\s*(`{3,}|~{3,})\s*([\w#+.-]*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_RE = /^\s*>\s?/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;

function isBlockStart(line) {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    QUOTE_RE.test(line) ||
    UL_RE.test(line) ||
    OL_RE.test(line)
  );
}

/**
 * A deliberately small, dependency-free Markdown block parser. It covers the
 * constructs a coding assistant actually produces: fenced code, headings,
 * lists, quotes, rules and paragraphs.
 */
export function parseMarkdown(source) {
  const lines = String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[1][0];
      const minLength = fence[1].length;
      const lang = fence[2] || "";
      const code = [];
      i += 1;

      while (i < lines.length) {
        const close = lines[i].match(/^\s*(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === marker && close[1].length >= minLength) {
          i += 1;
          break;
        }
        code.push(lines[i]);
        i += 1;
      }

      blocks.push({ type: "code", lang, code: code.join("\n") });
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quote = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(lines[i].replace(QUOTE_RE, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }

    const unordered = line.match(UL_RE);
    if (unordered) {
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(UL_RE);
        if (!item) break;
        items.push(item[1]);
        i += 1;
        while (
          i < lines.length &&
          lines[i].trim() &&
          /^\s{2,}/.test(lines[i]) &&
          !isBlockStart(lines[i])
        ) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i += 1;
        }
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    const ordered = line.match(OL_RE);
    if (ordered) {
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(OL_RE);
        if (!item) break;
        items.push(item[1]);
        i += 1;
        while (
          i < lines.length &&
          lines[i].trim() &&
          /^\s{2,}/.test(lines[i]) &&
          !isBlockStart(lines[i])
        ) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i += 1;
        }
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    } else {
      // Safety valve: never loop forever on an unknown line.
      blocks.push({ type: "paragraph", text: line });
      i += 1;
    }
  }

  return blocks;
}

const INLINE_RE = /`([^`\n]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;

export function parseInline(source) {
  const text = String(source ?? "");
  const nodes = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      nodes.push({ type: "code", text: match[1] });
    } else if (match[2] !== undefined) {
      nodes.push({ type: "link", text: match[2], href: match[3] });
    } else if (match[4] !== undefined) {
      nodes.push({ type: "strong", text: match[4] });
    } else if (match[5] !== undefined) {
      nodes.push({ type: "em", text: match[5] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }

  return nodes;
}
