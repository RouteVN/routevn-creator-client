export const updatePlayerLoadingProgress = (
  loadingElement,
  { loaded, total },
) => {
  const progress = loadingElement?.querySelector("#loading-progress");
  // Native players have no loading UI; errors replace it with diagnostics.
  if (!progress) return;

  const percentage = total === 0 ? 100 : Math.floor((loaded / total) * 100);
  progress.value = percentage;
  loadingElement.querySelector("#loading-percentage").textContent =
    `${percentage}%`;
};
