export async function fetchPageText(url, timeout = 15000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VIPCare/0.1)' },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!resp.ok) return '';

    const html = await resp.text();
    // Strip tags
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > 5000) text = text.slice(0, 5000) + '...';
    return text;
  } catch {
    return '';
  }
}
