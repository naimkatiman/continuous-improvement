// patch-paths.mts — The files an apply_patch patch touches.
//
// Codex sends every edit and write as `apply_patch`, with the whole patch in
// tool_input.command and the file paths only in its header lines (verified
// research, Codex entry, tool_names). OpenCode on GPT models, Cline, Copilot,
// Devin, Droid, Junie and Amp send patches in the same grammar:
//
//   *** Begin Patch
//   *** Add File: <path>
//   *** Update File: <path>
//   *** Move to: <path>
//   *** Delete File: <path>
//   *** End Patch
//
// Codex trims leading whitespace before it looks for a marker, so it applies a
// header indented by spaces or a tab (codex --codex-run-as-apply-patch, 0.171).
// The parser reads a header after any leading whitespace too. An added or
// removed hunk line starts with "+" or "-" and is never a header. A
// header-shaped context line (" *** Update File: x") is read as one more path,
// which can only add a file to gate. Pure: no I/O.

const HEADER_RE = /^\s*\*\*\* (?:Add File|Update File|Delete File|Move to):(.*)$/;

/** The paths named by the patch headers, in order and once each. Anything not a string has none. */
export function parsePatchPaths(text: unknown): string[] {
  if (typeof text !== "string" || text === "") return [];
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const header = HEADER_RE.exec(line.replace(/\r$/, ""));
    const path = header?.[1]?.trim() ?? "";
    if (path !== "" && !paths.includes(path)) paths.push(path);
  }
  return paths;
}
