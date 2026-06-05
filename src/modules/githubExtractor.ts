import { getPref } from "../utils/prefs";

export interface GitHubExtractionResult {
  links: string[];
  cacheKey: string;
  fromCache: boolean;
}

const itemCache = new Map<string, string[]>();

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
        Zotero.debug(
          `[Zotero GitHub Links] Attachment ${attID} text length: ${text.length}`,
        );
        addGitHubMatches(found, text);
      } catch (err) {
        Zotero.debug(
          `[Zotero GitHub Links] Failed to extract PDF text for attachment ${attID}: ${err}`,
        );
      }
    }
  }

  const links = [...found].sort((a, b) => a.localeCompare(b));
  Zotero.debug(`[Zotero GitHub Links] Found ${links.length} link(s)`);
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
  const parts: string[] = [];

  try {
    const indexed = await Fulltext.isIndexed?.(attID);
    if (!indexed && Fulltext.indexItems) {
      await Fulltext.indexItems([attID]);
    }
  } catch (err) {
    Zotero.debug(`[Zotero GitHub Links] Fulltext index request failed: ${err}`);
  }

  const candidates = [
    ["getItemText", () => Fulltext.getItemText?.(attID)],
    ["getCachedItemText", () => Fulltext.getCachedItemText?.(attID)],
    ["getCachedPageText", () => Fulltext.getCachedPageText?.(attID)],
    ["getPages", () => Fulltext.getPages?.(attID)],
  ] as const;

  for (const [name, reader] of candidates) {
    try {
      const value = await reader();
      const text = stringifyFulltextValue(value);
      if (text) {
        Zotero.debug(
          `[Zotero GitHub Links] Read ${text.length} chars via Zotero.Fulltext.${name}`,
        );
        parts.push(text);
      }
    } catch (err) {
      Zotero.debug(`[Zotero GitHub Links] Fulltext.${name} failed: ${err}`);
    }
  }

  const cacheText = await readFulltextCacheFile(attID);
  if (cacheText) parts.push(cacheText);

  const pdfWorkerText = await readViaPDFWorker(attID);
  if (pdfWorkerText) parts.push(pdfWorkerText);

  return parts.join("\n");
}

function stringifyFulltextValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringifyFulltextValue).join("\n");
  if (typeof value === "object")
    return Object.values(value).map(String).join("\n");
  return String(value);
}

async function readFulltextCacheFile(attID: number): Promise<string> {
  const Fulltext = Zotero.Fulltext as any;
  const att = Zotero.Items.get(attID);
  const candidates = [
    () => Fulltext.getItemProcessorCacheFile?.(att),
    () => Fulltext.getItemProcessorCacheFile?.(attID),
    () => Fulltext.getProcessorCacheFile?.(att),
    () => Fulltext.getProcessorCacheFile?.(attID),
    () => Fulltext.getCacheFile?.(att),
    () => Fulltext.getCacheFile?.(attID),
  ];

  for (const getFile of candidates) {
    try {
      const file = await getFile();
      const path = file?.path || file;
      if (typeof path !== "string") continue;
      const text = await readUTF8File(path);
      if (text) {
        Zotero.debug(
          `[Zotero GitHub Links] Read ${text.length} chars from fulltext cache ${path}`,
        );
        return text;
      }
    } catch (err) {
      Zotero.debug(`[Zotero GitHub Links] Fulltext cache read failed: ${err}`);
    }
  }
  return "";
}

async function readViaPDFWorker(attID: number): Promise<string> {
  const PDFWorker = Zotero.PDFWorker as any;
  const att = Zotero.Items.get(attID) as any;
  const path = await getAttachmentPath(att);
  const candidates = [
    () => PDFWorker.getFullText?.(attID),
    () => PDFWorker.getFullText?.(att),
    () => PDFWorker.getFullText?.(path),
    () => PDFWorker.extractText?.(path),
    () => PDFWorker.getText?.(path),
  ];

  for (const reader of candidates) {
    try {
      const text = stringifyFulltextValue(await reader());
      if (text) {
        Zotero.debug(
          `[Zotero GitHub Links] Read ${text.length} chars via PDFWorker fallback`,
        );
        return text;
      }
    } catch (err) {
      Zotero.debug(`[Zotero GitHub Links] PDFWorker fallback failed: ${err}`);
    }
  }
  return "";
}

async function getAttachmentPath(att: Zotero.Item | false): Promise<string> {
  if (!att) return "";
  try {
    return String((await (att as any).getFilePathAsync?.()) || "");
  } catch (_) {
    return String((att as any).attachmentPath || "");
  }
}

async function readUTF8File(path: string): Promise<string> {
  try {
    if (typeof IOUtils !== "undefined") {
      return await IOUtils.readUTF8(path);
    }
  } catch (_) {
    // Fall through to OS.File if available.
  }
  try {
    const OS = (ChromeUtils as any).importESModule?.(
      "resource://gre/modules/osfile.sys.mjs",
    )?.OS;
    if (OS?.File?.read) {
      const bytes = await OS.File.read(path);
      return new TextDecoder().decode(bytes);
    }
  } catch (err) {
    Zotero.debug(`[Zotero GitHub Links] UTF-8 file read failed: ${err}`);
  }
  return "";
}

export function addGitHubMatches(target: Set<string>, text: string) {
  if (!text) return;

  // Normal URL in metadata or raw full-text cache.
  const normal = /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/gi;
  for (const match of text.matchAll(normal)) {
    target.add(normalizeGitHubURL(match[0]));
  }

  // Zotero 9 fulltext indexing can expose tokenized text where punctuation is
  // removed, e.g. "https github com owner repo". Rebuild those conservatively.
  const tokenized =
    /(?:https?\s+)?github\s+(?:com\s+)?([a-z0-9][\w.-]{0,38})\s+([a-z0-9][\w.-]{0,100})/gi;
  for (const match of text.matchAll(tokenized)) {
    const owner = match[1];
    const repo = match[2];
    if (isLikelyNonRepoToken(owner) || isLikelyNonRepoToken(repo)) continue;
    target.add(`https://github.com/${owner}/${repo}`);
  }
}

function isLikelyNonRepoToken(token: string): boolean {
  return /^(com|www|http|https|doi|org|the|and|for|with|from|permission|copyright|code|available)$/i.test(
    token,
  );
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
