import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { repository, store, props } = deps;
  const { images, layouts, videos } = repository.getState();

  store.setImageItems({
    items: images,
  });

  store.setLayoutItems({
    items: layouts,
  });

  store.setVideoItems({
    items: videos,
  });

  // Initialize with existing background data if available
  if (props?.line?.presentation?.background?.imageId) {
    const flatImageItems = toFlatItems(images);
    const existingImage = flatImageItems.find(
      (item) => item.id === props.line.presentation.background.imageId,
    );

    if (existingImage) {
      store.setSelectedImageAndFileId({
        imageId: props.line.presentation.background.imageId,
        fileId: existingImage.fileId,
      });
      store.setTab({ tab: "images" });
    }
  } else if (props?.line?.presentation?.background?.layoutId) {
    store.setSelectedLayoutId({
      layoutId: props.line.presentation.background.layoutId,
    });
    store.setTab({ tab: "layouts" });
  } else if (props?.line?.presentation?.background?.videoId) {
    const flatVideoItems = toFlatItems(videos);
    const existingVideo = flatVideoItems.find(
      (item) => item.id === props.line.presentation.background.videoId,
    );

    if (existingVideo) {
      store.setSelectedVideoAndFileId({
        videoId: props.line.presentation.background.videoId,
        fileId: existingVideo.fileId,
      });
      store.setTab({ tab: "videos" });
    }
  }
};

export const handleAfterMount = async (deps) => {
  const { httpClient, store, render, props, repository } = deps;
  const { images, layouts, videos } = repository.getState();

  // Initialize with existing background data if available
  if (props?.line?.presentation?.background?.imageId) {
    const flatImageItems = toFlatItems(images);
    const existingImage = flatImageItems.find(
      (item) => item.id === props.line.presentation.background.imageId,
    );

    if (existingImage) {
      const { url } = await httpClient.creator.getFileContent({
        fileId: existingImage.fileId,
        projectId: "someprojectId",
      });

      store.setContext({
        background: {
          src: url,
        },
      });
      render();
    }
  }
};

export const handleImageSelected = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { images } = repository.getState();

  const { imageId } = e.detail;

  store.setTempSelectedImageId({
    imageId: imageId,
  });

  render();

  const flatImageItems = toFlatItems(images);
  const existingImage = flatImageItems.find((item) => item.id === imageId);

  const { url } = await httpClient.creator.getFileContent({
    fileId: existingImage.fileId,
    projectId: "someprojectId",
  });

  store.setContext({
    background: {
      src: url,
    },
  });
  render();
};

export const handleFormExtra = (e, deps) => {
  console.log("extraaaaaaaaa", e.detail);
  const { store, render } = deps;
  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleLayoutItemClick = (payload, deps) => {
  const { store, render } = deps;

  // Extract layout ID from the element ID (format: layout-item-{id})
  const elementId =
    payload.target.id || payload.target.closest('[id^="layout-item-"]')?.id;
  const layoutId = elementId?.replace("layout-item-", "");

  store.setTempSelectedLayoutId({
    layoutId: layoutId,
  });

  render();
};

export const handleVideoItemClick = (payload, deps) => {
  const { store, render } = deps;

  // Extract video ID from the element ID (format: video-item-{id})
  const elementId =
    payload.target.id || payload.target.closest('[id^="video-item-"]')?.id;
  const videoId = elementId?.replace("video-item-", "");

  store.setTempSelectedVideoId({
    videoId: videoId,
  });

  render();
};

export const handleTabClick = (e, deps) => {
  const { store, render } = deps;

  store.setTab({
    tab: e.detail.id,
  });

  render();
};

export const handleSubmitClick = (e, deps) => {
  const { dispatchEvent, store } = deps;
  const tab = store.selectTab();

  let backgroundData = {};

  if (tab === "images") {
    const selectedImageId = store.selectSelectedImageId();
    if (!selectedImageId) {
      return;
    }
    backgroundData = {
      imageId: selectedImageId,
    };
  } else if (tab === "layouts") {
    const selectedLayoutId = store.selectSelectedLayoutId();
    if (!selectedLayoutId) {
      return;
    }
    backgroundData = {
      layoutId: selectedLayoutId,
    };
  } else if (tab === "videos") {
    const selectedVideoId = store.selectSelectedVideoId();
    if (!selectedVideoId) {
      return;
    }
    backgroundData = {
      videoId: selectedVideoId,
    };
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        background: backgroundData,
      },
    }),
  );
};

export const handleBackgroundSelectorClick = (payload, deps) => {
  const { store, render } = deps;
  const tab = store.selectTab();

  if (tab === "images") {
    const selectedImageId = store.selectSelectedImageId();
    store.setTempSelectedImageId({
      imageId: selectedImageId,
    });
  } else if (tab === "layouts") {
    const selectedLayoutId = store.selectSelectedLayoutId();
    store.setTempSelectedLayoutId({
      layoutId: selectedLayoutId,
    });
  } else if (tab === "videos") {
    const selectedVideoId = store.selectSelectedVideoId();
    store.setTempSelectedVideoId({
      videoId: selectedVideoId,
    });
  }

  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleBreadcumbActionsClick = (e, deps) => {
  const { dispatchEvent, store, render } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else {
    store.setMode({
      mode: e.detail.id,
    });
    render();
  }
};

export const handleButtonSelectClick = (payload, deps) => {
  const { store, render, repository } = deps;
  const tab = store.selectTab();

  if (tab === "images") {
    const { images } = repository.getState();
    const tempSelectedImageId = store.selectTempSelectedImageId();
    const tempSelectedImage = toFlatItems(images).find(
      (image) => image.id === tempSelectedImageId,
    );
    store.setSelectedImageAndFileId({
      imageId: tempSelectedImageId,
      fileId: tempSelectedImage.fileId,
    });
  } else if (tab === "layouts") {
    const tempSelectedLayoutId = store.selectTempSelectedLayoutId();
    store.setSelectedLayoutId({
      layoutId: tempSelectedLayoutId,
    });
  } else if (tab === "videos") {
    const { videos } = repository.getState();
    const tempSelectedVideoId = store.selectTempSelectedVideoId();
    const tempSelectedVideo = toFlatItems(videos).find(
      (video) => video.id === tempSelectedVideoId,
    );
    store.setSelectedVideoAndFileId({
      videoId: tempSelectedVideoId,
      fileId: tempSelectedVideo.fileId,
    });
  }

  store.setMode({
    mode: "current",
  });
  render();
};
