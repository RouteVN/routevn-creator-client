import { toVariableConditionTarget } from "../../../internal/layoutConditions.js";
import { toRuntimeConditionTarget } from "../../../internal/runtimeFields.js";

const isPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const getDialogueText = (dialogue = {}) => {
  return dialogue?.content?.[0]?.text ?? "";
};

const getDialogueLines = (dialogue = {}) => {
  return Array.isArray(dialogue?.lines) ? dialogue.lines : [];
};

const getChoiceItems = (choice = {}) => {
  return Array.isArray(choice?.items) ? choice.items : [];
};

const getHistoryLines = (historyDialogue) => {
  return Array.isArray(historyDialogue) ? historyDialogue : [];
};

const toSlotIndex = (slot, fallbackIndex) => {
  const slotId = Number(slot?.slotId);
  if (Number.isFinite(slotId) && slotId > 0) {
    return Math.trunc(slotId) - 1;
  }

  return fallbackIndex;
};

export const normalizePersistedPreviewData = (previewData) => {
  if (!isPlainObject(previewData)) {
    return {};
  }

  return structuredClone(previewData);
};

export const createPersistedPreviewState = (previewData) => {
  const normalizedPreviewData = normalizePersistedPreviewData(previewData);
  const dialogue = normalizedPreviewData.dialogue ?? {};
  const dialogueLines = getDialogueLines(dialogue);
  const historyDialogue = getHistoryLines(
    normalizedPreviewData.historyDialogue,
  );
  const choiceItems = getChoiceItems(normalizedPreviewData.choice);
  const saveSlots = Array.isArray(normalizedPreviewData.saveSlots)
    ? normalizedPreviewData.saveSlots
    : [];
  const previewVariableValues = {};

  for (const [variableId, value] of Object.entries(
    normalizedPreviewData.variables ?? {},
  )) {
    const target = toVariableConditionTarget(variableId);
    if (!target) {
      continue;
    }
    previewVariableValues[target] = value;
  }

  for (const [runtimeId, value] of Object.entries(
    normalizedPreviewData.runtime ?? {},
  )) {
    const target = toRuntimeConditionTarget(runtimeId);
    if (!target) {
      continue;
    }
    previewVariableValues[target] = value;
  }

  let maxSlotIndex = -1;
  const saveImageIds = [];
  const saveDates = [];

  saveSlots.forEach((slot, fallbackIndex) => {
    const slotIndex = toSlotIndex(slot, fallbackIndex);
    if (slotIndex < 0) {
      return;
    }

    maxSlotIndex = Math.max(maxSlotIndex, slotIndex);
    saveImageIds[slotIndex] = slot?.image;
    saveDates[slotIndex] =
      slot?.date ??
      slot?.saveDate ??
      (Number.isFinite(Number(slot?.savedAt))
        ? new Date(Number(slot.savedAt)).toISOString()
        : "");
  });

  const slotCount = maxSlotIndex + 1;
  for (let index = 0; index < slotCount; index += 1) {
    if (!Object.hasOwn(saveImageIds, index)) {
      saveImageIds[index] = undefined;
    }

    if (!Object.hasOwn(saveDates, index)) {
      saveDates[index] = "";
    }
  }

  return {
    dialogueDefaultValues: isPlainObject(normalizedPreviewData.dialogue)
      ? {
          "dialogue-character-id": dialogue?.characterId ?? "",
          "dialogue-custom-character-name":
            typeof dialogue?.character?.name === "string" &&
            dialogue.character.name.length > 0,
          "dialogue-character-name": dialogue?.character?.name ?? "",
          "dialogue-content": getDialogueText(dialogue),
          "dialogue-auto-mode":
            normalizedPreviewData.runtime?.autoMode ?? false,
          "dialogue-skip-mode":
            normalizedPreviewData.runtime?.skipMode ?? false,
          "dialogue-is-line-completed":
            normalizedPreviewData.runtime?.isLineCompleted ?? false,
        }
      : undefined,
    nvlDefaultValues:
      dialogueLines.length > 0
        ? {
            linesNum: dialogueLines.length,
            characterNames: dialogueLines.map(
              (line) => line?.characterName ?? "",
            ),
            lines: dialogueLines.map((line, index) => {
              return line?.content?.[0]?.text ?? `Line ${index + 1}`;
            }),
          }
        : undefined,
    previewRevealingSpeed: normalizedPreviewData.runtime?.dialogueTextSpeed,
    choiceDefaultValues:
      normalizedPreviewData.choice !== undefined
        ? {
            choicesNum: choiceItems.length,
            choices: choiceItems.map((item) => item?.content ?? ""),
          }
        : undefined,
    historyDefaultValues:
      normalizedPreviewData.historyDialogue !== undefined
        ? {
            linesNum: historyDialogue.length,
            characterNames: historyDialogue.map(
              (line) => line?.characterName ?? "",
            ),
            texts: historyDialogue.map((line) => line?.text ?? ""),
          }
        : undefined,
    saveLoadDefaultValues:
      saveSlots.length > 0
        ? {
            slotsNum: slotCount,
            saveImageIds,
            saveDates,
          }
        : undefined,
    previewVariableValues,
    previewBackgroundImageId:
      typeof normalizedPreviewData.backgroundImageId === "string" &&
      normalizedPreviewData.backgroundImageId.length > 0
        ? normalizedPreviewData.backgroundImageId
        : undefined,
  };
};
