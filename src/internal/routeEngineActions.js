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

// Returns the value with every updateVariable action id mapped, copying only
// the objects on the way to a changed id.
export const normalizeUpdateVariableIds = (value) => {
  if (!value || typeof value !== "object") return value;
  let result = value;
  for (const [key, child] of Object.entries(value)) {
    let next = normalizeUpdateVariableIds(child);
    if (key === "updateVariable" && next && typeof next === "object") {
      const id = normalizeUpdateVariableId(next.id);
      if (id !== next.id) next = { ...next, id };
    }
    if (next !== child) {
      if (result === value)
        result = Array.isArray(value) ? [...value] : { ...value };
      result[key] = next;
    }
  }
  return result;
};
