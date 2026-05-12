import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setRepositoryState,
  setSelectedAnimation,
  setSelectedResource,
  setSelectedTransform,
} from "../../src/components/commandLineBackground/commandLineBackground.store.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

describe("commandLineBackground.store", () => {
  it("uses a clearable animation select with type suffix text", () => {
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
        animations: {
          items: {
            "bg-pan": {
              id: "bg-pan",
              type: "animation",
              name: "Pan",
              animation: {
                type: "update",
              },
            },
            "bg-fade": {
              id: "bg-fade",
              type: "animation",
              name: "Fade",
              animation: {
                type: "transition",
              },
            },
          },
          tree: [{ id: "bg-pan" }, { id: "bg-fade" }],
        },
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
    const animationField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "animationId",
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
    expect(animationField).toMatchObject({
      label: "Animation",
      type: "select",
      clearable: true,
      placeholder: "Select animation",
      options: [
        {
          value: "bg-pan",
          label: "Pan",
          suffixText: "Update",
        },
        {
          value: "bg-fade",
          label: "Fade",
          suffixText: "Transition",
        },
      ],
    });
    expect(continuityField).toBeUndefined();
    expect(viewData.dialogueForm.defaultValues.transformId).toBe("bg-center");
    expect(viewData.dialogueForm.defaultValues.animationId).toBeUndefined();
    expect(viewData.dialogueForm.defaultValues.playbackContinuity).toBe(
      "render",
    );
  });

  it("shows playback continuity when an animation is selected", () => {
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
        animations: {
          items: {
            "bg-pan": {
              id: "bg-pan",
              type: "animation",
              name: "Pan",
              animation: {
                type: "update",
              },
            },
          },
          tree: [{ id: "bg-pan" }],
        },
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
    setSelectedAnimation(
      { state },
      {
        animationId: "bg-pan",
      },
    );

    const viewData = selectViewData({ state });
    const animationField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "animationId",
    );
    const continuityField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "playbackContinuity",
    );

    expect(animationField).toMatchObject({
      type: "select",
      clearable: true,
      options: [
        {
          value: "bg-pan",
          label: "Pan",
          suffixText: "Update",
        },
      ],
    });
    expect(continuityField).toMatchObject({
      name: "playbackContinuity",
      label: "Playback",
      type: "segmented-control",
      options: [
        {
          label: "Single Line",
          value: "render",
        },
        {
          label: "Persistent",
          value: "persistent",
        },
      ],
    });
    expect(viewData.dialogueForm.defaultValues.transformId).toBe("bg-center");
    expect(viewData.dialogueForm.defaultValues.animationId).toBe("bg-pan");
    expect(viewData.dialogueForm.defaultValues.playbackContinuity).toBe(
      "render",
    );
  });
});
