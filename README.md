# Amader Drivers {_Saiful_Islam_}

A lightweight, bilingual (English/বাংলা) local driver directory. A customer
scans a QR code, picks a bazar, picks a vehicle type (CNG / Auto / Van /
Other), browses drivers, and taps **Call Driver** — no account required.
Drivers can register, and once approved can log in to switch their own
listing between **Active** and **Currently Unavailable**.

The site runs entirely on the front end and treats **Google Sheets** as its
database, through a small Google Apps Script backend. It also ships with a
**demo mode** (sample data, no Google Sheet needed) so you can try the full
experience — search, registration, login, availability — before connecting
anything.

**Performance:** Markets load first; Vehicle Categories and the full Driver
directory then preload in the background (`Api.preload()` in `js/api.js`).
Every screen checks the cache first, so moving from Bazar → Vehicle Type →
Driver List feels instant once that initial preload has settled, and no
market/vehicle click ever re-requests data that's already loaded. Driver
photos load lazily and never block a card's text/call button from
appearing. In the public driver list, **Active drivers are always sorted
before Inactive ones**.

A compact breadcrumb (`Home › Bazar › Vehicle`) sits at the top of the
directory screens for quick backward navigation, and the footer is a single
slim two-row bar (brand + links, then copyright + language) rather than a
tall multi-column block.

---

## 1. Project structure

```
project/
├── index.html
├── README.md
├── css/
│   ├── themes.css        # color tokens, light/dark theme
│   ├── style.css         # base layout + components (mobile-first)
│   └── responsive.css    # tablet/desktop breakpoint overrides
├── js/
│   ├── utils.js          # shared helpers (DOM, phone, storage)
│   ├── icons.js          # inline SVG icon set
│   ├── language.js       # EN/BN translation system
│   ├── theme.js          # light/dark theme switcher
│   ├── api.js            # data layer (Google Sheets or demo data)
│   ├── auth.js           # driver session/login state
│   ├── search.js         # shared search-matching helpers
│   ├── app.js            # router, toasts, modal, header wiring
│   ├── drivers.js        # home, banner, bazar/vehicle selection, driver list & detail
│   ├── doctors.js        # doctor list & doctor-details modal ("Find a Doctor")
│   ├── registration.js   # multi-step "Register as a Driver" form
│   └── profile.js        # driver login + profile/availability screen
├── assets/
│   ├── images/           # (empty — driver photos come from Google Sheets)
│   ├── home-banners/     # homepage banner + section background images (see its own README)
│   └── icons/
│       └── favicon.svg
├── config/
│   ├── config.example.js # documented configuration template
│   └── config.js         # your actual configuration (demo mode by default)
└── google-apps-script/
    └── Code.gs           # optional backend for real Google Sheets access
```

---

## 2. Running it locally (demo mode, no setup)

`config/config.js` ships with `API_BASE_URL: null`, which puts the site in
**demo mode**: it uses realistic sample drivers, markets and vehicle types
stored in your browser's `localStorage`, so registration, login
(`karim.driver` / `demo1234`, or any of the other seeded usernames — see
`js/api.js`) and availability switching all work end-to-end with no backend.

Just open `index.html` in a browser, or serve the folder with any static
file server, e.g.:

```
npx serve .
```

---

## 3. Connecting a real Google Sheet

### 3.1 Create the spreadsheet

Create one Google Sheet with these exact tab names — just **3 main tabs**
(plus the optional `Doctors` tab from §3.5 — there is no separate `Users`
tab; a driver's own row is the only source of truth for their login):

| Tab | Purpose |
|---|---|
| `Drivers` | Approved, publicly visible drivers — also where each driver's own Username/Password live |
| `Pending Drivers` | New registrations awaiting manual review |
| `Markets` | The list of bazars |
| `Vehicle Categories` | CNG / Auto / Van / Other, etc. |

### 3.2 Column headers

**Markets**
`Market ID | Market Name English | Market Name Bengali | Location | Status | Sort Order | Markets Image URL | Markets BG Image URL`

- `Markets Image URL` — an optional photo shown next to the bazar's icon on the homepage's market cards (same idea as the Vehicle Categories image below). Leave it empty and the card just shows its icon as before, no broken image.
- `Markets BG Image URL` — an optional large background photo for the whole market card (separate from the small icon/image above, which stays visible either way). Leave it empty and the card keeps its existing plain background (white in Light Mode, dark in Dark Mode); if the URL doesn't load, the same plain background is used — never a broken image.

**Vehicle Categories**
`Category ID | English Name | Bengali Name | Icon | Status | Sort Order | Vehicle Categories Image URL`

- `Vehicle Categories Image URL` — a category artwork image shown next to the existing small icon on the vehicle-type selection screen (roughly 2:1, wider than tall). This is completely separate from a driver's own `Vehicle Image URL` in the Drivers tab — leave it empty and the category card just shows its icon as before, no broken image.

**Drivers**
`Driver ID | Name | Bengali Name | Father/Husband Name | Phone | Alternative Phone | Village | Post Office | Union | Upazila | District | Full Address | Vehicle Type | Vehicle Number | Bazar | Service Area | Driving Experience | Driver Image URL | Vehicle Image URL | Username | Password | Status | Availability | Created Date | Updated Date | Star Rating | WhatsApp | Emergency Contact | Sort Status | Personal Details | Video URL | Manual Rating | Public Rating Cache | Public Rating Count`

- `Username` / `Password` — **a driver logs in directly against their own row here.** There is no separate Users sheet at all. `Password` is a SHA-256 hash, never plain text — see "Pending Drivers" below for how a value gets here in the first place.
- `Sort Status` — one of `1st`, `2nd`, `3rd`, or blank. On a bazar+vehicle-type driver list, this is **always the first sort priority**: every `1st` driver appears before every `2nd`, before every `3rd`, before everyone left blank. Drivers sharing the same Sort Status are then ordered by `Star Rating` (highest first).
- `Bengali Name` — shown instead of `Name` whenever the site is in বাংলা mode. Leave it blank and the English `Name` is used as a fallback automatically — a driver never shows with a blank name.
- `Emergency Contact` — `TRUE` (case-insensitive) adds the driver to the homepage's "Emergency Contact" list regardless of their vehicle type or bazar; `FALSE` or blank keeps them out of it. This never affects their normal listing under their own bazar/vehicle type. This list is ordered by the same `Sort Status` → `Star Rating` rule as a bazar+vehicle-type list — not a separate rule.
- `Star Rating` — a number from 0–5 (decimals like `4.2` are fine); shown to customers as rounded stars, never as the raw number, in the driver's own basic info row. Leave empty for 0 stars. This is unrelated to the new Rating/Review system below.
- `WhatsApp` — controls the WhatsApp button on the driver card/profile: `F` uses the main `Phone`, `A` uses `Alternative Phone`, a real phone number is used directly, `N` or empty hides the button.
- `Bazar`, `Vehicle Type`, and `Vehicle Image URL` all support **multiple values** in one cell, separated by `, ` (comma + space) — e.g. `Nobi Bazar, Bangla Bazar` or `Motorcycle, CNG, Auto` or `image1.jpg, image2.jpg, image3.jpg`. A driver with multiple bazars/vehicle types shows up under every one of them; multiple vehicle images become a clickable thumbnail gallery on the driver detail screen. A single plain value (no comma) still works exactly as before.
- `Bazar` must match a `Market Name English` value from the Markets tab (matched by a lowercased, hyphenated "slug" of the name — e.g. "Nobi Bazar" → `nobi-bazar`).
- `Vehicle Type` must similarly match an `English Name` from Vehicle Categories.
- `Status` = `Active` to make the driver eligible to appear publicly at all.
- `Availability` = `Active` or `Inactive` — this is the flag the driver controls from their own profile.
- `Personal Details` — shown as its own "Personal Details" section right after the Photo Gallery on the driver's detail page. Plain text is shown as plain text; you can also use basic HTML (`<h3>`, `<b>`, `<strong>`, `<p>`, `<ul>`, `<li>`, etc.) and it renders formatted, exactly as written. Leave it empty and the whole section — heading included — doesn't appear at all.
- `Video URL` — shown as its own "Video" section, right after the Rating/Reviews section. A YouTube link plays in an embedded YouTube player; a Google Drive video link plays via Drive's own preview player. Leave it empty, or if the link doesn't actually work, the whole section — heading included — doesn't appear at all.
- `Manual Rating` — the admin's own rating input, 0–5. Combines with verified public reviews below to make up the driver's displayed Rating (see "Public Ratings" further down): `Final Rating = MIN(Public Rating Cache + Manual Rating, 5)`. Leave empty for 0.
- `Public Rating Cache` / `Public Rating Count` — **do not edit these by hand** — they're the average and count of that driver's VERIFIED public reviews, kept up to date automatically (see "Public Ratings" below) whenever you mark a review Verified. Leave both empty (they'll read as 0) until the driver has at least one verified review.

**Public Ratings**
`Rating ID | Target Type | Target ID | Star Rating | Comment | Date Time | Verified`

The Driver/Doctor Details page's public review system — one row per
submitted review, for both Drivers and Doctors (`Target Type` is
`driver` or `doctor`, `Target ID` is that Driver/Doctor's own
`Driver ID`). This tab is created automatically the first time it's
needed, so you don't have to create it yourself — but you can add
Column headers ahead of time if you prefer.

- Every new review a visitor submits starts with `Verified` = `FALSE`, and an unverified review is **never** shown publicly and **never** counted in the rating — it only ever exists here for you to review.
- To publish a review, change its `Verified` cell to `TRUE` yourself, directly in this sheet. The moment you do, that driver's/doctor's `Public Rating Cache`/`Public Rating Count` (on the Drivers or Doctors tab) is **automatically recalculated** — no page reload, no manual math, and nothing else on the site needs to recompute anything. This runs via the `onEdit()` trigger in `Code.gs`, so no separate Apps Script trigger setup is needed — it works as soon as `Code.gs` is deployed on this spreadsheet.
- Setting `Verified` back to `FALSE` (or anything other than `TRUE`) un-publishes that review and recalculates the average again, minus that review.
- The Details page only ever loads 2 verified reviews at first (for a fast initial load); the full list is fetched only when a visitor taps "View All Reviews".



**My Profile (driver-side)**
A logged-in driver's own "My Profile" page (Change Password + a
"Edit Profile" action) writes back to their SAME row on `Drivers` —
still no separate Users sheet. Only a small, fixed set of columns are
ever editable this way: `Bengali Name`, `Father/Husband Name`,
`Alternative Phone`, `WhatsApp`, `Service Area`, `Vehicle Number`, and
`Password` (via Change Password, after the current password is
verified). Everything else shown on the profile — `Name`, `Phone`,
`Username`, `Vehicle Type`, `Bazar`, `Driving Experience`, both photo
URLs, `Status`, and `Availability` (which has its own dedicated
toggle) — stays read-only there by design; see `updateProfile()` /
`changePassword()` in `Code.gs`. As with Availability, the row to
change is always located by the Driver ID tied to the caller's own
session token, never a value the client sends directly.

**Pending Drivers**
Same idea as Drivers, plus `Application ID`, `Application Status`,
`Submitted Date`. `Username`/`Password` are already collected at
registration (password stored hashed, same as on the Drivers tab) —
there is **no admin panel**; you review this tab yourself and, once
happy, copy the whole row's information straight into the `Drivers`
tab (give it a `Driver ID`) and delete it from `Pending Drivers`. Because
`Username`/`Password` copy over as-is, the driver can log in immediately
with the same credentials they registered with — no separate account
sheet to keep in sync.

The registration form itself collects: Full Name (English, required),
Full Name (Bangla, required — falls back to the English name anywhere
it's displayed if left blank later), Mobile (required), Alternative
Mobile and WhatsApp Number (both optional), a multi-select for Vehicle
Type and for Preferred Bazar (each saved as one comma-separated cell,
same as elsewhere in this project), and Driving Experience as a number
plus a Years/Months choice (combined into one free-text value like
"2 Years" when saved). A live check while typing a Username or the
Mobile number shows a small blue check mark once it's confirmed
available, or a red "already taken" message otherwise (see
`checkUsernameAvailable()` / `checkPhoneAvailable()` in `Code.gs` —
each only ever returns true/false, never the list of existing
usernames/numbers or any password data). The result for whichever
value was last checked is remembered, so pressing Next doesn't
re-check/re-load the same, unchanged value a second time — only
editing the field invalidates that remembered result.

The backend also auto-creates a `Sessions` tab the first time someone logs
in — you don't need to create it yourself, and you never need to look at
it (it just tracks per-token login expiry).

### 3.3 Deploy the Apps Script backend

1. In the spreadsheet: **Extensions → Apps Script**.
2. Delete the default code and paste in `google-apps-script/Code.gs`.
3. **Deploy → New deployment → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the resulting URL (ends in `/exec`).

### 3.4 Configure the frontend

Edit `config/config.js`:

```js
window.NOBI_CONFIG = {
  API_BASE_URL: "https://script.google.com/macros/s/XXXXXXXXXXXX/exec",
  ...
};
```

Setting `API_BASE_URL` automatically switches the site out of demo mode —
no other code changes are needed anywhere in the project.

**Never put a Google API key, OAuth secret, or service-account credential
in `config.js`.** The Apps Script Web App URL is the only thing that
belongs there, and it is meant to be public — the actual spreadsheet access
happens inside your Apps Script project under your own Google account.

### 3.5 The "Doctors" sheet (optional "Find a Doctor" feature)

Doctors get their own **`Doctors`** tab, built with the exact same column
headers as `Drivers` — only the *meaning* of three columns changes for
that tab:

| Column header (unchanged) | Means, on the Doctors tab |
|---|---|
| `Driver ID` | Doctor ID |
| `Vehicle Type` | Degree / Qualification (e.g. `MBBS`, `MBBS, FCPS`) |
| `Vehicle Number` | Registration Number (e.g. `BMDC-A-45210`) |

Everything else — `Name`, `Bengali Name`, `Phone`, `Alternative Phone`,
`WhatsApp`, `Service Area`, `Driving Experience`, `Star Rating`,
`Driver Image URL` (profile photo), `Vehicle Image URL` (sample/work
photos, comma-separated for a gallery), `Status`, `Availability`,
`Personal Details`, `Video URL`, `Manual Rating`, `Public Rating Cache`,
`Public Rating Count` — works exactly like the Drivers tab, including
multi-value support and the Bengali Name fallback. Doctors are **not**
filtered by bazar or vehicle type; "Find a Doctor" on the homepage
always shows every active doctor. Doctor reviews live in the SAME
`Public Ratings` tab as driver reviews — just with `Target Type` =
`doctor` on those rows.

---

## 4. How to add things later

- **Add a new bazar:** add a row to `Markets` with `Status = Active`. It
  appears on the homepage automatically — no code changes. If there are
  more than 4 active bazars, the homepage shows the first 3 (by `Sort
  Order`) plus an "Others" tile that reveals the rest in place.
- **Add a new vehicle category:** add a row to `Vehicle Categories` the
  same way. The same "first 3 + Others" rule applies, and a category only
  shows for a given bazar if at least one approved driver in that bazar
  actually has that vehicle type — an active-but-empty category for that
  bazar stays hidden there (it can still show normally in a bazar that
  does have a driver for it).
- **Approve a driver:** move their whole row from `Pending Drivers` to
  `Drivers` (see §3.2) — their `Username`/`Password` come along with it,
  so they can log in immediately with no separate account step.
- **Update a driver's photo:** edit `Driver Image URL` in the `Drivers`
  sheet. Google Drive share links are supported — the frontend converts
  them to a direct-view URL automatically (see `Utils.resolveImageUrl` in
  `js/utils.js`). If the URL is missing or broken, a placeholder icon is
  shown instead of a broken image.

---

## 5. Driver login & availability

- Only drivers need an account — customers never log in.
- Login uses **Username or Mobile Number + Password**.
- After login, a driver can only see and edit **their own** profile: the
  backend identifies the driver strictly from their session token, never
  from any ID the browser sends, so one driver can never modify another's
  row.
- The one thing a driver can change is **Availability** (Active /
  Inactive). This is separate from **Account Status** (whether the account
  itself is approved) — see `Code.gs` and `js/profile.js`.

---

## 5.5 Homepage images & footer social links

- **Banner**: Slide 1 is generated from site text (updates live with the
  language toggle) and needs no image. Slides 2 and 3, plus the
  Registration and Doctor section backgrounds, all come from
  `assets/home-banners/` — drop in `home-banner-02.jpg`,
  `home-banner-03.jpg`, `home-registration-banner.jpg`, and
  `home-doctor-banner.jpg` (see that folder's own README) and they
  appear automatically, no code changes. Missing files never break
  anything: a banner slide without an image shows a clean placeholder,
  and a section without its background image just keeps its normal
  solid color — never a broken-image icon. The banner auto-advances
  every 3 seconds and also responds to touch swipe (left = next, right
  = previous); swiping restarts the timer instead of running a second
  one alongside it.
- **Footer social links**: edit `SOCIAL_LINKS` in `config/config.js`.
  Leave any entry as `"#"` until you have a real URL — the icon still
  shows, it just doesn't go anywhere yet.

---

## 5.6 Performance & offline-friendly caching

Markets, Vehicle Categories, and the Driver/Doctor directories are cached
in the browser's `localStorage` (not just in memory), so:

- **Cold start / reopen / refresh**: whatever was last shown successfully
  is displayed **instantly** — no blank/loading screen — while a fresh
  copy is quietly fetched in the background.
- **A failed or slow refresh never erases what's already shown.** Old
  data is only replaced once a complete, valid new response has arrived
  (see `cachedCall()` in `js/api.js`).
- Driver/Doctor availability is treated as more time-sensitive than
  static data: it refreshes on a shorter cycle (`STATUS_CACHE_TTL_MS` in
  `config/config.js`, 60 seconds by default) than Markets/Vehicle
  Categories (`CACHE_TTL_MS`, 5 minutes by default).
- Images are not re-fetched for a URL the browser has already
  downloaded — this relies on the browser's normal HTTP cache, plus
  `loading="lazy"` so off-screen photos don't load until needed. This
  project does not add a Service Worker / Cache Storage layer for
  fully offline image access — that would be a reasonable future
  enhancement, but was left out here to avoid the risk of a
  misconfigured Service Worker breaking the site for visitors.

---

## 6. Known limitations

- Google Sheets is a lightweight, convenient store for a small local
  directory — it is **not** a transactional database. Under heavy
  simultaneous writes (e.g. many drivers toggling availability at once) it
  can be slower than a real database, and it has no built-in row-level
  locking. For this project's scale (a single bazar's worth of drivers)
  this is not expected to be an issue.
- There is intentionally no admin dashboard or admin login — approving a
  driver is a manual step in the spreadsheet.
- Demo mode's "backend" lives entirely in the visitor's own browser
  storage, so it resets if they clear site data, and different visitors in
  demo mode do not share data with each other. This is expected — demo mode
  exists for trying out the UI, not for running a real directory.

---

## 7. Security notes

- No Google credentials, API keys, or service-account secrets exist
  anywhere in the frontend code — only the public Apps Script Web App URL.
- Passwords are hashed (SHA-256) before they are ever written to a sheet,
  and are never returned to the browser at any point, including right
  after registration.
- The public driver directory only ever receives the specific fields
  listed in `publicDriverFields()` in both `js/api.js` (demo mode) and
  `google-apps-script/Code.gs` (real mode) — the `Users` sheet and the
  `Pending Drivers` sheet are never exposed to normal visitors.
- This is a practical, appropriate level of security for a small community
  tool — it is not a claim of bank-level security.

---

## 8. Deploying the site itself

The frontend is static HTML/CSS/JS, so it can be hosted anywhere that
serves static files — GitHub Pages, Netlify, Vercel, or a normal web host.
For GitHub Pages: push this folder to a repository and enable Pages on the
`main` branch (root). No build step is required.

The site is a single page (`index.html`) with hash-based routing
(`#/drivers/nobi-bazar/cng`, etc.), so it will not 404 on refresh when
hosted on GitHub Pages or any other static host.
