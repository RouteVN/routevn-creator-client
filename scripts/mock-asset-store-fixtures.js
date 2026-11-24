// Project templates the mock asset store serves, in the shapes the asset
// store API answers: rows of `{id, data}` with a creator, file IDs in `data`,
// rich-text descriptions, and epoch-millisecond dates. Every image is an SVG
// drawn here, served by the mock under its file ID.

import { createHash } from "node:crypto";

const WIDTH = 1920;
const HEIGHT = 1080;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// A 16-character Base62 ID, as the API's, the same for the same name on every
// run so links to a template keep working while the mock restarts.
const stableId = (name) =>
  [...createHash("sha256").update(name).digest()]
    .slice(0, 16)
    .map((byte) => BASE62[byte % 62])
    .join("");

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

const svg = (body, { width = WIDTH, height = HEIGHT } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;

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
  title: drawTitle,
  dialogue: drawDialogue,
  choices: drawChoices,
  menu: drawMenu,
};

const drawAvatar = ({ name, color }) => {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2);
  return svg(
    `<rect width="96" height="96" fill="${color}"/><text x="48" y="60" font-size="36" font-family="sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(initials)}</text>`,
    { width: 96, height: 96 },
  );
};

const CREATORS = [
  { key: "studio-one", name: "Studio One", color: "#c2185b" },
  { key: "studio-two", name: "Studio Two", color: "#1565c0" },
  { key: "studio-three", name: "Studio Three", color: "#2e7d32" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const NOVEMBER_23_2026 = Date.UTC(2026, 10, 23);

// Paragraphs; a line starting with "• " is an item of the list it is in.
const TEMPLATE_SOURCES = [
  {
    key: "classic-romance",
    title: "Classic Romance",
    summary:
      "A sweet love story starter with affection points and three endings.",
    creator: "studio-one",
    languages: ["en", "ja"],
    creatorModelSchema: 21,
    versionName: "1.2.0",
    releaseNotes: "Adds a third ending.",
    listedDaysAgo: 3,
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
    key: "night-mystery",
    title: "Night Mystery",
    summary:
      "Investigate a case with clues, a notebook and branching accusations.",
    creator: "studio-two",
    languages: ["en"],
    creatorModelSchema: 21,
    versionName: "2.0.1",
    releaseNotes: "",
    listedDaysAgo: 9,
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
    descriptionImage: "menu",
    description: [
      "A detective story starter set at night. Collect clues as you talk to suspects, then choose who to accuse.",
      "Each clue is a variable, so the accusation scene can check what the player has found.",
      "• A notebook screen that lists the clues found so far",
      "• Three suspects, each with their own interview scene",
      "• Endings for a right and a wrong accusation",
    ],
  },
  {
    key: "fantasy-quest",
    title: "Fantasy Quest",
    summary:
      "An adventure across a magical kingdom, with a map and party members.",
    creator: "studio-three",
    languages: ["en", "es", "fr"],
    creatorModelSchema: 21,
    versionName: "1.0.0",
    releaseNotes: "",
    listedDaysAgo: 15,
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
    key: "school-days",
    title: "School Days",
    summary:
      "Slice of life at school, with a calendar of days and club activities.",
    creator: "studio-one",
    languages: ["en", "ja", "zh-Hans", "ko"],
    creatorModelSchema: 21,
    versionName: "1.4.0",
    releaseNotes: "",
    listedDaysAgo: 22,
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
    key: "haunted-house",
    title: "Haunted House",
    summary: "A horror story starter with tense music cues and a sanity meter.",
    creator: "studio-two",
    languages: ["en"],
    creatorModelSchema: 21,
    versionName: "1.1.0",
    releaseNotes: "",
    listedDaysAgo: 31,
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
    key: "space-station",
    title: "Space Station",
    summary:
      "Science fiction aboard a station in orbit, with a ship's computer narrator.",
    creator: "studio-three",
    languages: ["en", "ru"],
    creatorModelSchema: 21,
    versionName: "0.9.0",
    releaseNotes: "",
    listedDaysAgo: 40,
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
    key: "kinetic-novel",
    title: "Kinetic Novel",
    summary:
      "A story without choices, with text filling the screen like a book.",
    creator: "studio-one",
    languages: ["en", "ja"],
    resolution: { width: 1280, height: 720 },
    creatorModelSchema: 20,
    versionName: "1.0.0",
    releaseNotes: "",
    listedDaysAgo: 55,
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
  {
    // Written with a newer Creator model than any released app: a Creator
    // that sends its own schema never lists it.
    key: "future-template",
    title: "Future Template",
    summary: "Needs a newer RouteVN Creator than this one.",
    creator: "studio-three",
    languages: ["en"],
    creatorModelSchema: 99,
    versionName: "1.0.0",
    releaseNotes: "",
    listedDaysAgo: 1,
    updatedDaysAgo: 1,
    palette: {
      sky: ["#2b2d42", "#8d99ae"],
      ground: "#2b2d42",
      accent: "#ef233c",
      figure: "#000000",
      box: "#edf2f4",
      text: "#2b2d42",
      title: "#edf2f4",
    },
    screens: ["title"],
    description: ["Listed only for a Creator with model schema 99 or later."],
  },
];

const run = (text) => ({ text, marks: [], link: null });

// Rich text as the API answers it: paragraphs, and consecutive "• " lines as
// one list. An image block names its file by ID.
const toDescription = (lines, image) => {
  const blocks = [];
  for (const line of lines) {
    if (line.startsWith("• ")) {
      const last = blocks.at(-1);
      const item = { children: [run(line.slice(2))] };
      if (last?.type === "LIST") last.items.push(item);
      else blocks.push({ type: "LIST", items: [item] });
    } else {
      blocks.push({ type: "PARAGRAPH", children: [run(line)] });
    }
  }
  if (image) {
    blocks.push({
      type: "IMAGE",
      fileId: image.fileId,
      alt: image.alt,
      width: WIDTH,
      height: HEIGHT,
    });
  }
  return blocks;
};

// The mock's templates, newest first, their creators, and an SVG for every
// file ID they name.
export const createMockAssetStoreFixtures = ({
  now = NOVEMBER_23_2026,
} = {}) => {
  const files = new Map();
  const creators = new Map();
  for (const source of CREATORS) {
    const creator = {
      id: stableId(`creator:${source.key}`),
      name: source.name,
      avatarFileId: stableId(`creator:${source.key}:avatar`),
    };
    files.set(creator.avatarFileId, drawAvatar(source));
    creators.set(source.key, creator);
  }

  const templates = TEMPLATE_SOURCES.map((source) => {
    const screenshotFileIds = source.screens.map((screen) => {
      const fileId = stableId(`template:${source.key}:${screen}`);
      files.set(fileId, svg(SCREENS[screen](source.palette, source.title)));
      return fileId;
    });
    let image;
    if (source.descriptionImage) {
      image = {
        fileId:
          screenshotFileIds[source.screens.indexOf(source.descriptionImage)],
        alt: "The notebook screen",
      };
    }
    const creator = creators.get(source.creator);
    return {
      id: stableId(`template:${source.key}`),
      creator,
      data: {
        title: source.title,
        summary: source.summary,
        coverFileId: screenshotFileIds[0],
        screenshotFileIds,
        languages: source.languages,
        resolution: source.resolution ?? { width: WIDTH, height: HEIGHT },
        creatorModelSchema: source.creatorModelSchema,
        pricing: { type: "FREE" },
        listedAt: now - source.listedDaysAgo * DAY_MS,
        description: toDescription(source.description, image),
        versionName: source.versionName,
        releaseNotes: source.releaseNotes,
        lastUpdatedAt: now - source.updatedDaysAgo * DAY_MS,
        // The package's size and directory are the built package's; see
        // mock-asset-store-packages.js.
        package: { fileId: stableId(`template:${source.key}:package`) },
      },
    };
  }).sort(
    (left, right) =>
      right.data.listedAt - left.data.listedAt || (left.id < right.id ? -1 : 1),
  );

  return { templates, files };
};
