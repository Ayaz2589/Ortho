// `ws` is only dynamically imported as a WebSocket polyfill on Node < 22
// (see db/client.ts). Its bundled types aren't resolved under our tsconfig's
// dynamic import, so declare it loosely — we only use the default export.
declare module 'ws'
