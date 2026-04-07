"""Generic web page text extraction."""

import re
from html.parser import HTMLParser


class _TextExtractor(HTMLParser):
    """Simple HTML to text converter."""

    def __init__(self):
        super().__init__()
        self._text = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            self._text.append(data)

    def get_text(self) -> str:
        text = " ".join(self._text)
        # Collapse whitespace
        text = re.sub(r"\s+", " ", text).strip()
        return text


def fetch_page_text(url: str, timeout: int = 15) -> str:
    """Fetch a URL and extract plain text from HTML."""
    try:
        import requests
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": "Mozilla/5.0 (compatible; VIP-CRM/0.1)"},
        )
        resp.raise_for_status()

        extractor = _TextExtractor()
        extractor.feed(resp.text)
        text = extractor.get_text()

        # Truncate very long pages
        if len(text) > 5000:
            text = text[:5000] + "..."

        return text
    except Exception:
        return ""
