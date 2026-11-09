// The device's preferred languages as BCP 47 tags, most preferred first, as
// the web view reports them. It reports the system languages on Android and
// iOS and in the desktop app (WebKit gives only the first), and the browser's
// languages on the web.
export const getDeviceLanguages = (navigator = globalThis.navigator) => {
  if (navigator?.languages?.length > 0) {
    return [...navigator.languages];
  }
  return navigator?.language ? [navigator.language] : [];
};
