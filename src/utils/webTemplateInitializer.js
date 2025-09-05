import { loadTemplate } from "./templateLoader";
import { nanoid } from "nanoid";

export async function initializeWebTemplate(repositoryFactory, fileManager) {
  const repository = await repositoryFactory.getByProject();
  const actionStream = repository.getAllEvents();

  if (actionStream.length === 0) {
    console.log("First time user - loading template data...");

    // Load template from static files
    const templateData = await loadTemplate("default");

    // Load and store template files in IndexedDB
    const templateFiles = await loadTemplateFilesToIndexedDB("default", fileManager);

    // Replace all imageId references in layouts with new random IDs
    if (templateFiles.imageIdMapping && templateData.layouts) {
      for (const layout of Object.values(templateData.layouts.items)) {
        if (layout.elements && layout.elements.items) {
          for (const element of Object.values(layout.elements.items)) {
            // Replace imageId with new random ID
            if (element.imageId && templateFiles.imageIdMapping[element.imageId]) {
              element.imageId = templateFiles.imageIdMapping[element.imageId];
            }
            if (element.hoverImageId && templateFiles.imageIdMapping[element.hoverImageId]) {
              element.hoverImageId = templateFiles.imageIdMapping[element.hoverImageId];
            }
          }
        }
      }
    }
    
    // Replace fontId references in typography with new random IDs
    if (templateFiles.fontIdMapping && templateData.typography) {
      for (const typo of Object.values(templateData.typography.items)) {
        // Handle null fontId or existing fontId
        if (!typo.fontId || typo.fontId === "font-sample_font") {
          typo.fontId = templateFiles.fontIdMapping["font-sample_font"];
        }
      }
    }

    // Replace images and fonts with uploaded versions
    if (templateFiles.images) {
      templateData.images = templateFiles.images;
    }
    if (templateFiles.fonts) {
      templateData.fonts = templateFiles.fonts;
    }

    // Use the init action to set all template data at once
    repository.addAction({
      actionType: "init",
      target: null,
      value: templateData,
    });
    console.log("Template data loaded and saved to repository");
  }
}

async function loadTemplateFilesToIndexedDB(templateId, fileManager) {
  // Create folder IDs
  const imageFolderId = nanoid();
  const fontFolderId = nanoid();
  
  const result = {
    images: { 
      items: {
        [imageFolderId]: {
          type: "folder",
          name: "Template Images"
        }
      }, 
      tree: [
        {
          id: imageFolderId,
          children: []
        }
      ] 
    },
    fonts: { 
      items: {
        [fontFolderId]: {
          type: "folder",
          name: "Template Fonts"
        }
      },
      tree: [
        {
          id: fontFolderId,
          children: []
        }
      ]
    },
  };

  // Map to track original filename -> new random ID for replacement
  const imageIdMapping = {};
  
  // Load image files
  const imageFiles = [
    "dialogue_box.png",
    "choice_box.png",
    "choice_box_activated.png",
  ];

  for (const fileName of imageFiles) {
    try {
      const response = await fetch(`/templates/${templateId}/files/${fileName}`);
      if (response.ok) {
        const blob = await response.blob();
        // Generate ONE random ID that will be used everywhere
        const newId = nanoid();
        imageIdMapping[fileName] = newId;
        
        // Use this ID as the file name so fileManager uses it as fileId
        const file = new File([blob], newId, { type: blob.type });

        // Use fileManager to store in IndexedDB
        const uploadResult = await fileManager.upload([file]);

        if (uploadResult && uploadResult[0]) {
          const fileData = uploadResult[0];
          // Use the SAME random ID as imageId (key in items)
          result.images.items[newId] = {
            type: "image",
            name: fileName.replace('.png', '').replace(/_/g, ' '),
            filename: fileData.fileId,  // should be the same as newId
            url: fileData.downloadUrl,   // blob URL from IndexedDB
            width: fileData.dimensions?.width,
            height: fileData.dimensions?.height,
          };
          // Add to folder's children
          result.images.tree[0].children.push({ id: newId });
        }
      }
    } catch (error) {
      console.error(`Failed to load template image ${fileName}:`, error);
    }
  }
  
  // Store mapping for template replacement
  result.imageIdMapping = imageIdMapping;
  
  // Map for font IDs
  const fontIdMapping = {};
  
  // Load font files
  try {
    const response = await fetch(`/templates/${templateId}/files/sample_font.ttf`);
    if (response.ok) {
      const blob = await response.blob();
      // Generate ONE random ID for font
      const newId = nanoid();
      fontIdMapping["font-sample_font"] = newId;
      
      const file = new File([blob], newId, { type: "font/ttf" });

      // Use fileManager to store in IndexedDB
      const uploadResult = await fileManager.upload([file]);

      if (uploadResult && uploadResult[0]) {
        const fontData = uploadResult[0];
        // Use the random ID as fontId
        result.fonts.items[newId] = {
          type: "font",
          name: "Sample Font",
          filename: fontData.fileId,  // should be the same as newId
          url: fontData.downloadUrl,   // blob URL from upload result
        };
        // Add to folder's children
        result.fonts.tree[0].children.push({ id: newId });
      }
    }
  } catch (error) {
    console.error("Failed to load template font:", error);
  }
  
  result.fontIdMapping = fontIdMapping;
  return result;
}