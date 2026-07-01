import { toFlatGroups } from "../../internal/project/tree.js";
import { prependRootItemsGroup } from "../../internal/ui/resourcePages/rootGroups.js";

export const createInitialState = () => ({
  selectedSoundId: undefined,
  sounds: { items: {}, tree: [] },
});

export const selectSelectedSoundId = ({ state }) => {
  return state.selectedSoundId;
};

export const setSelectedSoundId = ({ state }, { soundId } = {}) => {
  state.selectedSoundId = soundId;
};

export const selectSounds = ({ state }) => {
  return state.sounds;
};

export const setSounds = ({ state }, { sounds } = {}) => {
  state.sounds = sounds;
};

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  return name.includes(searchQuery) || description.includes(searchQuery);
};

export const selectViewData = ({ state, props = {} }) => {
  const sounds = state.sounds ?? { items: {}, tree: [] };
  const selectedSoundId = state.selectedSoundId;
  const searchQuery = (props.searchQuery ?? "").toLowerCase().trim();
  const sourceGroups = prependRootItemsGroup({
    data: sounds,
    groups: toFlatGroups(sounds),
    label: "Sounds",
  });

  const groups = sourceGroups
    .map((group) => {
      const children = group.children
        .filter((child) => child.type === "sound")
        .filter((child) => matchesSearch(child, searchQuery))
        .map((child) => {
          const isSelected = child.id === selectedSoundId;
          const itemBorderColor = isSelected ? "pr" : "bo";
          const itemHoverBorderColor = isSelected ? "pr" : "ac";
          const selectedSoundInsetStyle = isSelected
            ? " box-shadow: inset 0 0 0 1px var(--color-pr);"
            : "";
          const soundCardStyle = `max-width: 100%; box-sizing: border-box;${selectedSoundInsetStyle}`;

          return {
            ...child,
            itemBorderColor,
            itemHoverBorderColor,
            soundCardStyle,
          };
        });

      return {
        ...group,
        children,
        hasChildren: children.length > 0,
        shouldDisplay: !searchQuery || children.length > 0,
      };
    })
    .filter((group) => group.hasChildren && group.shouldDisplay);

  return {
    groups,
    selectedSoundId,
  };
};
