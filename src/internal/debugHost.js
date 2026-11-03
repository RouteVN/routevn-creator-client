// A host on this machine or a private network, where debug builds reach
// local servers.
export const isDebugHost = (hostname) => {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local"))
    return true;
  if (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd")))
    return true;
  const parts = host.split(".");
  if (parts.some((part) => !/^(?:0|[1-9][0-9]{0,2})$/.test(part))) return false;
  const octets = parts.map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  )
    return false;
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
};
