export const createZoomHandlers = (componentName, deps) => {
  const { store, render, userConfig, getRefIds } = deps;

  return {
    handleBeforeMount: () => {
      const zoomLevel = userConfig.get(`${componentName}.zoomLevel`);
      store.setZoomLevel(zoomLevel || 1.0);
      render();
    },

    handleZoomChange: (e) => {
      const value = (e.currentTarget && e.currentTarget.value) || 1.0;
      const zoomLevel = parseFloat(value);

      userConfig.set(`${componentName}.zoomLevel`, zoomLevel.toFixed(1));
      store.setZoomLevel(zoomLevel);
      render();
    },

    handleZoomOut: () => {
      const currentZoom = store.selectCurrentZoomLevel();
      const newZoom = Math.max(0.5, currentZoom - 0.1);

      store.setZoomLevel(newZoom);

      // Update slider DOM element directly
      const sliderElement = getRefIds()["zoom-slider"]?.elm;
      if (sliderElement) {
        sliderElement.value = newZoom;
      }

      userConfig.set(`${componentName}.zoomLevel`, newZoom.toFixed(1));
      render();
    },

    handleZoomIn: () => {
      const currentZoom = store.selectCurrentZoomLevel();
      const newZoom = Math.min(4.0, currentZoom + 0.1);

      store.setZoomLevel(newZoom);

      // Update slider DOM element directly
      const sliderElement = getRefIds()["zoom-slider"]?.elm;
      if (sliderElement) {
        sliderElement.value = newZoom;
      }

      userConfig.set(`${componentName}.zoomLevel`, newZoom.toFixed(1));
      render();
    },
  };
};
