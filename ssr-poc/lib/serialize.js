/**
 * vnode -> HTML string serializer for @rettangoli/fe.
 *
 * Written because snabbdom-to-html@7.1.0 is wrong for this dialect:
 *  - it stringifies `data.props` into lowercased attributes, so a node with
 *    `h-bc="ac"` emits BOTH `h-bc="ac"` and `hbc="ac"`, and every object prop
 *    emits `[object Object]`. Those names are in observedAttributes, so
 *    attributeChangedCallback would overwrite real props with garbage.
 *  - it drops empty-string attributes (`if (value && value !== '')`), which is
 *    exactly how rettangoli encodes boolean attributes (`attrs[name] = ""`).
 *
 * The parser mirrors attribute-form bindings into BOTH data.attrs and
 * data.props (bindings.js), so ignoring data.props entirely loses nothing that
 * has an HTML representation. Property-form (`:prop=${obj}`) bindings live only
 * in data.props and are intentionally dropped -- they have no HTML form.
 */

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * RAW TEXT elements. The HTML parser does NOT resolve character references
 * inside these -- content runs literally until the closing tag. Escaping `<`
 * to `&lt;` here produces corrupt CSS/JS (`.a &gt; .b` is not a selector).
 *
 * Note `textarea` and `title` are ESCAPABLE raw text: they DO process
 * character references, so normal escaping is correct for them and they are
 * deliberately absent from this set.
 */
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

/**
 * Since raw text cannot be escaped, the only defence against the content
 * closing its own element is to reject it. Anything producing `</style` or
 * `</script` inside these is either a bug or an injection attempt.
 */
const rawTextOrThrow = (tag, content) => {
  const text = String(content ?? "");
  if (new RegExp(`</\\s*${tag}`, "i").test(text)) {
    throw new Error(
      `[serialize] <${tag}> content contains a closing "</${tag}" sequence and cannot be safely serialized.`,
    );
  }
  return text;
};

// Mirrors the framework's own attribute-name validation.
const ATTRIBUTE_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;

const escapeText = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapeAttr = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const kebab = (key) =>
  key.startsWith("--") ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const styleObjectToString = (style) => {
  if (!style || typeof style !== "object") return "";
  return Object.entries(style)
    // snabbdom's style module reserves these sub-objects for animation hooks.
    .filter(([k]) => k !== "delayed" && k !== "remove" && k !== "destroy")
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${kebab(k)}: ${v}`)
    .join("; ");
};

const classObjectToString = (klass) => {
  if (!klass || typeof klass !== "object") return "";
  return Object.keys(klass).filter((k) => klass[k]).join(" ");
};

/** `sel` is a bare tag for rettangoli, but tolerate snabbdom's tag#id.cls form. */
const tagFromSel = (sel) => String(sel).split(/[.#]/)[0] || "div";

const buildAttributes = (data = {}) => {
  const out = [];
  const attrs = { ...data.attrs };

  // data.class and an authored class attribute can co-occur; merge into one.
  const selectorClasses = classObjectToString(data.class);
  if (selectorClasses) {
    attrs.class = attrs.class ? `${attrs.class} ${selectorClasses}` : selectorClasses;
  }

  // data.style is an object; attrs.style is already a string. Object wins the
  // merge only for keys it defines.
  const styleFromObject = styleObjectToString(data.style);
  if (styleFromObject) {
    attrs.style = attrs.style
      ? `${String(attrs.style).replace(/;\s*$/, "")}; ${styleFromObject}`
      : styleFromObject;
  }

  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (!ATTRIBUTE_NAME.test(name)) continue;
    // `true` and `""` are both the boolean form -> bare attribute.
    if (value === true || value === "") {
      out.push(` ${name}=""`);
      continue;
    }
    out.push(` ${name}="${escapeAttr(value)}"`);
  }

  return out.join("");
};

/**
 * @param {object} vnode
 * @param {object} [options]
 * @param {(vnode: object) => string|null} [options.renderComponent]
 *   Called for element vnodes. Return an HTML string to substitute for that
 *   element's children (used to recurse into fe components), or null to
 *   serialize normally.
 */
export const serializeVNode = (vnode, options = {}) => {
  if (vnode === null || vnode === undefined) return "";

  // Text vnode: snabbdom sets sel undefined and puts the string in `text`.
  if (vnode.sel === undefined) {
    return escapeText(vnode.text ?? "");
  }

  if (vnode.sel === "!") {
    return `<!--${String(vnode.text ?? "")}-->`;
  }

  const tag = tagFromSel(vnode.sel);
  const attributes = buildAttributes(vnode.data);

  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attributes}>`;
  }

  let inner = "";

  const substituted = options.renderComponent
    ? options.renderComponent(vnode)
    : null;

  if (substituted !== null && substituted !== undefined) {
    inner = substituted;
  } else if (RAW_TEXT_ELEMENTS.has(tag)) {
    // Emit verbatim -- escaping would corrupt the CSS/JS.
    const raw = Array.isArray(vnode.children) && vnode.children.length > 0
      ? vnode.children.map((child) => child?.text ?? "").join("")
      : (vnode.text ?? "");
    inner = rawTextOrThrow(tag, raw);
  } else if (Array.isArray(vnode.children) && vnode.children.length > 0) {
    inner = vnode.children.map((child) => serializeVNode(child, options)).join("");
  } else if (vnode.text !== undefined && vnode.text !== null) {
    // h(tag, data, "string") puts the text on the element vnode itself.
    inner = escapeText(vnode.text);
  }

  return `<${tag}${attributes}>${inner}</${tag}>`;
};

export default serializeVNode;
