// spec 032 — `regenerator-runtime` ships no types. It is imported only for its
// side effect (defining the global `regeneratorRuntime` that @pdf-lib/fontkit's
// complex-script shaper needs); we never touch its exports.
declare module 'regenerator-runtime/runtime.js'
