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

    const data = {};
    let currentStep = 1;
    // Latest known availability result for Mobile (Step 1) and Username
    // (Step 4), each tracked by value so a stale/pending result never
    // lets that step's Next button through, and an unchanged value is
    // never re-checked/re-loaded a second time — see handleNext().
    let phoneCheck = { value: null, available: null };
    let usernameCheck = { value: null, available: null };

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
      return [
        fieldRow({ id: "fullName", labelKey: "field.fullName", required: true }),
        fieldRow({ id: "fullNameBn", labelKey: "field.fullNameBn", required: true }),
        fieldRow({ id: "guardianName", labelKey: "field.guardianName" }),
        mobileField(app, (value, available) => { phoneCheck = { value, available }; }),
        fieldRow({ id: "altMobile", labelKey: "field.altMobile", type: "tel" }),
        fieldRow({ id: "whatsapp", labelKey: "field.whatsapp", type: "tel" }),
        fieldRow({ id: "village", labelKey: "field.village" }),
        fieldRow({ id: "postOffice", labelKey: "field.postOffice" }),
        fieldRow({ id: "union", labelKey: "field.union" }),
        fieldRow({ id: "upazila", labelKey: "field.upazila" }),
        fieldRow({ id: "district", labelKey: "field.district" }),
        fieldRow({ id: "fullAddress", labelKey: "field.fullAddress", type: "textarea" })
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
      return [
        fieldRow({ id: "imageUrl", labelKey: "field.driverPhoto", type: "url", hint: "https://..." }),
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
        // Driver/Profile Image URL is required; Vehicle Image URL stays optional.
        const value = Utils.clean(data.imageUrl);
        if (!value) { setFieldError(app, "imageUrl", Lang.t("validation.required")); valid = false; }
        else setFieldError(app, "imageUrl", "");
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
      const rows = STEP_BUILDERS[currentStep - 1]();
      rows.forEach((row) => stepBody.appendChild(row.wrap || row));
      hydrateStepValues();
      updateIndicator();
      renderActions();
    }

    function renderActions() {
      actions.innerHTML = "";
      if (currentStep > 1) {
        actions.appendChild(Utils.el("button", {
          class: "btn btn--ghost", text: Lang.t("action.back"),
          onClick: () => { collectStepValues(); currentStep -= 1; renderStep(); }
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
            nextBtn.disabled = false;
            if (!phoneCheck.available) {
              setFieldError(app, "mobile", phoneCheck.networkError ? Lang.t("error.network") : Lang.t("field.phoneTaken"));
              focusFirstError(stepBody);
              return;
            }
          }
          if (currentStep === 4) {
            const value = Utils.clean(data.username);
            nextBtn.disabled = true;
            usernameCheck = await ensureAvailability(usernameCheck, value, Api.checkUsername);
            nextBtn.disabled = false;
            if (!usernameCheck.available) {
              setFieldError(app, "username", usernameCheck.networkError ? Lang.t("error.network") : Lang.t("field.usernameTaken"));
              focusFirstError(stepBody);
              return;
            }
          }

          currentStep += 1;
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
