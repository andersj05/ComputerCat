export interface PermissionContext {
  id: number;
  url: string;
  destroyed: boolean;
  mainFrame: boolean;
}
export function allowMicrophone(
  owner: PermissionContext | null,
  chat: { id: number; url: string } | undefined,
  granted: boolean,
  permission: string,
  details: {
    isMainFrame?: boolean;
    requestingUrl?: string;
    mediaTypes?: string[];
    mediaType?: string;
  },
  kind: "request" | "check",
): boolean {
  if (
    !owner ||
    !chat ||
    !granted ||
    permission !== "media" ||
    owner.destroyed ||
    owner.id !== chat.id ||
    owner.url !== chat.url ||
    !owner.mainFrame ||
    details.isMainFrame !== true ||
    details.requestingUrl !== chat.url
  )
    return false;
  return kind === "request"
    ? details.mediaTypes?.length === 1 && details.mediaTypes[0] === "audio"
    : details.mediaType === "audio";
}
