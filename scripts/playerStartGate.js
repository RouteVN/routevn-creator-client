export const waitForPlayerStart = async ({
  loadingElement,
  startMode,
} = {}) => {
  if (startMode !== "click" || !loadingElement) {
    return;
  }

  const progress = loadingElement.querySelector(".loading-progress");
  const startButton = loadingElement.querySelector("#loading-start");
  const window = loadingElement.ownerDocument.defaultView;
  startButton.textContent = window.matchMedia("(pointer: coarse)").matches
    ? "Tap to start"
    : "Click to start";
  progress.inert = true;
  progress.setAttribute("aria-hidden", "true");
  startButton.disabled = false;
  loadingElement.classList.add("ready");

  await new Promise((resolve) => {
    loadingElement.addEventListener("click", resolve, { once: true });
  });

  startButton.disabled = true;
};
