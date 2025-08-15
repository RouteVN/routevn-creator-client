import { nanoid } from "nanoid";

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
    const dialogueBoxId = nanoid();
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
            wordWrapWidth: 400,
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
            wordWrapWidth: 1440,
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
  const createLayoutElements = (imageFileId) => {
    if (!imageFileId) {
      return {
        items: {},
        tree: [],
      };
    }

    const elementId = nanoid();
    return {
      items: {
        [elementId]: {
          type: "image",
          name: "Background",
          imageId: imageFileId,
          placement: "center",
        },
      },
      tree: [{ id: elementId }],
    };
  };

  return {
    tree: [
      {
        id: "default-layouts-group",
        children: [{ id: "simple-dialogue" }, { id: "choice-menu" }],
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
      "choice-menu": {
        type: "layout",
        name: "Simple Choice",
        layoutType: "choice",
        elements: createLayoutElements(imageFileIds["choice-bg.png"]),
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
});
