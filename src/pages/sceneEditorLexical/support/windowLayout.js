export const mountSceneEditorWindowLayout = ({
  windowMetricsClient,
  store,
  render,
}) =>
  windowMetricsClient?.subscribe((metrics) => {
    store.setAppWindowMetrics(metrics);
    render();
  });
