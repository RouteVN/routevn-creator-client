export const waitForPlayerStart = async ({
  loadingElement,
  startMode,
} = {}) => {
  if (startMode !== "click" || !loadingElement) {
    return;
  }

  loadingElement.textContent = "Click to start";
  loadingElement.classList.add("ready");

  await new Promise((resolve) => {
    const handleClick = () => {
      loadingElement.removeEventListener("click", handleClick);
      resolve();
    };

    loadingElement.addEventListener("click", handleClick);
  });

  loadingElement.classList.remove("ready");
};
