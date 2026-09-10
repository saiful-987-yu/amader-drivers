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
      const rows = [
        fieldRow({ id: "fullName", labelKey: "field.fullName", required: true }),
        fieldRow({ id: "guardianName", labelKey: "field.guardianName" }),
        fieldRow({ id: "mobile", labelKey: "field.mobile", type: "tel", required: true }),
        fieldRow({ id: "altMobile", labelKey: "field.altMobile", type: "tel" }),
        fieldRow({ id: "village", labelKey: "field.village" }),
        fieldRow({ id: "postOffice", labelKey: "field.postOffice" }),
        fieldRow({ id: "union", labelKey: "field.union" }),
        fieldRow({ id: "upazila", labelKey: "field.upazila" }),
        fieldRow({ id: "district", labelKey: "field.district" }),
        fieldRow({ id: "fullAddress", labelKey: "field.fullAddress", type: "textarea" })
      ];
      return rows;
    }

    function buildStep2() {
      return [
        fieldRow({
          id: "vehicleType", labelKey: "field.vehicleType", type: "select", required: true,
          options: vehicles.map((v) => ({ value: v.slug, label: Lang.current() === "bn" ? v.nameBn : v.nameEn }))
        }),
        fieldRow({ id: "vehicleNumber", labelKey: "field.vehicleNumber", required: true }),
        fieldRow({
          id: "marketSlug", labelKey: "field.preferredMarket", type: "select", required: true,
          options: markets.map((m) => ({ value: m.slug, label: Lang.current() === "bn" ? m.nameBn : m.nameEn }))
        }),
        fieldRow({ id: "serviceArea", labelKey: "field.serviceArea", required: true }),
        fieldRow({ id: "experience", labelKey: "field.experience", type: "number" })
      ];
    }

    function buildStep3() {
      return [
        fieldRow({ id: "imageUrl", labelKey: "field.driverPhoto", type: "url", hint: "https://..." }),
        fieldRow({ id: "vehicleImageUrl", labelKey: "field.vehiclePhoto", type: "url", hint: "https://..." })
      ];
    }

    function buildStep4() {
      const usernameRow = fieldRow({ id: "username", labelKey: "field.username", required: true });
      const passwordRow = passwordField("password", "field.password");
      const confirmRow = passwordField("confirmPassword", "field.confirmPassword");
      return [usernameRow, passwordRow, confirmRow];
    }

    function buildStep5() {
      const entries = [
        ["field.fullName", data.fullName], ["field.guardianName", data.guardianName],
        ["field.mobile", data.mobile], ["field.altMobile", data.altMobile],
        ["field.village", data.village], ["field.postOffice", data.postOffice],
        ["field.union", data.union], ["field.upazila", data.upazila], ["field.district", data.district],
        ["field.fullAddress", data.fullAddress],
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
      return [dl];
    }

    const STEP_BUILDERS = [buildStep1, buildStep2, buildStep3, buildStep4, buildStep5];

    function collectStepValues() {
      Utils.qsa("input, select, textarea", stepBody).forEach((el) => {
        data[el.name || el.id] = el.value;
      });
    }

    function hydrateStepValues() {
      Utils.qsa("input, select, textarea", stepBody).forEach((el) => {
        const key = el.name || el.id;
        if (data[key] != null) el.value = data[key];
      });
    }

    function validateStep() {
      let valid = true;
      collectStepValues();
      if (currentStep === 1) {
        [["fullName", true], ["mobile", true]].forEach(([id, required]) => {
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
        actions.appendChild(Utils.el("button", {
          class: "btn btn--primary", text: Lang.t("action.next"),
          onClick: () => { if (validateStep()) { currentStep += 1; renderStep(); } }
        }));
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

  Router.register("/register", renderRegister);
})(window, document, window.Utils, window.Lang, window.Icons, window.Api, window.Router, window.ViewHelpers, window.Toast);
