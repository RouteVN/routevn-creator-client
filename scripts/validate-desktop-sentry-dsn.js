const [environment, dsn] = process.argv.slice(2);

if (environment !== "production" && environment !== "development") {
  console.error("Invalid desktop error collector environment.");
  process.exit(1);
}

let url;
try {
  url = new URL(dsn);
} catch {
  console.error("Invalid desktop error collector DSN.");
  process.exit(1);
}

const isProduction = environment === "production";
const validHost = isProduction
  ? url.hostname === "api1.routevn.com" && url.protocol === "https:"
  : ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.protocol === "http:";
const validKey = isProduction
  ? /^[a-f0-9]{32}$/i.test(url.username)
  : url.username === "11111111111111111111111111111111";

if (
  !validHost ||
  !validKey ||
  url.password ||
  url.pathname !== "/system/sentry/1" ||
  url.search ||
  url.hash
) {
  console.error(`Invalid ${environment} desktop error collector DSN.`);
  process.exit(1);
}
