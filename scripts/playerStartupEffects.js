// Resolve the opening scene once, without rendering, saving, or running timers
// until the player starts. The normal effects handler owns playback afterward.
export const createPlayerStartupEffects = ({ getEngine, effectsHandler }) => {
  let waiting = true;
  let pending = [];
  let schedule;

  const handleEffects = (effects) => {
    if (!waiting) return effectsHandler(effects);

    for (const effect of effects) {
      if (effect.name !== "handleLineActions") {
        pending.push(effect);
      }
    }
    // Match the normal handler's latest-wins entered-line reconciliation.
    const enteredLine = effects.findLast(
      (effect) => effect.name === "handleLineActions",
    );
    if (enteredLine) getEngine().handleLineActions(enteredLine.payload);
  };

  handleEffects.reconcilePlaybackScheduleV1 = (nextSchedule) => {
    if (waiting) {
      schedule = nextSchedule;
    } else {
      effectsHandler.reconcilePlaybackScheduleV1(nextSchedule);
    }
  };
  handleEffects.reset = () => {
    pending = [];
    schedule = undefined;
    effectsHandler.reset();
  };
  handleEffects.dispose = () => {
    pending = [];
    schedule = undefined;
    effectsHandler.dispose();
  };
  handleEffects.start = () => {
    if (!waiting) return;
    waiting = false;
    const effects = pending;
    pending = [];
    if (schedule) effectsHandler.reconcilePlaybackScheduleV1(schedule);
    schedule = undefined;
    // An empty opening line still needs its first render.
    effectsHandler([...effects, { name: "render" }]);
  };

  return handleEffects;
};
