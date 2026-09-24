# site/

The three web pages PepperPro has to have before it can be submitted.

```
site/
  index.html          →  https://pepperpro.app/
  privacy/index.html  →  https://pepperpro.app/privacy
  support/index.html  →  https://pepperpro.app/support
  style.css
```

`/privacy` and `/support` are **real paths, not anchors**. App Store Connect
wants a URL that lands on the policy, and a reviewer who has to scroll a long
home page to find it may record it as not found.

- **Privacy policy URL** — `https://pepperpro.app/privacy`. Required by App
  Review guideline 5.1.1(i), and again under 5.1.3 for HealthKit.
- **Support URL** — `https://pepperpro.app/support`. Required before App Store
  Connect will accept a submission.
- **Marketing URL** — `https://pepperpro.app`. Optional.

## It is deliberately buildless

Three HTML files and one stylesheet. No build step, no framework, no
JavaScript, and **no external requests of any kind** — no web fonts, no
analytics, no CDN, no icon set. Text is set in the system font stack.

That is not minimalism for its own sake. `/privacy` is a page whose entire
argument is that the app sends nothing anywhere unless you switch on a feature
that says it will. A page making that argument while loading three third-party
scripts refutes itself, and somebody will open the network tab and notice. If
traffic numbers are ever wanted, use a host that reports server-side request
counts rather than a client-side script.

The colours are the app's, taken from `PepperPro/Design/Theme.swift`: the
ground, the card, the wells, the three ink tiers, the hairline, and `critical`,
which is the red in the app icon. Light is the default and the dark palette
arrives through `prefers-color-scheme`. Each value is commented in `style.css`
with the token it came from.

## The two pages that mirror something in the repository

These are copies, and copies drift. Both files carry an HTML comment saying so.

| Page | Source of truth | Rule |
|---|---|---|
| `privacy/index.html` | `PepperPro/Features/PrivacyPolicyView.swift` | Word for word, section for section. Change both in the **same commit**. |
| `support/index.html` | `docs/support-page.md` | Same content, same order. |

The privacy policy is the one that matters. A policy that differs between the
app and the URL in the store listing is an app making two different promises
about the same data, which is worse than having no web page at all.

**One deliberate difference, in both pages.** The app interpolates
`Device.noun` and says "this iPhone" or "this iPad" depending on what it is
running on; `docs/support-page.md` says "iPhone" outright. A web page cannot
know what the reader is holding, so both use the same type's own documented
fallback — "device" — which `Device.swift` calls house style and which is true
on every device the app ships to. Naming the iPhone on a page that an iPad user
reads is the defect commit `9e49481` exists to fix.

## Checking it locally

```bash
cd site && python3 -m http.server 8000
```

Then `http://localhost:8000/`, `/privacy/` and `/support/`. No server is
required to *view* the files — opening `site/index.html` in a browser works
too — but the local server is what proves the directory-index URLs resolve the
way they will in production.

## Deploying

Any static host. Upload the `site/` directory as the web root; there is nothing
to compile and nothing to configure.

- **Cloudflare Pages / Netlify / Vercel** — point at the repository, set the
  publish directory to `site` and leave the build command empty.
- **GitHub Pages** — publish from `/site` on the default branch.
- **S3 + CloudFront, or any plain web server** — copy the directory across and
  set `index.html` as the directory index, which is the default nearly
  everywhere.

Whatever the host: serve over HTTPS, and make sure `/privacy` and `/support`
resolve **with and without** a trailing slash. Both links in the App Store
Connect form should be pasted in and then opened from a phone that has never
seen the site, because that is what a reviewer does.

## Before the store listing goes live

`index.html` carries one placeholder, marked on screen as well as in a comment:
the block tagged `APP-STORE-LINK`. Replace the whole block with the real link
once the app is published. It is written to be visibly unfinished so that it
cannot ship as though it were a working link.
