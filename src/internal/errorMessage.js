// Native bridges may reject with a string instead of an Error.
export const getErrorMessage = (error) => {
  const message = typeof error === "string" ? error : error?.message;
  if (typeof message !== "string" || !message.trim()) return undefined;
  return message.trim();
};
