import { computeSha256 } from "../../clients/sha256.js";
import { stableStringify } from "../../../internal/stableStringify.js";

// The hash of what a thumbnail is drawn from, saved with it as
// `thumbnailSourceHash`, so the app can tell whether the saved thumbnail still
// shows it. `renderState` must hold only what is drawn: file ids, not blob
// URLs, and no selection outline. Bump `version` when the same state starts
// drawing differently, so saved thumbnails are drawn again.
export const createThumbnailSourceHash = ({ version, renderState }) =>
  computeSha256(
    new TextEncoder().encode(stableStringify({ v: version, renderState })),
  );
