import { useEffect, useState } from "react";

/**
 * Which of the client's engagements the room shows (a client may have several: a Business Review, then a Pitch Deck).
 * Kept in the address as ?project=ID, so a link or a refresh opens the same one; none means the newest still open.
 */
const read = () => {
  const value = Number(new URLSearchParams(window.location.search).get("project"));
  return Number.isInteger(value) && value > 0 ? value : null;
};

export function useRoomProject() {
  const [project, setProject] = useState<number | null>(read);
  useEffect(() => {
    const onPop = () => setProject(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const choose = (id: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("project", String(id));
    url.hash = "";
    window.history.pushState(null, "", url.pathname + url.search);
    setProject(id);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return { project, choose };
}
