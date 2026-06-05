import { initLocale } from "./utils/locale";
import { registerItemPaneSection } from "./modules/itemPaneSection";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  registerItemPaneSection();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );
  registerStyleSheet(win);
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

function registerStyleSheet(win: Window) {
  const href = `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`;
  if (win.document.querySelector(`link[href="${href}"]`)) return;
  const link = win.document.createElement("link");
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = href;
  win.document.documentElement?.append(link);
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify: async () => undefined,
  onPrefsEvent: async () => undefined,
  onShortcuts: () => undefined,
  onDialogEvents: () => undefined,
};


