import {
  parseSpritesheetAnimationSelectionValue,
  toSpritesheetAnimationSelectionValue,
} from "../../internal/spritesheets.js";
import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";

const ROOT_GROUP_ID = "__root__";

export const createInitialState = () => ({
  selectedSpritesheetValue: undefined,
  spritesheets: { items: {}, tree: [] },
});

export const setSelectedSpritesheetValue = (
  { state },
  { selectedSpritesheetValue } = {},
) => {
  state.selectedSpritesheetValue = selectedSpritesheetValue;
};

export const setSpritesheets = ({ state }, { spritesheets } = {}) => {
  state.spritesheets = spritesheets;
};

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const animationName = (item.animationName ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  return (
    name.includes(searchQuery) ||
    animationName.includes(searchQuery) ||
    description.includes(searchQuery)
  );
};

const createAnimationItems = (spritesheet = {}, selectedSpritesheetValue) => {
  return Object.entries(spritesheet.animations ?? {}).map(
    ([animationName, animation]) => {
      const selectionValue = toSpritesheetAnimationSelectionValue(
        spritesheet.id,
        animationName,
      );
      const isSelected = selectionValue === selectedSpritesheetValue;
      const selectedInsetStyle = isSelected
        ? " box-shadow: inset 0 0 0 1px var(--color-pr);"
        : "";

      return {
        id: `${spritesheet.id}:${animationName}`,
        resourceId: spritesheet.id,
        animationName,
        selectionValue,
        name: `${spritesheet.name} / ${animationName}`,
        description: spritesheet.description,
        fileId: spritesheet.fileId,
        atlas: spritesheet.jsonData,
        animation,
        previewKey: `${selectionValue}:${spritesheet.fileId ?? ""}:${animation?.frames?.join(",") ?? ""}:${animation?.fps ?? animation?.animationSpeed ?? ""}`,
        itemBorderColor: isSelected ? "pr" : "bo",
        itemHoverBorderColor: isSelected ? "pr" : "ac",
        cardStyle: `max-width: 100%; box-sizing: border-box;${selectedInsetStyle}`,
      };
    },
  );
};

const createGroupViewData = (group, selectedSpritesheetValue, searchQuery) => {
  const children = group.children
    .filter((child) => child.type === "spritesheet")
    .flatMap((child) => createAnimationItems(child, selectedSpritesheetValue))
    .filter((child) => matchesSearch(child, searchQuery));

  return {
    ...group,
    children,
    hasChildren: children.length > 0,
    shouldDisplay: !searchQuery || children.length > 0,
  };
};

const createRootGroup = (spritesheets) => {
  const rootChildren = toFlatItems(spritesheets).filter(
    (item) => item.type === "spritesheet" && !item.parentId,
  );

  return {
    id: ROOT_GROUP_ID,
    fullLabel: "Spritesheets",
    type: "folder",
    children: rootChildren,
  };
};

export const selectViewData = ({ state, props = {} }) => {
  const spritesheets = state.spritesheets ?? { items: {}, tree: [] };
  const selectedSpritesheetValue =
    props.selectedSpritesheetValue ?? state.selectedSpritesheetValue;
  const searchQuery = (props.searchQuery ?? "").toLowerCase().trim();
  const { resourceId, animationName } = parseSpritesheetAnimationSelectionValue(
    selectedSpritesheetValue,
  );
  const groups = [createRootGroup(spritesheets), ...toFlatGroups(spritesheets)]
    .map((group) =>
      createGroupViewData(group, selectedSpritesheetValue, searchQuery),
    )
    .filter((group) => group.children.length > 0 || group.id !== ROOT_GROUP_ID)
    .filter((group) => group.shouldDisplay);

  return {
    groups,
    selectedSpritesheetValue,
    selectedResourceId: resourceId,
    selectedAnimationName: animationName,
  };
};
