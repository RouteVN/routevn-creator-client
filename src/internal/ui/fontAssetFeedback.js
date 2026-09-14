import { isFontAssetError } from "../fontAssetError.js";
import { formatI18nCopy } from "./i18nCopy.js";

export const getFontAssetMessage = ({
  error,
  fonts = {},
  i18n = {},
  projectService,
}) => {
  if (!isFontAssetError(error)) return undefined;
  // Runtime projections omit names. Read the authoring collection on failure
  // so the message identifies the item the user sees in Fonts.
  const fontItems =
    projectService?.getRepositoryState?.()?.fonts?.items ?? fonts;
  const font = Object.values(fontItems).find(
    (item) => item.fileId === error.fileId,
  );
  const fontName = font?.name ?? font?.fontFamily ?? error.fileId;
  const copy = i18n.resourcePages ?? {};
  const template =
    error.code === "font_integrity_mismatch"
      ? (copy.damagedFontMessage ??
        'The font "{fontName}" has changed or is damaged. Open Fonts and replace its file with a fresh copy.')
      : (copy.unavailableFontMessage ??
        'The font "{fontName}" could not be loaded. Open Fonts and replace its file with a valid copy.');
  return formatI18nCopy(template, { fontName });
};
