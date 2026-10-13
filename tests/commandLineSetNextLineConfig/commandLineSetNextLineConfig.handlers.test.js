import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectDefaultValues,
  setDefaultValues,
} from "../../src/components/commandLineSetNextLineConfig/commandLineSetNextLineConfig.store.js";
import {
  handleBeforeMount,
  handleFormChange,
  handleSubmitClick,
} from "../../src/components/commandLineSetNextLineConfig/commandLineSetNextLineConfig.handlers.js";
import { collectNonJsonFields } from "../../src/deps/services/shared/commandApi/shared.js";

const createDeps = ({ setNextLineConfig } = {}) => {
  const state = createInitialState();

  return {
    dispatchEvent: vi.fn(),
    props: { setNextLineConfig },
    render: vi.fn(),
    store: {
      selectDefaultValues: () => selectDefaultValues({ state }),
      setDefaultValues: (payload) => setDefaultValues({ state }, payload),
    },
  };
};

const submit = (deps) => {
  handleSubmitClick(deps);

  expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
  return deps.dispatchEvent.mock.calls[0][0].detail;
};

// The names of the fields a line actions update would report as non-JSON.
const nonJsonFieldsOf = (detail) => {
  const fields = new Set();
  collectNonJsonFields({ lineId: "line-1", data: detail }, "payload", fields);
  return [...fields];
};

describe("commandLineSetNextLineConfig.handlers", () => {
  it("submits a new config without a requireLineCompleted field", () => {
    const deps = createDeps();
    handleBeforeMount(deps);

    const detail = submit(deps);

    // Strict equality tells a field set to undefined from a missing one.
    expect(detail).toStrictEqual({
      setNextLineConfig: {
        applyMode: "singleLine",
        manual: {
          enabled: true,
        },
        auto: {
          enabled: false,
          trigger: "fromComplete",
          delay: 1000,
        },
      },
    });
    expect(nonJsonFieldsOf(detail)).toEqual([]);
  });

  it("keeps a new config free of the field after the form changes", () => {
    const deps = createDeps();
    handleBeforeMount(deps);
    handleFormChange(deps, {
      _event: {
        detail: {
          values: {
            applyMode: "persistent",
            manualEnabled: false,
            autoEnabled: true,
            autoTrigger: "fromStart",
            autoDelay: "250",
          },
        },
      },
    });

    const detail = submit(deps);

    expect(detail).toStrictEqual({
      setNextLineConfig: {
        applyMode: "persistent",
        manual: {
          enabled: false,
        },
        auto: {
          enabled: true,
          trigger: "fromStart",
          delay: 250,
        },
      },
    });
    expect(nonJsonFieldsOf(detail)).toEqual([]);
  });

  it("submits requireLineCompleted as false when the edited config has none", () => {
    const deps = createDeps({
      setNextLineConfig: {
        applyMode: "persistent",
        manual: {
          enabled: false,
        },
        auto: {
          enabled: false,
        },
      },
    });
    handleBeforeMount(deps);

    const detail = submit(deps);

    expect(detail.setNextLineConfig.manual).toEqual({
      enabled: false,
      requireLineCompleted: false,
    });
    expect(nonJsonFieldsOf(detail)).toEqual([]);
  });

  it("keeps the requireLineCompleted value of the edited config", () => {
    const deps = createDeps({
      setNextLineConfig: {
        applyMode: "singleLine",
        manual: {
          enabled: true,
          requireLineCompleted: true,
        },
        auto: {
          enabled: false,
        },
      },
    });
    handleBeforeMount(deps);

    const detail = submit(deps);

    expect(detail.setNextLineConfig.manual).toEqual({
      enabled: true,
      requireLineCompleted: true,
    });
  });
});
