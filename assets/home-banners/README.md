# Homepage images

Drop image files into this folder using these EXACT filenames — the
website picks them up automatically, no code changes needed:

| Filename | Used for |
|---|---|
| `home-banner-02.jpg` | Homepage banner, slide 2 |
| `home-banner-03.jpg` | Homepage banner, slide 3 |
| `home-registration-banner.jpg` | Background image of the "Register as a Driver" section |
| `home-doctor-banner.jpg` | Background image of the "Find a Doctor" section |

Notes:

- The homepage banner's **Slide 1** is generated automatically from site
  text — it doesn't use an image file and needs no image from you.
- If any of these files is missing, nothing breaks: the banner slide
  shows a clean placeholder instead, and the Registration/Doctor
  sections just keep their existing solid background color. There is
  never a broken-image icon.
- To use different filenames or a different folder, edit `BANNER_IMAGES`
  and `SECTION_BACKGROUNDS` in `config/config.js`.
- Recommended for the banner images: roughly a 2:1 width:height ratio
  (e.g. 1200×600px), compressed JPG or WebP, to keep the homepage fast
  on slow mobile connections.
