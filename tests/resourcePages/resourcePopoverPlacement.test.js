import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  handleTagFilterButtonClick as handleCatalogFilterClick,
  handleZoomButtonClick as handleCatalogZoomClick,
} from "../../src/components/catalogResourcesView/catalogResourcesView.handlers.js";
import { handleTagFilterButtonClick as handleCharactersFilterClick } from "../../src/components/charactersResourcesView/charactersResourcesView.handlers.js";
import { handleTagFilterButtonClick as handleVariablesFilterClick } from "../../src/components/groupVariablesView/groupVariablesView.handlers.js";
import {
  handleTagFilterButtonClick as handleMediaFilterClick,
  handleZoomButtonClick as handleMediaZoomClick,
} from "../../src/components/mediaResourcesView/mediaResourcesView.handlers.js";
import {
  handleTagFilterButtonClick as handleTextStyleFilterClick,
  handleZoomButtonClick as handleTextStyleZoomClick,
} from "../../src/components/textStyleResourcesView/textStyleResourcesView.handlers.js";

const popoverHandlers = [
  [
    "media filter",
    handleMediaFilterClick,
    "tagFilterButton",
    "openTagFilterPopover",
  ],
  ["media zoom", handleMediaZoomClick, "zoomButton", "openZoomPopover"],
  [
    "catalog filter",
    handleCatalogFilterClick,
    "tagFilterButton",
    "openTagFilterPopover",
  ],
  ["catalog zoom", handleCatalogZoomClick, "zoomButton", "openZoomPopover"],
  [
    "text style filter",
    handleTextStyleFilterClick,
    "tagFilterButton",
    "openTagFilterPopover",
  ],
  [
    "text style zoom",
    handleTextStyleZoomClick,
    "zoomButton",
    "openZoomPopover",
  ],
  [
    "characters filter",
    handleCharactersFilterClick,
    "tagFilterButton",
    "openTagFilterPopover",
  ],
  [
    "variables filter",
    handleVariablesFilterClick,
    "tagFilterButton",
    "openTagFilterPopover",
  ],
];

const resourcePopoverViews = [
  [
    "mediaResourcesView/mediaResourcesView.view.yaml",
    ["tagFilterPopover", "zoomPopover"],
  ],
  [
    "catalogResourcesView/catalogResourcesView.view.yaml",
    ["tagFilterPopover", "zoomPopover"],
  ],
  [
    "textStyleResourcesView/textStyleResourcesView.view.yaml",
    ["tagFilterPopover", "zoomPopover"],
  ],
  [
    "charactersResourcesView/charactersResourcesView.view.yaml",
    ["tagFilterPopover"],
  ],
  ["groupVariablesView/groupVariablesView.view.yaml", ["tagFilterPopover"]],
];

describe("resource popover placement", () => {
  it.each(popoverHandlers)(
    "anchors %s to the button's right edge",
    (_name, handler, refName, storeMethod) => {
      const openPopover = vi.fn();
      const stopPropagation = vi.fn();
      const deps = {
        props: {
          selectedTagFilterValues: [],
        },
        refs: {
          [refName]: {
            getBoundingClientRect: () => ({
              left: 900,
              right: 940,
              bottom: 48,
            }),
          },
        },
        store: {
          [storeMethod]: openPopover,
        },
        render: vi.fn(),
      };

      handler(deps, {
        _event: {
          stopPropagation,
        },
      });

      expect(openPopover).toHaveBeenCalledWith(
        expect.objectContaining({
          position: { x: 940, y: 48 },
        }),
      );
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(deps.render).toHaveBeenCalledOnce();
    },
  );

  it.each(resourcePopoverViews)(
    "uses bottom-end placement in %s",
    (relativePath, popoverIds) => {
      const view = readFileSync(
        new URL(`../../src/components/${relativePath}`, import.meta.url),
        "utf8",
      );
      const lines = view.split("\n");

      for (const popoverId of popoverIds) {
        const popoverLine = lines.find((line) =>
          line.includes(`rtgl-popover#${popoverId}`),
        );

        expect(popoverLine).toContain("place=be");
      }
    },
  );
});
