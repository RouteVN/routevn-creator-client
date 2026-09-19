// Application release versions use SemVer, independently of project formats.
const identifier = "(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)";
const versionPattern = new RegExp(
  `^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-(${identifier}(?:\\.${identifier})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);

const parseVersion = (value) => {
  if (typeof value !== "string" || value.length > 128) return;
  const match = versionPattern.exec(value);
  if (!match || match[0] !== value) return;
  return {
    core: match.slice(1, 4).map(BigInt),
    prerelease: match[4]?.split("."),
  };
};

export const isUpdateVersion = (value) => Boolean(parseVersion(value));

const compare = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

export const compareUpdateVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error("Invalid application release version.");
  for (let index = 0; index < 3; index += 1) {
    const order = compare(a.core[index], b.core[index]);
    if (order) return order;
  }
  if (!a.prerelease) return b.prerelease ? 1 : 0;
  if (!b.prerelease) return -1;
  for (
    let index = 0;
    index < Math.max(a.prerelease.length, b.prerelease.length);
    index += 1
  ) {
    const x = a.prerelease[index];
    const y = b.prerelease[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numericX = /^[0-9]+$/.test(x);
    const numericY = /^[0-9]+$/.test(y);
    const order =
      numericX && numericY
        ? compare(BigInt(x), BigInt(y))
        : numericX !== numericY
          ? numericX
            ? -1
            : 1
          : compare(x, y);
    if (order) return order;
  }
  return 0;
};
