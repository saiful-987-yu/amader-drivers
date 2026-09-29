/**
 * registration.js — the "Register as a Driver" multi-step form.
 * Submissions go to the Pending Drivers sheet (via Api.registerDriver)
 * and are never published automatically — see README for the
 * manual-approval flow.
 */
(function (window, document, Utils, Lang, Icons, Api, Router, ViewHelpers, Toast) {
  "use strict";

  const STEP_COUNT = 5;
  const STEP_TITLE_KEYS = ["register.step1.title", "register.step2.title", "register.step3.title", "register.step4.title", "register.step5.title"];

  /**
   * Holds the in-progress registration form's step + data + live-check
   * state across a language-switch re-render (app.js re-invokes
   * renderRegister() from scratch on "nobi:languagechange"). null means
   * no registration is in progress — a fresh renderRegister() call then
   * starts a brand-new session at Step 1. Reset to null only after a
   * successful submission (see the submit handler in renderRegister).
   */
  let activeRegistrationSession = null;

  /**
   * Points at the currently-mounted registration form's collectStepValues()
   * (set inside renderRegister below), so that whatever is on-screen but
   * not yet committed via Next/Back can still be saved the instant
   * something forces a full re-render out from under the user — most
   * importantly a language switch ("nobi:languagechange" -> renderRoute()
   * -> renderRegister() from scratch). Without this, only Next/Back ever
   * wrote the DOM's live values into activeRegistrationSession.data, so
   * switching language mid-typing silently discarded whatever hadn't
   * been committed yet. Reset to null right after each use.
   */
  let flushActiveSessionFields = null;

  function fieldRow({ id, labelKey, type, required, hint, options }) {
    const label = Utils.el("label", { for: id, text: Lang.t(labelKey) + (required ? " *" : "") });
    let control;
    if (type === "select") {
      control = Utils.el("select", { id, name: id });
      control.appendChild(Utils.el("option", { value: "", text: Lang.t("validation.selectOption") }));
      (options || []).forEach((opt) => control.appendChild(Utils.el("option", { value: opt.value, text: opt.label })));
    } else if (type === "textarea") {
      control = Utils.el("textarea", { id, name: id, rows: "3" });
    } else {
      control = Utils.el("input", { id, name: id, type: type || "text" });
    }
    const errorMsg = Utils.el("div", { class: "error-msg", "data-error-for": id });
    const wrap = Utils.el("div", { class: "field", "data-field": id }, [
      label, control,
      hint ? Utils.el("div", { class: "hint", text: hint }) : null,
      errorMsg
    ]);
    return { wrap, control };
  }

  /** A group of pill-style checkboxes sharing one field name — collectStepValues() joins the checked values with ", " into a single string, same format as a Sheet cell with multiple values. */
  function multiSelectField({ id, labelKey, options, required }) {
    const label = Utils.el("label", { text: Lang.t(labelKey) + (required ? " *" : "") });
    const group = Utils.el("div", { class: "checkbox-group" }, options.map((opt) =>
      Utils.el("label", { class: "checkbox-option" }, [
        Utils.el("input", { type: "checkbox", name: id, value: opt.value }),
        Utils.el("span", { text: opt.label })
      ])
    ));
    const errorMsg = Utils.el("div", { class: "error-msg", "data-error-for": id });
    const wrap = Utils.el("div", { class: "field", "data-field": id }, [label, group, errorMsg]);
    return { wrap };
  }

  /** Number + Years/Months select, combined into one "N Years"/"N Months" string for storage — same free-text format the Sheet already used. */
  function experienceField() {
    const numberInput = Utils.el("input", { id: "experienceValue", name: "experienceValue", type: "number", min: "0", inputmode: "numeric" });
    const unitSelect = Utils.el("select", { id: "experienceUnit", name: "experienceUnit" });
    [["years", Lang.t("field.experienceYears")], ["months", Lang.t("field.experienceMonths")]].forEach(([value, text]) =>
      unitSelect.appendChild(Utils.el("option", { value, text }))
    );
    const row = Utils.el("div", { class: "experience-row" }, [numberInput, unitSelect]);
    const errorMsg = Utils.el("div", { class: "error-msg", "data-error-for": "experienceValue" });
    const wrap = Utils.el("div", { class: "field", "data-field": "experienceValue" }, [
      Utils.el("label", { for: "experienceValue", text: Lang.t("field.experience") }),
      row, errorMsg
    ]);
    return { wrap };
  }

  /** Pairs two fieldRow() results (e.g. {wrap,control} results) side by side in one responsive 2-column row — used for the Post Office/Union and Upazila/District address fields in Step 1. */
  function twoColFieldRow(a, b) {
    return Utils.el("div", { class: "field-row-2col" }, [a.wrap, b.wrap]);
  }

  function setFieldError(app, id, message) {
    const field = app.querySelector(`[data-field="${id}"]`);
    if (!field) return;
    field.classList.toggle("has-error", !!message);
    const err = field.querySelector(".error-msg");
    if (err) err.textContent = message || "";
  }

  function passwordField(id, labelKey) {
    const { wrap, control } = fieldRow({ id, labelKey, type: "password" });
    wrap.classList.add("field--tint-d");
    const inputWrap = Utils.el("div", { class: "password-field" });
    // Move the input into the password-field wrapper with a show/hide button.
    wrap.replaceChild(inputWrap, control);
    inputWrap.appendChild(control);
    const toggleBtn = Utils.el("button", {
      type: "button", "aria-label": Lang.t("login.showPassword"), html: Icons.eye,
      onClick: () => {
        const showing = control.type === "text";
        control.type = showing ? "password" : "text";
        toggleBtn.innerHTML = showing ? Icons.eye : Icons.eyeOff;
        toggleBtn.setAttribute("aria-label", showing ? Lang.t("login.showPassword") : Lang.t("login.hidePassword"));
      }
    });
    inputWrap.appendChild(toggleBtn);
    return { wrap, control };
  }

  /**
   * Shared "live availability check" field builder — the same debounced
   * check/checking-indicator/available/taken UX used for both the
   * Username field (Step 4) and, now, the Mobile Number field (Step 1).
   * `isValidFn`, when given, gates the check so it only fires once the
   * value already satisfies the field's OWN existing validation (e.g.
   * the existing 11-digit BD phone format) — never on every partial
   * keystroke. `onStatus(value, available)` — available is true/false
   * once a check resolves, or null while unknown/pending — lets the
   * caller remember the latest known result (see usernameCheck/
   * phoneCheck in renderRegister) so Next never re-checks/re-loads an
   * unchanged value a second time.
   */
  function availabilityField(app, { id, labelKey, type, wrapClass, checkFn, takenMessageKey, isValidFn, onStatus, tintClass }) {
    const { wrap, control } = fieldRow({ id, labelKey, type });
    if (tintClass) wrap.classList.add(tintClass);
    const inputWrap = Utils.el("div", { class: wrapClass });
    wrap.replaceChild(inputWrap, control);
    inputWrap.appendChild(control);
    const statusIcon = Utils.el("span", { class: wrapClass + "__status", "aria-hidden": "true" });
    inputWrap.appendChild(statusIcon);

    let requestToken = 0;
    const check = Utils.debounce(() => {
      const value = Utils.clean(control.value);
      const myToken = ++requestToken;
      statusIcon.classList.remove("is-checking", "is-available");
      statusIcon.innerHTML = "";
      setFieldError(app, id, "");
      if (onStatus) onStatus(value, null);
      if (!value) return;
      if (isValidFn && !isValidFn(value)) return; // not yet in a checkable shape — wait for more input
      statusIcon.innerHTML = Icons.more; // small "checking…" indicator
      statusIcon.classList.add("is-checking");
      checkFn(value).then((res) => {
        if (myToken !== requestToken) return; // a newer keystroke has already superseded this check
        statusIcon.classList.remove("is-checking");
        const available = !!(res && res.available);
        if (available) {
          statusIcon.classList.add("is-available");
          statusIcon.innerHTML = Icons.checkCircle;
          setFieldError(app, id, "");
        } else {
          statusIcon.innerHTML = "";
          setFieldError(app, id, Lang.t(takenMessageKey));
        }
        if (onStatus) onStatus(value, available);
      }).catch(() => {
        if (myToken !== requestToken) return;
        statusIcon.classList.remove("is-checking");
        statusIcon.innerHTML = "";
        if (onStatus) onStatus(value, null);
      });
    }, 500);
    control.addEventListener("input", check);

    return { wrap, control };
  }

  /** Username field (Step 4) — never exposes the list of other accounts, just available/taken. */
  function usernameField(app, onStatus) {
    const field = availabilityField(app, {
      id: "username", labelKey: "field.username", wrapClass: "username-field",
      checkFn: Api.checkUsername, takenMessageKey: "field.usernameTaken", onStatus, tintClass: "field--tint-a"
    });
    field.control.placeholder = Lang.current() === "bn" ? "ইউজারনেম লিখুন যেমন (saiful221)" : "enter username like (saiful221)";
    return field;
  }

  /** Mobile Number field (Step 1) — same live-check UX as Username, gated on the existing phone-format validation. */
  function mobileField(app, onStatus) {
    const field = availabilityField(app, {
      id: "mobile", labelKey: "field.mobile", type: "tel", wrapClass: "phone-field",
      checkFn: Api.checkPhone, takenMessageKey: "field.phoneTaken", isValidFn: Utils.isValidBdPhone, onStatus, tintClass: "field--tint-b"
    });
    field.control.placeholder = Lang.current() === "bn" ? "নাম্বার লিখুন যেমন (01610-253221)" : "Enter number like (01610-253221)";
    return field;
  }

  /**
   * Resolves availability for `value`, reusing `cached` when it's still
   * for this SAME, unchanged value (never re-checks/reloads the same
   * value twice) — otherwise awaits one fresh check and returns the new
   * result to remember. Shared by Step 1 (mobile) and Step 4 (username)
   * right before their Next button is allowed to proceed.
   */
  async function ensureAvailability(cached, value, checkFn) {
    if (cached.value === value && cached.available !== null) return cached;
    try {
      const res = await checkFn(value);
      return { value, available: !!(res && res.available) };
    } catch (err) {
      return { value, available: false, networkError: true };
    }
  }

  /**
   * Today's date-based PIN (DDMMYY), checked entirely client-side
   * against the visitor's own device clock — no network call.
   */
  function todaysPhotoPin() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return pad(d.getDate()) + pad(d.getMonth() + 1) + String(d.getFullYear()).slice(-2);
  }

  /**
   * Confirms a Google Drive image link is actually publicly accessible
   * by probing it off-DOM (same lightweight technique already used for
   * market/banner background images elsewhere in this app — never a
   * backend call). Reuses the cached result when `value` hasn't
   * changed, exactly like ensureAvailability() above for Mobile/Username.
   */
  async function ensureDriveAccessible(cached, value) {
    if (cached.value === value && cached.available !== null) return cached;
    return new Promise((resolve) => {
      const probeUrl = Utils.resolveImageUrl(value);
      const probe = new Image();
      probe.onload = () => resolve({ value, available: true });
      probe.onerror = () => resolve({ value, available: false });
      probe.src = probeUrl;
    });
  }

  /**
   * Step 3's Driver Photo field — Google Drive share link only. As the
   * user types (debounced, same UX as Mobile/Username in
   * availabilityField), it live-checks the link is a Drive URL, then
   * probes whether it's actually publicly accessible. The definitive
   * check right before "Next" happens in ensureDriveAccessible() above.
   */
  function driveImageField(app, onStatus) {
    const { wrap, control } = fieldRow({ id: "imageUrl", labelKey: "field.driverPhoto", type: "url" });
    const inputWrap = Utils.el("div", { class: "drive-image-field" });
    wrap.replaceChild(inputWrap, control);
    inputWrap.appendChild(control);
    const statusIcon = Utils.el("span", { class: "drive-image-field__status", "aria-hidden": "true" });
    inputWrap.appendChild(statusIcon);

    let requestToken = 0;
    const check = Utils.debounce(() => {
      const value = Utils.clean(control.value);
      const myToken = ++requestToken;
      statusIcon.classList.remove("is-checking", "is-available");
      statusIcon.innerHTML = "";
      setFieldError(app, "imageUrl", "");
      if (onStatus) onStatus(value, null);
      if (!value) return;
      if (!/drive\.google\.com/.test(value)) {
        setFieldError(app, "imageUrl", Lang.t("validation.driveLinkInvalid"));
        if (onStatus) onStatus(value, false);
        return;
      }
      statusIcon.classList.add("is-checking");
      statusIcon.innerHTML = Icons.more;
      ensureDriveAccessible({ value: null, available: null }, value).then((res) => {
        if (myToken !== requestToken) return;
        statusIcon.classList.remove("is-checking");
        if (res.available) {
          statusIcon.classList.add("is-available");
          statusIcon.innerHTML = Icons.checkCircle;
          setFieldError(app, "imageUrl", "");
        } else {
          statusIcon.innerHTML = "";
          setFieldError(app, "imageUrl", Lang.t("validation.driveLinkNoAccess"));
        }
        if (onStatus) onStatus(value, res.available);
      });
    }, 500);
    control.addEventListener("input", check);

    return { wrap, control };
  }

  /** Clickable WhatsApp help link shown under the Step 3 photo instructions — fixed support number, independent of any driver-entered value. */
  function photoWhatsappHelpLink() {
    return Utils.el("a", {
      href: Utils.waLink("01610253221"), target: "_blank", rel: "noopener",
      class: "photo-whatsapp-help",
      html: Icons.whatsapp + "<span>" + Lang.t("register.step3.whatsappHelp") + "</span>"
    });
  }

  /**
   * Builds the pre-filled URL for the existing Google Form used by the
   * Photo Upload option (see config.js's GOOGLE_FORM). Only the Mobile
   * Number field can be pre-filled this way — the Profile Photo /
   * Vehicle Photo upload questions themselves are filled in by the
   * driver directly inside the Google Form.
   */
  function buildPhotoFormUrl(mobile) {
    const cfg = (window.NOBI_CONFIG && window.NOBI_CONFIG.GOOGLE_FORM) || {};
    const base = cfg.URL || "https://docs.google.com/forms/d/e/1FAIpQLSfWSXqhzab6o0Yh6lFrRzXz_F-jxgnvvzoB29mvBg5yDiRnIA/viewform";
    const parts = ["usp=pp_url"];
    if (cfg.MOBILE_ENTRY_ID && mobile) {
      parts.push(cfg.MOBILE_ENTRY_ID + "=" + encodeURIComponent(mobile));
    }
    return base + (base.indexOf("?") === -1 ? "?" : "&") + parts.join("&");
  }

  /**
   * Step 3's top "Profile Photo Upload" button. Clicking it opens the
   * phone's gallery; the chosen photo is sent to the Apps Script
   * backend (Api.uploadDriverPhoto), which saves it in the Drive
   * folder and returns its link. Under the button it shows
   * "Uploading…", the photo preview + a success message, or an error.
   * State lives on `session.photoUpload` so it survives Back/Next and
   * language switches; `valid` is only true after a successful upload.
   * If SECTION_BACKGROUNDS.registerPhotoUpload isn't in the folder,
   * the plain soft-green color stays.
   */
  function photoUploadField(session) {
    const up = session.photoUpload;
    const fileInput = Utils.el("input", { type: "file", accept: "image/*", style: "display:none;" });
    const drop = Utils.el("button", { type: "button", class: "photo-upload-card__drop", onClick: () => fileInput.click() }, [
      Utils.el("span", { class: "photo-upload-card__icon", html: Icons.upload }),
      Utils.el("div", {}, [
        Utils.el("div", { class: "photo-upload-card__title", text: Lang.t("register.step3.photoUpload.title") }),
        Utils.el("div", { class: "photo-upload-card__subtitle", text: Lang.t("register.step3.photoUpload.subtitle") })
      ])
    ]);
    const bg = (window.NOBI_CONFIG.SECTION_BACKGROUNDS || {}).registerPhotoUpload;
    if (bg) drop.style.backgroundImage = 'url("' + bg + '")';
    const status = Utils.el("div", { class: "photo-upload-card__status" });
    const wrap = Utils.el("div", { class: "photo-upload-card" }, [drop, fileInput, status]);

    // Draws the area under the button from session.photoUpload.
    function render() {
      status.innerHTML = "";
      drop.disabled = up.stage === "uploading";
      if (up.stage === "uploading") {
        status.appendChild(Utils.el("span", { class: "photo-status", text: Lang.t("field.photoUploading") }));
      } else if (up.stage === "confirmed" && up.valid) {
        const preview = Utils.el("img", { class: "photo-preview", alt: "" });
        preview.src = up.preview;
        status.appendChild(preview);
        status.appendChild(Utils.el("span", { class: "photo-status photo-status--success", html: Icons.checkCircle + "<span>" + Lang.t("field.photoUploadSuccess") + "</span>" }));
      } else if (up.stage === "error") {
        status.appendChild(Utils.el("span", { class: "photo-status photo-status--error", text: Lang.t(up.error) }));
      }
    }
    // Records the result on the session; redraws only if this card is
    // still on screen (the driver may have moved to another step).
    function finish(patch) {
      Object.assign(up, patch);
      if (wrap.isConnected) render();
    }
    function failed(errorKey) {
      finish({ valid: false, stage: "error", error: errorKey, url: "", preview: "" });
    }

    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      fileInput.value = ""; // lets the same file be chosen again for a retry
      if (up.stage === "uploading") return; // never send a second request for the same upload
      if (!file.type || file.type.indexOf("image/") !== 0) { failed("field.photoTypeError"); return; }
      if (file.size < 50 * 1024 || file.size > 3 * 1024 * 1024) { failed("field.photoSizeError"); return; }
      finish({ valid: false, stage: "uploading", error: "", url: "", preview: "" });

      const reader = new FileReader();
      reader.onerror = () => failed("field.photoUploadError");
      reader.onload = async () => {
        const dataUrl = String(reader.result || "");
        const base64 = dataUrl.split(",")[1] || "";
        try {
          // ONE request only — no automatic retry. api.js gives uploads a longer timeout.
          const res = await Api.uploadDriverPhoto(base64, file.type);
          if (!res || !res.url) { failed("field.photoUploadError"); return; }
          finish({ valid: true, stage: "confirmed", error: "", url: res.url, preview: dataUrl });
        } catch (err) {
          failed("field.photoUploadError");
        }
      };
      reader.readAsDataURL(file);
    });

    render();
    return { wrap };
  }

  /**
   * Vehicle Photo field (Step 3): the same optional URL input as before,
   * but its header now reads "Enter the vehicle photo link or [Send via
   * Google Form]" — the second part is a button that opens the same
   * Google Form (pre-filled with the Mobile Number from Step 1) in a new
   * tab. Coming back changes nothing on this page.
   */
  function vehiclePhotoField(mobile) {
    const row = fieldRow({ id: "vehicleImageUrl", labelKey: "register.step3.vehicleLabelPrefix", type: "url", hint: "https://..." });
    const label = row.wrap.querySelector("label");
    label.textContent = Lang.t("register.step3.vehicleLabelPrefix") + " ";
    label.appendChild(Utils.el("button", {
      type: "button", class: "photo-form-link-btn", text: Lang.t("register.step3.vehicleLabelButton"),
      onClick: () => window.open(buildPhotoFormUrl(mobile), "_blank", "noopener")
    }));
    return row;
  }

  /**
   * After a failed validateStep(), scroll to and focus the first field
   * still marked .has-error (setFieldError toggles that class in the
   * same order fields were validated), so the user can see immediately
   * which required field to fill in. Works for every step — plain
   * inputs/selects/textareas, the checkbox-group multi-selects, and the
   * password/username wrappers alike — since it just looks for the
   * first focusable control inside the errored field.
   */
  function focusFirstError(stepBody) {
    const field = stepBody.querySelector(".field.has-error");
    if (!field) return;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = field.querySelector("input, select, textarea");
    if (focusable) focusable.focus({ preventScroll: true });
  }

  async function renderRegister(app) {
    // If a registration form is already live on screen, this is a forced
    // re-render (a language switch is the only case today) rather than a
    // fresh visit — save whatever's currently typed, still on the OLD
    // page, into the session before that page is torn down below.
    if (flushActiveSessionFields) {
      flushActiveSessionFields();
      flushActiveSessionFields = null;
    }
    app.innerHTML = "";

    let markets = [], vehicles = [];
    try {
      [markets, vehicles] = await Promise.all([Api.getMarkets(), Api.getVehicleCategories()]);
    } catch (err) {
      app.appendChild(Utils.el("section", { class: "section container" }, [
        ViewHelpers.errorBlock(Lang.t("error.network"), () => renderRegister(app))
      ]));
      return;
    }

    // Persisted across re-renders of THIS SAME route (e.g. a language
    // switch, which re-invokes renderRegister() from scratch via
    // app.js's "nobi:languagechange" -> renderRoute()) so the user's
    // current step and already-entered data are never lost. Cleared
    // only after a successful submission — see the submit handler below.
    if (!activeRegistrationSession) {
      activeRegistrationSession = {
        data: {}, currentStep: 1,
        phoneCheck: { value: null, available: null },
        usernameCheck: { value: null, available: null },
        driveCheck: { value: null, available: null },
        // Step 3's Photo Upload option — see photoUploadField()'s
        // comment. stage moves idle -> uploading -> confirmed (or
        // error); valid only becomes true once the photo has been
        // saved to Drive, and `url` then holds its Drive link.
        photoUpload: { valid: false, stage: "idle", url: "", preview: "", error: "" }
      };
    }
    const session = activeRegistrationSession;
    const data = session.data;
    let currentStep = session.currentStep;
    // Latest known availability result for Mobile (Step 1) and Username
    // (Step 4), each tracked by value so a stale/pending result never
    // lets that step's Next button through, and an unchanged value is
    // never re-checked/re-loaded a second time — see handleNext().
    let phoneCheck = session.phoneCheck;
    let usernameCheck = session.usernameCheck;
    let driveCheck = session.driveCheck;
    // Set by buildStep1() each time Step 1 is (re)built; renderStep()
    // calls it right after hydrateStepValues() so the read-only "সম্পূর্ণ
    // ঠিকানা" box reflects data restored from `data` (e.g. after Back,
    // or a language switch) exactly the same way typing does — never
    // left showing a stale/old value.
    let syncFullAddress = null;

    const heading = Utils.el("h2", { text: Lang.t("register.heading") });
    const sub = Utils.el("p", { text: Lang.t("register.sub"), class: "hint mt-5" });

    const stepIndicator = Utils.el("div", { class: "step-indicator" }, [
      Utils.el("span", { "data-step-label": "true" }),
      Utils.el("div", { class: "step-indicator__track" }, [Utils.el("div", { class: "step-indicator__fill", "data-fill": "true" })]),
      Utils.el("span", { "data-step-title": "true" })
    ]);

    const stepBody = Utils.el("div", { "data-step-body": "true" });
    const actions = Utils.el("div", { class: "form-actions" });

    const card = Utils.el("div", { class: "form-card" }, [stepIndicator, stepBody, actions]);
    app.appendChild(Utils.el("section", { class: "section container" }, [heading, sub, Utils.el("div", { class: "mt-5" }, [card])]));

    function updateIndicator() {
      stepIndicator.querySelector("[data-step-label]").textContent = Lang.t("register.step", { current: currentStep, total: STEP_COUNT });
      stepIndicator.querySelector("[data-step-title]").textContent = Lang.t(STEP_TITLE_KEYS[currentStep - 1]);
      stepIndicator.querySelector("[data-fill]").style.width = (currentStep / STEP_COUNT * 100) + "%";
    }

    function buildStep1() {
      const villageField = fieldRow({ id: "village", labelKey: "field.village" });
      const postOfficeField = fieldRow({ id: "postOffice", labelKey: "field.postOffice" });
      const unionField = fieldRow({ id: "union", labelKey: "field.union" });
      const upazilaField = fieldRow({ id: "upazila", labelKey: "field.upazila" });
      const districtField = fieldRow({ id: "district", labelKey: "field.district" });
      // "সম্পূর্ণ ঠিকানা" — read-only, auto-built from the five fields
      // above in order (গ্রাম → ডাকঘর → ইউনিয়ন → উপজেলা → জেলা), only
      // the non-empty ones, comma-separated. This is a frontend-only
      // convenience: the five individual fields still go to the Sheet
      // exactly as before (see collectStepValues()/Api.registerDriver),
      // fullAddress is collected too but is now always derived, never
      // hand-typed.
      const fullAddressField = fieldRow({ id: "fullAddress", labelKey: "field.fullAddress", type: "textarea" });
      fullAddressField.control.readOnly = true;
      fullAddressField.control.classList.add("is-readonly");

      const addressParts = [villageField, postOfficeField, unionField, upazilaField, districtField];
      /**
       * Guesses whether the driver is typing this address in English or
       * Bangla by the share of English (Latin-script) words across all
       * five boxes combined — this is a heuristic, not a language
       * setting, since the page's own display language and the address
       * script don't have to match (e.g. a Bangla page with an English
       * address). >60% English words -> treat the whole address as
       * English for the গ্রাম/Village + ডাকঘর/Post Office prefixes and
       * the trailing punctuation; otherwise Bangla.
       */
      function addressIsEnglish() {
        const words = addressParts
          .map((f) => Utils.clean(f.control.value))
          .filter(Boolean)
          .join(" ")
          .split(/\s+/)
          .filter(Boolean);
        if (!words.length) return Lang.current() !== "bn";
        const englishWords = words.filter((w) => /^[A-Za-z0-9.,'\-]+$/.test(w)).length;
        return englishWords / words.length > 0.6;
      }
      syncFullAddress = () => {
        const isEn = addressIsEnglish();
        const village = Utils.clean(villageField.control.value);
        const postOffice = Utils.clean(postOfficeField.control.value);
        const rest = [unionField, upazilaField, districtField]
          .map((f) => Utils.clean(f.control.value))
          .filter(Boolean);
        const parts = [];
        if (village) parts.push((isEn ? "Village: " : "গ্রামঃ ") + village);
        if (postOffice) parts.push((isEn ? "Post Office: " : "ডাকঘর: ") + postOffice);
        parts.push(...rest);
        fullAddressField.control.value = parts.length ? parts.join(", ") + (isEn ? "." : "।") : "";
      };
      addressParts.forEach((f) => f.control.addEventListener("input", syncFullAddress));

      const isBn = Lang.current() === "bn";

      const fullNameField = fieldRow({ id: "fullName", labelKey: "field.fullName" });
      fullNameField.wrap.classList.add("field--tint-a");
      // English-name box: the example name always stays in Latin script,
      // wrapped in the same bracket style used for the number examples below.
      fullNameField.control.placeholder = isBn ? "আপনার নাম লিখুন যেমন (Saiful Islam)" : "Enter your name like (Saiful Islam)";

      const fullNameBnField = fieldRow({ id: "fullNameBn", labelKey: "field.fullNameBn" });
      fullNameBnField.wrap.classList.add("field--tint-a");
      fullNameBnField.control.placeholder = isBn ? "নাম লিখুন" : "Enter name";

      const guardianField = fieldRow({ id: "guardianName", labelKey: "field.guardianName" });
      guardianField.wrap.classList.add("field--tint-a", "field--label-noshrink-guard");
      // Same placeholder as the Bangla-name box above — no example name here.
      guardianField.control.placeholder = isBn ? "নাম লিখুন" : "Enter name";

      const altMobileField = fieldRow({ id: "altMobile", labelKey: "field.altMobile", type: "tel" });
      altMobileField.wrap.classList.add("field--tint-b");
      altMobileField.control.placeholder = isBn ? "নাম্বার লিখুন" : "Enter number";

      const whatsappField = fieldRow({ id: "whatsapp", labelKey: "field.whatsapp", type: "tel" });
      whatsappField.wrap.classList.add("field--tint-b");
      whatsappField.control.placeholder = isBn ? "নাম্বার লিখুন" : "Enter number";

      [villageField, postOfficeField, unionField, upazilaField, districtField].forEach((f) => f.wrap.classList.add("field--tint-c"));
      villageField.control.placeholder = isBn ? "গ্রামঃ পশ্চিম উরির চর, ৮ নং ওয়ার্ড" : "Village: West Urir Char, Ward No. 8";
      postOfficeField.control.placeholder = isBn ? "যেমনঃ জনতা বাজার - ৩৮১৩" : "e.g. Jonota Bazar - 3813";
      unionField.control.placeholder = isBn ? "যেমনঃ চরক্লার্ক" : "e.g. Char Clerk";
      upazilaField.control.placeholder = isBn ? "যেমনঃ সুবর্ণচর" : "e.g. Subarnachar";
      districtField.control.placeholder = isBn ? "যেমনঃ নোয়াখালী" : "e.g. Noakhali";

      return [
        fullNameField,
        twoColFieldRow(fullNameBnField, guardianField),
        mobileField(app, (value, available) => { phoneCheck = { value, available }; }),
        twoColFieldRow(altMobileField, whatsappField),
        villageField,
        twoColFieldRow(postOfficeField, unionField),
        twoColFieldRow(upazilaField, districtField),
        fullAddressField
      ];
    }

    function buildStep2() {
      const vehicleNumberField = fieldRow({ id: "vehicleNumber", labelKey: "field.vehicleNumber" });
      vehicleNumberField.wrap.classList.add("field--tint-b");
      vehicleNumberField.control.placeholder = Lang.current() === "bn"
        ? "যেমন: ঢাকা মেট্রো-থ ৪৯-১২৩৪, No License, No Need"
        : "e.g. Dhaka Metro-GA 11-1234, No License, No Need";

      const serviceAreaField = fieldRow({ id: "serviceArea", labelKey: "field.serviceArea" });
      serviceAreaField.wrap.classList.add("field--tint-b");
      serviceAreaField.control.placeholder = "Nobi Bazar + 50 km Coverage Radius";

      const experienceRow = experienceField();
      experienceRow.wrap.classList.add("field--tint-d");

      return [
        multiSelectField({
          id: "vehicleType", labelKey: "field.vehicleType",
          options: vehicles.map((v) => ({ value: v.slug, label: Lang.current() === "bn" ? v.nameBn : v.nameEn }))
        }),
        vehicleNumberField,
        multiSelectField({
          id: "marketSlug", labelKey: "field.preferredMarket",
          options: markets.map((m) => ({ value: m.slug, label: Lang.current() === "bn" ? m.nameBn : m.nameEn }))
        }),
        serviceAreaField,
        experienceRow
      ];
    }

    function buildStep3() {
      const photoUploadRow = photoUploadField(session);
      const driveField = driveImageField(app, (value, available) => { driveCheck = { value, available }; session.driveCheck = driveCheck; });
      // No hint/description under the PIN box at all — it's collected
      // via WhatsApp (see the header instructions above), never shown
      // or explained on screen.
      const pinField = fieldRow({ id: "photoPin", labelKey: "register.step3.pinLabel" });
      // Lightweight live feedback only (client-side, same today's-date
      // PIN check as todaysPhotoPin()/Next already do) — just tells the
      // driver "PIN ভুল"/"PIN সঠিক" as they type; it never blocks Next
      // and never replaces the existing submit-time PIN validation.
      const pinCheck = Utils.debounce(() => {
        const field = app.querySelector('[data-field="photoPin"]');
        if (!field) return;
        const err = field.querySelector(".error-msg");
        const value = Utils.clean(pinField.control.value);
        field.classList.remove("has-error", "has-success");
        if (err) err.textContent = "";
        if (!value) return;
        if (value === todaysPhotoPin()) {
          field.classList.add("has-success");
          if (err) err.textContent = Lang.t("validation.pinCorrect");
        } else {
          field.classList.add("has-error");
          if (err) err.textContent = Lang.t("validation.pinWrong");
        }
      }, 300);
      pinField.control.addEventListener("input", pinCheck);
      return [
        // Profile Photo Upload button — opens the gallery and uploads to Drive.
        photoUploadRow,
        Utils.el("div", { class: "photo-method-divider", text: Lang.t("register.step3.orDivider") }),
        Utils.el("div", { class: "photo-instructions hint" }, [
          photoWhatsappHelpLink()
        ]),
        // Drive Link (~70%) and PIN (~30%) side by side in one row.
        Utils.el("div", { class: "photo-input-row" }, [driveField.wrap, pinField.wrap]),
        // Vehicle Photo — same optional URL field; header now has the Google Form button.
        vehiclePhotoField(Utils.clean(data.mobile))
      ];
    }

    function buildStep4() {
      const usernameRow = usernameField(app, (value, available) => { usernameCheck = { value, available }; });
      const passwordRow = passwordField("password", "field.password");
      const confirmRow = passwordField("confirmPassword", "field.confirmPassword");
      return [usernameRow, passwordRow, confirmRow];
    }

    function buildStep5() {
      const entries = [
        ["field.fullName", data.fullName], ["field.fullNameBn", data.fullNameBn],
        ["field.guardianName", data.guardianName],
        ["field.mobile", data.mobile], ["field.altMobile", data.altMobile], ["field.whatsapp", data.whatsapp],
        ["field.village", data.village], ["field.postOffice", data.postOffice],
        ["field.union", data.union], ["field.upazila", data.upazila], ["field.district", data.district],
        ["field.vehicleType", data.vehicleType], ["field.vehicleNumber", data.vehicleNumber],
        ["field.preferredMarket", data.marketSlug], ["field.serviceArea", data.serviceArea],
        ["field.experience", data.experience], ["field.username", data.username]
      ].filter(([, v]) => v);
      const dl = Utils.el("dl", { class: "review-list" }, entries.map(([labelKey, value]) =>
        Utils.el("div", { class: "review-row" }, [
          Utils.el("dt", { text: Lang.t(labelKey) }),
          Utils.el("dd", { text: String(value) })
        ])
      ));
      // Full Address goes last, right before Submit — shown even when
      // blank (it's optional) so the review list stays predictable.
      const addressRow = Utils.el("div", { class: "review-row" }, [
        Utils.el("dt", { text: Lang.t("field.fullAddress") }),
        Utils.el("dd", { text: data.fullAddress ? data.fullAddress : "—" })
      ]);
      dl.appendChild(addressRow);
      return [dl];
    }

    const STEP_BUILDERS = [buildStep1, buildStep2, buildStep3, buildStep4, buildStep5];

    function collectStepValues() {
      const checkboxGroups = {};
      Utils.qsa("input, select, textarea", stepBody).forEach((el) => {
        // The Photo Upload card manages its own state on
        // `session.photoUpload` (idle/opened/confirmed), separate from
        // this generic field collection. This guard is kept defensively
        // in case any file input is ever reintroduced — a browser also
        // throws if a file input's .value is set back to anything but
        // "", which hydrateStepValues() below would hit.
        if (el.type === "file") return;
        const key = el.name || el.id;
        if (el.type === "checkbox") {
          if (!checkboxGroups[key]) checkboxGroups[key] = [];
          if (el.checked) checkboxGroups[key].push(el.value);
        } else {
          data[key] = el.value;
        }
      });
      Object.keys(checkboxGroups).forEach((key) => { data[key] = checkboxGroups[key].join(", "); });
      // Combine the Experience number + unit into one free-text value
      // (e.g. "2 Years") — same format the Sheet already stores.
      if (data.experienceValue) {
        const unitLabel = data.experienceUnit === "months" ? "Months" : "Years";
        data.experience = Utils.clean(data.experienceValue) + " " + unitLabel;
      } else {
        data.experience = "";
      }
    }
    // Always points at THIS render's collectStepValues, whatever step is
    // currently showing — see flushActiveSessionFields's own comment above.
    flushActiveSessionFields = collectStepValues;

    function hydrateStepValues() {
      Utils.qsa("input, select, textarea", stepBody).forEach((el) => {
        if (el.type === "file") return; // see collectStepValues() above
        const key = el.name || el.id;
        if (el.type === "checkbox") {
          const selected = Utils.splitMulti(data[key]);
          el.checked = selected.includes(el.value);
        } else if (data[key] != null) {
          el.value = data[key];
        }
      });
    }

    function validateStep() {
      let valid = true;
      collectStepValues();
      if (currentStep === 1) {
        [["fullName", true], ["fullNameBn", true], ["mobile", true]].forEach(([id, required]) => {
          const value = Utils.clean(data[id]);
          if (required && !value) { setFieldError(app, id, Lang.t("validation.required")); valid = false; }
          else setFieldError(app, id, "");
        });
        if (data.mobile && !Utils.isValidBdPhone(data.mobile)) {
          setFieldError(app, "mobile", Lang.t("validation.phoneInvalid"));
          valid = false;
        }
      }
      if (currentStep === 2) {
        ["vehicleType", "vehicleNumber", "marketSlug", "serviceArea"].forEach((id) => {
          const value = Utils.clean(data[id]);
          if (!value) { setFieldError(app, id, Lang.t("validation.required")); valid = false; }
          else setFieldError(app, id, "");
        });
      }
      if (currentStep === 3) {
        // Photo Upload OR a Google Drive photo link OR a PIN makes this
        // step valid — any ONE of the three is enough, and they're
        // independent alternatives, so leftover/wrong data in one box
        // must never block a valid entry via another (e.g. a confirmed
        // Photo Upload still passes even with stale PIN digits or a
        // half-typed Drive link left in the other boxes). Vehicle Photo
        // stays optional either way.
        const photoUploadOk = !!(session.photoUpload && session.photoUpload.valid);
        const imageValue = Utils.clean(data.imageUrl);
        const pinValue = Utils.clean(data.photoPin);
        const pinOk = !!pinValue && pinValue === todaysPhotoPin();
        const looksLikeDriveLink = !!imageValue && /drive\.google\.com/.test(imageValue);
        setFieldError(app, "imageUrl", "");
        setFieldError(app, "photoPin", "");
        if (!photoUploadOk) {
          if (!imageValue && !pinValue) {
            setFieldError(app, "imageUrl", Lang.t("validation.required"));
            valid = false;
          } else if (!pinOk && !looksLikeDriveLink) {
            // Neither method is satisfiable yet — flag whichever the
            // user actually attempted.
            if (pinValue) setFieldError(app, "photoPin", Lang.t("validation.pinInvalid"));
            if (imageValue) setFieldError(app, "imageUrl", Lang.t("validation.driveLinkInvalid"));
            valid = false;
          }
        }
        // Actual Drive-link accessibility is confirmed asynchronously
        // right before advancing (see the Next handler), the same way
        // Mobile/Username availability is — never here.
      }
      if (currentStep === 4) {
        ["username", "password", "confirmPassword"].forEach((id) => {
          const value = Utils.clean(data[id]);
          if (!value) { setFieldError(app, id, Lang.t("validation.required")); valid = false; }
          else setFieldError(app, id, "");
        });
        if (data.password && data.password.length < 6) {
          setFieldError(app, "password", Lang.t("validation.passwordShort"));
          valid = false;
        }
        if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
          setFieldError(app, "confirmPassword", Lang.t("validation.passwordMismatch"));
          valid = false;
        }
      }
      return valid;
    }

    function renderStep() {
      stepBody.innerHTML = "";
      syncFullAddress = null;
      const rows = STEP_BUILDERS[currentStep - 1]();
      rows.forEach((row) => stepBody.appendChild(row.wrap || row));
      hydrateStepValues();
      if (currentStep === 1 && syncFullAddress) syncFullAddress();
      updateIndicator();
      renderActions();
    }

    function renderActions() {
      actions.innerHTML = "";
      if (currentStep > 1) {
        actions.appendChild(Utils.el("button", {
          class: "btn btn--ghost", text: Lang.t("action.back"),
          onClick: () => { collectStepValues(); currentStep -= 1; session.currentStep = currentStep; renderStep(); }
        }));
      }
      if (currentStep < STEP_COUNT) {
        const nextBtn = Utils.el("button", { class: "btn btn--primary", text: Lang.t("action.next") });
        nextBtn.addEventListener("click", async () => {
          if (!validateStep()) { focusFirstError(stepBody); return; }

          // Step 1 (Mobile) / Step 4 (Username): the value must be
          // confirmed available right before advancing. ensureAvailability()
          // reuses the remembered result when the value hasn't changed
          // since it was last checked (no repeat API call/loading either
          // way, available or taken) and only awaits a fresh check when
          // it's genuinely new/unknown — e.g. the user clicked Next
          // before the debounced as-you-type check resolved.
          if (currentStep === 1) {
            const value = Utils.clean(data.mobile);
            nextBtn.disabled = true;
            phoneCheck = await ensureAvailability(phoneCheck, value, Api.checkPhone);
            session.phoneCheck = phoneCheck;
            nextBtn.disabled = false;
            if (!phoneCheck.available) {
              setFieldError(app, "mobile", phoneCheck.networkError ? Lang.t("error.network") : Lang.t("field.phoneTaken"));
              focusFirstError(stepBody);
              return;
            }
          }
          if (currentStep === 3) {
            const photoUploadOk = !!(session.photoUpload && session.photoUpload.valid);
            const imageValue = Utils.clean(data.imageUrl);
            const pinValue = Utils.clean(data.photoPin);
            const pinOk = !!pinValue && pinValue === todaysPhotoPin();
            // A confirmed Photo Upload already makes this step valid on
            // its own — never block Next on stale/incomplete Drive-link
            // text left in that other box.
            if (!photoUploadOk && !pinOk && imageValue) {
              nextBtn.disabled = true;
              driveCheck = await ensureDriveAccessible(driveCheck, imageValue);
              session.driveCheck = driveCheck;
              nextBtn.disabled = false;
              if (!driveCheck.available) {
                setFieldError(app, "imageUrl", Lang.t("validation.driveLinkNoAccess"));
                focusFirstError(stepBody);
                return;
              }
            }
          }
          if (currentStep === 4) {
            const value = Utils.clean(data.username);
            nextBtn.disabled = true;
            usernameCheck = await ensureAvailability(usernameCheck, value, Api.checkUsername);
            session.usernameCheck = usernameCheck;
            nextBtn.disabled = false;
            if (!usernameCheck.available) {
              setFieldError(app, "username", usernameCheck.networkError ? Lang.t("error.network") : Lang.t("field.usernameTaken"));
              focusFirstError(stepBody);
              return;
            }
          }

          currentStep += 1;
          session.currentStep = currentStep;
          renderStep();
        });
        actions.appendChild(nextBtn);
      } else {
        const submitBtn = Utils.el("button", { class: "btn btn--primary", text: Lang.t("action.submit") });
        submitBtn.addEventListener("click", async () => {
          submitBtn.disabled = true;
          submitBtn.textContent = Lang.t("action.submitting");
          try {
            const payload = Object.assign({}, data, { phone: data.mobile, altPhone: data.altMobile });
            // A successfully uploaded profile photo's Drive link is what gets saved as the Driver Image URL.
            if (session.photoUpload && session.photoUpload.valid && session.photoUpload.url) payload.imageUrl = session.photoUpload.url;
            const result = await Api.registerDriver(payload);
            activeRegistrationSession = null;
            flushActiveSessionFields = null;
            renderSuccess(app, result);
          } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = Lang.t("action.submit");
            const map = {
              DUPLICATE_PHONE: "register.error.duplicatePhone",
              DUPLICATE_USERNAME: "register.error.duplicateUsername"
            };
            Toast.show(Lang.t(map[err.code] || "register.error.generic"), "error");
          }
        });
        actions.appendChild(submitBtn);
      }
    }

    renderStep();
  }

  function renderSuccess(app) {
    app.innerHTML = "";
    app.appendChild(Utils.el("section", { class: "section container" }, [
      Utils.el("div", { class: "state-block" }, [
        Utils.el("div", { class: "state-block__icon", html: Icons.checkCircle }),
        Utils.el("h3", { text: Lang.t("register.success.title") }),
        Utils.el("p", { text: Lang.t("register.success.body") }),
        Utils.el("button", { class: "btn btn--primary", text: Lang.t("register.success.action"), onClick: () => Router.navigate("/") })
      ])
    ]));
  }

  Router.register("/registration", renderRegister, ["/"]);
})(window, document, window.Utils, window.Lang, window.Icons, window.Api, window.Router, window.ViewHelpers, window.Toast);
