/**
 * Pull plain text out of a ProseMirror JSON document. Used for search and
 * previews — we walk the tree and concatenate every `text` leaf, adding a
 * space between blocks so words from adjacent paragraphs don't merge.
 */
interface PMNode {
  type?: string;
  text?: string;
  content?: PMNode[];
}

export function docToText(doc: unknown, limit = 4000): string {
  const out: string[] = [];
  let len = 0;
  const walk = (n: PMNode) => {
    if (len > limit) return;
    if (n.text) {
      out.push(n.text);
      len += n.text.length;
    }
    n.content?.forEach(walk);
    if (n.type && n.type !== 'text') out.push(' ');
  };
  if (doc && typeof doc === 'object') walk(doc as PMNode);
  return out.join('').replace(/\s+/g, ' ').trim();
}

/**
 * A small fuzzy matcher: every query character must appear in order.
 * Consecutive matches and matches at word starts score higher, which is the
 * heuristic behind most "command-K" pickers (Sublime, VS Code, Raycast).
 * Returns -1 for no match.
 */
export function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (t.includes(q)) return 100 + (t.startsWith(q) ? 50 : 0) - t.length * 0.01;
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    streak = found === ti ? streak + 1 : 0;
    const wordStart = found === 0 || /\s|-|_/.test(t[found - 1]);
    score += 1 + streak * 2 + (wordStart ? 3 : 0);
    ti = found + 1;
  }
  return score;
}
