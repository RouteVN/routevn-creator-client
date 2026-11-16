// Route Engine checks each updateVariable action's own id against
// /^[a-zA-Z0-9]+$/. Older or imported projects can hold other ids, such as
// "update-score". Each such id maps to "uv" plus the UTF-16 code units in hex:
// the mapping is one-to-one, and its length (2 + 4n) never equals the
// 12-character Base58 ids the client generates, so it cannot collide with them.
export const normalizeUpdateVariableId = (id) => {
  if (typeof id === "string" && /^[a-zA-Z0-9]+$/.test(id)) return id;
  const value = String(id ?? "");
  let result = "uv";
  for (let index = 0; index < value.length; index += 1) {
    result += value.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return result;
};

const normalizeUpdateVariableAction = (action) => {
  const id = normalizeUpdateVariableId(action.id);
  return id === action.id ? action : { ...action, id };
};

// Route Engine throws on every render that starts the auto-advance timer of a
// Next Line Config with a negative delay. The Delay field used to accept one,
// so a saved negative delay is read as 0.
const normalizeSetNextLineConfigAction = (action) => {
  const delay = action.auto?.delay;
  if (!(typeof delay === "number" && delay < 0)) return action;
  return { ...action, auto: { ...action.auto, delay: 0 } };
};

const ACTION_NORMALIZERS = new Map([
  ["updateVariable", normalizeUpdateVariableAction],
  ["setNextLineConfig", normalizeSetNextLineConfigAction],
]);

// Returns the value with every action Route Engine would reject fixed,
// copying only the objects on the way to a changed action.
export const normalizeRouteEngineActions = (value) => {
  if (!value || typeof value !== "object") return value;
  let result = value;
  for (const [key, child] of Object.entries(value)) {
    let next = normalizeRouteEngineActions(child);
    const normalizeAction = ACTION_NORMALIZERS.get(key);
    if (normalizeAction && next && typeof next === "object") {
      next = normalizeAction(next);
    }
    if (next !== child) {
      if (result === value)
        result = Array.isArray(value) ? [...value] : { ...value };
      result[key] = next;
    }
  }
  return result;
};
