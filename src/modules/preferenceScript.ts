export async function registerPrefsScripts(_window: Window) {
  addon.data.prefs = { window: _window, columns: [], rows: [] };
  ztoolkit.log("Zotero GitHub Links preferences loaded");
}
