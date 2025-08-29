// Shared template setup functions for both web and Tauri

// Fetch template images from static folder
export async function fetchTemplateImages(uploadImageFiles) {
  const templateImageUrls = [
    "/public/template/dialogue_box.png",
    "/public/template/choice_box.png",
    "/public/template/choice_box_activated.png",
  ];

  const fetchedImages = {};
  const imageItems = {};
  const imageTree = [];

  // Create the Template Images folder
  const folderId = "template-images-folder";
  imageItems[folderId] = {
    type: "folder",
    name: "Template Images",
  };

  const folderChildren = [];

  for (const url of templateImageUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const fileName = url.split("/").pop();
        const file = new File([blob], fileName, { type: blob.type });

        // Upload to local storage and get fileId
        const results = await uploadImageFiles([file], "template-project");
        if (results && results.length > 0) {
          const result = results[0];
          const imageId = `image-${fileName.replace(".png", "")}`;

          // Store the file ID for layout references
          fetchedImages[fileName] = result.fileId;

          // Create the image item for the repository
          imageItems[imageId] = {
            type: "image",
            fileId: result.fileId,
            name: fileName.replace(".png", "").replace(/_/g, " "),
            src: result.downloadUrl,
            width: result.dimensions?.width || 100,
            height: result.dimensions?.height || 100,
          };

          // Add to folder children
          folderChildren.push({ id: imageId });
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch template image ${url}:`, error);
    }
  }

  // Create the tree structure with folder
  imageTree.push({
    id: folderId,
    children: folderChildren,
  });

  return { fetchedImages, imageItems, imageTree };
}

// Fetch template fonts from static folder
export async function fetchTemplateFonts(uploadFontFiles) {
  const templateFontUrls = ["/public/template/sample_font.ttf"];

  const fetchedFonts = {};
  const fontItems = {};
  const fontTree = [];

  // Create the Template Fonts folder
  const folderId = "template-fonts-folder";
  fontItems[folderId] = {
    type: "folder",
    name: "Template Fonts",
  };

  const folderChildren = [];

  for (const url of templateFontUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const fileName = url.split("/").pop();
        const file = new File([blob], fileName, { type: "font/ttf" });

        // Upload to local storage and get fileId
        const results = await uploadFontFiles([file], "template-project");
        if (results && results.length > 0) {
          const result = results[0];
          const fontId = `font-sample`;

          // Store the file ID for layout references
          fetchedFonts[fileName] = result.fileId;

          // Create the font item for the repository
          fontItems[fontId] = {
            type: "font",
            fileId: result.fileId,
            name: "Sample Font",
            fontFamily: result.fontName || "SampleFont",
            fileType: "font/ttf",
            fileSize: file.size,
          };

          // Add to folder children
          folderChildren.push({ id: fontId });
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch template font ${url}:`, error);
    }
  }

  // Create the tree structure with folder only if we have fonts
  if (folderChildren.length > 0) {
    fontTree.push({
      id: folderId,
      children: folderChildren,
    });
  }

  return { fetchedFonts, fontItems, fontTree };
}
