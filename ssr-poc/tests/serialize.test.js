import { describe, it, expect } from "vitest";
import { h } from "snabbdom/build/h.js";

import { serializeVNode } from "../lib/serialize.js";

describe("serializer: escaping", () => {
  it("escapes text nodes so markup cannot be injected", () => {
    const html = serializeVNode(h("div", {}, ["<script>alert(1)</script>"]));
    expect(html).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
    expect(html).not.toContain("<script>");
  });

  it("escapes quotes in attribute values so they cannot break out", () => {
    const html = serializeVNode(
      h("div", { attrs: { title: '" onload="alert(1)' } }, ["x"]),
    );
    expect(html).toBe('<div title="&quot; onload=&quot;alert(1)">x</div>');
    // The payload stays INSIDE the value: exactly one attribute is emitted on
    // the tag, so no `onload` handler was created.
    const openTag = html.slice(0, html.indexOf(">") + 1);
    // One attribute on the tag...
    expect(openTag.match(/\s[a-zA-Z-]+="/g)).toHaveLength(1);
    // ...and exactly two raw quotes: the delimiters. The payload's own quotes
    // became &quot;, so it cannot terminate the value and start a new
    // attribute. That is what makes the injected `onload=` inert text.
    expect(openTag.match(/"/g)).toHaveLength(2);
  });

  it("escapes ampersands in both text and attributes", () => {
    const html = serializeVNode(
      h("a", { attrs: { href: "/a?x=1&y=2" } }, ["A&B"]),
    );
    expect(html).toBe('<a href="/a?x=1&amp;y=2">A&amp;B</a>');
  });

  it("does not double-escape already-escaped entities", () => {
    const html = serializeVNode(h("div", {}, ["&amp;"]));
    // "&amp;" as literal text must become "&amp;amp;" -- exactly once.
    expect(html).toBe("<div>&amp;amp;</div>");
  });

  it("leaves single quotes alone because attributes are always double-quoted", () => {
    const html = serializeVNode(h("div", { attrs: { title: "it's" } }, ["x"]));
    expect(html).toBe("<div title=\"it's\">x</div>");
  });
});

describe("serializer: raw text elements", () => {
  // <style> and <script> are RAW TEXT: the parser resolves no character
  // references inside them. Escaping would corrupt the CSS/JS.
  it("emits <style> content verbatim", () => {
    const html = serializeVNode(h("style", {}, ['.a > .b { content: "<" }']));
    expect(html).toBe('<style>.a > .b { content: "<" }</style>');
    expect(html).not.toContain("&gt;");
  });

  it("emits <script> content verbatim", () => {
    const html = serializeVNode(h("script", {}, ["if (a < b) {}"]));
    expect(html).toBe("<script>if (a < b) {}</script>");
    expect(html).not.toContain("&lt;");
  });

  it("refuses content that would close its own raw-text element", () => {
    expect(() =>
      serializeVNode(h("style", {}, ["x{}</style><img onerror=alert(1)>"])),
    ).toThrow(/cannot be safely serialized/);

    expect(() =>
      serializeVNode(h("script", {}, ["</script><img onerror=alert(1)>"])),
    ).toThrow(/cannot be safely serialized/);
  });

  it("still escapes textarea and title, which ARE escapable raw text", () => {
    expect(serializeVNode(h("textarea", {}, ["<b>&</b>"]))).toBe(
      "<textarea>&lt;b&gt;&amp;&lt;/b&gt;</textarea>",
    );
    expect(serializeVNode(h("title", {}, ["a < b"]))).toBe("<title>a &lt; b</title>");
  });
});

describe("serializer: props are never emitted", () => {
  it("drops data.props entirely, including non-serializable values", () => {
    const html = serializeVNode(
      h("x-child", {
        props: {
          user: { name: "Ada" },
          when: new Date("1843-01-01"),
          cb: () => {},
          list: [1, 2, 3],
        },
      }),
    );
    expect(html).toBe("<x-child></x-child>");
  });

  it("keeps attribute-form bindings, which the parser mirrors into attrs", () => {
    const html = serializeVNode(
      h("x-child", { attrs: { label: "hi" }, props: { label: "hi" } }),
    );
    expect(html).toBe('<x-child label="hi"></x-child>');
  });
});

describe("serializer: attribute encoding", () => {
  it("preserves empty-string attributes, which is rettangoli's boolean form", () => {
    const html = serializeVNode(h("rtgl-view", { attrs: { wrap: "", sv: "" } }));
    expect(html).toBe('<rtgl-view wrap="" sv=""></rtgl-view>');
  });

  it("omits false / null / undefined attributes", () => {
    const html = serializeVNode(
      h("div", { attrs: { a: false, b: null, c: undefined, d: "keep" } }),
    );
    expect(html).toBe('<div d="keep"></div>');
  });

  it("merges data.class into a single class attribute", () => {
    const html = serializeVNode(
      h("div", { attrs: { class: "authored" }, class: { alpha: true, beta: false } }),
    );
    expect(html).toBe('<div class="authored alpha"></div>');
    expect(html.match(/class=/g)).toHaveLength(1);
  });

  it("renders style objects as kebab-case css and keeps custom properties", () => {
    const html = serializeVNode(
      h("div", { style: { display: "contents", marginTop: "4px", "--x": "1" } }),
    );
    expect(html).toBe('<div style="display: contents; margin-top: 4px; --x: 1"></div>');
  });

  it("drops snabbdom's animation sub-objects from style", () => {
    const html = serializeVNode(
      h("div", { style: { color: "red", delayed: { opacity: "1" }, remove: { opacity: "0" } } }),
    );
    expect(html).toBe('<div style="color: red"></div>');
  });

  it("rejects invalid attribute names rather than emitting broken markup", () => {
    const html = serializeVNode(h("div", { attrs: { "bad name": "x", ok: "y" } }));
    expect(html).toBe('<div ok="y"></div>');
  });
});

describe("serializer: element shapes", () => {
  it("does not close void elements", () => {
    expect(serializeVNode(h("img", { attrs: { src: "/a.png" } }))).toBe('<img src="/a.png">');
    expect(serializeVNode(h("br"))).toBe("<br>");
  });

  it("serializes nested children in order", () => {
    const html = serializeVNode(h("ul", {}, [h("li", {}, ["a"]), h("li", {}, ["b"])]));
    expect(html).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  it("handles the text-on-element form h(tag, data, 'string')", () => {
    expect(serializeVNode(h("p", {}, "hello"))).toBe("<p>hello</p>");
  });
});
