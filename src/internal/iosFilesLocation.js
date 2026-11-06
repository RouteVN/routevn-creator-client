// The iOS Files app names local storage after the device, as in "On My
// iPhone". Catalogs give one label per device instead of inserting the device
// name, so a language can decline it, as Polish does in "Na moim iPhonie".
export const selectOnMyDeviceLocation = (appCopy, deviceName) =>
  deviceName === "iPad"
    ? appCopy.iosOnMyIpadLocation
    : appCopy.iosOnMyIphoneLocation;
