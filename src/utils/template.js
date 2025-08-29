export async function fetchTemplateImages({
  uploadImageFiles,
  repository,
  uploadedImages,
}) {
  const templateImages = [
    "dialogue_box.png",
    "choice_box.png",
    "choice_box_activated.png",
  ];

  const fetchedImages = await Promise.all(
    templateImages.map(async (filename) => {
      const url = `/public/template/${filename}`;
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: blob.type });
      return file;
    }),
  );

  const uploadResult = await uploadImageFiles(fetchedImages);

  const imageItems = uploadResult.uploadedItems.map(
    ({ item: image, id, name }) => ({
      id,
      name,
      src: image.src,
      type: "image",
    }),
  );

  const imageTree = {};
  imageItems.forEach((item) => {
    imageTree[item.id] = {
      id: item.id,
      parent: uploadedImages,
      title: item.name,
      type: "IMAGE",
      expanded: false,
    };
  });

  uploadedImages.children = imageItems.map((item) => item.id);

  await repository.store(uploadedImages);
  for (const key in imageTree) {
    await repository.store(imageTree[key]);
  }

  return {
    fetchedImages,
    imageItems,
    imageTree,
  };
}

export async function fetchTemplateFonts({
  uploadFontFiles,
  repository,
  uploadedFonts,
}) {
  const templateFonts = ["sample_font.ttf"];

  const fetchedFonts = await Promise.all(
    templateFonts.map(async (filename) => {
      const url = `/public/template/${filename}`;
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: blob.type });
      return file;
    }),
  );

  const uploadResult = await uploadFontFiles(fetchedFonts);

  const fontItems = uploadResult.uploadedItems.map(
    ({ item: font, id, name }) => ({
      id,
      name,
      type: "font",
    }),
  );

  const fontTree = {};
  fontItems.forEach((item) => {
    fontTree[item.id] = {
      id: item.id,
      parent: uploadedFonts,
      title: item.name,
      type: "FONT",
      expanded: false,
    };
  });

  uploadedFonts.children = fontItems.map((item) => item.id);

  await repository.store(uploadedFonts);
  for (const key in fontTree) {
    await repository.store(fontTree[key]);
  }

  return {
    fetchedFonts,
    fontItems,
    fontTree,
  };
}
