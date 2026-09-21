// Offline fixture: persist a fake OAuth connection using Electron's actual OS encryption.
const { app, safeStorage } = require("electron");
const { writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const directory = process.argv[2];
app.setPath("userData", directory);
app.setPath("sessionData", directory);
app.whenReady().then(async () => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("No OS encryption for fixture.");
  await writeFile(
    join(directory, "codex-credentials.enc"),
    safeStorage.encryptString(
      JSON.stringify({
        type: "oauth",
        access: "offline-access-only",
        refresh: "offline-refresh-only",
        accountId: "offline-account",
        expires: Date.now() + 3600000,
      }),
    ),
  );
  console.log("Offline connection saved.");
  app.quit();
});
