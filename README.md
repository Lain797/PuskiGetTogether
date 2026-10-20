# A little website

Made by hand, for one person. Everything personal is encrypted, and the page opens only for the right answer.

## Editing

1. Change the words or photos in `private/content.json` (that folder is never committed).
2. Preview: run `python3 -m http.server 8080` here and open <http://localhost:8080/docs/?dev>.
3. Lock it: `python3 -I scripts/lock.py`. This encrypts `private/` into `docs/vault/` and refuses to finish if anything readable would be published.
4. Commit `docs/` and push. GitHub Pages serves the `docs/` folder from `main`.
