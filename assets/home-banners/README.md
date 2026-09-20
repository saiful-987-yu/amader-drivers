# Homepage images

Drop image files into this folder using these EXACT filenames — the
website picks them up automatically, no code changes needed:

| Filename | Used for |
|---|---|
| `home-banner-01.jpg` | Homepage banner, slide 1 — used as the BACKGROUND behind the automatic headline/text (not a replacement for it) |
| `home-banner-02.jpg` | Homepage banner, slide 2 |
| `home-banner-03.jpg` | Homepage banner, slide 3 |
| `home-registration-banner.jpg` | Background image of the "Register as a Driver" section |
| `home-doctor-banner.jpg` | Background image of the "Find a Doctor" section |

Notes:

- Slide 1's headline/text is always automatic and always follows the
  selected language (English/বাংলা), on the same solid background used
  by the Doctor/Registration sections by default — `home-banner-01.jpg`
  only ever supplies the background photo behind that text.
- If `home-banner-01.jpg` is missing (or fails to load), slide 1 simply
  keeps that solid background with the same automatic text — you don't
  need to provide it to get started.
- If any of these other files is missing, nothing breaks: slides 2/3
  show a clean placeholder instead, and the Registration/Doctor
  sections just keep their existing solid background color. There is
  never a broken-image icon.
- To use different filenames or a different folder, edit `BANNER_IMAGES`
  and `SECTION_BACKGROUNDS` in `config/config.js`.
- Recommended for the banner images: roughly a 2:1 width:height ratio
  (e.g. 1200×600px), compressed JPG or WebP, to keep the homepage fast
  on slow mobile connections.
