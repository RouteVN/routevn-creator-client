import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = path.join(rootDir, "vt", "specs", "project", "coverage");
const checklistPath = path.join(rootDir, "vt", "CHECKLIST.md");

const WIDE = Object.freeze({
  id: "wide",
  width: 1440,
  height: 900,
});

const VT_FILE_INPUT_SELECTOR = "#rtglVtFilePickerInput";
const FIRST_INTERACTIVE_CARD_SELECTOR =
  "#groupview #itemRef0x0[data-item-id]:not([data-item-id=''])";

const createProjectName = (title) => {
  return `VT ${title}`.slice(0, 48);
};

const waitFor = (selector, state = "visible", timeoutMs = 10000) => ({
  action: "waitFor",
  selector,
  state,
  timeoutMs,
});

const waitForDialogOpen = (selector, timeoutMs = 5000) => {
  return waitFor(`${selector}[open]`, "attached", timeoutMs);
};

const wait = (ms) => ({
  action: "wait",
  ms,
});

const screenshot = () => ({
  action: "screenshot",
});

const click = () => ({
  action: "click",
});

const dblclick = () => ({
  action: "dblclick",
});

const clear = () => ({
  action: "clear",
});

const keypress = (key) => ({
  action: "keypress",
  key,
});

const write = (value) => ({
  action: "write",
  value,
});

const upload = (files) => ({
  action: "upload",
  files,
});

const select = (selector, steps) => ({
  action: "select",
  selector,
  steps,
});

const selectTestId = (testId, steps) => ({
  action: "select",
  testId,
  steps,
});

const assertUrl = (value) => ({
  action: "assert",
  type: "url",
  value,
});

const customEvent = (name, detail = {}) => ({
  action: "customEvent",
  name,
  detail,
});

const fillTextField = (selector, value) => {
  return select(selector, [clear(), write(value)]);
};

const chooseSelectOption = (fieldSelector, optionIndex) => {
  return [
    waitFor(`${fieldSelector} [data-testid='select-button']`, "visible", 5000),
    select(`${fieldSelector} [data-testid='select-button']`, [click()]),
    waitFor(`${fieldSelector} #option${optionIndex}`, "visible", 5000),
    select(`${fieldSelector} #option${optionIndex}`, [click()]),
    wait(250),
  ];
};

const setSearchQuery = (query) => [
  select("#searchInput", [clear(), write(query)]),
  wait(350),
];

const VARIABLE_DEFAULT_INPUT_SELECTOR = [
  "#addVariableDialog rtgl-input#field4 input",
  "#addVariableDialog rtgl-input-number#field4 input",
].join(", ");

const createProjectSteps = (title, description) => {
  const projectName = createProjectName(title);

  return [
    waitFor("[data-testid='create-project-button']", "visible", 5000),
    wait(250),
    selectTestId("create-project-button", [click()]),
    waitFor(
      "rtgl-global-ui rtgl-form#createProjectForm rtgl-input#field0 input",
      "attached",
      5000,
    ),
    select(
      "rtgl-global-ui rtgl-form#createProjectForm rtgl-input#field0 input",
      [clear(), write(projectName)],
    ),
    select(
      "rtgl-global-ui rtgl-form#createProjectForm rtgl-input#field1 input",
      [clear(), write(description)],
    ),
    wait(250),
    select("rtgl-global-ui rtgl-button[data-action-id='submit']", [click()]),
    waitFor("#projectItem0", "visible", 10000),
    wait(500),
    select("#projectItem0", [click()]),
    waitFor("rvn-project", "attached", 10000),
    wait(500),
  ];
};

const goSidebar = (pathValue, componentSelector) => [
  select(`#sidebar [data-item-id='${pathValue}']`, [click()]),
  waitFor(componentSelector, "attached", 10000),
  assertUrl(pathValue),
  wait(450),
];

const goResource = (resourceId, componentSelector, pathValue) => [
  select(`rvn-resource-types [data-item-id='${resourceId}']`, [click()]),
  waitFor(componentSelector, "attached", 10000),
  assertUrl(pathValue),
  wait(450),
];

const goShortcut = (keyValue, componentSelector, pathValue) => [
  keypress("g"),
  wait(120),
  keypress(keyValue),
  waitFor(componentSelector, "attached", 10000),
  assertUrl(pathValue),
  wait(450),
];

const goVtRoute = (pathValue, componentSelector) => [
  customEvent("routevn:vt:navigate", { path: pathValue }),
  waitFor(componentSelector, "attached", 10000),
  assertUrl(pathValue),
  wait(450),
];

const openFirstItemDetail = (
  itemSelector,
  detailSelector = "#detailView",
) => [
  waitFor(itemSelector, "visible", 20000),
  select(itemSelector, [click()]),
  waitFor(detailSelector, "attached", 5000),
  wait(300),
];

const closeDialog = (selector) => [
  keypress("Escape"),
  waitFor(selector, "hidden", 10000),
  wait(250),
];

const createCharacter = ({
  name = "Mina",
  description = "Generated VT character.",
} = {}) => [
  waitFor("#addBtnHeaderRef0", "visible", 10000),
  select("#addBtnHeaderRef0", [click()]),
  waitForDialogOpen("#addCharacterDialog", 5000),
  wait(250),
  select("#addCharacterDialog rtgl-input#field0 input", [
    clear(),
    write(name),
  ]),
  select("#addCharacterDialog rtgl-input#field1 input", [
    clear(),
    write(description),
  ]),
  select("#addCharacterDialog rtgl-button[data-action-id='submit']", [click()]),
  waitFor("#charactersView #itemRef0x0", "visible", 10000),
  wait(500),
];

const createVersion = ({
  name = "Version One",
  description = "First generated checkpoint.",
} = {}) => [
  select("#saveVersionBtn", [click()]),
  waitFor("#versionDialog", "visible", 5000),
  wait(250),
  fillTextField("#versionDialog rtgl-input#field0 input", name),
  fillTextField("#versionDialog rtgl-textarea#field1 textarea", description),
  select("#versionDialog rtgl-button[data-action-id='submit']", [click()]),
  waitFor("#versionDialog", "hidden", 10000),
  waitFor("#versionItemRef0", "visible", 10000),
  wait(500),
];

const createVariable = ({
  name = "playerName",
  typeOptionIndex = undefined,
  defaultValue = undefined,
  defaultOptionIndex = undefined,
} = {}) => [
  select("#addVariableButtonRef0", [click()]),
  waitFor("#addVariableDialog", "visible", 5000),
  wait(250),
  fillTextField("#addVariableDialog rtgl-input#field0 input", name),
  ...(typeOptionIndex === undefined
    ? []
    : chooseSelectOption("#addVariableDialog rtgl-select#field3", typeOptionIndex)),
  ...(defaultValue === undefined
    ? []
    : [
        waitFor(VARIABLE_DEFAULT_INPUT_SELECTOR, "attached", 5000),
        fillTextField(VARIABLE_DEFAULT_INPUT_SELECTOR, defaultValue),
      ]),
  ...(defaultOptionIndex === undefined
    ? []
    : chooseSelectOption(
        "#addVariableDialog rtgl-select#field4",
        defaultOptionIndex,
      )),
  select("#addVariableDialog rtgl-button[data-action-id='submit']", [click()]),
  waitFor("#addVariableDialog", "hidden", 10000),
  waitFor("#rowRef0x0", "visible", 10000),
  wait(500),
];

const triggerUpload = (buttonSelector, files) => [
  waitFor(buttonSelector, "visible", 10000),
  select(buttonSelector, [click()]),
  waitFor(VT_FILE_INPUT_SELECTOR, "attached", 5000),
  select(VT_FILE_INPUT_SELECTOR, [upload(files)]),
  wait(500),
];

const createSpritesheet = ({
  name = "Pulse Sheet",
} = {}) => [
  waitFor("#uploadBtnHeaderRef0", "visible", 10000),
  select("#uploadBtnHeaderRef0", [click()]),
  waitFor("#spritesheetDialog", "visible", 5000),
  wait(300),
  select("#dialogImageSourceButton", [click()]),
  waitFor(VT_FILE_INPUT_SELECTOR, "attached", 5000),
  select(VT_FILE_INPUT_SELECTOR, [upload(["vt/fixtures/spritesheet.png"])]),
  wait(300),
  select("#dialogAtlasSourceButton", [click()]),
  waitFor(VT_FILE_INPUT_SELECTOR, "attached", 5000),
  select(VT_FILE_INPUT_SELECTOR, [upload(["vt/fixtures/spritesheet.atlas.json"])]),
  wait(500),
  waitFor("#spritesheetDialog rtgl-input#field2 input", "attached", 5000),
  fillTextField("#spritesheetDialog rtgl-input#field2 input", name),
  waitFor("#dialogClipButton0", "visible", 10000),
  wait(300),
  select("#spritesheetDialog rtgl-button[data-action-id='submit']", [click()]),
  waitFor("#spritesheetDialog", "hidden", 10000),
  waitFor("#groupview #itemRef0x0", "visible", 10000),
  wait(500),
];

const createParticle = ({ textureOptionIndex = 1 } = {}) => [
  select("#addBtnHeaderRef0", [click()]),
  waitFor("rtgl-global-ui rtgl-form#formDialog", "attached", 5000),
  wait(250),
  select("rtgl-global-ui rtgl-button[data-action-id='submit']", [click()]),
  waitFor("#particleDialog", "visible", 10000),
  wait(700),
  ...chooseSelectOption(
    "#particleDialog rtgl-select#field1",
    textureOptionIndex,
  ),
  select("#particleDialog rtgl-button[data-action-id='submit']", [click()]),
  waitFor("#particleDialog", "hidden", 10000),
  waitFor(FIRST_INTERACTIVE_CARD_SELECTOR, "visible", 15000),
  wait(500),
];

const withProject = ({ title, description, steps }) => ({
  title,
  description,
  url: "/projects",
  skipInitialScreenshot: true,
  viewport: WIDE,
  steps: [
    ...createProjectSteps(title, description),
    ...steps,
  ],
});

const docsByFile = {
  "core.yaml": [
    withProject({
      title: "Project Overview Detail",
      description:
        "Captures the opened project overview and edit dialog from the seeded project shell.",
      steps: [
        screenshot(),
        select("#projectTitle", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
      ],
    }),
    withProject({
      title: "Project Overview Edit Submit",
      description:
        "Updates the project name and description, then captures the refreshed project overview state.",
      steps: [
        screenshot(),
        select("#projectTitle", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
        fillTextField("#editDialog rtgl-input#field0 input", "VT Project Edited"),
        fillTextField(
          "#editDialog rtgl-textarea#field1 textarea",
          "Updated by the expanded VT coverage suite.",
        ),
        select("#editDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#editDialog", "hidden", 10000),
        wait(500),
        screenshot(),
      ],
    }),
    withProject({
      title: "Project About Page",
      description:
        "Navigates to the About route from the project shell and captures the settings surface.",
      steps: [
        ...goSidebar("/project/about", "rvn-about"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Project Versions Empty",
      description:
        "Navigates to the versions page and captures the empty release history state.",
      steps: [
        ...goSidebar("/project/releases/versions", "rvn-versions"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Project Versions Create",
      description:
        "Creates the first release version and captures the dialog, created list item, and selected detail view.",
      steps: [
        ...goSidebar("/project/releases/versions", "rvn-versions"),
        screenshot(),
        select("#saveVersionBtn", [click()]),
        waitFor("#versionDialog", "visible", 5000),
        wait(250),
        screenshot(),
        select("#versionDialog rtgl-input#field0 input", [
          clear(),
          write("Version One"),
        ]),
        select("#versionDialog rtgl-textarea#field1 textarea", [
          clear(),
          write("First generated checkpoint."),
        ]),
        select("#versionDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#versionItemRef0", "visible", 10000),
        wait(500),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#versionDialog", 5000),
        wait(250),
        screenshot(),
      ],
    }),
    withProject({
      title: "Project Versions Edit Submit",
      description:
        "Creates a version, edits it from the detail panel, and captures the updated release detail state.",
      steps: [
        ...goSidebar("/project/releases/versions", "rvn-versions"),
        ...createVersion({
          name: "Version One",
          description: "First generated checkpoint.",
        }),
        screenshot(),
        select("#detailHeader", [click()]),
        waitFor("#versionDialog", "visible", 5000),
        wait(250),
        fillTextField("#versionDialog rtgl-input#field0 input", "Version One Edited"),
        fillTextField(
          "#versionDialog rtgl-textarea#field1 textarea",
          "Edited checkpoint for the VT suite.",
        ),
        screenshot(),
        select("#versionDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#versionDialog", "hidden", 10000),
        wait(500),
        screenshot(),
      ],
    }),
    withProject({
      title: "Project Keyboard Shortcuts",
      description:
        "Exercises project-level keyboard navigation shortcuts across visible and hidden routes.",
      steps: [
        ...goShortcut("i", "rvn-images", "/project/images"),
        screenshot(),
        ...goShortcut("o", "rvn-colors", "/project/colors"),
        screenshot(),
        ...goShortcut("b", "rvn-variables", "/project/variables"),
        screenshot(),
        ...goShortcut("h", "rvn-spritesheets", "/project/spritesheets"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Project Keyboard Shortcuts Shell Routes",
      description:
        "Uses the global g-key keyboard router to reach core shell routes for project, about, and scenes.",
      steps: [
        ...goShortcut("p", "rvn-project", "/project"),
        screenshot(),
        ...goShortcut("a", "rvn-about", "/project/about"),
        screenshot(),
        ...goShortcut("n", "rvn-scenes", "/project/scenes"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Project Keyboard Shortcuts UI Routes",
      description:
        "Uses the global g-key router to move across the main UI resource pages.",
      steps: [
        ...goShortcut("o", "rvn-colors", "/project/colors"),
        screenshot(),
        ...goShortcut("f", "rvn-fonts", "/project/fonts"),
        screenshot(),
        ...goShortcut("y", "rvn-text-styles", "/project/text-styles"),
        screenshot(),
        ...goShortcut("l", "rvn-layouts", "/project/layouts"),
        screenshot(),
        ...goShortcut("b", "rvn-variables", "/project/variables"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Project Keyboard Shortcuts Asset Routes",
      description:
        "Uses the global g-key router to move across the asset resource pages.",
      steps: [
        ...goShortcut("i", "rvn-images", "/project/images"),
        screenshot(),
        ...goShortcut("h", "rvn-spritesheets", "/project/spritesheets"),
        screenshot(),
        ...goShortcut("c", "rvn-characters", "/project/characters"),
        screenshot(),
        ...goShortcut("s", "rvn-sounds", "/project/sounds"),
        screenshot(),
        ...goShortcut("v", "rvn-videos", "/project/videos"),
        screenshot(),
        ...goShortcut("t", "rvn-transforms", "/project/transforms"),
        screenshot(),
      ],
    }),
  ],
  "ui-resources.yaml": [
    withProject({
      title: "Colors Detail Preview",
      description:
        "Captures the seeded colors page detail panel, preview dialog, and edit dialog.",
      steps: [
        ...goShortcut("o", "rvn-colors", "/project/colors"),
        screenshot(),
        ...openFirstItemDetail("#groupview #itemRef0x0"),
        screenshot(),
        select("#groupview #itemRef0x0", [dblclick()]),
        waitFor("#previewDialog", "visible", 5000),
        wait(300),
        screenshot(),
        ...closeDialog("#previewDialog"),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
      ],
    }),
    withProject({
      title: "Colors Search Empty",
      description:
        "Captures the seeded colors page before and after a no-match search query.",
      steps: [
        ...goShortcut("o", "rvn-colors", "/project/colors"),
        screenshot(),
        ...setSearchQuery("zzzz vt color"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Fonts Glyph Preview",
      description:
        "Captures the seeded fonts page detail panel, glyph preview dialog, and edit dialog.",
      steps: [
        ...goShortcut("f", "rvn-fonts", "/project/fonts"),
        screenshot(),
        ...openFirstItemDetail("#groupview #itemRef0x0"),
        screenshot(),
        select("#groupview #itemRef0x0", [dblclick()]),
        waitFor("#fontDialog", "visible", 10000),
        wait(500),
        screenshot(),
        ...closeDialog("#fontDialog"),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
      ],
    }),
    withProject({
      title: "Fonts Search Empty",
      description:
        "Captures the seeded fonts page before and after a no-match search query.",
      steps: [
        ...goShortcut("f", "rvn-fonts", "/project/fonts"),
        screenshot(),
        ...setSearchQuery("zzzz vt font"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Text Styles Dialog",
      description:
        "Captures the seeded text style detail panel and the full edit dialog with preview.",
      steps: [
        ...goShortcut("y", "rvn-text-styles", "/project/text-styles"),
        screenshot(),
        ...openFirstItemDetail("#typographyView #itemRef0x0"),
        screenshot(),
        select("#typographyView #itemRef0x0", [dblclick()]),
        waitFor("#addTypographyDialog", "visible", 5000),
        wait(400),
        screenshot(),
      ],
    }),
    withProject({
      title: "Text Styles Search Empty",
      description:
        "Captures the seeded text styles page before and after a no-match search query.",
      steps: [
        ...goShortcut("y", "rvn-text-styles", "/project/text-styles"),
        screenshot(),
        ...setSearchQuery("zzzz vt text style"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Layouts Editor Entry",
      description:
        "Captures the seeded layouts page detail panel, edit dialog, and route into the layout editor.",
      steps: [
        ...goShortcut("l", "rvn-layouts", "/project/layouts"),
        screenshot(),
        ...openFirstItemDetail("#groupview #itemRef0x0"),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
        ...closeDialog("#editDialog"),
        select("#groupview #itemRef0x0", [dblclick()]),
        waitFor("rvn-layout-editor", "attached", 20000),
        assertUrl("/project/layout-editor"),
        wait(1200),
        screenshot(),
      ],
    }),
    withProject({
      title: "Layouts Search Empty",
      description:
        "Captures the seeded layouts page before and after a no-match search query.",
      steps: [
        ...goShortcut("l", "rvn-layouts", "/project/layouts"),
        screenshot(),
        ...setSearchQuery("zzzz vt layout"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Controls Keyboard Actions",
      description:
        "Captures the seeded controls page detail panel, embedded keyboard action summary, and command editor.",
      steps: [
        ...goSidebar("/project/controls", "rvn-controls"),
        screenshot(),
        ...openFirstItemDetail("#groupview #itemRef0x0"),
        screenshot(),
        select("#keyboardItem1", [click()]),
        waitFor("rvn-system-actions#keyboardSystemActions", "attached", 5000),
        wait(300),
        waitFor("#commandLineToggleDialogueUI", "attached", 5000),
        screenshot(),
      ],
    }),
    withProject({
      title: "Variables Create And Edit",
      description:
        "Uses the hidden variables route to capture the empty state, creation dialog, created detail panel, and edit dialog.",
      steps: [
        ...goShortcut("b", "rvn-variables", "/project/variables"),
        screenshot(),
        select("#addVariableButtonRef0", [click()]),
        waitFor("#addVariableDialog", "visible", 5000),
        wait(250),
        screenshot(),
        select("#addVariableDialog rtgl-input#field0 input", [
          clear(),
          write("playerName"),
        ]),
        select("#addVariableDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#rowRef0x0", "visible", 10000),
        wait(500),
        select("#rowRef0x0", [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(300),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#addVariableDialog", 5000),
        wait(250),
        screenshot(),
      ],
    }),
    withProject({
      title: "Variables Search Created",
      description:
        "Creates a variable, filters the list by its name, and captures the resulting empty search state as well.",
      steps: [
        ...goShortcut("b", "rvn-variables", "/project/variables"),
        ...createVariable({
          name: "playerSearch",
        }),
        select("#rowRef0x0", [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(300),
        screenshot(),
        ...setSearchQuery("playerSearch"),
        screenshot(),
        ...setSearchQuery("zzzz vt variable"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Variables Create Number",
      description:
        "Creates a number variable and captures the number-specific dialog, selected detail state, and edit dialog.",
      steps: [
        ...goShortcut("b", "rvn-variables", "/project/variables"),
        select("#addVariableButtonRef0", [click()]),
        waitFor("#addVariableDialog", "visible", 5000),
        wait(250),
        fillTextField("#addVariableDialog rtgl-input#field0 input", "score"),
        ...chooseSelectOption("#addVariableDialog rtgl-select#field3", 1),
        waitFor(VARIABLE_DEFAULT_INPUT_SELECTOR, "attached", 5000),
        fillTextField(VARIABLE_DEFAULT_INPUT_SELECTOR, "42"),
        screenshot(),
        select("#addVariableDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#addVariableDialog", "hidden", 10000),
        waitFor("#rowRef0x0", "visible", 10000),
        select("#rowRef0x0", [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(300),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#addVariableDialog", 5000),
        wait(250),
        screenshot(),
      ],
    }),
    withProject({
      title: "Variables Create Boolean",
      description:
        "Creates a boolean variable and captures the boolean-specific dialog, selected detail state, and edit dialog.",
      steps: [
        ...goShortcut("b", "rvn-variables", "/project/variables"),
        select("#addVariableButtonRef0", [click()]),
        waitFor("#addVariableDialog", "visible", 5000),
        wait(250),
        fillTextField("#addVariableDialog rtgl-input#field0 input", "hasKey"),
        ...chooseSelectOption("#addVariableDialog rtgl-select#field3", 2),
        ...chooseSelectOption("#addVariableDialog rtgl-select#field4", 0),
        screenshot(),
        select("#addVariableDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#addVariableDialog", "hidden", 10000),
        waitFor("#rowRef0x0", "visible", 10000),
        select("#rowRef0x0", [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(300),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#addVariableDialog", 5000),
        wait(250),
        screenshot(),
      ],
    }),
  ],
  "assets-existing.yaml": [
    withProject({
      title: "Images Search Empty",
      description:
        "Captures the seeded images page before and after a no-match search query.",
      steps: [
        ...goShortcut("i", "rvn-images", "/project/images"),
        screenshot(),
        ...setSearchQuery("zzzz vt image"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Characters Create Detail And Sprites Route",
      description:
        "Captures the characters empty state, create dialog, created detail panel, edit dialog, and navigation into character sprites.",
      steps: [
        ...goShortcut("c", "rvn-characters", "/project/characters"),
        screenshot(),
        ...createCharacter({
          name: "Mina",
          description: "Generated VT character.",
        }),
        screenshot(),
        waitFor("rvn-base-file-explorer#fileExplorer #itemRef1", "visible", 10000),
        select("rvn-base-file-explorer#fileExplorer #itemRef1", [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(300),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
        ...closeDialog("#editDialog"),
        select("#spritesButtonRef0x0", [click()]),
        waitFor("rvn-character-sprites", "attached", 10000),
        assertUrl("/project/character-sprites"),
        wait(500),
        screenshot(),
      ],
    }),
    withProject({
      title: "Characters Search Created",
      description:
        "Creates a character, filters the list by its name, and captures the no-match character search state.",
      steps: [
        ...goShortcut("c", "rvn-characters", "/project/characters"),
        ...createCharacter({
          name: "Search Mina",
          description: "Character used for VT search coverage.",
        }),
        screenshot(),
        ...setSearchQuery("Search Mina"),
        screenshot(),
        ...setSearchQuery("zzzz vt character"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Character Sprites Upload Preview",
      description:
        "Creates a character, opens character sprites, uploads a sprite image, and captures detail, preview overlay, and edit dialog.",
      steps: [
        ...goShortcut("c", "rvn-characters", "/project/characters"),
        ...createCharacter({
          name: "Mina",
          description: "Generated VT character.",
        }),
        select("#spritesButtonRef0x0", [click()]),
        waitFor("rvn-character-sprites", "attached", 10000),
        wait(500),
        screenshot(),
        ...triggerUpload("#uploadBtnHeaderRef0", ["vt/fixtures/spritesheet.png"]),
        ...openFirstItemDetail("#groupview #itemRef0x0"),
        screenshot(),
        select("#groupview #itemRef0x0", [dblclick()]),
        waitFor("#previewOverlay", "visible", 10000),
        wait(400),
        screenshot(),
        select("#previewOverlay", [click()]),
        waitFor("#previewOverlay", "hidden", 10000),
        wait(250),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
      ],
    }),
    withProject({
      title: "Character Sprites Search Uploaded",
      description:
        "Creates a character sprite upload and captures the character sprites search empty state after filtering.",
      steps: [
        ...goShortcut("c", "rvn-characters", "/project/characters"),
        ...createCharacter({
          name: "Sprite Mina",
          description: "Character used for sprite search coverage.",
        }),
        select("#spritesButtonRef0x0", [click()]),
        waitFor("rvn-character-sprites", "attached", 10000),
        wait(500),
        ...triggerUpload("#uploadBtnHeaderRef0", ["vt/fixtures/spritesheet.png"]),
        waitFor("#groupview #itemRef0x0", "visible", 10000),
        wait(500),
        screenshot(),
        ...setSearchQuery("zzzz vt sprite"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Transforms Preview Dialog",
      description:
        "Captures the seeded transforms page detail panel, preview dialog, and edit dialog.",
      steps: [
        ...goShortcut("t", "rvn-transforms", "/project/transforms"),
        screenshot(),
        ...openFirstItemDetail("#groupview #itemRef0x0"),
        screenshot(),
        select("#groupview #itemRef0x0", [dblclick()]),
        waitFor("#transformDialog", "visible", 10000),
        wait(500),
        screenshot(),
        ...closeDialog("#transformDialog"),
        select("#detailHeader", [click()]),
        waitFor("#transformDialog", "visible", 10000),
        wait(500),
        screenshot(),
      ],
    }),
    withProject({
      title: "Transforms Search Empty",
      description:
        "Captures the seeded transforms page before and after a no-match search query.",
      steps: [
        ...goShortcut("t", "rvn-transforms", "/project/transforms"),
        screenshot(),
        ...setSearchQuery("zzzz vt transform"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Animations Editor Route",
      description:
        "Captures the seeded animations page detail panel, edit dialog, and animation editor route.",
      steps: [
        ...goSidebar("/project/animations", "rvn-animations"),
        screenshot(),
        ...openFirstItemDetail("#groupview #itemRef0x0", "#detailHeader"),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
        ...closeDialog("#editDialog"),
        select("#groupview #itemRef0x0", [dblclick()]),
        waitFor("rvn-animation-editor", "attached", 20000),
        assertUrl("/project/animation-editor"),
        wait(1200),
        screenshot(),
      ],
    }),
    withProject({
      title: "Animations Search Empty",
      description:
        "Captures the seeded animations page before and after a no-match search query.",
      steps: [
        ...goSidebar("/project/animations", "rvn-animations"),
        screenshot(),
        ...setSearchQuery("zzzz vt animation"),
        screenshot(),
      ],
    }),
  ],
  "assets-uploaded.yaml": [
    withProject({
      title: "Sounds Upload And Preview",
      description:
        "Uploads a tiny WAV fixture and captures the sounds empty state, created detail panel, audio player, and edit dialog.",
      steps: [
        ...goShortcut("s", "rvn-sounds", "/project/sounds"),
        screenshot(),
        ...triggerUpload("#uploadBtnHeaderRef0", ["vt/fixtures/sine.wav"]),
        waitFor(FIRST_INTERACTIVE_CARD_SELECTOR, "visible", 10000),
        select(FIRST_INTERACTIVE_CARD_SELECTOR, [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(400),
        screenshot(),
        select(FIRST_INTERACTIVE_CARD_SELECTOR, [dblclick()]),
        waitFor("#rvnAudioPlayer", "attached", 10000),
        wait(500),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
      ],
    }),
    withProject({
      title: "Sounds Edit And Search",
      description:
        "Uploads a sound, renames it through the edit dialog, and captures the filtered sounds list.",
      steps: [
        ...goShortcut("s", "rvn-sounds", "/project/sounds"),
        ...triggerUpload("#uploadBtnHeaderRef0", ["vt/fixtures/sine.wav"]),
        waitFor(FIRST_INTERACTIVE_CARD_SELECTOR, "visible", 10000),
        select(FIRST_INTERACTIVE_CARD_SELECTOR, [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(400),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        fillTextField("#editDialog rtgl-input#field0 input", "Searchable Sine"),
        screenshot(),
        select("#editDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#editDialog", "hidden", 10000),
        wait(500),
        screenshot(),
        ...setSearchQuery("Searchable Sine"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Videos Upload And Preview",
      description:
        "Uploads a tiny MP4 fixture and captures the videos empty state, created detail panel, video preview dialog, and edit dialog.",
      steps: [
        ...goShortcut("v", "rvn-videos", "/project/videos"),
        screenshot(),
        ...triggerUpload("#uploadBtnHeaderRef0", ["vt/fixtures/pulse.mp4"]),
        waitFor(FIRST_INTERACTIVE_CARD_SELECTOR, "visible", 15000),
        select(FIRST_INTERACTIVE_CARD_SELECTOR, [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(500),
        screenshot(),
        select(FIRST_INTERACTIVE_CARD_SELECTOR, [dblclick()]),
        waitFor("#videoPreviewDialog", "visible", 10000),
        wait(800),
        screenshot(),
        ...closeDialog("#videoPreviewDialog"),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        screenshot(),
      ],
    }),
    withProject({
      title: "Videos Edit And Search",
      description:
        "Uploads a video, renames it through the edit dialog, and captures the filtered videos list.",
      steps: [
        ...goShortcut("v", "rvn-videos", "/project/videos"),
        ...triggerUpload("#uploadBtnHeaderRef0", ["vt/fixtures/pulse.mp4"]),
        waitFor(FIRST_INTERACTIVE_CARD_SELECTOR, "visible", 15000),
        select(FIRST_INTERACTIVE_CARD_SELECTOR, [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(500),
        screenshot(),
        select("#detailHeader", [click()]),
        waitForDialogOpen("#editDialog", 5000),
        wait(300),
        fillTextField("#editDialog rtgl-input#field0 input", "Searchable Pulse"),
        screenshot(),
        select("#editDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#editDialog", "hidden", 10000),
        wait(500),
        screenshot(),
        ...setSearchQuery("Searchable Pulse"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Spritesheets Upload And Preview",
      description:
        "Uses the hidden spritesheets route to create a spritesheet from PNG and atlas fixtures, then captures detail and preview states.",
      steps: [
        ...goShortcut("h", "rvn-spritesheets", "/project/spritesheets"),
        screenshot(),
        waitFor("#uploadBtnHeaderRef0", "visible", 10000),
        select("#uploadBtnHeaderRef0", [click()]),
        waitFor("#spritesheetDialog", "visible", 5000),
        wait(300),
        screenshot(),
        select("#dialogImageSourceButton", [click()]),
        waitFor(VT_FILE_INPUT_SELECTOR, "attached", 5000),
        select(VT_FILE_INPUT_SELECTOR, [upload(["vt/fixtures/spritesheet.png"])]),
        wait(300),
        select("#dialogAtlasSourceButton", [click()]),
        waitFor(VT_FILE_INPUT_SELECTOR, "attached", 5000),
        select(VT_FILE_INPUT_SELECTOR, [
          upload(["vt/fixtures/spritesheet.atlas.json"]),
        ]),
        wait(500),
        waitFor("#spritesheetDialog rtgl-input#field2 input", "attached", 5000),
        select("#spritesheetDialog rtgl-input#field2 input", [
          clear(),
          write("Pulse Sheet"),
        ]),
        waitFor("#dialogClipButton0", "visible", 10000),
        wait(300),
        screenshot(),
        select("#spritesheetDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#groupview #itemRef0x0", "visible", 10000),
        wait(500),
        select("#groupview #itemRef0x0", [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(300),
        screenshot(),
        select("#groupview #itemRef0x0", [dblclick()]),
        waitFor("#spritesheetDialog", "visible", 10000),
        wait(500),
        screenshot(),
      ],
    }),
    withProject({
      title: "Spritesheets Search Created",
      description:
        "Creates a spritesheet from fixtures and captures filtered and empty search states on the spritesheets page.",
      steps: [
        ...goShortcut("h", "rvn-spritesheets", "/project/spritesheets"),
        ...createSpritesheet({
          name: "Search Pulse Sheet",
        }),
        select("#groupview #itemRef0x0", [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(300),
        screenshot(),
        ...setSearchQuery("Search Pulse Sheet"),
        screenshot(),
        ...setSearchQuery("zzzz vt spritesheet"),
        screenshot(),
      ],
    }),
    withProject({
      title: "Particles Create Flow",
      description:
        "Uses the VT route bridge to reach the hidden particles page, then captures preset selection, editor, and created detail state.",
      steps: [
        ...goVtRoute("/project/particles", "rvn-particles"),
        screenshot(),
        select("#addBtnHeaderRef0", [click()]),
        waitFor("rtgl-global-ui rtgl-form#formDialog", "attached", 5000),
        wait(250),
        screenshot(),
        select("rtgl-global-ui rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#particleDialog", "visible", 10000),
        wait(700),
        screenshot(),
        waitFor(
          "#particleDialog rtgl-select#field1 [data-testid='select-button']",
          "visible",
          5000,
        ),
        select("#particleDialog rtgl-select#field1 [data-testid='select-button']", [
          click(),
        ]),
        waitFor("#particleDialog rtgl-select#field1 #option1", "visible", 5000),
        select("#particleDialog rtgl-select#field1 #option1", [click()]),
        wait(300),
        select("#particleDialog rtgl-button[data-action-id='submit']", [click()]),
        waitFor("#particleDialog", "hidden", 10000),
        waitFor(FIRST_INTERACTIVE_CARD_SELECTOR, "visible", 15000),
        select(FIRST_INTERACTIVE_CARD_SELECTOR, [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(500),
        screenshot(),
      ],
    }),
    withProject({
      title: "Particles Edit Dialog And Search",
      description:
        "Creates a particle effect, opens the edit dialog from the detail panel, and captures the filtered empty search state.",
      steps: [
        ...goVtRoute("/project/particles", "rvn-particles"),
        ...createParticle(),
        select(FIRST_INTERACTIVE_CARD_SELECTOR, [click()]),
        waitFor("#detailView", "attached", 5000),
        wait(500),
        screenshot(),
        select("#detailHeader", [click()]),
        waitFor("#particleDialog", "visible", 10000),
        wait(700),
        screenshot(),
        ...closeDialog("#particleDialog"),
        ...setSearchQuery("zzzz vt particle"),
        screenshot(),
      ],
    }),
  ],
};

const checklistSections = [
  {
    title: "Existing Baseline Specs Retained",
    items: [
      "Projects page responsive states on wide, laptop, tablet, and mobile viewports.",
      "Project creation flow from the real UI into the project shell.",
      "Seeded workspace navigation through project, about, releases, scenes, scene editor, and core resource routes.",
      "Seeded resource detail coverage for colors, fonts, and text styles.",
      "Image-specific interaction coverage for detail panels, preview overlay, edit dialog, and explorer drag/drop.",
      "Scene map creation flow and seeded scene workspace preview coverage.",
    ],
  },
  {
    title: "Project Shell And Navigation",
    items: [
      "Project overview detail panel and project edit dialog.",
      "Project edit submit flow with updated overview state.",
      "About route.",
      "Versions empty state.",
      "Version creation flow, selected detail state, and edit dialog.",
      "Version edit submit flow from the selected detail panel.",
      "Keyboard route shortcuts for images, colors, variables, and spritesheets.",
      "Keyboard route shortcuts for shell routes, UI resources, and asset resources.",
    ],
  },
  {
    title: "UI Resource Pages",
    items: [
      "Colors page list state, selected detail state, preview dialog, and edit dialog.",
      "Colors search empty state.",
      "Fonts page list state, selected detail state, glyph preview dialog, and edit dialog.",
      "Fonts search empty state.",
      "Text styles page list state, selected detail state, and edit dialog with live preview.",
      "Text styles search empty state.",
      "Layouts page list state, selected detail state, edit dialog, and layout editor route entry.",
      "Layouts search empty state.",
      "Controls page selected detail state, embedded keyboard action summary, and command editor.",
      "Variables page empty state, add dialog, created row/detail state, and edit dialog.",
      "Variables search filtering for created rows.",
      "Variables create flows for number and boolean types.",
    ],
  },
  {
    title: "Asset Resource Pages",
    items: [
      "Images search empty state.",
      "Characters page empty state, create dialog, selected detail state, edit dialog, and character sprites route entry.",
      "Characters search filtering for newly created items.",
      "Character sprites page empty state, upload flow, selected detail state, full-image preview, and edit dialog.",
      "Character sprites search empty state after upload.",
      "Transforms page selected detail state, preview dialog, and edit dialog.",
      "Transforms search empty state.",
      "Animations page selected detail state, edit dialog, and animation editor route entry.",
      "Animations search empty state.",
      "Sounds page empty state, upload flow, selected detail state, audio player preview, and edit dialog.",
      "Sounds edit submit and search filtering after upload.",
      "Videos page empty state, upload flow, selected detail state, preview dialog, and edit dialog.",
      "Videos edit submit and search filtering after upload.",
      "Spritesheets page empty state, create/import dialog, populated detail state, and preview dialog.",
      "Spritesheets filtered and empty search states after creation.",
      "Particles page empty state, preset picker, particle editor, and populated detail state.",
      "Particles edit dialog from the populated detail state and search empty state.",
    ],
  },
];

const renderChecklist = () => {
  const docCount = Object.values(docsByFile).reduce(
    (total, docs) => total + docs.length,
    0,
  );
  const screenshotCount = Object.values(docsByFile).reduce((total, docs) => {
    return (
      total +
      docs.reduce((docTotal, doc) => {
        return (
          docTotal +
          doc.steps.filter((step) => step.action === "screenshot").length
        );
      }, 0)
    );
  }, 0);

  const lines = [
    "# VT Coverage Checklist",
    "",
    `Generated suite additions: ${docCount} specs with ${screenshotCount} explicit screenshots.`,
    "",
    "The broader repo VT total also includes the existing checked-in specs under `vt/specs/projects/` and `vt/specs/project/`.",
    "",
  ];

  checklistSections.forEach((section) => {
    lines.push(`## ${section.title}`);
    lines.push("");
    section.items.forEach((item) => {
      lines.push(`- ${item}`);
    });
    lines.push("");
  });

  return `${lines.join("\n").trim()}\n`;
};

const slugifyFileName = (value) => {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const dumpDoc = (doc) => {
  return `---\n${yaml.dump(doc, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
  })}---\n`;
};

const generatedSpecs = Object.entries(docsByFile).flatMap(([groupFileName, docs]) => {
  const groupName = groupFileName.replace(/\.yaml$/, "");

  return docs.map((doc) => {
    const fileName = `${slugifyFileName(doc.title)}.yaml`;
    return {
      doc,
      filePath: path.join(generatedDir, `${groupName}-${fileName}`),
    };
  });
});

await rm(generatedDir, { recursive: true, force: true });
await mkdir(generatedDir, { recursive: true });

for (const { filePath, doc } of generatedSpecs) {
  await writeFile(filePath, dumpDoc(doc), "utf8");
}

await writeFile(checklistPath, renderChecklist(), "utf8");

const generatedFiles = generatedSpecs
  .map(({ filePath }) => path.relative(rootDir, filePath))
  .sort();

console.log(`Wrote ${generatedFiles.length} VT spec files.`);
generatedFiles.forEach((fileName) => console.log(`- ${fileName}`));
console.log(`- ${path.relative(rootDir, checklistPath)}`);
