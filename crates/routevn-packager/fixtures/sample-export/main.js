const status = document.querySelector("#status");
const payload = document.querySelector("#payload");

async function boot() {
  const response = await fetch("./package.bin");
  if (!response.ok) {
    throw new Error(`Failed to load package.bin: ${response.status}`);
  }

  const text = await response.text();
  status.textContent = "package.bin loaded successfully";
  payload.textContent = text;
}

boot().catch((error) => {
  status.textContent = "Failed to load package.bin";
  payload.textContent = String(error);
});
