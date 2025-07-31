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
        fileIds.add(value.replace("file:", ""));
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }

    if (typeof value === "object") {
      Object.keys(value).forEach((key) => {
        // Check if this property is 'url', 'src', 'hoverUrl', or 'clickUrl' and extract fileId
        if (
          (key === "url" ||
            key === "src" ||
            key === "hoverUrl" ||
            key === "clickUrl") &&
          typeof value[key] === "string"
        ) {
          if (value[key].startsWith("file:")) {
            fileIds.add(value[key].replace("file:", ""));
          }
        }
        // Continue traversing nested objects
        traverse(value[key]);
      });
    }
  }

  traverse(obj);
  return Array.from(fileIds);
};

export const extractFontFileIds = (layout, typographyData, fontsData) => {
  const fontFileIds = new Set();

  const extractFromLayout = (elements) => {
    elements.forEach((element) => {
      if (element.type === "text") {
        // Check main typography
        if (
          element.typographyId &&
          typographyData.items[element.typographyId]
        ) {
          const typography = typographyData.items[element.typographyId];
          if (typography.fontId && fontsData.items[typography.fontId]) {
            const font = fontsData.items[typography.fontId];
            if (font.fileId) {
              fontFileIds.add(font.fileId);
            }
          }
        }

        // Check hover typography
        if (
          element.hoverTypographyId &&
          typographyData.items[element.hoverTypographyId]
        ) {
          const hoverTypography =
            typographyData.items[element.hoverTypographyId];
          if (
            hoverTypography.fontId &&
            fontsData.items[hoverTypography.fontId]
          ) {
            const hoverFont = fontsData.items[hoverTypography.fontId];
            if (hoverFont.fileId) {
              fontFileIds.add(hoverFont.fileId);
            }
          }
        }

        // Check clicked typography
        if (
          element.clickedTypographyId &&
          typographyData.items[element.clickedTypographyId]
        ) {
          const clickedTypography =
            typographyData.items[element.clickedTypographyId];
          if (
            clickedTypography.fontId &&
            fontsData.items[clickedTypography.fontId]
          ) {
            const clickedFont = fontsData.items[clickedTypography.fontId];
            if (clickedFont.fileId) {
              fontFileIds.add(clickedFont.fileId);
            }
          }
        }
      }

      // Recursively check children
      if (element.children && element.children.length > 0) {
        extractFromLayout(element.children);
      }
    });
  };

  extractFromLayout(layout);
  return Array.from(fontFileIds);
};

export const layoutTreeStructureToRenderState = (
  layout,
  imageItems,
  typographyData,
  colorsData,
  fontsData,
) => {
  const mapNode = (node) => {
    let element = {
      id: node.id,
      type: node.type,
      x: parseInt(node.x || 0),
      y: parseInt(node.y || 0),
      width: parseInt(node.width || 100),
      height: parseInt(node.height || 100),
      anchorX: parseFloat(node.anchorX || 0),
      anchorY: parseFloat(node.anchorY || 0),
      scaleX: parseFloat(node.scaleX || 1),
      scaleY: parseFloat(node.scaleY || 1),
      rotation: parseInt(node.rotation || 0),
    };

    if (node.type === "text") {
      let textStyle = {};

      // Apply typography if selected
      if (node.typographyId && typographyData.items[node.typographyId]) {
        const typography = typographyData.items[node.typographyId];
        const colorItem = colorsData.items[typography.colorId];
        const fontItem = fontsData.items[typography.fontId];

        textStyle = {
          fontSize: typography.fontSize,
          fontFamily: fontItem.fontFamily,
          fontWeight: typography.fontWeight,
          fill: colorItem.hex,
          lineHeight: typography.lineHeight * typography.fontSize,
        };
      } else {
        // Use default settings
        textStyle = {
          fontSize: 24,
          fill: "white",
          lineHeight: 1.5 * 24,
        };
      }

      const finalStyle = {
        ...textStyle,
        wordWrapWidth: parseInt(node.style?.wordWrapWidth),
        align: node.style?.align,
      };

      // Handle interaction styles
      const interactionStyles = {};

      // Process hover style
      if (node.hoverTypographyId) {
        const hoverTypography = typographyData.items[node.hoverTypographyId];
        if (hoverTypography) {
          const hoverColorItem = colorsData.items[hoverTypography.colorId];
          const hoverFontItem = fontsData.items[hoverTypography.fontId];

          interactionStyles.hoverStyle = {
            fontSize: hoverTypography.fontSize,
            fontFamily: hoverFontItem.fontFamily,
            fontWeight: hoverTypography.fontWeight,
            fill: hoverColorItem.hex,
            lineHeight: hoverTypography.lineHeight * hoverTypography.fontSize,
          };
        }
      }

      // Process clicked style
      if (node.clickedTypographyId) {
        const clickedTypography =
          typographyData.items[node.clickedTypographyId];
        if (clickedTypography) {
          const clickedColorItem = colorsData.items[clickedTypography.colorId];
          const clickedFontItem = fontsData.items[clickedTypography.fontId];

          interactionStyles.clickedTextStyle = {
            fontSize: clickedTypography.fontSize,
            fontFamily: clickedFontItem.fontFamily,
            fontWeight: clickedTypography.fontWeight,
            fill: clickedColorItem.hex,
            lineHeight:
              clickedTypography.lineHeight * clickedTypography.fontSize,
          };
        }
      }

      element = {
        ...element,
        text: node.text,
        style: finalStyle,
        ...interactionStyles,
      };
    }

    if (node.type === "sprite") {
      if (node.imageId && imageItems) {
        // node.imageId contains an imageId, so we need to look up the image
        const image = imageItems[node.imageId];
        if (image && image.fileId) {
          element.url = `file:${image.fileId}`;
        }
      }
      if (node.hoverImageId && imageItems) {
        // node.hoverImageId contains an imageId, so we need to look up the image
        const hoverImage = imageItems[node.hoverImageId];
        if (hoverImage && hoverImage.fileId) {
          element.hoverUrl = `file:${hoverImage.fileId}`;
        }
      }
      if (node.clickImageId && imageItems) {
        // node.clickImageId contains an imageId, so we need to look up the image
        const clickImage = imageItems[node.clickImageId];
        if (clickImage && clickImage.fileId) {
          element.clickUrl = `file:${clickImage.fileId}`;
        }
      }
    }

    if (node.children && node.children.length > 0) {
      element.children = node.children.map(mapNode);
    }

    return element;
  };

  return layout.map(mapNode);
};
