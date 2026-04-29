// [VOICE-DEBUG-CAPTURE] IPC handlers for the dev-only voice pipeline capture.
// The renderer encodes WAVs and serializes metadata; main writes the bundle
// to a user-picked directory. Two IPC endpoints — pickDir, writeBundle —
// matched to the existing screenshare:* handler pattern.

import { promises as fs } from "node:fs";
import { join } from "node:path";

import { dialog, ipcMain } from "electron";

import { mainWindow } from "./window";

interface BundleFile {
  name: string;
  buffer: ArrayBuffer;
}

interface WriteBundlePayload {
  parentDir: string;
  subfolderName: string;
  files: BundleFile[];
  metadata: Record<string, unknown>;
}

let registered = false;

export function initDebugCapture() {
  if (registered) return;
  registered = true;

  ipcMain.handle("debug-capture:pickDir", async () => {
    if (!mainWindow) return { canceled: true, path: null };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose folder for voice debug capture",
      buttonLabel: "Save here",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null };
    }
    return { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle("debug-capture:writeBundle", async (_e, payload: WriteBundlePayload) => {
    const { parentDir, subfolderName, files, metadata } = payload;
    if (!parentDir || !subfolderName || !Array.isArray(files)) {
      throw new Error("debug-capture:writeBundle invalid payload");
    }
    // Defensive: only allow capture-named subfolders to limit the IPC surface.
    if (!/^stoat-capture-[0-9-]+$/.test(subfolderName)) {
      throw new Error(`debug-capture:writeBundle suspicious subfolder name: ${subfolderName}`);
    }
    const targetDir = join(parentDir, subfolderName);
    await fs.mkdir(targetDir, { recursive: true });

    for (const f of files) {
      // Filenames are fixed in the renderer; sanity check anyway so a bad
      // payload can't escape the chosen directory via "..".
      if (!/^[0-9a-z_]+\.wav$/i.test(f.name)) {
        throw new Error(`debug-capture:writeBundle invalid filename: ${f.name}`);
      }
      const buf = Buffer.from(f.buffer);
      await fs.writeFile(join(targetDir, f.name), buf);
    }

    await fs.writeFile(
      join(targetDir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8",
    );

    return { path: targetDir };
  });
}
