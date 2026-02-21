/**
 * Trigger a browser file download from a URL.
 * If `url` is relative, it is resolved against `baseUrl`.
 */
export async function downloadFile(url: string, filename: string, baseUrl = ""): Promise<void> {
  const href = url.startsWith("http") ? url : `${baseUrl}${url}`;
  try {
    const response = await fetch(href);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  } catch {
    // silently ignore download errors
  }
}
