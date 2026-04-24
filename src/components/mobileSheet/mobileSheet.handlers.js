export const handleOverlayClick = ({ dispatchEvent }) => {
  dispatchEvent(new CustomEvent("close", { detail: {}, bubbles: true }));
};
