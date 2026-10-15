// Every dispatch returns a Promise, so callers can chain on UI actions
// (e.g. updatePlayerStats(...).then(...)). This used to be the turn engine's validator.
const promiseDispatch = () => (next) => (action) => Promise.resolve(next(action));

export default promiseDispatch;
