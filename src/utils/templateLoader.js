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
    console.log(response);
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
