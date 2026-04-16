import { toFlatItems } from "../../../internal/project/tree.js";
import { isFragmentLayout } from "../../../internal/project/layout.js";

export const getFragmentLayoutItems = (
  layoutsData = { items: {}, tree: [] },
  { excludeLayoutId } = {},
) => {
  return toFlatItems(layoutsData)
    .filter(
      (item) =>
        item?.type === "layout" &&
        isFragmentLayout(item) &&
        item?.id !== excludeLayoutId,
    )
    .sort((left, right) =>
      String(left.name || left.id).localeCompare(
        String(right.name || right.id),
      ),
    );
};

export const getFragmentLayoutOptions = (
  layoutsData = { items: {}, tree: [] },
  options = {},
) => {
  return getFragmentLayoutItems(layoutsData, options).map((item) => ({
    label: item.name || item.id,
    value: item.id,
  }));
};
