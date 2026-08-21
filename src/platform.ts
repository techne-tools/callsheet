// Minimal platform detection for the webview.
//
// Tauri webviews report the host OS in the user agent: "Macintosh" (macOS),
// "Windows NT" (Windows), "Linux" (Linux). We only need to distinguish macOS
// for the dock toggle and the Cmd/Ctrl modifier label.
export const isMac = navigator.userAgent.includes("Mac");

/** The primary modifier label for the current platform. */
export const modLabel = isMac ? "Cmd" : "Ctrl";
