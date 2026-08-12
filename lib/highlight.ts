/**
 * Highlighting a selection, without an editor under it.
 *
 * The desktop note editor gets this for free: it is a `contentEditable`, so
 * `document.execCommand("hiliteColor")` does the DOM surgery and the browser
 * handles every awkward case. The phone's reader (components/NoteReader.tsx)
 * deliberately isn't editable — that is what keeps the keyboard down and the
 * caret out of a note nobody meant to change — and `execCommand` does nothing
 * at all outside an editing host. So the surgery is here instead.
 *
 * It is small on purpose, and it knows nothing about markdown. The rendered
 * DOM is the document, `mdToHtml` builds it and `htmlToMd` reads it back, so
 * all this has to do is put a `<mark>` in the right place and leave the tree in
 * a state the serialiser already understands. A highlight made on a phone is
 * therefore the same `==text==` as one made on a laptop.
 *
 * Everything here takes an explicit `root` and never touches the live
 * selection, so it can be driven from a test as easily as from a thumb.
 */

/** Is this element one of ours? `htmlToMd` reads both forms as a highlight. */
const isMark = (node: Node | null): node is HTMLElement =>
  !!node && node.nodeType === 1 && (node as HTMLElement).tagName === "MARK";

/**
 * The marks a range touches — the ones it sits inside, and the ones it covers.
 *
 * Both directions matter: a thumb-tap inside an existing highlight selects a
 * word *within* a mark (so climb the ancestors), and a drag across a paragraph
 * can swallow several whole marks (so scan for intersections).
 */
export function marksIn(root: HTMLElement, range: Range): HTMLElement[] {
  const found = new Set<HTMLElement>();

  const climb = (node: Node | null) => {
    while (node && node !== root) {
      if (isMark(node)) found.add(node);
      node = node.parentNode;
    }
  };
  climb(range.startContainer);
  climb(range.endContainer);

  for (const el of Array.from(root.querySelectorAll("mark"))) {
    if (range.intersectsNode(el)) found.add(el as HTMLElement);
  }
  return [...found];
}

/** True when applying "clear" to this range would actually remove something. */
export const rangeHasHighlight = (root: HTMLElement, range: Range): boolean =>
  marksIn(root, range).length > 0;

/**
 * Every text node the range covers, split so only the selected part is listed.
 *
 * `Range.surroundContents` would be one line, and it throws the moment a
 * selection crosses a block boundary — which a thumb-drag across two sentences
 * does constantly. So the range is walked instead and each text node handled
 * separately, which is also what stops a highlight from swallowing the `<p>`
 * structure between the sentences it spans.
 *
 * The nodes are collected before any splitting happens. Splitting rearranges
 * the tree the walker is walking, and a TreeWalker that is mutated underneath
 * itself silently skips nodes — which showed up as the last word of a
 * selection never getting highlighted.
 */
function selectedTextNodes(root: HTMLElement, range: Range): Text[] {
  const touched: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    if (range.intersectsNode(text) && (text.textContent ?? "").trim()) {
      touched.push(text);
    }
  }

  const { startContainer, startOffset, endContainer, endOffset } = range;
  return (
    touched
      .map((text) => {
        let node = text;
        // End first: splitting the tail leaves the head's offsets untouched, so
        // a range starting and ending inside the *same* node still clips right.
        if (node === endContainer && endOffset < node.length) {
          node.splitText(endOffset);
        }
        if (node === startContainer && startOffset > 0) {
          node = node.splitText(startOffset);
        }
        return node;
      })
      /*
       * Filtered *after* clipping, which is the whole point.
       *
       * Testing the node before the split asks "is this text node blank?" when
       * the question is "is the selected part of it blank?". Dragging across
       * the single space in "alpha beta" passes the first test and fails the
       * second — and used to produce a `<mark> </mark>` that serialised to
       * nothing, so the note was unchanged but a save fired and a sync went out
       * to report it.
       */
      .filter((node) => (node.textContent ?? "").trim().length > 0)
  );
}

/**
 * Wrap everything the range covers in `<mark>`, or recolour what is already
 * marked. Returns the number of nodes affected, which is zero for an empty or
 * whitespace-only selection.
 */
export function highlightRange(
  root: HTMLElement,
  range: Range,
  colour: string,
): number {
  const nodes = selectedTextNodes(root, range);
  for (const node of nodes) {
    const parent = node.parentElement;
    // Already marked: recolour in place rather than nesting a second one, which
    // would serialise as `====text====` and read back as literal equals signs.
    if (isMark(parent)) {
      parent.style.backgroundColor = colour;
      continue;
    }
    const mark = document.createElement("mark");
    mark.style.backgroundColor = colour;
    node.parentNode?.insertBefore(mark, node);
    mark.appendChild(node);
  }
  root.normalize();
  return nodes.length;
}

/**
 * Unwrap every mark the range touches, leaving the text exactly where it was.
 *
 * Deliberately all-or-nothing per mark: clearing the middle of a highlight
 * would have to split it into two, and "I tapped clear and half of it is still
 * yellow" is a worse outcome than losing a highlight you can re-apply in one
 * tap. Returns how many were removed.
 */
export function clearHighlight(root: HTMLElement, range: Range): number {
  const marks = marksIn(root, range);
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  }
  // Stitches the split text nodes back together, so repeatedly highlighting and
  // clearing the same sentence can't shred it into thousands of fragments.
  root.normalize();
  return marks.length;
}
