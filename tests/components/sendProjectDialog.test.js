import { describe, expect, it, vi } from "vitest";
import { validateField } from "../../node_modules/@rettangoli/ui/src/components/form/form.store.js";
import * as handlers from "../../src/components/sendProjectDialog/sendProjectDialog.handlers.js";
import * as store from "../../src/components/sendProjectDialog/sendProjectDialog.store.js";
import { AR_I18N, EN_I18N, JA_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const PROJECTS = [
  { id: "ProjectOne01", name: "Project One" },
  { id: "ProjectTwo02", name: "" },
];

const viewData = (props = {}, i18n = EN_I18N) =>
  store.selectViewData({ props: { projects: PROJECTS, ...props }, i18n });

const field = (name, data = viewData()) =>
  data.form.fields.find((candidate) => candidate.name === name);

const events = () => {
  const dispatched = [];
  return {
    dispatched,
    dispatchEvent: vi.fn((event) =>
      dispatched.push([event.type, event.detail]),
    ),
  };
};

describe("send project dialog", () => {
  it("says what is shared and for how long before asking for the code", () => {
    const { form } = viewData();
    expect(form.title).toBe("Send Project to Support");
    expect(form.description).toBe(EN_I18N.sendProjectDialog.description);
    expect(form.description).toContain("30 days");
    expect(form.fields.map(({ name }) => name)).toEqual(["code", "projectId"]);
    expect(form.actions.buttons).toEqual([
      { id: "send", variant: "pr", validate: true, label: "Send" },
    ]);
  });

  it("opens as a dialog holding the form", () => {
    const html = renderViewYaml(
      "src/components/sendProjectDialog/sendProjectDialog.view.yaml",
      viewData(),
    );
    expect(html).toMatch(/<rtgl-dialog id="dialog"[^>]*open/);
    expect(html).toContain('<rtgl-form id="sendForm"');
  });

  it("offers every project, untitled ones by the Untitled label, with the open one chosen", () => {
    expect(field("projectId").options).toEqual([
      { label: "Project One", value: "ProjectOne01" },
      { label: "Untitled", value: "ProjectTwo02" },
    ]);
    expect(viewData({ projectId: "ProjectTwo02" }).defaultValues).toEqual({
      code: "",
      projectId: "ProjectTwo02",
    });
    expect(viewData().defaultValues.projectId).toBe("ProjectOne01");
  });

  it("checks the code the way it is read: either case, spaces and hyphens allowed", () => {
    const code = field("code");
    expect(validateField(code, "")).toBe("Enter the code support gave you.");
    expect(validateField(code, "k7q-m4x")).toBeNull();
    expect(validateField(code, "K7Q M4X")).toBeNull();
    for (const typed of ["K7QM4", "K7QM0X", "K7QM4XY"]) {
      expect(validateField(code, typed)).toBe(
        "A support code has 6 letters and numbers.",
      );
    }
    expect(code.placeholder).toBe("K7QM4X");
  });

  it("is worded in the app language", () => {
    const data = viewData({}, JA_I18N);
    expect(data.form.title).toBe(JA_I18N.sendProjectDialog.title);
    expect(field("code", data).label).toBe(JA_I18N.sendProjectDialog.codeLabel);
    expect(field("projectId", data).options[1].label).toBe(
      JA_I18N.projectsPage.untitledProject,
    );
  });

  it("reads a code typed in a right-to-left language's layout", () => {
    const data = viewData({}, AR_I18N);
    expect(data.form.title).toBe(AR_I18N.sendProjectDialog.title);
    expect(validateField(field("code", data), "k7q-m4x")).toBeNull();
    expect(validateField(field("code", data), "K7QM0X")).toBe(
      AR_I18N.sendProjectDialog.codeInvalid,
    );
  });

  it("sends the code and project only once the form is valid", () => {
    const sink = events();
    const act = (detail) =>
      handlers.handleFormAction(sink, { _event: { detail } });

    act({ actionId: "send", valid: false, values: { code: "K7" } });
    act({ actionId: "other", valid: true, values: {} });
    act({
      actionId: "send",
      valid: true,
      values: { code: "k7q-m4x", projectId: "ProjectOne01" },
    });

    expect(sink.dispatched).toEqual([
      ["submit", { code: "k7q-m4x", projectId: "ProjectOne01" }],
    ]);
  });

  it("closes from the dialog's own close", () => {
    const sink = events();
    handlers.handleDialogClose(sink);
    expect(sink.dispatched).toEqual([["close", null]]);
  });
});
