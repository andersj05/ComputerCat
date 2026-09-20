/** Literal, bounded search of a fresh accessibility snapshot, never a live app Find command. */
export function findWindowText(text: string, query: string) {
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const matches: { offset: number; excerpt: string }[] = [];
  let hasMoreMatches = false;
  for (const match of text.matchAll(pattern)) {
    if (matches.length === 5) {
      hasMoreMatches = true;
      break;
    }
    const offset = match.index;
    matches.push({
      offset,
      excerpt: text.slice(Math.max(0, offset - 120), offset + match[0].length + 120),
    });
  }
  return { matches, hasMoreMatches, searchedCharacters: text.length };
}
