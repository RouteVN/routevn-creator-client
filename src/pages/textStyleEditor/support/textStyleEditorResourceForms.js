import { toFlatItems } from "../../../internal/project/tree.js";

// The add color and add font dialogs create the resource in the folder they
// name, and the editor then picks it.

export const createFolderOptions = (collection, copy = {}) => [
  { value: "_root", label: copy.rootFolderLabel },
  ...toFlatItems(collection)
    .filter((item) => item.type === "folder")
    .map((folder) => ({
      value: folder.id,
      label: folder.name ?? folder.id,
    })),
];

export const createAddColorDefaultValues = () => ({
  name: "",
  description: "",
  hex: "#ff0000",
  folderId: "_root",
});

export const createAddFontDefaultValues = () => ({
  description: "",
  folderId: "_root",
});

export const createAddColorForm = ({ folderOptions, copy = {} }) => ({
  title: copy.addNewColorTitle,
  description: copy.addNewColorDescription,
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.colorNameLabel,
      description: copy.enterColorNameDescription,
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel,
      description: copy.optionalColorDescription,
      required: false,
    },
    {
      name: "hex",
      type: "color-picker",
      label: copy.hexValueLabel,
      description: copy.chooseHexDescription,
      required: true,
    },
    {
      name: "folderId",
      type: "select",
      label: copy.folderLabel,
      description: copy.chooseColorFolderDescription,
      options: folderOptions,
      required: true,
    },
  ],
});

export const createAddFontForm = ({ folderOptions, copy = {} }) => ({
  title: copy.addNewFontTitle,
  description: copy.addNewFontDescription,
  fields: [
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel,
      description: copy.optionalFontDescription,
      required: false,
    },
    {
      name: "folderId",
      type: "select",
      label: copy.folderLabel,
      description: copy.chooseFontFolderDescription,
      options: folderOptions,
      required: true,
    },
    {
      slot: "font-upload",
      type: "slot",
      label: copy.fontFileLabel,
      description: copy.fontFileDescription,
      required: true,
    },
  ],
});
