/**
 * profile.js — driver-only screens: Login and My Profile
 * (availability toggle, logout). Customers never need this file.
 */
(function (window, document, Utils, Lang, Icons, Auth, Router, ViewHelpers, Toast, Modal) {
  "use strict";

  function marketLabel(slug) {
    // Falls back to the raw slug if markets haven't loaded; good enough
    // for a label since the profile screen already has the driver record.
    return slug ? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
  }

  // ---------------------------------------------------------
  // LOGIN VIEW
  // ---------------------------------------------------------
  function renderLogin(app) {
    app.innerHTML = "";
    if (Auth.isLoggedIn()) { Router.navigate("/profile"); return; }

    const idInput = Utils.el("input", { id: "identifier", type: "text", autocomplete: "username" });
    const pwInput = Utils.el("input", { id: "password", type: "password", autocomplete: "current-password" });

    const pwWrap = Utils.el("div", { class: "password-field" }, [pwInput]);
    const pwToggle = Utils.el("button", {
      type: "button", "aria-label": Lang.t("login.showPassword"), html: Icons.eye,
      onClick: () => {
        const showing = pwInput.type === "text";
        pwInput.type = showing ? "password" : "text";
        pwToggle.innerHTML = showing ? Icons.eye : Icons.eyeOff;
      }
    });
    pwWrap.appendChild(pwToggle);

    const errorMsg = Utils.el("div", { class: "error-msg", style: "display:none;color:var(--color-danger);font-size:var(--font-size-sm);margin-top:var(--space-2);" });

    const submitBtn = Utils.el("button", { class: "btn btn--primary btn--block", text: Lang.t("login.submit") });

    const form = Utils.el("form", {}, [
      Utils.el("div", { class: "field" }, [Utils.el("label", { for: "identifier", text: Lang.t("login.usernameLabel") }), idInput]),
      Utils.el("div", { class: "field" }, [Utils.el("label", { for: "password", text: Lang.t("login.passwordLabel") }), pwWrap]),
      errorMsg,
      submitBtn,
      Utils.el("p", { class: "text-center mt-5 hint" }, [
        document.createTextNode(Lang.t("login.noAccount") + " "),
        Utils.el("a", { href: "#/register", text: Lang.t("login.registerLink") })
      ])
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorMsg.style.display = "none";
      submitBtn.disabled = true;
      const original = submitBtn.textContent;
      submitBtn.textContent = Lang.t("loading.generic");
      try {
        await Auth.login(idInput.value, pwInput.value);
        Router.navigate("/profile");
      } catch (err) {
        const key = err.code === "PENDING_APPROVAL" ? "login.error.pending" : "login.error";
        errorMsg.textContent = Lang.t(key);
        errorMsg.style.display = "block";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    });

    app.appendChild(Utils.el("section", { class: "section container" }, [
      Utils.el("div", { class: "section-head text-center" }, [
        Utils.el("h2", { text: Lang.t("login.heading") }),
        Utils.el("p", { text: Lang.t("login.sub") })
      ]),
      Utils.el("div", { class: "form-card" }, [form])
    ]));
  }

  // ---------------------------------------------------------
  // PROFILE VIEW
  // ---------------------------------------------------------
  async function renderProfile(app) {
    app.innerHTML = "";
    if (!Auth.isLoggedIn()) {
      app.appendChild(Utils.el("section", { class: "section container" }, [
        ViewHelpers.emptyBlock({
          message: Lang.t("profile.loginRequired"), icon: Icons.userLarge,
          actionLabel: Lang.t("nav.login"), onAction: () => Router.navigate("/login")
        })
      ]));
      return;
    }

    const section = Utils.el("section", { class: "section container" }, [ViewHelpers.loadingBlock()]);
    app.appendChild(section);

    let driver;
    try {
      driver = await Auth.getProfile();
    } catch (err) {
      section.innerHTML = "";
      if (err.code === "SESSION_EXPIRED") {
        Toast.show(Lang.t("error.sessionExpired"), "error");
        Router.navigate("/login");
        return;
      }
      section.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderProfile(app)));
      return;
    }

    section.innerHTML = "";

    const photoWrap = Utils.el("div", { class: "profile-photo" });
    const url = Utils.resolveImageUrl(driver.imageUrl);
    if (url) {
      const img = Utils.el("img", { alt: driver.name });
      img.src = url;
      img.addEventListener("error", () => { photoWrap.innerHTML = Icons.userLarge; });
      photoWrap.appendChild(img);
    } else {
      photoWrap.innerHTML = Icons.userLarge;
    }

    const accountStatusKey = "profile.accountStatus." + (driver.accountStatus || "active");

    const kvRows = [
      [Lang.t("driver.phone"), driver.phone],
      [Lang.t("driver.market"), marketLabel(driver.marketSlug)],
      [Lang.t("driver.serviceArea"), driver.serviceArea || "—"],
      [Lang.t("driver.vehicleNumber"), driver.vehicleNumber || "—"],
      [Lang.t("profile.accountStatus"), Lang.t(accountStatusKey)]
    ];

    const activeBtn = Utils.el("button", { html: Icons.checkCircle + "<span>" + Lang.t("profile.setActive") + "</span>" });
    const inactiveBtn = Utils.el("button", { html: Icons.alertCircle + "<span>" + Lang.t("profile.setInactive") + "</span>" });

    function paintAvailability() {
      activeBtn.classList.toggle("is-active-state", driver.availability === "active");
      inactiveBtn.classList.toggle("is-inactive-state", driver.availability !== "active");
    }
    paintAvailability();

    async function switchAvailability(target) {
      if (driver.availability === target) return;
      const confirmed = await Modal.confirm({
        title: Lang.t(target === "inactive" ? "profile.confirmInactive.title" : "profile.confirmActive.title"),
        body: Lang.t(target === "inactive" ? "profile.confirmInactive.body" : "profile.confirmActive.body"),
        danger: target === "inactive"
      });
      if (!confirmed) return;
      try {
        await Auth.updateAvailability(target);
        driver.availability = target;
        paintAvailability();
        Toast.show(Lang.t(target === "active" ? "profile.statusUpdated.active" : "profile.statusUpdated.inactive"), "success");
      } catch (err) {
        Toast.show(Lang.t("profile.statusUpdateError"), "error");
      }
    }

    activeBtn.addEventListener("click", () => switchAvailability("active"));
    inactiveBtn.addEventListener("click", () => switchAvailability("inactive"));

    const logoutBtn = Utils.el("button", {
      class: "btn btn--ghost btn--block mt-5", text: Lang.t("nav.logout"),
      onClick: async () => {
        const confirmed = await Modal.confirm({ title: Lang.t("nav.logout"), body: Lang.t("profile.logoutConfirm"), confirmLabel: Lang.t("nav.logout") });
        if (confirmed) { Auth.logout(); Router.navigate("/"); }
      }
    });

    section.appendChild(Utils.el("div", { class: "profile-card" }, [
      Utils.el("div", { class: "profile-top" }, [
        photoWrap,
        Utils.el("div", {}, [
          Utils.el("div", { class: "profile-name", text: driver.name }),
          Utils.el("div", { class: "profile-sub", text: (driver.vehicleType || "").toUpperCase() })
        ])
      ]),
      Utils.el("dl", {}, kvRows.map(([label, value]) => Utils.el("div", { class: "kv-row" }, [
        Utils.el("dt", { text: label }), Utils.el("dd", { text: value })
      ]))),
      Utils.el("div", { class: "mt-5" }, [
        Utils.el("label", { class: "hint", text: Lang.t("profile.availability") }),
        Utils.el("div", { class: "availability-control" }, [activeBtn, inactiveBtn])
      ]),
      logoutBtn
    ]));
  }

  Router.register("/login", renderLogin);
  Router.register("/profile", renderProfile);
})(window, document, window.Utils, window.Lang, window.Icons, window.Auth, window.Router, window.ViewHelpers, window.Toast, window.Modal);
