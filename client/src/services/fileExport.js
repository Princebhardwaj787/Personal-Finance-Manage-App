/**
 * FILE EXPORT / IMPORT (Android conversion — Phase F)
 * ===================================================
 * Writes generated files to the device and shares them, and reads files the
 * user picks.
 *
 * Design decisions:
 *  - No broad storage permission is requested. The app writes into its OWN
 *    private directory and shares the file through the system share sheet, so
 *    the user chooses where it lands (Drive, Files, email, …). The app never
 *    reads arbitrary storage.
 *  - The Capacitor modules are imported lazily so the web build does not
 *    include them.
 *  - The web build keeps using the browser's download / file-input
 *    mechanisms, which is what the existing implementation does.
 */

import { isNativeBuild, isNativePlatform } from './platform';

/** The directory generated files are written to inside the app sandbox. */
export const EXPORT_DIRECTORY = 'finance-exports';

/**
 * The Capacitor plugin objects.
 *
 * IMPORTANT: a Capacitor plugin is a Proxy that returns a function for EVERY
 * property access, including `then`. If an async function RESOLVES with the
 * bare proxy, the promise machinery treats it as a thenable and calls
 * `proxy.then()`, which throws
 * "Capacitor.Plugins.X.then() is not implemented on android".
 * Every plugin is therefore returned WRAPPED in a plain object.
 */
const getFilesystem = async () => {
  const mod = await import('@capacitor/filesystem');
  return { Filesystem: mod.Filesystem, Directory: mod.Directory };
};

const getShare = async () => {
  const mod = await import('@capacitor/share');
  return { Share: mod.Share };
};

/**
 * Write a text or binary file into the app's private export directory.
 *
 * @param {string} filename
 * @param {string|Uint8Array} data
 * @returns {Promise<{uri: string, filename: string}>}
 */
export const writeExportFile = async (filename, data) => {
  const { Filesystem, Directory } = await getFilesystem();

  // Make sure the directory exists (it may not on a fresh install).
  try {
    await Filesystem.mkdir({ path: EXPORT_DIRECTORY, directory: Directory.Documents, recursive: true });
  } catch {
    // The directory may already exist — that is fine.
  }

  const isBinary = data instanceof Uint8Array;
  await Filesystem.writeFile({
    path: `${EXPORT_DIRECTORY}/${filename}`,
    data: isBinary ? base64FromBytes(data) : data,
    directory: Directory.Documents,
    recursive: true
  });

  const uri = await Filesystem.getUri({
    path: `${EXPORT_DIRECTORY}/${filename}`,
    directory: Directory.Documents
  });

  return { uri: uri.uri, filename };
};

/** Share an exported file through the system share sheet. */
export const shareExportFile = async ({ uri, filename, title = 'Finance export' }) => {
  const { Share } = await getShare();
  await Share.share({
    title,
    files: [uri],
    dialogTitle: title
  });
  return { uri, filename };
};

/**
 * Pick a file with the system document picker and return its contents.
 *
 * The picker is provided by `@capawesome/capacitor-file-picker`, which uses
 * the Storage Access Framework — no storage permission required.
 *
 * @param {string[]} [mimeTypes]
 * @returns {Promise<{name: string, text: string} | null>} null when cancelled
 */
export const pickTextFile = async (mimeTypes = ['application/json', 'text/plain', '*/*']) => {
  const { FilePicker } = await import('@capawesome/capacitor-file-picker');
  const { Filesystem, Directory } = await getFilesystem();

  const { files } = await FilePicker.pickFiles({
    types: mimeTypes,
    allowMultiple: false
  });

  if (!files || files.length === 0) return null; // cancelled

  const picked = files[0];
  const contents = await Filesystem.readFile({
    path: picked.path,
    directory: Directory.External
  });

  return {
    name: picked.name,
    text: typeof contents.data === 'string' ? contents.data : decodeBase64(contents.data)
  };
};

/* ------------------------------------------------------------------ */
/* Base64 helpers (no atob/btoa dependency — they must work everywhere) */
/* ------------------------------------------------------------------ */

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encode bytes as base64. */
export const base64FromBytes = (bytes) => {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    output += BASE64_CHARS[b0 >> 2];
    output += BASE64_CHARS[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    output += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    output += b2 === undefined ? '=' : BASE64_CHARS[b2 & 63];
  }
  return output;
};

/** Decode a base64 string to bytes. */
export const bytesFromBase64 = (text) => {
  const clean = String(text).replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes = [];

  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i]);
    const c1 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c2 = BASE64_CHARS.indexOf(clean[i + 2]);
    const c3 = BASE64_CHARS.indexOf(clean[i + 3]);

    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 >= 0) bytes.push(((c2 & 3) << 6) | c3);
  }

  return new Uint8Array(bytes);
};

/** Decode base64 into a UTF-8 string. */
export const decodeBase64 = (text) => new TextDecoder().decode(bytesFromBase64(text));

/* ------------------------------------------------------------------ */
/* Web fallbacks                                                       */
/* ------------------------------------------------------------------ */

/** Download generated content in the browser (the web build's existing path). */
export const downloadInBrowser = (filename, data) => {
  const isBinary = data instanceof Uint8Array;
  const blob = isBinary
    ? new Blob([data], { type: 'application/pdf' })
    : new Blob([data], { type: 'text/csv;charset=utf-8' });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { uri: url, filename };
};

/** Read a file the user picked in the browser. */
export const pickTextFileInBrowser = () =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const text = await file.text();
      resolve({ name: file.name, text });
    };
    input.click();
  });

/**
 * Write a generated file and offer it to the user, using the right
 * mechanism for the current platform.
 */
export const saveAndShare = async (filename, data, title = 'Finance export') => {
  if (isNativePlatform()) {
    const written = await writeExportFile(filename, data);
    await shareExportFile({ ...written, title });
    return written;
  }
  return downloadInBrowser(filename, data);
};

/** Read a user-picked file, using the right mechanism for the platform. */
export const pickBackupFile = async () => {
  if (isNativePlatform()) return pickTextFile();
  return pickTextFileInBrowser();
};

export { isNativeBuild };
