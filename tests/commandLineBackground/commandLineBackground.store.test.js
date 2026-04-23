import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setRepositoryState,
  setSelectedAnimationMode,
  setSelectedResource,
  setSelectedTransform,
} from "../../src/components/commandLineBackground/commandLineBackground.store.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

describe("commandLineBackground.store", () => {
  it("hides playback continuity when animation mode is none", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        images: {
          items: {
            "bg-school": {
              id: "bg-school",
              type: "image",
              name: "School",
              fileId: "file-school",
            },
          },
          tree: [{ id: "bg-school" }],
        },
        layouts: createEmptyCollection(),
        videos: createEmptyCollection(),
        animations: createEmptyCollection(),
        transforms: {
          items: {
            "bg-center": {
              id: "bg-center",
              type: "transform",
              name: "Center",
            },
          },
          tree: [{ id: "bg-center" }],
        },
      },
    );
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setSelectedTransform(
      { state },
      {
        transformId: "bg-center",
      },
    );
    const viewData = selectViewData({ state });
    const transformField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "transformId",
    );
    const continuityField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "playbackContinuity",
    );

    expect(transformField).toMatchObject({
      label: "Transform",
      type: "select",
      clearable: true,
      placeholder: "Select transform",
      options: [
        {
          value: "bg-center",
          label: "Center",
        },
      ],
    });
    expect(continuityField).toBeUndefined();
    expect(viewData.dialogueForm.defaultValues.transformId).toBe("bg-center");
    expect(viewData.dialogueForm.defaultValues.playbackContinuity).toBe(
      "render",
    );
  });

  it("shows playback continuity with render first when animation mode is active", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        images: {
          items: {
            "bg-school": {
              id: "bg-school",
              type: "image",
              name: "School",
              fileId: "file-school",
            },
          },
          tree: [{ id: "bg-school" }],
        },
        layouts: createEmptyCollection(),
        videos: createEmptyCollection(),
        animations: createEmptyCollection(),
        transforms: {
          items: {
            "bg-center": {
              id: "bg-center",
              type: "transform",
              name: "Center",
            },
          },
          tree: [{ id: "bg-center" }],
        },
      },
    );
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setSelectedTransform(
      { state },
      {
        transformId: "bg-center",
      },
    );
    setSelectedAnimationMode(
      { state },
      {
        mode: "update",
      },
    );

    const viewData = selectViewData({ state });
    const continuityField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "playbackContinuity",
    );

    expect(continuityField).toMatchObject({
      label: "Playback Continuity",
      type: "segmented-control",
      clearable: false,
      options: [
        {
          value: "render",
          label: "Render",
        },
        {
          value: "persistent",
          label: "Persistent",
        },
      ],
    });
    expect(viewData.dialogueForm.defaultValues.transformId).toBe("bg-center");
    expect(viewData.dialogueForm.defaultValues.playbackContinuity).toBe(
      "render",
    );
  });
});
