import { createSquareCroppedImageFile } from "./fileProcessors.js";

const createSourceFile = (sourceBytes) => {
  const file = new Blob([sourceBytes], { type: "image/png" });
  file.name = "project-icon.png";
  return file;
};

export const createWebIconAssets = async ({ sourceBytes, variants } = {}) => {
  const sourceFile = createSourceFile(sourceBytes);

  return Promise.all(
    variants.map(async ({ fileName, size }) => {
      const file = await createSquareCroppedImageFile({
        file: sourceFile,
        outputSize: size,
      });

      return {
        fileName,
        bytes: new Uint8Array(await file.arrayBuffer()),
      };
    }),
  );
};
