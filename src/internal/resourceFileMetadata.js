const isPlainObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const hasFilesSource = (files) =>
  files !== undefined && files !== null;

const FILES_OWNED_METADATA_ITEM_TYPES = new Set([
  "image",
  "sound",
  "video",
  "font",
  "spritesheet",
]);

const usesFilesOwnedMetadata = (item) =>
  FILES_OWNED_METADATA_ITEM_TYPES.has(item?.type);

const resolveFilesById = (files) => {
  if (isPlainObject(files?.items)) {
    return files.items;
  }

  if (isPlainObject(files)) {
    return files;
  }

  return {};
};

const resolveFileRecord = ({ item, files } = {}) => {
  const fileId = item?.fileId;
  if (typeof fileId !== "string" || fileId.length === 0) {
    return undefined;
  }

  const filesById = resolveFilesById(files);
  const fileRecord = filesById[fileId];
  return isPlainObject(fileRecord) ? fileRecord : undefined;
};

export const resolveResourceFileType = ({ item, files } = {}) => {
  const fileRecord = resolveFileRecord({ item, files });
  return fileRecord?.mimeType;
};

export const resolveResourceFileSize = ({ item, files } = {}) => {
  const fileRecord = resolveFileRecord({ item, files });
  return fileRecord?.size;
};

export const withResolvedResourceFileMetadata = ({ item, files } = {}) => {
  if (!isPlainObject(item) || !usesFilesOwnedMetadata(item)) {
    return item;
  }

  if (!hasFilesSource(files)) {
    return item;
  }

  const resolvedFileType = resolveResourceFileType({
    item,
    files,
  });
  const resolvedFileSize = resolveResourceFileSize({
    item,
    files,
  });

  let nextItem = item;

  if (resolvedFileType !== item.fileType) {
    nextItem = nextItem === item ? { ...item } : nextItem;
    if (resolvedFileType === undefined) {
      delete nextItem.fileType;
    } else {
      nextItem.fileType = resolvedFileType;
    }
  }

  if (resolvedFileSize !== item.fileSize) {
    nextItem = nextItem === item ? { ...item } : nextItem;
    if (resolvedFileSize === undefined) {
      delete nextItem.fileSize;
    } else {
      nextItem.fileSize = resolvedFileSize;
    }
  }

  return nextItem;
};

export const withResolvedCollectionFileMetadata = ({
  collection,
  files,
  resourceTypes,
} = {}) => {
  if (!isPlainObject(collection)) {
    return collection;
  }

  const allowedTypes = Array.isArray(resourceTypes)
    ? new Set(resourceTypes)
    : undefined;
  const items = isPlainObject(collection.items) ? collection.items : {};
  let nextItems;

  for (const [itemId, item] of Object.entries(items)) {
    if (
      allowedTypes &&
      !allowedTypes.has(item?.type) &&
      item?.type !== undefined
    ) {
      continue;
    }

    const nextItem = withResolvedResourceFileMetadata({
      item,
      files,
    });
    if (nextItem === item) {
      continue;
    }

    if (!nextItems) {
      nextItems = { ...items };
    }
    nextItems[itemId] = nextItem;
  }

  if (!nextItems) {
    return collection;
  }

  return {
    ...collection,
    items: nextItems,
  };
};
