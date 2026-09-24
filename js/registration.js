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
    const { wrap, control } = fieldRow({ id, labelKey, type: "password", required: true });
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
  function availabilityField(app, { id, labelKey, type, wrapClass, checkFn, takenMessageKey, isValidFn, onStatus }) {
    const { wrap, control } = fieldRow({ id, labelKey, type, required: true });
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
    return availabilityField(app, {
      id: "username", labelKey: "field.username", wrapClass: "username-field",
      checkFn: Api.checkUsername, takenMessageKey: "field.usernameTaken", onStatus
    });
  }

  /** Mobile Number field (Step 1) — same live-check UX as Username, gated on the existing phone-format validation. */
  function mobileField(app, onStatus) {
    return availabilityField(app, {
      id: "mobile", labelKey: "field.mobile", type: "tel", wrapClass: "phone-field",
      checkFn: Api.checkPhone, takenMessageKey: "field.phoneTaken", isValidFn: Utils.isValidBdPhone, onStatus
    });
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
   * Step 3's "Photo Upload" option — first and most prominent, per
   * spec. The large drop card is now a direct shortcut to the
   * existing Google Form: tapping it never opens this site's own
   * camera/gallery picker or shows a local preview — it just opens
   * the Google Form (pre-filled with the Mobile Number already
   * entered in Step 1), where the driver attaches their Profile
   * Photo and Vehicle Photo and taps Submit. Coming back here and
   * tapping the confirm button marks this method VALID. That
   * confirmation is self-reported by the driver, exactly the way the
   * existing PIN method already works (PIN is also just a self/
   * WhatsApp-coordinated confirmation, never something this site
   * verifies against the Sheet either) — so this never claims a
   * server-verified "success" the site has no technical way to check.
   *
   * stage moves idle -> opened -> confirmed.
   */
  function photoUploadField(session, mobile, rerender) {
    const state = session.photoUpload;

    const confirmed = state.stage === "confirmed";
    const drop = Utils.el("button", {
      type: "button", class: "photo-upload-card__drop",
      onClick: () => {
        if (state.stage !== "idle") return;
        window.open(buildPhotoFormUrl(mobile), "_blank", "noopener");
        state.stage = "opened";
        session.photoUpload = state;
        rerender();
      }
    }, [
      Utils.el("span", { class: "photo-upload-card__icon", html: confirmed ? Icons.checkCircle : Icons.upload }),
      Utils.el("div", {}, [
        Utils.el("div", {
          class: "photo-upload-card__title",
          text: Lang.t(confirmed ? "register.step3.photoUpload.confirmedTitle" : "register.step3.photoUpload.title")
        }),
        Utils.el("div", {
          class: "photo-upload-card__subtitle",
          text: Lang.t(confirmed ? "register.step3.photoUpload.confirmedSubtitle" : "register.step3.photoUpload.subtitle")
        })
      ])
    ]);

    const card = Utils.el("div", { class: "photo-upload-card" + (confirmed ? " is-confirmed" : "") }, [drop]);

    if (state.stage === "opened") {
      const actions = Utils.el("div", { class: "photo-upload-card__actions" });
      actions.appendChild(Utils.el("button", {
        type: "button", class: "photo-upload-card__link", text: Lang.t("register.step3.photoUpload.reopenForm"),
        onClick: () => window.open(buildPhotoFormUrl(mobile), "_blank", "noopener")
      }));
      actions.appendChild(Utils.el("button", {
        type: "button", class: "btn btn--primary", text: Lang.t("register.step3.photoUpload.confirmButton"),
        onClick: () => { state.stage = "confirmed"; state.valid = true; session.photoUpload = state; rerender(); }
      }));
      card.appendChild(actions);
    }

    if (confirmed) {
      card.appendChild(Utils.el("button", {
        type: "button", class: "photo-upload-card__undo", text: Lang.t("register.step3.photoUpload.undo"),
        onClick: () => {
          window.open(buildPhotoFormUrl(mobile), "_blank", "noopener");
          state.stage = "opened";
          state.valid = false;
          session.photoUpload = state;
          rerender();
        }
      }));
    }

    return { wrap: card };
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
        // comment. stage moves idle -> opened -> confirmed;
        // valid only ever becomes true once the driver has explicitly
        // self-confirmed the Submit step on the actual Google Form.
        photoUpload: { valid: false, stage: "idle" }
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
      syncFullAddress = () => {
        fullAddressField.control.value = addressParts
          .map((f) => Utils.clean(f.control.value))
          .filter(Boolean)
          .join(", ");
      };
      addressParts.forEach((f) => f.control.addEventListener("input", syncFullAddress));

      return [
        fieldRow({ id: "fullName", labelKey: "field.fullName", required: true }),
        fieldRow({ id: "fullNameBn", labelKey: "field.fullNameBn", required: true }),
        fieldRow({ id: "guardianName", labelKey: "field.guardianName" }),
        mobileField(app, (value, available) => { phoneCheck = { value, available }; }),
        fieldRow({ id: "altMobile", labelKey: "field.altMobile", type: "tel" }),
        fieldRow({ id: "whatsapp", labelKey: "field.whatsapp", type: "tel" }),
        villageField,
        twoColFieldRow(postOfficeField, unionField),
        twoColFieldRow(upazilaField, districtField),
        fullAddressField
      ];
    }

    function buildStep2() {
      return [
        multiSelectField({
          id: "vehicleType", labelKey: "field.vehicleType", required: true,
          options: vehicles.map((v) => ({ value: v.slug, label: Lang.current() === "bn" ? v.nameBn : v.nameEn }))
        }),
        fieldRow({ id: "vehicleNumber", labelKey: "field.vehicleNumber", required: true }),
        multiSelectField({
          id: "marketSlug", labelKey: "field.preferredMarket", required: true,
          options: markets.map((m) => ({ value: m.slug, label: Lang.current() === "bn" ? m.nameBn : m.nameEn }))
        }),
        fieldRow({ id: "serviceArea", labelKey: "field.serviceArea", required: true }),
        experienceField()
      ];
    }

    function buildStep3() {
      // Re-renders just this step in place after a Photo Upload state
      // change (file chosen / form opened / confirmed) — collects
      // whatever's currently typed into Drive Link/PIN first, exactly
      // like the existing Back button does, so neither is ever lost.
      const rerenderStep3 = () => { collectStepValues(); renderStep(); };
      const photoUploadRow = photoUploadField(session, Utils.clean(data.mobile), rerenderStep3);
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
        // Photo Upload — first and most prominent, per spec.
        photoUploadRow,
        Utils.el("div", { class: "photo-method-divider", text: Lang.t("register.step3.orDivider") }),
        Utils.el("div", { class: "photo-instructions hint" }, [
          Utils.el("p", { text: Lang.t("register.step3.instructions") }),
          photoWhatsappHelpLink()
        ]),
        // Drive Link (~70%) and PIN (~30%) side by side in one row.
        Utils.el("div", { class: "photo-input-row" }, [driveField.wrap, pinField.wrap]),
        // Vehicle Photo — unchanged, existing simple optional URL field.
        fieldRow({ id: "vehicleImageUrl", labelKey: "field.vehiclePhoto", type: "url", hint: "https://..." })
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
            const result = await Api.registerDriver(payload);
            activeRegistrationSession = null;
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
