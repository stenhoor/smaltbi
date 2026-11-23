---
description: "Saved views of a report, and the view state the viewer keeps in its URL."
---

# Bookmarks and view state

```jsonc
"bookmarks": [
  { "name": "Europe only", "state": {
      "page": "overview",
      "selections": { "s-region": [ { "field": "stores.region", "op": "in", "values": ["Europe"] } ] },
      "drill": { "c-date": { "level": 1, "path": { "0": "2025" } } }
  } }
]
```

The viewer keeps the current state in the URL as `#s=<base64url JSON>` with the same shape.
