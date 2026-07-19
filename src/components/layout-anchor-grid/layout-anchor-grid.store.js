const anchorsMatch = (left, right) =>
  left?.x === right?.x && left?.y === right?.y;

export const createInitialState = () => ({});

export const selectViewData = ({ props }) => {
  const options = props.options ?? [];
  const selectedIndex = options.findIndex((option) =>
    anchorsMatch(option.value, props.value),
  );
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

  return {
    label: props.label ?? "Anchor",
    cells: options.map((option, index) => ({
      index,
      isSelected: index === selectedIndex,
      label: option.label,
      tabIndex: index === tabbableIndex ? 0 : -1,
      value: option.value,
    })),
  };
};
