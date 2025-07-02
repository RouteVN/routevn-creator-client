import { Subject } from "rxjs";

/**
 * A custom subject that can be used to dispatch actions and subscribe to them
 * You can think of this as a bus for all frontend events and communication
 *
 * Example:
 * const subject = new CustomSubject();
 *
 * const subscription = subject.subscribe(({ action, payload }) => {
 *   console.log(action, payload);
 * });
 *
 * subject.dispatch("action", { payload: "payload" });
 *
 * subscription.unsubscribe();
 */
export default class CustomSubject {
  _subject = new Subject();
  pipe = (...args) => {
    return this._subject.pipe(...args);
  };
  dispatch = (action, payload) => {
    this._subject.next({
      action,
      payload: payload || {},
    });
  };
  dispatchCall = (action, payload) => {
    return () => this.dispatch(action, payload || {});
  };
}
