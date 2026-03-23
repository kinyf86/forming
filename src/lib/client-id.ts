const CLIENT_ID_KEY = "forming_client_id";

export function getClientId(): string {
  if (typeof window === "undefined") return "default";

  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `student-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}
