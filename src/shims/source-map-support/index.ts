/**
 * Stub implementation for `source-map-support` so the browser bundle
 * does not attempt to include Node-focused stack trace helpers.
 */
export function install() {
  // no-op in the browser
}

export default {
  install,
};
