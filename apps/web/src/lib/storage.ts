const USERNAME_KEY = "prism:username";

export function getSavedUsername(): string {
  try {
    return localStorage.getItem(USERNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveUsername(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed) {
      localStorage.setItem(USERNAME_KEY, trimmed);
    } else {
      localStorage.removeItem(USERNAME_KEY);
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
}
