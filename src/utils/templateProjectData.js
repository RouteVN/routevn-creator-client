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
        { id: "center" },
        { id: "top-left" },
        { id: "top-right" },
        { id: "bottom-left" },
        { id: "bottom-right" },
        { id: "bottom-center" },
        { id: "left-center" },
        { id: "right-center" },
      ],
    },
  ],
  items: {
    "default-placements-group": {
      type: "folder",
      name: "Template Placements",
    },
    center: {
      type: "placement",
      name: "Center",
      x: "960",
      y: "540",
      scaleX: "1",
      scaleY: "1",
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: "0",
    },
    "top-left": {
      type: "placement",
      name: "Top Left",
      x: "100",
      y: "100",
      scaleX: "1",
      scaleY: "1",
      anchorX: 0,
      anchorY: 0,
      rotation: "0",
    },
    "top-right": {
      type: "placement",
      name: "Top Right",
      x: "1820",
      y: "100",
      scaleX: "1",
      scaleY: "1",
      anchorX: 1,
      anchorY: 0,
      rotation: "0",
    },
    "bottom-left": {
      type: "placement",
      name: "Bottom Left",
      x: "100",
      y: "980",
      scaleX: "1",
      scaleY: "1",
      anchorX: 0,
      anchorY: 1,
      rotation: "0",
    },
    "bottom-right": {
      type: "placement",
      name: "Bottom Right",
      x: "1820",
      y: "980",
      scaleX: "1",
      scaleY: "1",
      anchorX: 1,
      anchorY: 1,
      rotation: "0",
    },
    "bottom-center": {
      type: "placement",
      name: "Bottom Center",
      x: "960",
      y: "980",
      scaleX: "1",
      scaleY: "1",
      anchorX: 0.5,
      anchorY: 1,
      rotation: "0",
    },
    "left-center": {
      type: "placement",
      name: "Left Center",
      x: "100",
      y: "540",
      scaleX: "1",
      scaleY: "1",
      anchorX: 0,
      anchorY: 0.5,
      rotation: "0",
    },
    "right-center": {
      type: "placement",
      name: "Right Center",
      x: "1820",
      y: "540",
      scaleX: "1",
      scaleY: "1",
      anchorX: 1,
      anchorY: 0.5,
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

    return {
      items: {
        [containerId]: {
          type: "container",
          name: "Dialogue Container",
          x: 960,
          y: 850,
          width: 1600,
          height: 250,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        [dialogueBoxId]: {
          type: "sprite",
          name: "Dialogue Box",
          x: 0,
          y: 0,
          width: 1600,
          height: 250,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          imageId: imageFileIds["dialogue_box.png"] || null,
        },
        [characterNameId]: {
          type: "text",
          name: "Character Name",
          x: 80,
          y: 30,
          width: 400,
          height: 40,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          contentType: "dialogue.character.name",
          text: "${dialogue.character.name}",
          style: {
            wordWrapWidth: 400,
            align: "left",
          },
        },
        [dialogueContentId]: {
          type: "text",
          name: "Dialogue Content",
          x: 80,
          y: 80,
          width: 1440,
          height: 140,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          contentType: "dialogue.content",
          text: "${dialogue.content}",
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

// Function to create template project data
export const createTemplateProjectData = (
  imageFileIds = {},
  fontFileIds = {},
) => ({
  animations: templateAnimations,
  placements: templatePlacements,
  layouts: createTemplateLayouts(imageFileIds, fontFileIds),
});
