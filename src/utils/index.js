export const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

export const extractFileIdsFromRenderState = (obj) => {
  const fileIds = new Set();

  function traverse(value) {
    if (value === null || value === undefined) return;

    if (typeof value === "string") {
      // Check if this is a fileId (starts with 'file:')
      if (value.startsWith("file:")) {
        fileIds.add({
          url: value.replace("file:", ""),
          type: value.fileType || "image/png",
        });
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }

    if (typeof value === "object") {
      Object.keys(value).forEach((key) => {
        // Check if this property contains file references and extract fileId
        if (
          (key === "fileId" ||
            key === "url" ||
            key === "src" ||
            key === "thumbSrc" ||
            key === "barSrc" ||
            key === "hoverUrl" ||
            key === "clickUrl" ||
            key === "fontFileId") &&
          typeof value[key] === "string"
        ) {
          const fileId = value[key].startsWith("file:")
            ? value[key].replace("file:", "")
            : value[key];
          fileIds.add({
            url: fileId,
            type: value.fileType || "image/png",
          });
        }
        // Continue traversing nested objects
        traverse(value[key]);
      });
    }
  }

  traverse(obj);
  return Array.from(fileIds);
};

export const layoutTreeStructureToRenderState = (
  layout,
  imageItems,
  typographyData,
  colorsData,
  fontsData,
) => {
  const updateChildrenIds = (children, indexVar) => {
    return children.map((child) => {
      const updatedChild = {
        ...child,
        id: `${child.id}-\${${indexVar}}`,
      };
      if (updatedChild.children && updatedChild.children.length > 0) {
        updatedChild.children = updateChildrenIds(
          updatedChild.children,
          indexVar,
        );
      }
      return updatedChild;
    });
  };

  const mapNode = (node) => {
    let element = {
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      anchorX: node.anchorX ?? 0,
      anchorY: node.anchorY ?? 0,
      scaleX: node.scaleX ?? 1,
      scaleY: node.scaleY ?? 1,
      rotation: node.rotation ?? 0,
      click: node.click,
    };

    if (node["$when"]) {
      element["$when"] = node["$when"];
    }

    if (node["$each"]) {
      element["$each"] = node["$each"];
    }

    if (
      [
        "text",
        "text-revealing",
        "text-ref-character-name",
        "text-revealing-ref-dialogue-content",
        "text-ref-choice-item-content",
      ].includes(node.type)
    ) {
      let textStyle = {};

      // Apply typography if selected
      if (node.typographyId && typographyData.items[node.typographyId]) {
        const typography = typographyData.items[node.typographyId];
        const colorItem = colorsData.items?.[typography.colorId];
        const fontItem = fontsData.items?.[typography.fontId];

        textStyle = {
          fontSize: typography.fontSize || 24,
          fontFamily: fontItem?.fontFamily || "sans-serif",
          fontWeight: typography.fontWeight || "normal",
          fill: colorItem?.hex || "white",
          lineHeight: typography.lineHeight || 1.2,
          breakWords: true,
          align: node.style?.align,
        };
      } else {
        // Use default settings
        textStyle = {
          fontSize: 24,
          fill: "white",
          lineHeight: 1.2,
          align: node.style?.align,
        };
      }

      const finalStyle = {
        ...textStyle,
        wordWrapWidth: parseInt(node.style?.wordWrapWidth),
      };

      // Handle interaction styles
      const interactionStyles = {};

      // Process hover style
      if (node.hoverTypographyId) {
        const hoverTypography = typographyData.items[node.hoverTypographyId];
        if (hoverTypography) {
          const hoverColorItem = colorsData.items?.[hoverTypography.colorId];
          const hoverFontItem = fontsData.items?.[hoverTypography.fontId];

          interactionStyles.hover = {
            textStyle: {
              fontSize: hoverTypography.fontSize || 24,
              fontFamily: hoverFontItem?.fontFamily || "sans-serif",
              fontWeight: hoverTypography.fontWeight || "normal",
              fill: hoverColorItem?.hex || "white",
              lineHeight: hoverTypography.lineHeight || 1.2,
            },
          };
        }
      }

      // Process clicked style
      if (node.clickedTypographyId) {
        const clickedTypography =
          typographyData.items[node.clickedTypographyId];
        if (clickedTypography) {
          const clickedColorItem =
            colorsData.items?.[clickedTypography.colorId];
          const clickedFontItem = fontsData.items?.[clickedTypography.fontId];

          interactionStyles.click = {
            textStyle: {
              fontSize: clickedTypography.fontSize || 24,
              fontFamily: clickedFontItem?.fontFamily || "sans-serif",
              fontWeight: clickedTypography.fontWeight || "normal",
              fill: clickedColorItem?.hex || "white",
              lineHeight: clickedTypography.lineHeight || 1.2,
            },
          };
        }
      }

      element = {
        ...element,
        text: node.text,
        content: node.text,
        textStyle: finalStyle,
        ...interactionStyles,
      };

      if (node.type === "text-ref-character-name") {
        element.type = "text";
        element.content = "${dialogue.character.name}";
      }

      if (node.type === "text-revealing-ref-dialogue-content") {
        element.type = "text";
        element.content = "${dialogue.content[0].text}";
      }

      if (node.type === "text-ref-choice-item-content") {
        element.type = "text";
        element.content = "${item.content}";
      }
    }

    if (node.type === "sprite") {
      if (node.imageId && imageItems) {
        // node.imageId contains an imageId, so we need to look up the image
        const image = imageItems[node.imageId];
        if (image && image.fileId) {
          element.src = `${image.fileId}`;
        }
      }
      if (node.hoverImageId && imageItems) {
        // node.hoverImageId contains an imageId, so we need to look up the image
        const hoverImage = imageItems[node.hoverImageId];
        if (hoverImage && hoverImage.fileId) {
          element.hover = {
            src: `${hoverImage.fileId}`,
          };
        }
      }
      if (node.clickImageId && imageItems) {
        // node.clickImageId contains an imageId, so we need to look up the image
        const clickImage = imageItems[node.clickImageId];
        if (clickImage && clickImage.fileId) {
          element.click = {
            ...element.click,
            src: `${clickImage.fileId}`,
          };
        }
      }
    }

    if (node.type === "slider") {
      element.direction = node.direction ?? "horizontal";
      element.min = node.min ?? 0;
      element.max = node.max ?? 100;
      element.step = node.step ?? 1;
      element.initialValue = node.initialValue ?? 0;

      // Map thumbImageId to thumbSrc
      if (node.thumbImageId && imageItems) {
        const thumbImage = imageItems[node.thumbImageId];
        if (thumbImage && thumbImage.fileId) {
          element.thumbSrc = `${thumbImage.fileId}`;
        }
      }

      // Map barImageId to barSrc and get dimensions from bar image
      if (node.barImageId && imageItems) {
        const barImage = imageItems[node.barImageId];
        if (barImage && barImage.fileId) {
          element.barSrc = `${barImage.fileId}`;
          // Use bar image dimensions for slider size
          if (barImage.width) {
            element.width = barImage.width;
          }
          if (barImage.height) {
            element.height = barImage.height;
          }
        }
      }

      // Handle hover state
      if (node.hoverThumbImageId || node.hoverBarImageId) {
        element.hover = element.hover || {};

        if (node.hoverThumbImageId && imageItems) {
          const hoverThumbImage = imageItems[node.hoverThumbImageId];
          if (hoverThumbImage && hoverThumbImage.fileId) {
            element.hover.thumbSrc = `${hoverThumbImage.fileId}`;
          }
        }

        if (node.hoverBarImageId && imageItems) {
          const hoverBarImage = imageItems[node.hoverBarImageId];
          if (hoverBarImage && hoverBarImage.fileId) {
            element.hover.barSrc = `${hoverBarImage.fileId}`;
          }
        }
      }

      // Handle change event if defined
      if (node.change) {
        element.change = node.change;
      }
    }

    if (
      node.type === "container" ||
      node.type === "container-ref-choice-item"
    ) {
      // For containers, we need to handle direction and children
      element.direction = node.direction;
      element.gap = node.gap;
      element.containerType = node.containerType;

      if (node.type === "container-ref-choice-item") {
        element.type = "container";
        element.$each = "item, i in choice.items";
        element.id = `${node.id}-\${i}`;
        element.click = {
          actionPayload: {
            actions: "${item.events.click.actions}",
          },
        };
      }
    }

    if (node.children && node.children.length > 0) {
      element.children = node.children.map(mapNode);

      if (node.type === "container-ref-choice-item") {
        element.children = updateChildrenIds(element.children, "i");
      }
    }

    return element;
  };

  return layout.map(mapNode);
};
