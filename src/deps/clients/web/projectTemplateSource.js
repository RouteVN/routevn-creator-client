import { getTemplateFiles, loadTemplate } from "./templateLoader.js";
import {
  filterTemplateFileIds,
  resolveTemplateFontsForLanguage,
} from "../../../internal/defaultTemplateFonts.js";
import {
  resolveProjectResolutionForWrite,
  scaleTemplateProjectStateForResolution,
} from "../../../internal/projectResolution.js";

// What every platform creates a new project from. `template` is the bundled
// template's ID, such as "default", or a store template the app service has
// downloaded: `{id, repository, files}`, each file `{fileId, mimeType,
// bytes}`.

const isDownloadedTemplate = (template) => typeof template === "object";

const readBundledFile = async (templateId, fileId) => {
  const response = await fetch(`/templates/${templateId}/files/${fileId}`);
  if (!response.ok) {
    throw new Error(`Template file ${fileId} answered ${response.status}.`);
  }
  const blob = await response.blob();
  return new Uint8Array(await blob.arrayBuffer());
};

/**
 * The state a new project starts with, and the files it copies, each
 * `{fileId, mimeType, read}`, `read()` giving its bytes. The bundled template
 * takes fonts for the project's `language` and is scaled to
 * `projectResolution`. A store template keeps its own fonts and resolution:
 * each template is made for one.
 */
export const loadProjectTemplate = async ({
  template,
  language,
  projectResolution,
}) => {
  if (isDownloadedTemplate(template)) {
    const templateData = structuredClone(template.repository);
    return {
      templateData,
      files: template.files.map(({ fileId, mimeType, bytes }) => ({
        fileId,
        mimeType,
        read: async () => bytes,
      })),
    };
  }

  const languageTemplateData = resolveTemplateFontsForLanguage({
    templateId: template,
    templateData: await loadTemplate(template),
    language,
  });
  const templateData = scaleTemplateProjectStateForResolution(
    languageTemplateData,
    resolveProjectResolutionForWrite({
      projectResolution,
      fallbackResolution: languageTemplateData.project?.resolution,
    }),
  );
  const fileIds = filterTemplateFileIds({
    templateData,
    templateFileIds: await getTemplateFiles(template),
  });
  return {
    templateData,
    files: fileIds.map((fileId) => ({
      fileId,
      mimeType: templateData.files.items[fileId].mimeType,
      read: () => readBundledFile(template, fileId),
    })),
  };
};

/**
 * Saves each template file into the new project with `saveFile({fileId,
 * mimeType, bytes})`. A file that cannot be copied is skipped and logged, as
 * the bundled template's files always were; a store template's are already
 * downloaded and checked.
 */
export const copyProjectTemplateFiles = async ({ files, saveFile }) => {
  for (const file of files) {
    try {
      const bytes = await file.read();
      await saveFile({ fileId: file.fileId, mimeType: file.mimeType, bytes });
    } catch (error) {
      console.error(`Failed to copy template file ${file.fileId}:`, error);
    }
  }
};
