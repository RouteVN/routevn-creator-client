// The real top layer and the real Rettangoli dialogs, popovers and menus: the
// unit test can only fake how they answer the cancel event.
// Run with node tests/primitives/nativeBackOverlays.browser.mjs.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";

const bundle = await build({
  stdin: {
    contents: `
      import { installNativeBackOverlays } from './src/primitives/nativeBackOverlays.js';
      window.nativeBackOverlays = installNativeBackOverlays(window);
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  write: false,
  logLevel: "silent",
});

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent("<body></body>");
    // Installed first, as the mobile setups do before any dialog opens.
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.addScriptTag({
      path: "node_modules/@rettangoli/ui/dist/rettangoli-iife-ui.min.js",
    });

    const result = await page.evaluate(async () => {
      const overlays = window.nativeBackOverlays;
      const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
      const closes = [];
      const listenForClose = (element, label) => {
        element.addEventListener("close", () => closes.push(label));
      };
      const pageRoot = document.body
        .appendChild(document.createElement("div"))
        .attachShadow({ mode: "open" });

      // The menu comes first in the page but opens from inside the dialog.
      const menu = document.createElement("rtgl-popover");
      menu.innerHTML = "<rtgl-text>Menu</rtgl-text>";
      const dialog = document.createElement("rtgl-dialog");
      dialog.innerHTML =
        '<rtgl-view slot="content"><rtgl-text>Edit</rtgl-text></rtgl-view>';
      pageRoot.append(menu, dialog);
      listenForClose(menu, "menu");
      listenForClose(dialog, "dialog");
      const menuDialog = () => menu.shadowRoot.querySelector("dialog");

      dialog.setAttribute("open", "");
      await settle();
      menu.setAttribute("open", "");
      await settle();

      const steps = {};
      steps.firstBack = overlays.closeTopmostDialog();
      steps.afterFirstBack = [...closes];
      // Rettangoli leaves closing to the owner of the close event.
      steps.menuOpenUntilItsOwnerCloses = menuDialog().open;
      menu.removeAttribute("open");
      await settle();
      steps.secondBack = overlays.closeTopmostDialog();
      steps.afterSecondBack = [...closes];
      dialog.removeAttribute("open");
      await settle();
      steps.nothingOpen = overlays.closeTopmostDialog();

      // A Rettangoli component turns its popover's close into its own.
      const dropdown = document.createElement("rtgl-dropdown-menu");
      dropdown.items = [{ label: "Add", type: "item" }];
      pageRoot.append(dropdown);
      listenForClose(dropdown, "dropdown");
      await settle();
      dropdown.setAttribute("open", "");
      await settle();
      steps.dropdownBack = overlays.closeTopmostDialog();
      steps.afterDropdownBack = [...closes];
      dropdown.removeAttribute("open");
      await settle();

      // Panels: the sheet comes after the page, and a hidden control is skipped.
      const taps = [];
      const addControl = (parent, label, tagName = "rtgl-view") => {
        const control = document.createElement(tagName);
        control.setAttribute("data-native-back", "true");
        control.textContent = label;
        control.addEventListener("click", () => taps.push(label));
        parent.append(control);
        return control;
      };
      const explorerClose = addControl(pageRoot, "explorer", "rtgl-button");
      const hidden = document.body.appendChild(document.createElement("div"));
      hidden.style.display = "none";
      addControl(hidden, "hidden");
      const sheetHost = document.body.appendChild(
        document.createElement("div"),
      );
      addControl(sheetHost.attachShadow({ mode: "open" }), "sheet");
      await settle();

      steps.sheetBack = overlays.closeTopmostPanel();
      sheetHost.remove();
      steps.explorerBack = overlays.closeTopmostPanel();
      explorerClose.remove();
      steps.noPanelBack = overlays.closeTopmostPanel();
      steps.taps = taps;
      return steps;
    });

    assert.deepEqual(result, {
      firstBack: true,
      afterFirstBack: ["menu"],
      menuOpenUntilItsOwnerCloses: true,
      secondBack: true,
      afterSecondBack: ["menu", "dialog"],
      nothingOpen: false,
      dropdownBack: true,
      afterDropdownBack: ["menu", "dialog", "dropdown"],
      sheetBack: true,
      explorerBack: true,
      noPanelBack: false,
      taps: ["sheet", "explorer"],
    });
    assert.deepEqual(errors, []);
    console.log(`${name}: Back closes the topmost overlay, one at a time`);
  } finally {
    await browser.close();
  }
}
