const getPayloadString = (payload, key) => {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const ASSET_PACK_EDITOR_PATH = "/project/asset-pack-editor";
export const ASSET_PACKS_PATH = "/project/asset-packs";

export const resolveAssetPackEditorPayload = (payload = {}) => ({
  assetPackId: getPayloadString(payload, "ap"),
});

export const createAssetPackEditorPayload = ({
  payload = {},
  assetPackId,
} = {}) => {
  const nextPayload = { ...payload };
  delete nextPayload.ap;

  if (assetPackId) {
    nextPayload.ap = assetPackId;
  }

  return nextPayload;
};

export const getAssetPackEditorBackPath = () => ASSET_PACKS_PATH;
