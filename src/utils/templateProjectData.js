import { nanoid } from "nanoid";

const dialogueBoxId = nanoid();

// Template Animations with correct structure
export const templateAnimations = {
  tree: [
    {
      id: "default-animations-group",
      children: [
        { id: "fade-in" },
        { id: "fade-out" },
        { id: "slide-in-left" },
        { id: "slide-in-right" },
        { id: "zoom-in" },
        { id: "rotate-in" },
        { id: "bounce" },
        { id: "shake" },
      ],
    },
  ],
  items: {
    "default-animations-group": {
      type: "folder",
      name: "Template Animations",
    },
    "fade-in": {
      type: "animation",
      name: "Fade In",
      duration: "1s",
      keyframes: 1,
      properties: {
        alpha: {
          initialValue: 0,
          keyframes: [
            {
              duration: 1000,
              value: 1,
              easing: "linear",
              relative: false,
            },
          ],
        },
      },
    },
    "fade-out": {
      type: "animation",
      name: "Fade Out",
      duration: "1s",
      keyframes: 1,
      properties: {
        alpha: {
          initialValue: 1,
          keyframes: [
            {
              duration: 1000,
              value: 0,
              easing: "linear",
              relative: false,
            },
          ],
        },
      },
    },
    "slide-in-left": {
      type: "animation",
      name: "Slide In From Left",
      duration: "0.5s",
      keyframes: 1,
      properties: {
        x: {
          initialValue: -200,
          keyframes: [
            {
              duration: 500,
              value: 960,
              easing: "easein",
              relative: false,
            },
          ],
        },
      },
    },
    "slide-in-right": {
      type: "animation",
      name: "Slide In From Right",
      duration: "0.5s",
      keyframes: 1,
      properties: {
        x: {
          initialValue: 2120,
          keyframes: [
            {
              duration: 500,
              value: 960,
              easing: "easein",
              relative: false,
            },
          ],
        },
      },
    },
    "zoom-in": {
      type: "animation",
      name: "Zoom In",
      duration: "0.5s",
      keyframes: 2,
      properties: {
        scaleX: {
          initialValue: 0,
          keyframes: [
            {
              duration: 500,
              value: 1,
              easing: "easein",
              relative: false,
            },
          ],
        },
        scaleY: {
          initialValue: 0,
          keyframes: [
            {
              duration: 500,
              value: 1,
              easing: "easein",
              relative: false,
            },
          ],
        },
      },
    },
    "rotate-in": {
      type: "animation",
      name: "Rotate In",
      duration: "0.5s",
      keyframes: 2,
      properties: {
        rotation: {
          initialValue: 0,
          keyframes: [
            {
              duration: 500,
              value: 360,
              easing: "linear",
              relative: false,
            },
          ],
        },
        alpha: {
          initialValue: 0,
          keyframes: [
            {
              duration: 500,
              value: 1,
              easing: "linear",
              relative: false,
            },
          ],
        },
      },
    },
    bounce: {
      type: "animation",
      name: "Bounce",
      duration: "1s",
      keyframes: 4,
      properties: {
        y: {
          initialValue: 540,
          keyframes: [
            {
              duration: 250,
              value: 500,
              easing: "easein",
              relative: false,
            },
            {
              duration: 250,
              value: 540,
              easing: "easein",
              relative: false,
            },
            {
              duration: 250,
              value: 520,
              easing: "easein",
              relative: false,
            },
            {
              duration: 250,
              value: 540,
              easing: "easein",
              relative: false,
            },
          ],
        },
      },
    },
    shake: {
      type: "animation",
      name: "Shake",
      duration: "0.5s",
      keyframes: 6,
      properties: {
        x: {
          initialValue: 960,
          keyframes: [
            {
              duration: 83,
              value: 970,
              easing: "linear",
              relative: false,
            },
            {
              duration: 83,
              value: 950,
              easing: "linear",
              relative: false,
            },
            {
              duration: 83,
              value: 970,
              easing: "linear",
              relative: false,
            },
            {
              duration: 83,
              value: 950,
              easing: "linear",
              relative: false,
            },
            {
              duration: 83,
              value: 970,
              easing: "linear",
              relative: false,
            },
            {
              duration: 85,
              value: 960,
              easing: "linear",
              relative: false,
            },
          ],
        },
      },
    },
  },
};

// Template Placements with correct structure
export const templatePlacements = {
  tree: [
    {
      id: "default-placements-group",
      children: [
        { id: "bottom-left" },
        { id: "bottom-center" },
        { id: "bottom-right" },
      ],
    },
  ],
  items: {
    "default-placements-group": {
      type: "folder",
      name: "Template Placements",
    },
    "bottom-left": {
      type: "placement",
      name: "Bottom Left",
      x: "300",
      y: "1080",
      scaleX: "1",
      scaleY: "1",
      anchorX: 0.5,
      anchorY: 1,
      rotation: "0",
    },
    "bottom-center": {
      type: "placement",
      name: "Bottom Center",
      x: "960",
      y: "1080",
      scaleX: "1",
      scaleY: "1",
      anchorX: 0.5,
      anchorY: 1,
      rotation: "0",
    },
    "bottom-right": {
      type: "placement",
      name: "Bottom Right",
      x: "1620",
      y: "1080",
      scaleX: "1",
      scaleY: "1",
      anchorX: 0.5,
      anchorY: 1,
      rotation: "0",
    },
  },
};

// Function to create template layouts with image and font references
const createTemplateLayouts = (imageFileIds = {}, fontFileIds = {}) => {
  // Helper to create simple dialogue layout with dialogue box, character name and content
  const createDialogueLayoutElements = () => {
    const containerId = nanoid();
    const characterNameId = nanoid();
    const dialogueContentId = nanoid();

    // Check if we have the sample font to apply typography
    const hasSampleFont = fontFileIds["sample_font.ttf"];

    return {
      items: {
        [containerId]: {
          type: "container",
          name: "Dialogue Container",
          x: 960,
          y: 1080,
          width: 1850,
          height: 350,
          anchorX: 0.5,
          anchorY: 1,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        [dialogueBoxId]: {
          type: "sprite",
          name: "Dialogue Box",
          x: 0,
          y: -36,
          width: 1850,
          height: 350,
          anchorX: 0.5,
          anchorY: 1,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          imageId: imageFileIds["dialogue_box.png"] || null,
        },
        [characterNameId]: {
          type: "text",
          name: "Character Name",
          x: -850,
          y: -360,
          width: 400,
          height: 40,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          contentType: "dialogue.character.name",
          text: "${dialogue.character.name}",
          typographyId: hasSampleFont ? "typography-character-name" : null,
          style: {
            wordWrapWidth: 600,
            align: "left",
          },
        },
        [dialogueContentId]: {
          type: "text",
          name: "Dialogue Content",
          x: -850,
          y: -275,
          width: 1440,
          height: 140,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          contentType: "dialogue.content",
          text: "${dialogue.content}",
          typographyId: hasSampleFont ? "typography-text-view" : null,
          style: {
            wordWrapWidth: 1700,
            align: "left",
          },
        },
      },
      tree: [
        {
          id: containerId,
          children: [
            { id: dialogueBoxId },
            { id: characterNameId },
            { id: dialogueContentId },
          ],
        },
      ],
    };
  };

  // Helper to create layout elements with image references
  const createChoiceLayoutElements = () => {
    const choiceListId = nanoid();
    const choiceContainer1Id = nanoid();
    const choiceContainer2Id = nanoid();
    const choiceContainer3Id = nanoid();
    const choiceContainer4Id = nanoid();
    const choiceContainer5Id = nanoid();
    const choiceContainer6Id = nanoid();
    const choiceBox1Id = nanoid();
    const choiceBox2Id = nanoid();
    const choiceBox3Id = nanoid();
    const choiceBox4Id = nanoid();
    const choiceBox5Id = nanoid();
    const choiceBox6Id = nanoid();
    const choiceText1Id = nanoid();
    const choiceText2Id = nanoid();
    const choiceText3Id = nanoid();
    const choiceText4Id = nanoid();
    const choiceText5Id = nanoid();
    const choiceText6Id = nanoid();

    return {
      items: {
        [choiceListId]: {
          type: "container",
          name: "Choice Container",
          x: 960,
          y: 400,
          width: 1920,
          height: 1080,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          direction: "vertical",
        },
        ...[
          choiceContainer1Id,
          choiceContainer2Id,
          choiceContainer3Id,
          choiceContainer4Id,
          choiceContainer5Id,
          choiceContainer6Id,
        ].reduce((acc, id, index) => {
          acc[id] = {
            type: "container",
            name: `Choice Container ${index + 1}`,
            x: 0,
            y: 0,
            width: 100,
            height: 120,
            anchorX: 0.5,
            anchorY: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            $when: `choice.items[${index}]`,
          };
          return acc;
        }, {}),
        ...[
          choiceBox1Id,
          choiceBox2Id,
          choiceBox3Id,
          choiceBox4Id,
          choiceBox5Id,
          choiceBox6Id,
        ].reduce((acc, id, index) => {
          acc[id] = {
            type: "sprite",
            name: `Choice Box ${index + 1}`,
            x: 0,
            y: 0,
            width: 1400,
            height: 100,
            anchorX: 0.5,
            anchorY: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            imageId: imageFileIds["choice_box.png"] || null,
            hoverImageId: imageFileIds["choice_box_activated.png"] || null,
          };
          return acc;
        }, {}),
        ...[
          choiceText1Id,
          choiceText2Id,
          choiceText3Id,
          choiceText4Id,
          choiceText5Id,
          choiceText6Id,
        ].reduce((acc, id, index) => {
          acc[id] = {
            type: "text",
            name: `Choice Text ${index + 1}`,
            x: 0,
            y: 0,
            width: 1300,
            height: 80,
            anchorX: 0.5,
            anchorY: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            contentType: `choice.items[${index}].content`,
            text: `\${choice.items[${index}].content}`,
            typographyId: fontFileIds["sample_font.ttf"]
              ? "typography-text-view"
              : null,
            style: {
              wordWrapWidth: 1300,
              align: "center",
            },
          };
          return acc;
        }, {}),
      },
      tree: [
        {
          id: choiceListId,
          children: [
            {
              id: choiceContainer1Id,
              children: [{ id: choiceBox1Id }, { id: choiceText1Id }],
            },
            {
              id: choiceContainer2Id,
              children: [{ id: choiceBox2Id }, { id: choiceText2Id }],
            },
            {
              id: choiceContainer3Id,
              children: [{ id: choiceBox3Id }, { id: choiceText3Id }],
            },
            {
              id: choiceContainer4Id,
              children: [{ id: choiceBox4Id }, { id: choiceText4Id }],
            },
            {
              id: choiceContainer5Id,
              children: [{ id: choiceBox5Id }, { id: choiceText5Id }],
            },
            {
              id: choiceContainer6Id,
              children: [{ id: choiceBox6Id }, { id: choiceText6Id }],
            },
          ],
        },
      ],
    };
  };

  return {
    tree: [
      {
        id: "default-layouts-group",
        children: [{ id: "simple-dialogue" }, { id: "simple-choice" }],
      },
    ],
    items: {
      "default-layouts-group": {
        type: "folder",
        name: "Template Layouts",
      },
      "simple-dialogue": {
        type: "layout",
        name: "Simple Dialogue",
        layoutType: "dialogue",
        elements: createDialogueLayoutElements(),
      },
      "simple-choice": {
        type: "layout",
        name: "Simple Choice",
        layoutType: "choice",
        elements: createChoiceLayoutElements(),
      },
    },
  };
};

// Template Colors with correct structure
export const templateColors = {
  tree: [
    {
      id: "default-colors-group",
      children: [{ id: "color-white" }, { id: "color-black" }],
    },
  ],
  items: {
    "default-colors-group": {
      type: "folder",
      name: "Common Colors",
    },
    "color-white": {
      type: "color",
      name: "White",
      hex: "#FFFFFF",
    },
    "color-black": {
      type: "color",
      name: "Black",
      hex: "#000000",
    },
  },
};

// Function to create empty template fonts structure
// Actual fonts are loaded directly in setup.js
const createTemplateFonts = () => {
  return {
    tree: [],
    items: {},
  };
};

// Template Typography with correct structure
const createTemplateTypography = (fontFileIds = {}) => {
  // Create typography even without custom font - will use system fonts
  return {
    tree: [
      {
        id: "default-typography-group",
        children: [
          { id: "typography-character-name" },
          { id: "typography-text-view" },
        ],
      },
    ],
    items: {
      "default-typography-group": {
        type: "folder",
        name: "Template Typography",
      },
      "typography-character-name": {
        type: "typography",
        name: "Character Name",
        fontSize: 48,
        lineHeight: 1.5,
        colorId: "color-white",
        fontId: null, // Will use default system font
        fontWeight: "400",
        previewText: "Character Name",
      },
      "typography-text-view": {
        type: "typography",
        name: "Text View",
        fontSize: 36,
        lineHeight: 1.5,
        colorId: "color-white",
        fontId: null, // Will use default system font
        fontWeight: "400",
        previewText: "Text View",
      },
    },
  };
};

// Template Scenes with default Prologue scene
export const templateScenes = () => {
  const stepId = nanoid();
  const sectionId = nanoid();

  // Create presentation object with dialogue layout if found
  const presentation = {
    dialogue: {
      layoutId: "simple-dialogue",
    },
  };

  // Create items object with first line having presentation, rest with empty presentation
  const lineItems = {
    [stepId]: {
      presentation: presentation,
    },
  };

  const additionalLineIds = Array.from({ length: 31 }, () => nanoid());

  // Add 31 lines with empty presentation
  additionalLineIds.forEach((lineId) => {
    lineItems[lineId] = {
      presentation: {},
    };
  });

  // Create tree array with all line IDs in order
  const lineTree = [{ id: stepId }, ...additionalLineIds.map((id) => ({ id }))];

  return {
    tree: [
      {
        id: "default-scenes-folder",
        children: [{ id: "scene-prologue" }],
      },
    ],
    items: {
      "default-scenes-folder": {
        type: "folder",
        name: "Scenes",
      },
      "scene-prologue": {
        type: "scene",
        name: "Prologue",
        createdAt: new Date().toISOString(),
        position: {
          x: 0,
          y: 0,
        },
        sections: {
          items: {
            [sectionId]: {
              name: "Section New",
              lines: {
                items: lineItems,
                tree: lineTree,
              },
            },
          },
          tree: [
            {
              id: sectionId,
            },
          ],
        },
      },
    },
  };
};

// Template structure for pages with empty folders
export const createEmptyPageStructure = (pageName) => ({
  tree: [
    {
      id: `default-${pageName}-folder`,
      children: [],
    },
  ],
  items: {
    [`default-${pageName}-folder`]: {
      type: "folder",
      name: "Default " + pageName.charAt(0).toUpperCase() + pageName.slice(1),
    },
  },
});

// Function to create template project data
export const createTemplateProjectData = (
  imageFileIds = {},
  fontFileIds = {},
) => ({
  animations: templateAnimations,
  placements: templatePlacements,
  layouts: createTemplateLayouts(imageFileIds, fontFileIds),
  colors: templateColors,
  fonts: createTemplateFonts(),
  typography: createTemplateTypography(fontFileIds),
  scenes: templateScenes(),
  audio: createEmptyPageStructure("audio"),
  videos: createEmptyPageStructure("videos"),
  characters: createEmptyPageStructure("characters"),
});
