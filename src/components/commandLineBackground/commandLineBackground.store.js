import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  tab: "images", // "images", "layouts", or "videos"
  imageItems: [],
  layoutItems: [],
  videoItems: [],
  selectedImageId: undefined,
  selectedFileId: undefined,
  selectedLayoutId: undefined,
  selectedVideoId: undefined,
  tempSelectedImageId: undefined,
  tempSelectedLayoutId: undefined,
  tempSelectedVideoId: undefined,
});

export const selectSelectedImageId = ({ state }) => {
  return state.selectedImageId;
};

export const selectTempSelectedImageId = ({ state }) => {
  return state.tempSelectedImageId;
};

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setImageItems = (state, payload) => {
  state.imageItems = payload.items;
};

export const setLayoutItems = (state, payload) => {
  state.layoutItems = payload.items;
};

export const setVideoItems = (state, payload) => {
  state.videoItems = payload.items;
};

export const setTab = (state, payload) => {
  state.tab = payload.tab;
};

export const setSelectedImageAndFileId = (state, payload) => {
  state.selectedImageId = payload.imageId;
  state.selectedFileId = payload.fileId;
};

export const setTempSelectedImageId = (state, payload) => {
  state.tempSelectedImageId = payload.imageId;
};

export const selectSelectedLayoutId = ({ state }) => {
  return state.selectedLayoutId;
};

export const selectTempSelectedLayoutId = ({ state }) => {
  return state.tempSelectedLayoutId;
};

export const selectTab = ({ state }) => {
  return state.tab;
};

export const setSelectedLayoutId = (state, payload) => {
  state.selectedLayoutId = payload.layoutId;
};

export const setTempSelectedLayoutId = (state, payload) => {
  state.tempSelectedLayoutId = payload.layoutId;
};

export const selectSelectedVideoId = ({ state }) => {
  return state.selectedVideoId;
};

export const selectTempSelectedVideoId = ({ state }) => {
  return state.tempSelectedVideoId;
};

export const setSelectedVideoAndFileId = (state, payload) => {
  state.selectedVideoId = payload.videoId;
  state.selectedFileId = payload.fileId;
};

export const setTempSelectedVideoId = (state, payload) => {
  state.tempSelectedVideoId = payload.videoId;
};

export const toViewData = ({ state, props }, payload) => {
  const items = state.tab === "images" 
    ? state.imageItems 
    : state.tab === "layouts" 
    ? state.layoutItems 
    : state.videoItems;
  const flatItems = toFlatItems(items).filter(
    (item) => item.type === "folder",
  );
  const flatGroups = toFlatGroups(items).map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = state.tab === "images" 
          ? child.id === state.tempSelectedImageId
          : state.tab === "layouts"
          ? child.id === state.tempSelectedLayoutId
          : child.id === state.tempSelectedVideoId;
        return {
          ...child,
          bw: isSelected ? "md" : "",
        };
      }),
    };
  });

  // Get selected image/layout/video name
  let selectedName = null;
  if (state.tab === "images" && state.selectedImageId) {
    const selectedImage = toFlatItems(state.imageItems).find(
      (item) => item.id === state.selectedImageId
    );
    selectedName = selectedImage ? selectedImage.name : null;
  } else if (state.tab === "layouts" && state.selectedLayoutId) {
    const selectedLayout = toFlatItems(state.layoutItems).find(
      (item) => item.id === state.selectedLayoutId
    );
    selectedName = selectedLayout ? selectedLayout.name : null;
  } else if (state.tab === "videos" && state.selectedVideoId) {
    const selectedVideo = toFlatItems(state.videoItems).find(
      (item) => item.id === state.selectedVideoId
    );
    selectedName = selectedVideo ? selectedVideo.name : null;
  }

  const positionOptions = [
    { label: "Top Left", value: "top-left" },
    { label: "Top Center", value: "top-center" },
    { label: "Top Right", value: "top-right" },
    { label: "Center Left", value: "center-left" },
    { label: "Center", value: "center" },
    { label: "Center Right", value: "center-right" },
    { label: "Bottom Left", value: "bottom-left" },
    { label: "Bottom Center", value: "bottom-center" },
    { label: "Bottom Right", value: "bottom-right" },
  ];

  return {
    mode: state.mode,
    tab: state.tab,
    items: flatItems,
    groups: flatGroups,
    selectedImageId: state.selectedImageId,
    selectedFileId: state.selectedFileId,
    selectedLayoutId: state.selectedLayoutId,
    selectedVideoId: state.selectedVideoId,
    tempSelectedImageId: state.tempSelectedImageId,
    tempSelectedLayoutId: state.tempSelectedLayoutId,
    tempSelectedVideoId: state.tempSelectedVideoId,
    selectedName: selectedName,
    positionOptions: positionOptions,
  };
};
