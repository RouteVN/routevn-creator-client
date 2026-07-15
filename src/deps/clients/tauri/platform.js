export const isMacosHost = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgentPlatform = navigator.userAgentData?.platform;
  if (typeof userAgentPlatform === "string") {
    return userAgentPlatform === "macOS";
  }

  return /Mac/.test(navigator.platform ?? "");
};
