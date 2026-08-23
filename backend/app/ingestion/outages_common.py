"""Shared bits for the live utility-outage fetchers."""

# Utility outage backends serve their public maps to browsers; a browser
# User-Agent keeps us indistinguishable from the traffic they built for.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
