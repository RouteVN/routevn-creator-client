export function getCanvasRoot() {
  return (
    this.shadowRoot?.querySelector("#canvas") ||
    this.querySelector("#canvas")
  );
}
