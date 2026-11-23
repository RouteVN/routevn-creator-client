// Project templates for the template gallery until the asset store serves
// them. Cards and templates have the shape the store client will read from
// the API: images are URLs, dates are epoch milliseconds, and a description is
// paragraphs (`{ text }`) as the asset store's pack descriptions are.
//
// Every image is an SVG drawn here, so the mock needs no files and no network.

const MOCK_DELAY_MS = 450;
const PAGE_LIMIT = 6;
const WIDTH = 1920;
const HEIGHT = 1080;

export class ProjectTemplateStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProjectTemplateStoreError";
    this.code = code;
  }
}

const escapeXml = (text) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character],
  );

const svgDataUrl = (body, { width = WIDTH, height = HEIGHT } = {}) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`,
  )}`;

const sky = ({ sky: [top, bottom] }) =>
  `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>`;

const scenery = ({ ground, accent }) =>
  `<circle cx="1500" cy="250" r="120" fill="${accent}" opacity="0.5"/><path d="M0 770 Q 480 640 960 720 T 1920 700 V1080 H0 Z" fill="${ground}"/>`;

const bar = ({ x, y, width, color, opacity = 0.8, height = 28 }) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${color}" opacity="${opacity}"/>`;

const silhouette = ({ figure }, x) =>
  `<g fill="${figure}" opacity="0.92"><ellipse cx="${x}" cy="420" rx="95" ry="110"/><path d="M${x - 170} 1080 Q ${x - 170} 560 ${x} 540 Q ${x + 170} 560 ${x + 170} 1080 Z"/></g>`;

const drawTitle = (palette, title) =>
  [
    sky(palette),
    scenery(palette),
    `<text x="160" y="430" font-size="116" font-weight="700" font-family="Georgia, 'Times New Roman', serif" fill="${palette.title}">${escapeXml(title)}</text>`,
    bar({ x: 164, y: 560, width: 320, color: palette.title }),
    bar({ x: 164, y: 630, width: 260, color: palette.title, opacity: 0.6 }),
    bar({ x: 164, y: 700, width: 290, color: palette.title, opacity: 0.6 }),
  ].join("");

const drawDialogue = (palette) => {
  if (palette.textBox === "nvl") {
    return [
      sky(palette),
      scenery(palette),
      `<rect x="160" y="100" width="1600" height="880" rx="24" fill="${palette.box}" opacity="0.86"/>`,
      ...[0, 1, 2, 3, 4, 5, 6].map((line) =>
        bar({
          x: 240,
          y: 200 + line * 100,
          width: [1380, 1300, 1420, 900, 1360, 1200, 640][line],
          color: palette.text,
          opacity: line < 4 ? 0.8 : 0.45,
        }),
      ),
    ].join("");
  }
  return [
    sky(palette),
    scenery(palette),
    silhouette(palette, 960),
    `<rect x="120" y="760" width="1680" height="260" rx="28" fill="${palette.box}" opacity="0.9"/>`,
    `<rect x="170" y="712" width="340" height="76" rx="18" fill="${palette.accent}"/>`,
    bar({ x: 210, y: 738, width: 260, color: palette.box, opacity: 0.9 }),
    bar({ x: 190, y: 840, width: 1240, color: palette.text }),
    bar({ x: 190, y: 900, width: 980, color: palette.text, opacity: 0.6 }),
  ].join("");
};

const drawChoices = (palette) =>
  [
    sky(palette),
    scenery(palette),
    silhouette(palette, 1480),
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#000000" opacity="0.32"/>`,
    ...[0, 1, 2].map((index) => {
      const y = 300 + index * 160;
      const stroke =
        index === 1
          ? ` stroke="${palette.accent}" stroke-width="8"`
          : ` stroke="${palette.text}" stroke-opacity="0.25" stroke-width="2"`;
      return `<rect x="520" y="${y}" width="880" height="112" rx="20" fill="${palette.box}" opacity="0.94"${stroke}/>${bar({ x: 600, y: y + 42, width: [520, 600, 440][index], color: palette.text })}`;
    }),
  ].join("");

const drawMenu = (palette) =>
  [
    sky(palette),
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${palette.box}" opacity="0.7"/>`,
    bar({ x: 160, y: 120, width: 360, height: 48, color: palette.text }),
    ...[0, 1, 2, 3, 4, 5].map((index) => {
      const x = 160 + (index % 3) * 540;
      const y = 260 + Math.floor(index / 3) * 380;
      return [
        `<rect x="${x}" y="${y}" width="500" height="340" rx="20" fill="${palette.box}" stroke="${palette.text}" stroke-opacity="0.2" stroke-width="2"/>`,
        `<rect x="${x + 24}" y="${y + 24}" width="452" height="220" rx="12" fill="url(#sky)"/>`,
        bar({ x: x + 24, y: y + 272, width: 300, color: palette.text }),
      ].join("");
    }),
  ].join("");

const SCREENS = {
  title: { draw: drawTitle, alt: "Title screen" },
  dialogue: { draw: drawDialogue, alt: "Dialogue" },
  choices: { draw: drawChoices, alt: "Choices" },
  menu: { draw: drawMenu, alt: "Save and load" },
};

const createScreenshot = ({ palette, title }, screen) => ({
  url: svgDataUrl(SCREENS[screen].draw(palette, title)),
  width: WIDTH,
  height: HEIGHT,
  alt: SCREENS[screen].alt,
});

const createAvatarUrl = ({ name, color }) => {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2);
  return svgDataUrl(
    `<rect width="96" height="96" fill="${color}"/><text x="48" y="60" font-size="36" font-family="sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(initials)}</text>`,
    { width: 96, height: 96 },
  );
};

const CREATORS = {
  studioOne: { id: "creator-one", name: "Studio One", color: "#c2185b" },
  studioTwo: { id: "creator-two", name: "Studio Two", color: "#1565c0" },
  studioThree: { id: "creator-three", name: "Studio Three", color: "#2e7d32" },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NOVEMBER_1_2026 = Date.UTC(2026, 10, 1);

const TEMPLATE_SOURCES = [
  {
    id: "template-classic-romance",
    title: "Classic Romance",
    summary:
      "A sweet love story starter with affection points and three endings.",
    creator: CREATORS.studioOne,
    languages: ["en", "ja"],
    versionName: "1.2.0",
    releasedDaysAgo: 3,
    updatedDaysAgo: 1,
    palette: {
      sky: ["#ffd3e1", "#ffb38a"],
      ground: "#f48fb1",
      accent: "#ec407a",
      figure: "#6d3b54",
      box: "#fff5f8",
      text: "#5d2a42",
      title: "#ffffff",
    },
    screens: ["title", "dialogue", "choices", "menu"],
    description: [
      "Start a romance visual novel with the screens most love stories need already in place.",
      "The template tracks affection with a variable for each love interest, so your choices can lead to one of three endings.",
      "• A title screen, with save, load and options menus",
      "• Dialogue in a box at the bottom of the screen, with the speaker's name",
      "• A prologue scene that shows how choices raise affection",
    ],
  },
  {
    id: "template-night-mystery",
    title: "Night Mystery",
    summary:
      "Investigate a case with clues, a notebook and branching accusations.",
    creator: CREATORS.studioTwo,
    languages: ["en"],
    versionName: "2.0.1",
    releasedDaysAgo: 9,
    updatedDaysAgo: 4,
    palette: {
      sky: ["#0d1b2a", "#1b4965"],
      ground: "#0b132b",
      accent: "#5fa8d3",
      figure: "#02040a",
      box: "#13293d",
      text: "#cae9ff",
      title: "#cae9ff",
    },
    screens: ["title", "dialogue", "choices", "menu"],
    description: [
      "A detective story starter set at night. Collect clues as you talk to suspects, then choose who to accuse.",
      "Each clue is a variable, so the accusation scene can check what the player has found.",
      "• A notebook screen that lists the clues found so far",
      "• Three suspects, each with their own interview scene",
      "• Endings for a right and a wrong accusation",
    ],
  },
  {
    id: "template-fantasy-quest",
    title: "Fantasy Quest",
    summary:
      "An adventure across a magical kingdom, with a map and party members.",
    creator: CREATORS.studioThree,
    languages: ["en", "es", "fr"],
    versionName: "1.0.0",
    releasedDaysAgo: 15,
    updatedDaysAgo: 15,
    palette: {
      sky: ["#a8e6cf", "#dcedc1"],
      ground: "#3d8361",
      accent: "#ffd166",
      figure: "#1e5128",
      box: "#fffbea",
      text: "#2d4a22",
      title: "#1e5128",
    },
    screens: ["title", "dialogue", "choices", "menu"],
    description: [
      "Set out on a quest across a kingdom of forests, towers and ruins.",
      "The template comes with a map screen that sends the player to each area, and party members who comment on your choices.",
      "• A world map with four areas",
      "• Party members who join along the way",
    ],
  },
  {
    id: "template-school-days",
    title: "School Days",
    summary:
      "Slice of life at school, with a calendar of days and club activities.",
    creator: CREATORS.studioOne,
    languages: ["en", "ja", "zh-Hans", "ko"],
    versionName: "1.4.0",
    releasedDaysAgo: 22,
    updatedDaysAgo: 6,
    palette: {
      sky: ["#a0d8ef", "#e0f4ff"],
      ground: "#8ecae6",
      accent: "#ffb703",
      figure: "#264653",
      box: "#ffffff",
      text: "#023047",
      title: "#023047",
    },
    screens: ["title", "dialogue", "choices", "menu"],
    description: [
      "A slice of life story over one school term. Each day, choose where to spend your free time.",
      "• A calendar that moves the story from day to day",
      "• Club activities with their own scenes",
      "• Ready for English, Japanese, Chinese and Korean text",
    ],
  },
  {
    id: "template-haunted-house",
    title: "Haunted House",
    summary: "A horror story starter with tense music cues and a sanity meter.",
    creator: CREATORS.studioTwo,
    languages: ["en"],
    versionName: "1.1.0",
    releasedDaysAgo: 31,
    updatedDaysAgo: 12,
    palette: {
      sky: ["#1a0f1f", "#4a1c2b"],
      ground: "#120a14",
      accent: "#c1121f",
      figure: "#050205",
      box: "#1f1218",
      text: "#f2d0d6",
      title: "#f2d0d6",
    },
    screens: ["title", "dialogue", "choices"],
    description: [
      "Explore a house that does not want you to leave. The screen darkens as the player's sanity drops.",
      "• A sanity variable that changes the background music",
      "• Jump scare animations you can reuse",
    ],
  },
  {
    id: "template-space-station",
    title: "Space Station",
    summary:
      "Science fiction aboard a station in orbit, with a ship's computer narrator.",
    creator: CREATORS.studioThree,
    languages: ["en", "ru"],
    versionName: "0.9.0",
    releasedDaysAgo: 40,
    updatedDaysAgo: 40,
    palette: {
      sky: ["#03045e", "#0077b6"],
      ground: "#023e8a",
      accent: "#90e0ef",
      figure: "#03045e",
      box: "#0a1931",
      text: "#caf0f8",
      title: "#caf0f8",
    },
    screens: ["title", "dialogue", "menu"],
    description: [
      "A science fiction starter set on a station in orbit. The ship's computer narrates between scenes.",
      "• A narrator voice that speaks without a character on screen",
      "• Sci-fi menus for save, load and options",
    ],
  },
  {
    id: "template-kinetic-novel",
    title: "Kinetic Novel",
    summary:
      "A story without choices, with text filling the screen like a book.",
    creator: CREATORS.studioOne,
    languages: ["en", "ja"],
    versionName: "1.0.0",
    releasedDaysAgo: 55,
    updatedDaysAgo: 50,
    palette: {
      sky: ["#e9e4d4", "#c9bfa5"],
      ground: "#a89f85",
      accent: "#7f5539",
      figure: "#3f3a2e",
      box: "#fdfaf2",
      text: "#3f3a2e",
      title: "#3f3a2e",
      textBox: "nvl",
    },
    screens: ["title", "dialogue", "menu"],
    description: [
      "Tell a story the reader follows from start to end, without choices.",
      "Text fills the screen page by page, as in a book, so long passages read comfortably.",
    ],
  },
];

const toCreator = ({ id, name, color }) => ({
  id,
  name,
  avatarUrl: createAvatarUrl({ name, color }),
});

const toCard = (source) => ({
  id: source.id,
  title: source.title,
  summary: source.summary,
  coverUrl: createScreenshot(source, "title").url,
  resolution: { width: WIDTH, height: HEIGHT },
  languages: [...source.languages],
  releasedAt: NOVEMBER_1_2026 + 22 * DAY_MS - source.releasedDaysAgo * DAY_MS,
  creator: toCreator(source.creator),
});

const toTemplate = (source) => ({
  ...toCard(source),
  description: source.description.map((text) => ({ text })),
  screenshots: source.screens.map((screen) => createScreenshot(source, screen)),
  versionName: source.versionName,
  updatedAt: NOVEMBER_1_2026 + 22 * DAY_MS - source.updatedDaysAgo * DAY_MS,
});

const wait = (delayMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const createMockProjectTemplateClient = ({
  delayMs = MOCK_DELAY_MS,
  sources = TEMPLATE_SOURCES,
} = {}) => ({
  // Template cards, newest first, a page at a time. The cursor is the index of
  // the page's first card.
  async listProjectTemplates({ cursor } = {}) {
    await wait(delayMs);
    const start = cursor === undefined ? 0 : Number(cursor);
    const end = start + PAGE_LIMIT;
    return {
      templates: sources.slice(start, end).map(toCard),
      nextCursor: end < sources.length ? String(end) : undefined,
    };
  },

  // One template with its description and screenshots.
  async getProjectTemplateById({ templateId } = {}) {
    await wait(delayMs);
    const source = sources.find(({ id }) => id === templateId);
    if (!source) {
      throw new ProjectTemplateStoreError(
        "project_template_not_found",
        "The project template is no longer available.",
      );
    }
    return toTemplate(source);
  },
});
