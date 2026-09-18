const { existsSync } = require("node:fs");
const { join } = require("node:path");
module.exports = async function checkVoicePackage(context) {
  if (context.electronPlatformName !== "win32") return;
  for (const variant of ["cpu", "cpu-avx2"]) {
    if (
      !existsSync(
        join(
          context.packager.projectDir,
          "resources",
          "voice",
          "bin",
          variant,
          "computercat-whisper.exe",
        ),
      )
    ) {
      throw new Error(
        "Build the pinned speech helpers with npm run voice:build before Windows packaging.",
      );
    }
  }
};
