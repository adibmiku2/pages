# Asta pages

Public homepage and privacy policy for Asta, a private assistant with one user. Google requires both
pages before a personal Google Cloud OAuth app can be published, which stops its sign-in tokens expiring
every 7 days. Two of the owner's OAuth apps link here: the server agent's and the `gws` command-line tool's.

- Homepage: <https://adibmiku2.github.io/pages/>
- Privacy policy: <https://adibmiku2.github.io/pages/privacy.html>
- Served by GitHub Pages from the `main` branch, root folder.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Homepage linked from the Google consent screen |
| `privacy.html` | Privacy policy linked from the Google consent screen |
| `.gitignore` | Allow-list: everything else is ignored |
| `scripts/privacy-check.cjs` | Privacy guard run by the git hooks |
| `scripts/git-hooks/` | `pre-commit` and `pre-push` hooks |

## Privacy guard

This repository is public. It must never hold private data: no owner name, personal email, phone number,
local user path, private or Tailscale IP address, or server name.

`scripts/privacy-check.cjs` runs from the `pre-commit` hook (staged files) and the `pre-push` hook (every
commit not yet on GitHub). It blocks:

- Any file not on its allow-list, even if force-added.
- Terms in `private/denylist.txt`, which stays local and is never committed. The check refuses to pass when
  that file is missing or empty.
- Email addresses other than GitHub noreply, Windows user folders, private or Tailscale IP addresses, and
  Australian or Indonesian mobile numbers.
- Commits whose author or committer email is not the GitHub noreply address.

Never bypass it with `--no-verify`.

## Set up after a fresh clone

```powershell
git config core.hooksPath scripts/git-hooks
git config user.email <your GitHub noreply address>
```

Then recreate `private/denylist.txt` with one private term per line, and run
`node scripts/privacy-check.cjs --tree` to confirm the guard passes.

## Update a page

Edit the HTML, commit and push. GitHub Pages republishes within a few minutes. If the privacy policy
changes, update its "Last updated" date. Adding a file means adding it to both `.gitignore` and `ALLOWED`
in the guard.
