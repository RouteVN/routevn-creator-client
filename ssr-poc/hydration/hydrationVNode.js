/**
 * Builds a snabbdom "old vnode" from server-rendered DOM so the first client
 * patch ADOPTS that DOM instead of appending beside it.
 *
 * Why snabbdom's shipped toVNode cannot be used here:
 *  - it builds `sel` as `tag#id.class`, while parser.js calls h() with a BARE
 *    tag and puts id in data.attrs / classes in data.class. sameVnode compares
 *    sel, so every node would mismatch and be recreated.
 *  - it never sets data.key, while parser.js keys every node (`${sel}-${path}`
 *    or the ref id). sameVnode compares key too.
 *
 * The approach here is a structural ZIP: walk the freshly-computed client vDom
 * and the live DOM in parallel and mirror the client's own sel/key onto the old
 * vnode, pointing `elm` at the real node. Anything that does not line up bails
 * to null, and the caller falls back to a normal (destructive) render -- correct
 * output either way, so a mismatch degrades rather than corrupts.
 *
 * `data` is deliberately left EMPTY on the old vnode. That makes every snabbdom
 * module treat each node as newly created: attributes are re-applied
 * (idempotent), data.props are assigned (this is how object props reach nested
 * components), and eventListeners sees oldOn === undefined and binds every
 * listener to the SERVER's element. That is what makes the adopted DOM live.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** parser.js emits bare tags; compare case-insensitively against the DOM. */
const tagOf = (sel) => String(sel || "").split(/[.#]/)[0].toLowerCase();

const isTextVNode = (vnode) =>
  vnode !== null && typeof vnode === "object" && vnode.sel === undefined;

export const buildHydrationVNode = ({ vDom, rootElm }) => {
  let mismatch = null;

  const zip = (vnode, elm) => {
    if (mismatch) return null;

    if (vnode === null || vnode === undefined) {
      mismatch = "null vnode";
      return null;
    }

    // Text node.
    if (isTextVNode(vnode)) {
      if (!elm || elm.nodeType !== TEXT_NODE) {
        mismatch = `expected text node, got ${elm?.nodeName ?? "nothing"}`;
        return null;
      }
      return { sel: undefined, data: undefined, children: undefined, text: elm.data, elm, key: undefined };
    }

    if (!elm || elm.nodeType !== ELEMENT_NODE) {
      mismatch = `expected element <${tagOf(vnode.sel)}>, got ${elm?.nodeName ?? "nothing"}`;
      return null;
    }

    if (elm.tagName.toLowerCase() !== tagOf(vnode.sel)) {
      mismatch = `tag ${elm.tagName.toLowerCase()} != ${tagOf(vnode.sel)}`;
      return null;
    }

    const vChildren = Array.isArray(vnode.children) ? vnode.children : [];

    // h(tag, data, "text") form: the element carries text directly.
    if (vChildren.length === 0) {
      if (vnode.text !== undefined && vnode.text !== null) {
        return { sel: vnode.sel, data: {}, children: undefined, text: elm.textContent, elm, key: vnode.key };
      }
      return { sel: vnode.sel, data: {}, children: [], text: undefined, elm, key: vnode.key };
    }

    // Ignore the declarative-shadow-root <template>: it is consumed by the
    // parser and is not part of the rendered child list the vdom describes.
    const domChildren = [...elm.childNodes].filter(
      (n) =>
        !(n.nodeType === ELEMENT_NODE && n.tagName === "TEMPLATE" && n.hasAttribute("shadowrootmode")),
    );

    if (domChildren.length !== vChildren.length) {
      const domTags = domChildren
        .map((n) => (n.nodeType === ELEMENT_NODE ? n.tagName.toLowerCase() : `#text`))
        .join(",");
      const vTags = vChildren
        .map((v) => (isTextVNode(v) ? "#text" : tagOf(v.sel)))
        .join(",");
      const hostAttrs = elm.getAttributeNames ? elm.getAttributeNames().join(" ") : "";
      mismatch =
        `<${tagOf(vnode.sel)} ${hostAttrs}> DOM[${domTags}] != VDOM[${vTags}]`;
      return null;
    }

    const children = vChildren.map((child, index) => zip(child, domChildren[index]));
    if (mismatch) return null;

    return { sel: vnode.sel, data: {}, children, text: undefined, elm, key: vnode.key };
  };

  // The render target IS the vDom root (patch(renderTarget, vDom) makes
  // emptyNodeAt match sel "div"), so zip the root against the target itself.
  const result = zip(vDom, rootElm);

  if (mismatch) {
    if (typeof console !== "undefined") {
      console.warn(`[rtgl-ssr] hydration mismatch, falling back to CSR: ${mismatch}`);
    }
    globalThis.__rtglSsr = globalThis.__rtglSsr || { hydrated: 0, mismatched: 0, reasons: [] };
    globalThis.__rtglSsr.mismatched += 1;
    globalThis.__rtglSsr.reasons.push(mismatch);
    return null;
  }

  globalThis.__rtglSsr = globalThis.__rtglSsr || { hydrated: 0, mismatched: 0, reasons: [] };
  globalThis.__rtglSsr.hydrated += 1;
  return result;
};

export default buildHydrationVNode;
