import type { ReactNode } from "react";

export type IconName = "new" | "options" | "desktop" | "help";

const icons: Record<IconName, ReactNode> = {
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
