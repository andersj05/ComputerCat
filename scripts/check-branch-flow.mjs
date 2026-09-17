const { BASE, HEAD, AUTHOR } = process.env;
const valid =
  (BASE === "main" && HEAD === "dev") ||
  (BASE === "dev" &&
    (HEAD?.startsWith("feat/") ||
      (AUTHOR === "dependabot[bot]" && HEAD?.startsWith("dependabot/"))));
if (!valid) {
  console.error("Pull requests must follow feat/<name> -> dev -> main.");
  process.exitCode = 1;
}
