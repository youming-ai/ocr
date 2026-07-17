// Hand-off for the file picked on the home page to the /scan route. A File
// can't ride in the URL, so we stash it here and take it once when /scan mounts.
// ponytail: module singleton, not a reactive store — only one file is ever in
// flight (pick → navigate → consume). Per-tab state; lost on reload (by design).
let pending: File | null = null;

export function setPendingFile(file: File): void {
  pending = file;
}

/** Returns the stashed file and clears it, so a reload/direct visit sees none. */
export function takePendingFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}
