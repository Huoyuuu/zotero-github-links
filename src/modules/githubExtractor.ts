import { getPref } from "../utils/prefs";

export interface GitHubExtractionResult {
  links: string[];
  cacheKey: string;
  fromCache: boolean;
}

const itemCache = new Map<string, string[]>();

/**
 * Extract GitHub repository links from item metadata and, when enabled,
 * from already indexed / freshly indexed PDF full text. This never opens the
 * PDF reader; it relies on Zotero's Fulltext service first and has guarded
 * compatibility fallbacks for Zotero 7/8 API differences.
 */
export async function extractGitHubLinks(
  item: Zotero.Item,
  forceRefresh = false,
): Promise<GitHubExtractionResult> {
  const cacheKey = buildCacheKey(item);
  if (!forceRefresh && itemCache.has(cacheKey)) {
    return { links: itemCache.get(cacheKey) || [], cacheKey, fromCache: true };
  }

  const found = new Set<string>();
  addGitHubMatches(found, safeGetField(item, "url"));
  addGitHubMatches(found, safeGetField(item, "extra"));

  if (getPref("extractFromPDF")) {
    for (const attID of getPDFLikeAttachmentIDs(item)) {
      try {
        const text = await getAttachmentFulltext(attID);
        addGitHubMatches(found, text);
      } catch (err) {
        Zotero.debug(
          `[Zotero GitHub Links] Failed to extract PDF text for attachment ${attID}: ${err}`,
        );
      }
    }
  }

  const links = [...found].sort((a, b) => a.localeCompare(b));
  itemCache.clear();
  itemCache.set(cacheKey, links);
  return { links, cacheKey, fromCache: false };
}

export function clearGitHubLinksCache() {
  itemCache.clear();
}

function buildCacheKey(item: Zotero.Item): string {
  const parts = [String(item.id), String((item as any).dateModified || "")];
  for (const attID of getPDFLikeAttachmentIDs(item)) {
    const att = Zotero.Items.get(attID) as any;
    parts.push(
      `${attID}:${att?.dateModified || ""}:${att?.attachmentModificationTime || ""}`,
    );
  }
  return parts.join("|");
}

function getPDFLikeAttachmentIDs(item: Zotero.Item): number[] {
  if (!item?.isRegularItem?.()) return [];
  return item
    .getAttachments()
    .filter((attID) => isPDFAttachment(Zotero.Items.get(attID)));
}

function isPDFAttachment(
  att: Zotero.Item | false | undefined,
): att is Zotero.Item {
  if (!att) return false;
  try {
    if (att.isPDFAttachment?.()) return true;
  } catch (err) {
    Zotero.debug(`[Zotero GitHub Links] PDF attachment check failed: ${err}`);
  }
  return String((att as any).attachmentFilename || "")
    .toLowerCase()
    .endsWith(".pdf");
}

function safeGetField(item: Zotero.Item, field: string): string {
  try {
    return String(item.getField(field) || "");
  } catch (_) {
    return "";
  }
}

async function getAttachmentFulltext(attID: number): Promise<string> {
  const Fulltext = Zotero.Fulltext as any;

  // Zotero 7/8 generally exposes Fulltext.isIndexed/indexItems for attachments.
  // Some beta/nightly builds differ, so every call is guarded and logged.
  try {
    const indexed = await Fulltext.isIndexed?.(attID);
    if (!indexed && Fulltext.indexItems) {
      await Fulltext.indexItems([attID]);
    }
  } catch (err) {
    Zotero.debug(`[Zotero GitHub Links] Fulltext index request failed: ${err}`);
  }

  const candidates = [
    () => Fulltext.getItemText?.(attID),
    () => Fulltext.getCachedItemText?.(attID),
    () => Fulltext.getCachedPageText?.(attID),
  ];

  for (const reader of candidates) {
    try {
      const value = await reader();
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.join("\n");
      if (value && typeof value === "object") {
        return Object.values(value).join("\n");
      }
    } catch (err) {
      Zotero.debug(`[Zotero GitHub Links] Fulltext reader failed: ${err}`);
    }
  }

  // If the Fulltext API surface changes, prefer not to block the item pane.
  // Future fallback can use Zotero.PDFWorker or attachment file path extraction.
  return "";
}

export function addGitHubMatches(target: Set<string>, text: string) {
  const regex = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/gi;
  for (const match of text.matchAll(regex)) {
    target.add(normalizeGitHubURL(match[0]));
  }
}

function normalizeGitHubURL(url: string): string {
  return url.replace(/[\s\])}>.,;:'"，。；：）】》]+$/g, "").replace(/\/$/, "");
}

export function displayLabel(url: string): string {
  try {
    const u = new URL(url);
    return (
      u.pathname.replace(/^\//, "").split("/").slice(0, 2).join("/") || url
    );
  } catch (_) {
    return url;
  }
}
