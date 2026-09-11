# Amader Drivers

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
│   ├── drivers.js        # home, bazar/vehicle selection, driver list & detail
│   ├── registration.js   # multi-step "Register as a Driver" form
│   └── profile.js        # driver login + profile/availability screen
├── assets/
│   ├── images/           # (empty — driver photos come from Google Sheets)
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

Create one Google Sheet with these exact tab names:

| Tab | Purpose |
|---|---|
| `Drivers` | Approved, publicly visible drivers |
| `Pending Drivers` | New registrations awaiting manual review |
| `Users` | Login credentials (hashed passwords), linked by Driver ID |
| `Markets` | The list of bazars |
| `Vehicle Categories` | CNG / Auto / Van / Other, etc. |

### 3.2 Column headers

**Markets**
`Market ID | Market Name English | Market Name Bengali | Location | Status | Sort Order`

**Vehicle Categories**
`Category ID | English Name | Bengali Name | Icon | Status | Sort Order | Vehicle Categories Image URL`

- `Vehicle Categories Image URL` — a category artwork image shown next to the existing small icon on the vehicle-type selection screen (roughly 2:1, wider than tall). This is completely separate from a driver's own `Vehicle Image URL` in the Drivers tab — leave it empty and the category card just shows its icon as before, no broken image.

**Drivers**
`Driver ID | Name | Bengali Name | Father/Husband Name | Phone | Alternative Phone | Village | Post Office | Union | Upazila | District | Full Address | Vehicle Type | Vehicle Number | Bazar | Service Area | Driving Experience | Star Rating | WhatsApp | Emergency Contact | Driver Image URL | Vehicle Image URL | Username | Status | Availability | Created Date | Updated Date`

- `Bengali Name` — shown instead of `Name` whenever the site is in বাংলা mode. Leave it blank and the English `Name` is used as a fallback automatically — a driver never shows with a blank name.
- `Emergency Contact` — `TRUE` (case-insensitive) adds the driver to the homepage's "Emergency Contact" list regardless of their vehicle type or bazar; `FALSE` or blank keeps them out of it. This never affects their normal listing under their own bazar/vehicle type.

- `Star Rating` — a number from 0–5 (decimals like `4.2` are fine); shown to customers as rounded stars, never as the raw number. Leave empty for 0 stars.
- `WhatsApp` — controls the WhatsApp button on the driver card/profile: `F` uses the main `Phone`, `A` uses `Alternative Phone`, a real phone number is used directly, `N` or empty hides the button.
- `Bazar`, `Vehicle Type`, and `Vehicle Image URL` all support **multiple values** in one cell, separated by `, ` (comma + space) — e.g. `Nobi Bazar, Bangla Bazar` or `Motorcycle, CNG, Auto` or `image1.jpg, image2.jpg, image3.jpg`. A driver with multiple bazars/vehicle types shows up under every one of them; multiple vehicle images become a clickable thumbnail gallery on the driver detail screen. A single plain value (no comma) still works exactly as before.

- `Bazar` must match a `Market Name English` value from the Markets tab (matched by a lowercased, hyphenated "slug" of the name — e.g. "Nobi Bazar" → `nobi-bazar`).
- `Vehicle Type` must similarly match an `English Name` from Vehicle Categories.
- `Status` = `Active` to make the driver eligible to appear publicly at all.
- `Availability` = `Active` or `Inactive` — this is the flag the driver controls from their own profile.

**Pending Drivers**
Same idea as Drivers, plus `Application ID`, `Password` (stored hashed by
the backend, never in plain text), `Application Status`, `Submitted Date`.
There is **no admin panel** — you review this tab yourself and, once happy,
manually copy the row's information into the `Drivers` tab and delete it
from `Pending Drivers`. Give the new row a `Driver ID` and add a matching
row to `Users`.

**Users**
`User ID | Username | Phone | Password | Driver ID | Account Status | Created Date | Last Login`
`Password` is a SHA-256 hash — never a plain-text password. When you
approve a pending driver, copy their `Username` and `Password` (already
hashed) from `Pending Drivers` into `Users`, and set `Driver ID` to match
the row you created in `Drivers`.

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
- **Approve a driver:** move their row from `Pending Drivers` to `Drivers`
  (see §3.2), and add a matching row to `Users`.
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
