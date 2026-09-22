import type { FullConfig } from "@playwright/test";

/** Native foreground/input ownership is shared by every process on the desktop. */
export default function validateLabExecution(config: FullConfig) {
  if (config.workers !== 1)
    throw new Error(
      "Computer-use lab requires exactly one worker; parallel native input is invalid.",
    );
  if (config.projects.some((project) => project.retries !== 0))
    throw new Error("Computer-use lab requires zero retries; retain every original attempt.");
}
