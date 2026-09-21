import type { ReactNode } from "react";

export type IconName =
  | "new"
  | "options"
  | "desktop"
  | "help"
  | "file"
  | "folder"
  | "search"
  | "terminal"
  | "clipboard"
  | "web"
  | "camera"
  | "selection"
  | "tabs";

const icons: Record<IconName, ReactNode> = {
  file: (
    <>
      <path fill="#4675a4" d="M3 0h7l4 4v12H3z" />
      <path fill="#fffdf0" d="M4 1h5v4h4v10H4z" />
      <path fill="#b8d8f3" d="m10 1 3 3h-3z" />
      <path fill="#7292ad" d="M6 7h5v1H6zm0 3h5v1H6zm0 3h3v1H6z" />
    </>
  ),
  folder: (
    <>
      <path fill="#97651f" d="M0 3h6l2 2h8v9H0z" />
      <path fill="#ffe49a" d="M1 4h5l2 2h7v7H1z" />
      <path fill="#ba8126" d="M0 7h16l-2 8H0z" />
      <path fill="#f4c95d" d="M1 8h14l-2 6H1z" />
      <path fill="#fff0b0" d="M2 8h12v1H2z" />
    </>
  ),
  search: (
    <>
      <path fill="#354d72" d="M4 0h6l3 3v6l-2 2 5 4-2 1-5-4H3L0 9V3z" />
      <path fill="#86badf" d="M4 1h5l3 3v4l-3 3H4L1 8V4z" />
      <path fill="#dff4ff" d="M4 2h4l3 3v3l-3 2H4L2 8V4z" />
      <path fill="#fff" d="M4 3h4v1H4z" />
      <path fill="#c38b45" d="m11 11 4 4-1 1-4-4z" />
    </>
  ),
  terminal: (
    <>
      <path fill="#3c536b" d="M0 1h16v14H0z" />
      <path fill="#699bd0" d="M1 2h14v2H1z" />
      <path fill="#172e3a" d="M1 5h14v9H1z" />
      <path fill="#b2ee86" d="m3 7 3 2-3 2v-1l2-1-2-1zm4 4h5v1H7z" />
      <path fill="#fff" d="M12 2h2v1h-2z" />
    </>
  ),
  clipboard: (
    <>
      <path fill="#976335" d="M2 2h12v14H2z" />
      <path fill="#edc990" d="M3 3h10v12H3z" />
      <path fill="#fffdf0" d="M4 4h8v10H4z" />
      <path fill="#577389" d="M5 1h2V0h2v1h2v4H5z" />
      <path fill="#c9d9df" d="M6 2h4v2H6z" />
      <path fill="#7292ad" d="M6 7h4v1H6zm0 3h4v1H6z" />
    </>
  ),
  web: (
    <>
      <path fill="#27588a" d="M4 0h8l4 4v8l-4 4H4l-4-4V4z" />
      <path fill="#70bcef" d="M4 1h8l3 3v8l-3 3H4l-3-3V4z" />
      <path fill="#3c883f" d="M4 2h4v2H6v3H3V5H2zm7 4h3v5h-2v3H9v-4H7V7h4z" />
      <path fill="#c0e8ff" d="M5 1h6v1H5zM1 7h14v1H1zM7 1h1v14H7z" />
    </>
  ),
  camera: (
    <>
      <path fill="#424f65" d="M5 2h6l1 2h4v10H0V4h4z" />
      <path fill="#bac8d7" d="M1 5h14v8H1z" />
      <path fill="#58738a" d="M6 5h4l2 2v3l-2 2H6l-2-2V7z" />
      <path fill="#183f70" d="M7 6h2l2 2v1l-2 2H7L5 9V8z" />
      <path fill="#80d1f5" d="M7 7h2v2H7z" />
      <path fill="#fff" d="M2 6h2v1H2z" />
      <path fill="#f1c354" d="M12 6h2v2h-2z" />
    </>
  ),
  selection: (
    <>
      <path fill="#4675a4" d="M1 0h14v16H1z" />
      <path fill="#fffdf0" d="M2 1h12v14H2z" />
      <path fill="#c4d4df" d="M4 3h8v1H4zm0 9h6v1H4z" />
      <path fill="#306ccb" d="M3 6h10v4H3z" />
      <path fill="#fff" d="M4 7h8v1H4z" />
    </>
  ),
  tabs: (
    <>
      <path fill="#547596" d="M0 2h7v2h9v11H0z" />
      <path fill="#7ba6d4" d="M8 2h7v2H8z" />
      <path fill="#fffdf0" d="M1 3h5v2h9v9H1z" />
      <path fill="#347bd0" d="M2 6h12v2H2z" />
      <path fill="#b0c5d6" d="M3 10h9v1H3z" />
    </>
  ),
  new: (
    <>
      <path fill="#4675a4" d="M2 0h8l4 4v11H2z" />
      <path fill="#fff" d="M3 1h6v4h4v9H3z" />
      <path fill="#bed8f5" d="m10 1 3 3h-3z" />
      <path fill="#91aec7" d="M5 7h6v1H5zm0 3h4v1H5z" />
      <path fill="#226422" d="M11 9h3v2h2v3h-2v2h-3v-2H9v-3h2z" />
      <path fill="#72bd48" d="M12 10h1v2h2v1h-2v2h-1v-2h-2v-1h2z" />
    </>
  ),
  options: (
    <>
      <path fill="#7a8aa3" d="M0 1h16v13H0z" />
      <path fill="#f4f1df" d="M1 4h14v9H1z" />
      <path fill="#387cd5" d="M1 2h14v2H1z" />
      <path fill="#fff" d="M12 2h2v1h-2z" />
      <path fill="#929182" d="M3 6h10v1H3zm0 4h10v1H3z" />
      <path fill="#60854b" d="M5 5h3v3H5z" />
      <path fill="#d78c38" d="M10 9h3v3h-3z" />
      <path fill="#c0e3a3" d="M6 5h1v2H6z" />
      <path fill="#f5d596" d="M11 9h1v2h-1z" />
    </>
  ),
  desktop: (
    <>
      <path fill="#6c7280" d="M1 0h14v11H1zm5 11h4v2H6zm-2 2h8v2H4z" />
      <path fill="#e4e5e6" d="M2 1h12v9H2z" />
      <path fill="#17488b" d="M3 2h10v6H3z" />
      <path fill="#70b6ee" d="M4 3h8v4H4z" />
      <path fill="#9dc76b" d="m4 6 4-2 4 1v2H4z" />
      <path fill="#c1c4ca" d="M7 11h2v2H7zm-2 2h6v1H5z" />
      <path fill="#75ad42" d="M11 9h2v1h-2z" />
    </>
  ),
  help: (
    <>
      <path fill="#245da8" d="M4 0h8l4 4v8l-4 4H4l-4-4V4z" />
      <path fill="#4889df" d="M4 1h8l3 3v8l-3 3H4l-3-3V4z" />
      <path fill="#fff" d="M5 3h5l2 2v2l-3 3H7V8l3-2V5H6v2H4V5zm2 9h2v2H7z" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}
