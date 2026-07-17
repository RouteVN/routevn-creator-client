const TEMPLATE_FILE_EXTENSION_BY_MIME_TYPE = {
  "font/ttf": "ttf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const getTemplateFileSourceName = ({ fileId, templateData }) => {
  const mimeType = templateData.files.items[fileId].mimeType;
  const extension = TEMPLATE_FILE_EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) {
    throw new Error(`Unsupported template file MIME type: ${mimeType}`);
  }

  return `${fileId}.${extension}`;
};

export async function loadTemplate(templateId = "default") {
  try {
    const response = await fetch(`/templates/${templateId}/repository.json`);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templateId}`);
    }

    const templateData = await response.json();

    return templateData;
  } catch (error) {
    console.error("Error loading template:", error);
    throw error;
  }
}

export async function getTemplateFiles(templateId) {
  try {
    const response = await fetch(`/templates/${templateId}/files/files.json`);
    if (!response.ok) {
      throw new Error(`Failed to load file list: ${templateId}`);
    }

    const templateData = await response.json();

    return templateData.files;
  } catch (error) {
    console.error("Error loading file list:", error);
    throw error;
  }
}
