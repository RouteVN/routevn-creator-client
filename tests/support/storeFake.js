/**
 * Bridges a hand-written fake store to the component's REAL selectors.
 *
 * Handler tests historically hand-rolled `store: { selectFoo: vi.fn(() => ...) }`.
 * That drifts: the moment a handler calls one more selector, the fake lacks it and
 * the test dies with `TypeError: store.selectFoo is not a function` — a failure that
 * says nothing about correctness.
 *
 * Wrap the fake instead. Selectors are delegated to the real store module, evaluated
 * against whatever `getState()` returns, so adding a selector call in a handler needs
 * no test change and the selector logic under test is the shipping one.
 *
 *   import * as store from "../../src/pages/characters/characters.store.js";
 *
 *   store: withSelectors(
 *     { getState: () => state, setItems: vi.fn() },
 *     store,
 *   )
 *
 * Pass an explicit subset when you want only some selectors bridged:
 *
 *   withSelectors({ getState: () => state }, { selectEditCharacterDraft })
 */
export const withSelectors = (fake, selectors) => {
  const bridged = { ...fake };

  Object.entries(selectors).forEach(([name, selector]) => {
    if (!name.startsWith("select") || typeof selector !== "function") {
      return;
    }
    // Never clobber an explicit override the test set up on purpose.
    if (name in fake) {
      return;
    }
    bridged[name] = (payload) => selector({ state: fake.getState() }, payload);
  });

  return bridged;
};
