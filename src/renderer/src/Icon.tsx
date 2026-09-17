export type IconName =
  | "chat"
  | "cat"
  | "settings"
  | "plus"
  | "desktop"
  | "arrow"
  | "spark"
  | "folder"
  | "help"
  | "check"
  | "power"
  | "stop";

const paths: Record<IconName, string> = {
  chat: "M3 4h18v13H10l-5 4v-4H3V4Zm4 5h10M7 12h7",
  cat: "m5 10-1-7 6 4h4l6-4-1 7a8 8 0 1 1-14 0Zm3 3h.01M16 13h.01M10 17l2 1 2-1M2 14l4 1m12 0 4-1",
  settings:
    "m10 3-1 3-3 1-3-1-1 4 3 2v3l-2 2 3 3 3-1 3 1 1 3 4-1 1-3 2-2 3-1-1-4-3-1-1-3-3-1V3h-4Zm2 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
  plus: "M12 5v14M5 12h14",
  desktop: "M3 4h18v13H3V4Zm9 13v4m-5 0h10",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  folder: "M3 7V4h7l2 3h9v13H3V7Zm0 3h18",
  help: "M9 8a3 3 0 0 1 6 0c0 3-3 2-3 6m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  check: "m5 12 4 4L19 6",
  power: "M12 2v10M6 5a9 9 0 1 0 12 0",
  stop: "M6 6h12v12H6V6Z",
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
