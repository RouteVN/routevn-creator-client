import assert from "node:assert/strict";
import {
  findResourceSceneUsage,
  formatResourceSceneUsage,
  createUsedInDetailField,
} from "../src/internal/resourceSceneUsage.js";

const mockScenes = {
  items: {
    "folder-1": {
      id: "folder-1",
      name: "Act 1",
      type: "folder",
    },
    "scene-intro": {
      id: "scene-intro",
      name: "Prologue",
      type: "scene",
      sections: {
        items: {
          "sec-1": {
            id: "sec-1",
            name: "Opening",
            lines: {
              items: {
                "line-1": {
                  id: "line-1",
                  actions: {
                    background: { resourceId: "bg_classroom" },
                    bgm: { resourceId: "bgm_peaceful" },
                    character: {
                      characterId: "char_alice",
                      spriteId: "spr_alice_happy",
                    },
                  },
                  text: "Welcome to school! My affection is ${var_alice_affection}.",
                },
              },
            },
          },
        },
      },
    },
    "scene-ch1": {
      id: "scene-ch1",
      name: "Chapter 1",
      type: "scene",
      sections: {
        items: {
          "sec-2": {
            id: "sec-2",
            name: "Morning",
            lines: {
              items: {
                "line-2": {
                  id: "line-2",
                  actions: {
                    bgm: { resourceId: "bgm_peaceful" },
                    video: { resourceId: "vid_intro" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "scene-ch2": {
      id: "scene-ch2",
      name: "Chapter 2",
      type: "scene",
      sections: {
        items: {
          "sec-3": {
            id: "sec-3",
            name: "Afternoon",
            lines: {
              items: {
                "line-3": {
                  id: "line-3",
                  actions: {
                    bgm: { resourceId: "bgm_peaceful" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// 1. Unused resource
const unused = findResourceSceneUsage({
  scenes: mockScenes,
  itemId: "unused_item",
});
assert.deepEqual(unused, []);
assert.equal(formatResourceSceneUsage(unused), "None");

// 2. Resource used in 1 scene
const bgUsage = findResourceSceneUsage({
  scenes: mockScenes,
  itemId: "bg_classroom",
});
assert.equal(bgUsage.length, 1);
assert.equal(bgUsage[0].name, "Prologue");
assert.equal(formatResourceSceneUsage(bgUsage), "Prologue");

// 3. Resource used in 2 scenes
const vidUsage = findResourceSceneUsage({
  scenes: mockScenes,
  itemId: "vid_intro",
});
assert.equal(vidUsage.length, 1);
assert.equal(formatResourceSceneUsage(vidUsage), "Chapter 1");

// 4. Resource used in 3 scenes
const bgmUsage = findResourceSceneUsage({
  scenes: mockScenes,
  itemId: "bgm_peaceful",
});
assert.equal(bgmUsage.length, 3);
assert.equal(formatResourceSceneUsage(bgmUsage), "Prologue, Chapter 1, +1 more");

// 5. Character with sprite ID
const charUsage = findResourceSceneUsage({
  scenes: mockScenes,
  itemId: "char_alice",
  additionalItemIds: ["spr_alice_happy"],
});
assert.equal(charUsage.length, 1);
assert.equal(charUsage[0].name, "Prologue");

// 6. Variable referenced in dialogue text template
const varUsage = findResourceSceneUsage({
  scenes: mockScenes,
  itemId: "var_alice_affection",
});
assert.equal(varUsage.length, 1);
assert.equal(varUsage[0].name, "Prologue");

// 7. createUsedInDetailField
const detailField = createUsedInDetailField({
  scenes: mockScenes,
  itemId: "bg_classroom",
  copy: { usedInLabel: "Used In" },
});
assert.deepEqual(detailField, {
  type: "text",
  label: "Used In",
  value: "Prologue",
});

console.log("PASS: resourceSceneUsage tests passed!");
