/** The caption seeded from a file name, with hashtag tokens left whole. */
export function filenameToCaption(fileName: string): string | null {
  if (!fileName || !fileName.trim()) return null;
  let name = fileName.trim();
  const lastDot = name.lastIndexOf(".");
  if (lastDot > 0) name = name.slice(0, lastDot);
  // Only the text between hashtags has its separators turned into spaces: the
  // underscore inside "#GoldenHour_edit" belongs to the tag.
  name = name
    .split(/(#[A-Za-z0-9_]+)/)
    .map((part, index) => (index % 2 ? part : part.replace(/[_-]+/g, " ")))
    .join("");
  name = name.replace(/\s+/g, " ").trim();
  return name || null;
}
