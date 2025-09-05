export async function loadTemplate(templateId = "default") {
  try {
    const response = await fetch(`/templates/${templateId}/repository.json`);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templateId}`);
    }

    const templateData = await response.json();

    // Load font files if they exist
    const fontFiles = await loadTemplateFonts(templateId);
    if (fontFiles && fontFiles.length > 0) {
      templateData.fonts = {
        tree: [],
        items: {},
      };

      for (const fontFile of fontFiles) {
        const fontId = `font-${fontFile.name.replace(/\.[^/.]+$/, "")}`;
        templateData.fonts.items[fontId] = {
          type: "font",
          name: fontFile.name,
          url: fontFile.url,
          filename: fontFile.name,
        };
        templateData.fonts.tree.push({ id: fontId });

        // Update typography to use the loaded font
        if (templateData.typography && templateData.typography.items) {
          Object.values(templateData.typography.items).forEach((item) => {
            if (item.type === "typography" && !item.fontId) {
              item.fontId = fontId;
            }
          });
        }
      }
    }

    return templateData;
  } catch (error) {
    console.error("Error loading template:", error);
    throw error;
  }
}

export async function loadTemplateFonts(templateId) {
  try {
    const fonts = [];

    // Try to load sample_font.ttf which we know exists
    try {
      const response = await fetch(
        `/templates/${templateId}/files/sample_font.ttf`,
      );
      if (response.ok) {
        fonts.push({
          name: "sample_font.ttf",
          url: `/templates/${templateId}/files/sample_font.ttf`,
        });
      }
    } catch (e) {
      // Font doesn't exist, continue
    }

    return fonts;
  } catch (error) {
    console.error("Error loading template fonts:", error);
    return [];
  }
}

export function getAvailableTemplates() {
  // For now, return hardcoded list
  // In the future, this could scan the templates directory
  return [
    {
      id: "default",
      name: "Default Template",
      description:
        "Basic visual novel template with dialogue and choice layouts",
    },
  ];
}

export function getTemplateFiles(templateId) {
  // Return list of template files and their paths
  const templatePath = `/templates/${templateId}/files/`;

  return {
    images: ["dialogue_box.png", "choice_box.png", "choice_box_activated.png"],
    fonts: ["sample_font.ttf"],
    sourcePath: templatePath,
  };
}
