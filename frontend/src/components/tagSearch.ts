/** A Google search for a tag, phrased in the page's language ("what is React" / "React 是什麼"). */
export function tagSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}
