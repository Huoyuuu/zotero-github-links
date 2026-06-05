import { clearGitHubLinksCache, displayLabel, extractGitHubLinks } from "./githubExtractor";
import { getString } from "../utils/locale";

export function registerItemPaneSection() {
  Zotero.ItemPaneManager.registerSection({
    paneID: "github-links",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: "zoterogithublinks-item-section-head-text",
      icon: "chrome://zoterogithublinks/content/icons/github.svg",
    },
    sidenav: {
      l10nID: "zoterogithublinks-item-section-sidenav-tooltip",
      icon: "chrome://zoterogithublinks/content/icons/github.svg",
    },
    onRender: ({ body, item, setSectionSummary }) => {
      renderSection(body, item, setSectionSummary, false);
    },
  });
}

function renderSection(
  body: HTMLElement,
  item: Zotero.Item | undefined,
  setSectionSummary?: (summary: string) => void,
  forceRefresh = false,
) {
  body.classList.add("zotero-github-links-section");
  body.textContent = "";
  body.append(createToolbar(body, item, setSectionSummary));
  const content = body.ownerDocument!.createElement("div");
  content.className = "zgl-content";
  content.textContent = getString("github-links-extracting");
  body.append(content);
  setSectionSummary?.("…");

  if (!item) {
    content.textContent = getString("github-links-select-item");
    setSectionSummary?.("-");
    return;
  }

  void extractGitHubLinks(item, forceRefresh)
    .then(({ links }) => {
      content.textContent = "";
      if (!links.length) {
        content.append(createMessage(body, getString("github-links-empty")));
        setSectionSummary?.("0");
        return;
      }
      const list = body.ownerDocument!.createElement("div");
      list.className = "zgl-list";
      for (const url of links) {
        const row = body.ownerDocument!.createElement("div");
        row.className = "zgl-row";
        const a = body.ownerDocument!.createElement("a");
        a.href = url;
        a.textContent = displayLabel(url);
        a.title = url;
        a.addEventListener("click", (ev) => {
          ev.preventDefault();
          Zotero.launchURL(url);
        });
        row.append(a);
        list.append(row);
      }
      content.append(list);
      setSectionSummary?.(String(links.length));
    })
    .catch((err) => {
      Zotero.debug(`[Zotero GitHub Links] Render failed: ${err}`);
      content.textContent = getString("github-links-error");
      content.classList.add("zgl-error");
      setSectionSummary?.("error");
    });
}

function createToolbar(
  body: HTMLElement,
  item: Zotero.Item | undefined,
  setSectionSummary?: (summary: string) => void,
): HTMLElement {
  const bar = body.ownerDocument!.createElement("div");
  bar.className = "zgl-toolbar";

  const copy = createButton(body, "⧉", getString("github-links-copy"));
  copy.addEventListener("click", async () => {
    if (!item) return;
    const { links } = await extractGitHubLinks(item);
    const helper = (Components.classes as any)[
      "@mozilla.org/widget/clipboardhelper;1"
    ].getService(Components.interfaces.nsIClipboardHelper) as nsIClipboardHelper;
    helper.copyString(links.join("\n"));
  });

  const refresh = createButton(body, "↻", getString("github-links-refresh"));
  refresh.addEventListener("click", () => {
    clearGitHubLinksCache();
    renderSection(body, item, setSectionSummary, true);
  });

  bar.append(copy, refresh);
  return bar;
}

function createButton(
  body: HTMLElement,
  text: string,
  title: string,
): HTMLButtonElement {
  const btn = body.ownerDocument!.createElement("button");
  btn.className = "zgl-button";
  btn.type = "button";
  btn.textContent = text;
  btn.title = title;
  return btn;
}

function createMessage(body: HTMLElement, text: string) {
  const div = body.ownerDocument!.createElement("div");
  div.className = "zgl-muted";
  div.textContent = text;
  return div;
}

