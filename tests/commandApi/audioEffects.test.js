import { describe, expect, it, vi } from "vitest";
import { createCatalogResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/catalog.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const crossfade = {
  type: "audioEffect",
  name: "Crossfade",
  audioEffect: {
    type: "transition",
    prev: {
      fade: {
        initialValue: 90,
        delay: 0,
        duration: 600,
        easing: "easeInOutSine",
      },
    },
    next: {
      fade: {
        initialValue: 10,
        delay: 0,
        duration: 900,
        easing: "easeInOutSine",
      },
    },
  },
};

const createShared = () => {
  const context = {
    projectId: "project-1",
    state: {
      audioEffects: {
        items: {
          folder: { id: "folder", type: "folder", name: "Transitions" },
          crossfade: { id: "crossfade", ...crossfade },
        },
        tree: [
          {
            id: "folder",
            children: [{ id: "crossfade" }],
          },
        ],
      },
    },
  };
  return {
    context,
    shared: {
      ensureCommandContext: vi.fn().mockResolvedValue(context),
      ensureFilesExist: vi
        .fn()
        .mockResolvedValue({ valid: true, createdCount: 0 }),
      createId: vi.fn().mockReturnValue("generated-effect"),
      resolveResourceIndex: vi.fn().mockReturnValue(2),
      buildPlacementPayload: vi.fn(({ parentId, index }) => ({
        parentId: parentId ?? null,
        index,
      })),
      submitCommandWithContext: vi
        .fn()
        .mockResolvedValue({ valid: true, commandIds: ["command-1"] }),
      resourceTypePartitionFor: vi.fn().mockReturnValue("audio-effects"),
    },
  };
};

describe("audio effect command API", () => {
  it("submits schema-13 create and update commands to the audio-effects partition", async () => {
    const { context, shared } = createShared();
    const api = createCatalogResourceCommandApi(shared);

    await expect(
      api.createAudioEffect({
        audioEffectId: "effect-1",
        data: crossfade,
        parentId: "folder",
      }),
    ).resolves.toBe("effect-1");
    expect(shared.submitCommandWithContext).toHaveBeenNthCalledWith(1, {
      context,
      scope: "resources",
      basePartition: "audio-effects",
      type: COMMAND_TYPES.AUDIOEFFECT_CREATE,
      payload: {
        audioEffectId: "effect-1",
        data: crossfade,
        parentId: "folder",
        index: 2,
      },
    });

    const update = {
      type: "update",
      tween: {
        volume: {
          initialValue: 90,
          keyframes: [{ startValue: 75, value: 50, duration: 300 }],
        },
      },
    };
    await api.updateAudioEffect({
      audioEffectId: "effect-1",
      data: {
        preview: {
          outgoing: { soundId: "sound-a" },
          incoming: { soundId: "sound-b" },
        },
        audioEffect: update,
      },
    });
    expect(shared.submitCommandWithContext).toHaveBeenNthCalledWith(2, {
      context,
      scope: "resources",
      basePartition: "audio-effects",
      type: COMMAND_TYPES.AUDIOEFFECT_UPDATE,
      payload: {
        audioEffectId: "effect-1",
        data: {
          preview: {
            outgoing: { soundId: "sound-a" },
            incoming: { soundId: "sound-b" },
          },
          audioEffect: update,
        },
      },
    });
  });

  it("duplicates beside the source and strips persisted wrapper fields", async () => {
    const { context, shared } = createShared();
    const api = createCatalogResourceCommandApi(shared);

    await expect(
      api.duplicateAudioEffect({ audioEffectId: "crossfade" }),
    ).resolves.toBe("generated-effect");

    expect(shared.resolveResourceIndex).toHaveBeenCalledWith({
      state: context.state,
      resourceType: "audioEffects",
      parentId: "folder",
      position: "after",
      positionTargetId: "crossfade",
      index: undefined,
    });
    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "resources",
      basePartition: "audio-effects",
      type: COMMAND_TYPES.AUDIOEFFECT_CREATE,
      payload: {
        audioEffectId: "generated-effect",
        data: crossfade,
        parentId: "folder",
        index: 2,
      },
    });
  });

  it("submits move and batch-delete commands with audio effect ids", async () => {
    const { context, shared } = createShared();
    const api = createCatalogResourceCommandApi(shared);

    await api.moveAudioEffect({
      audioEffectId: "crossfade",
      parentId: undefined,
      position: "first",
    });
    expect(shared.submitCommandWithContext).toHaveBeenNthCalledWith(1, {
      context,
      scope: "resources",
      basePartition: "audio-effects",
      type: COMMAND_TYPES.AUDIOEFFECT_MOVE,
      payload: {
        audioEffectId: "crossfade",
        parentId: null,
        index: 2,
      },
    });

    await api.deleteAudioEffects({
      audioEffectIds: ["crossfade", "effect-2"],
    });
    expect(shared.submitCommandWithContext).toHaveBeenNthCalledWith(2, {
      context,
      scope: "resources",
      basePartition: "audio-effects",
      type: COMMAND_TYPES.AUDIOEFFECT_DELETE,
      payload: {
        audioEffectIds: ["crossfade", "effect-2"],
      },
    });
  });
});
