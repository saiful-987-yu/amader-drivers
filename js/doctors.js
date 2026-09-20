/**
 * doctors.js — the Doctor list and Doctor Details modal. Doctors live in
 * their own "Doctors" Sheet tab (see Code.gs) and are NOT filtered by
 * bazar or vehicle type — this is a flat list, reached from the
 * homepage's "Find a Doctor" section.
 *
 * Deliberately mirrors js/drivers.js's card/detail structure closely and
 * reuses the SAME CSS classes (driver-card, detail-row, gallery,
 * action-row, etc.) so Doctor Cards/Details are visually identical to
 * Driver Cards/Details, per the project spec — without touching or
 * risking anything in the already-working driver flow.
 */
(function (window, document, Utils, Lang, Icons, Api, Router, ViewHelpers, Modal, Toast) {
  "use strict";

  // ---------------------------------------------------------
  // CALL HANDLING (same approach as drivers.js)
  // ---------------------------------------------------------
  function canPlaceCall() {
    return matchMedia("(pointer: coarse)").matches;
  }
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }
  function handleCall(doctor, e) {
    if (e) e.stopPropagation();
    const tel = Utils.normalizePhone(doctor.phone);
    if (canPlaceCall()) {
      window.location.href = "tel:" + tel;
      return;
    }
    copyToClipboard(tel).then((ok) => {
      Toast.show(ok ? Lang.t("driver.callNotSupported") : tel, ok ? "info" : undefined);
    });
  }

  // ---------------------------------------------------------
  // DOCTOR DETAILS MODAL <-> BACK BUTTON INTEGRATION
  // (independent copy of the same pattern used for drivers)
  // ---------------------------------------------------------
  let doctorModalHistoryPushed = false;
  let doctorModalClosingFromPopstate = false;

  function openDoctorModalWithHistory(contentNode) {
    function onPopState() {
      doctorModalClosingFromPopstate = true;
      window.removeEventListener("popstate", onPopState);
      Modal.close();
    }

    Modal.open(contentNode, {
      onClose: () => {
        window.removeEventListener("popstate", onPopState);
        const wasFromPopstate = doctorModalClosingFromPopstate;
        doctorModalClosingFromPopstate = false;
        if (doctorModalHistoryPushed) {
          doctorModalHistoryPushed = false;
          if (!wasFromPopstate) history.back();
        }
      }
    });

    history.pushState({ doctorModal: true }, "", window.location.hash || "#/");
    doctorModalHistoryPushed = true;
    window.addEventListener("popstate", onPopState);
  }

  // ---------------------------------------------------------
  // CARD + DETAIL BUILDING BLOCKS
  // ---------------------------------------------------------
  function doctorPhotoNode(doctor, size) {
    const wrap = Utils.el("div", { class: size === "large" ? "detail-photo" : "driver-card__photo" });
    const url = Utils.resolveImageUrl(doctor.imageUrl);
    if (url) {
      const img = Utils.el("img", { alt: Utils.driverDisplayName(doctor), loading: "lazy", decoding: "async" });
      img.src = url;
      img.addEventListener("error", () => { wrap.innerHTML = size === "large" ? Icons.userLarge : Icons.user; });
      wrap.appendChild(img);
    } else {
      wrap.innerHTML = size === "large" ? Icons.userLarge : Icons.user;
    }
    return wrap;
  }

  function statusNode(doctor, large) {
    const available = doctor.availability === "active";
    return Utils.el("span", {
      class: "status-dot " + (available ? "status-dot--available" : "status-dot--unavailable") + (large ? " status-dot--lg" : ""),
      text: available ? Lang.t("status.available") : Lang.t("status.unavailable")
    });
  }

  function starsNode(ratingRaw) {
    const count = Utils.starCount(ratingRaw);
    const stars = Utils.el("span", { class: "stars", role: "img", "aria-label": Lang.t("driver.ratingAria", { n: count }) });
    for (let i = 1; i <= 5; i++) {
      stars.appendChild(Utils.el("span", {
        class: "star " + (i <= count ? "star--filled" : "star--empty"),
        "aria-hidden": "true", text: i <= count ? "★" : "☆"
      }));
    }
    return stars;
  }

  function experienceRatingRow(doctor) {
    const parts = [];
    if (doctor.experience) {
      parts.push(Utils.el("span", { class: "driver-card__experience", text: doctor.experience }));
      parts.push(Utils.el("span", { class: "dot-sep", "aria-hidden": "true", text: "·" }));
    }
    parts.push(starsNode(doctor.rating));
    return Utils.el("div", { class: "driver-card__rating-row" }, parts);
  }

  function doctorCard(doctor, crumbTrail) {
    const whatsappNumber = Utils.resolveWhatsApp(doctor);
    const actions = [
      Utils.el("button", {
        class: "driver-card__call-btn",
        "aria-label": Lang.t("doctor.call") + " " + Utils.driverDisplayName(doctor),
        html: Icons.phone + "<span>" + Lang.t("doctor.call") + "</span>",
        disabled: doctor.availability !== "active" ? "true" : null,
        onClick: (e) => doctor.availability === "active" && handleCall(doctor, e)
      })
    ];
    if (whatsappNumber) {
      actions.push(Utils.el("a", {
        class: "whatsapp-btn", href: Utils.waLink(whatsappNumber), target: "_blank", rel: "noopener",
        "aria-label": Lang.t("driver.whatsapp") + " " + Utils.driverDisplayName(doctor), html: Icons.whatsapp,
        onClick: (e) => e.stopPropagation()
      }));
    }
    actions.push(Utils.el("div", { class: "driver-card__spacer", "aria-hidden": "true" }));

    return Utils.el("div", {
      class: "driver-card", tabindex: "0", role: "button",
      "aria-label": Utils.driverDisplayName(doctor),
      onClick: () => openDoctorDetail(doctor, crumbTrail),
      onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDoctorDetail(doctor, crumbTrail); } }
    }, [
      doctorPhotoNode(doctor, "small"),
      Utils.el("div", { class: "driver-card__body" }, [
        Utils.el("div", { class: "driver-card__name", text: Utils.driverDisplayName(doctor) }),
        Utils.el("div", { class: "driver-card__meta", title: doctor.degree || "", text: doctor.degree || "" }),
        experienceRatingRow(doctor),
        statusNode(doctor),
        Utils.el("div", { class: "driver-card__actions" }, actions)
      ])
    ]);
  }

  function twoColRow(labelA, valueA, labelB, valueB) {
    return Utils.el("div", { class: "detail-row" }, [
      Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: labelA }),
        Utils.el("div", { class: "detail-col__value", text: valueA })
      ]),
      Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: labelB }),
        Utils.el("div", { class: "detail-col__value", text: valueB })
      ])
    ]);
  }

  function phoneLinkNode(number) {
    return Utils.el("a", { class: "detail-col__value detail-col__value--link detail-col__value--phone", href: "tel:" + Utils.normalizePhone(number) }, [
      Utils.el("span", { class: "detail-col__phone-icon", "aria-hidden": "true", html: Icons.phone }),
      document.createTextNode(number)
    ]);
  }

  /** Same thumbnail + main-image gallery pattern as the driver's Vehicle Photos, sourced from "Doctor Sample Photos". */
  function buildGallery(doctor) {
    const urls = Utils.splitMulti(doctor.sampleImageUrl).map(Utils.resolveImageUrl).filter(Boolean);
    if (!urls.length) return null;

    const mainImg = Utils.el("img", { alt: Utils.driverDisplayName(doctor), loading: "lazy", decoding: "async" });
    const thumbButtons = [];
    let current = 0;

    function show(index) {
      current = (index + urls.length) % urls.length;
      mainImg.src = urls[current];
      thumbButtons.forEach((btn, i) => btn.classList.toggle("is-active", i === current));
    }

    const mainChildren = [mainImg];
    if (urls.length > 1) {
      mainChildren.push(Utils.el("button", {
        type: "button", class: "gallery__arrow gallery__arrow--prev",
        "aria-label": Lang.t("a11y.previousImage"), html: Icons.chevronLeft,
        onClick: () => show(current - 1)
      }));
      mainChildren.push(Utils.el("button", {
        type: "button", class: "gallery__arrow gallery__arrow--next",
        "aria-label": Lang.t("a11y.nextImage"), html: Icons.chevronRight,
        onClick: () => show(current + 1)
      }));
    }
    const mainWrap = Utils.el("div", { class: "gallery__main" }, mainChildren);

    const children = [];
    if (urls.length > 1) {
      const thumbs = urls.map((url, i) => {
        const thumbImg = Utils.el("img", { alt: "", loading: "lazy" });
        thumbImg.src = url;
        const btn = Utils.el("button", {
          type: "button", class: "gallery__thumb", "aria-label": (i + 1) + " / " + urls.length,
          onClick: () => show(i)
        }, [thumbImg]);
        thumbButtons.push(btn);
        return btn;
      });
      children.push(Utils.el("div", { class: "gallery__thumbs" }, thumbs));
    }
    children.push(mainWrap);

    show(0);
    return Utils.el("div", { class: "gallery" }, children);
  }

  /** Same UI-only "Rate This ___" demo widget as the driver details — nothing is ever saved. */
  /** Human-readable date for a review's ISO "Date Time" — falls back to nothing rather than throwing on a bad/missing value. */
  function formatReviewDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(Lang.current() === "bn" ? "bn-BD" : "en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch (err) { return ""; }
  }

  function renderReviewList(container, list) {
    container.innerHTML = "";
    if (!list.length) {
      container.appendChild(Utils.el("p", { class: "reviews-empty", text: Lang.t("driver.reviewsEmpty") }));
      return;
    }
    list.forEach((r) => {
      container.appendChild(Utils.el("div", { class: "review-item" }, [
        starsNode(r.stars),
        r.comment ? Utils.el("p", { class: "review-item__comment", text: r.comment }) : null,
        Utils.el("div", { class: "review-item__date", text: formatReviewDate(r.dateTime) })
      ].filter(Boolean)));
    });
  }

  /**
   * The full public Rating/Review widget — same shape/spirit as the
   * Driver Details one (see drivers.js), just its own copy targeting
   * "doctor" + doctorId. The doctor's blended rating (verified public
   * reviews + the admin's own Manual Rating, capped at 5 — finalRating
   * from the API) is shown up top, then a short preview of verified
   * reviews with "View All Reviews", then the star + comment
   * submission form. A new submission always starts unverified and is
   * never shown here until the sheet owner approves it.
   */
  function buildRatingSection(doctor) {
    const summaryRow = Utils.el("div", { class: "reviews-summary" }, [
      starsNode(doctor.finalRating),
      Utils.el("span", { class: "reviews-summary__value", text: (Number(doctor.finalRating) || 0).toFixed(1) }),
      Utils.el("span", { class: "reviews-summary__count", text: Lang.t("driver.reviewCount", { n: doctor.publicRatingCount || 0 }) })
    ]);

    // Preview (unchanged design/behavior) — up to 2 reviews, no scroll area.
    const listContainer = Utils.el("div", { class: "reviews-list" }, [ViewHelpers.loadingBlock()]);
    // "View All Reviews" expands into its OWN capped-height, scrollable
    // container instead — never the full list inline on the page — so
    // 100/500/1000 reviews never make the Details page itself long;
    // only this one area scrolls.
    const expandedContainer = Utils.el("div", { class: "reviews-list reviews-list--expanded" });
    expandedContainer.style.display = "none";

    const viewAllBtn = Utils.el("button", {
      type: "button", class: "btn btn--ghost btn--sm reviews-view-all-btn", text: Lang.t("driver.viewAllReviews")
    });
    const closeReviewsBtn = Utils.el("button", {
      type: "button", class: "btn btn--ghost btn--sm reviews-view-all-btn", text: Lang.t("driver.closeReviews")
    });
    closeReviewsBtn.style.display = "none";
    if ((doctor.publicRatingCount || 0) <= 2) viewAllBtn.style.display = "none";

    Api.getPublicRatings("doctor", doctor.doctorId, false)
      .then((list) => renderReviewList(listContainer, list))
      .catch(() => renderReviewList(listContainer, []));

    viewAllBtn.addEventListener("click", async () => {
      viewAllBtn.disabled = true;
      try {
        const all = await Api.getPublicRatings("doctor", doctor.doctorId, true);
        renderReviewList(expandedContainer, all);
        listContainer.style.display = "none";
        expandedContainer.style.display = "";
        viewAllBtn.style.display = "none";
        closeReviewsBtn.style.display = "";
      } catch (err) {
        Toast.show(Lang.t("error.network"), "error");
      } finally {
        viewAllBtn.disabled = false;
      }
    });

    closeReviewsBtn.addEventListener("click", () => {
      // The 2-review preview is still sitting in listContainer exactly
      // as it was — no re-fetch needed to collapse back to it.
      expandedContainer.style.display = "none";
      expandedContainer.innerHTML = "";
      listContainer.style.display = "";
      closeReviewsBtn.style.display = "none";
      if ((doctor.publicRatingCount || 0) > 2) viewAllBtn.style.display = "";
    });

    const starButtons = [];
    let selectedStars = 0;
    const starsRow = Utils.el("div", { class: "rate-stars", role: "radiogroup", "aria-label": Lang.t("doctor.rateSectionTitle") });

    function select(n) {
      selectedStars = n;
      starButtons.forEach((btn, idx) => {
        const filled = idx < n;
        btn.classList.toggle("star--filled", filled);
        btn.classList.toggle("star--empty", !filled);
        btn.textContent = filled ? "★" : "☆";
        btn.setAttribute("aria-checked", idx === n - 1 ? "true" : "false");
      });
    }

    for (let i = 1; i <= 5; i++) {
      const btn = Utils.el("button", {
        type: "button", class: "star star--empty", role: "radio", "aria-checked": "false",
        "aria-label": Lang.t("driver.ratingAria", { n: i }), text: "☆",
        onClick: () => select(i)
      });
      starButtons.push(btn);
      starsRow.appendChild(btn);
    }

    const commentInput = Utils.el("textarea", {
      class: "rate-textarea", rows: "3",
      placeholder: Lang.t("driver.ratingCommentPlaceholder"),
      "aria-label": Lang.t("driver.ratingCommentPlaceholder")
    });

    const submitBtn = Utils.el("button", {
      class: "btn btn--primary btn--sm mt-5",
      text: Lang.t("driver.ratingSubmit"),
      onClick: async () => {
        if (!selectedStars) { Toast.show(Lang.t("driver.ratingSelectStars")); return; }
        submitBtn.disabled = true;
        try {
          await Api.submitPublicRating("doctor", doctor.doctorId, selectedStars, commentInput.value);
          Toast.show(Lang.t("driver.ratingSubmitted"), "success");
          commentInput.value = "";
          select(0);
        } catch (err) {
          Toast.show(Lang.t("error.generic"), "error");
        } finally {
          submitBtn.disabled = false;
        }
      }
    });

    return Utils.el("div", { class: "rate-section" }, [
      Utils.el("h3", { class: "detail-section-title", text: Lang.t("doctor.rateSectionTitle") }),
      summaryRow,
      listContainer,
      expandedContainer,
      viewAllBtn,
      closeReviewsBtn,
      starsRow,
      commentInput,
      submitBtn
    ]);
  }

  function openDoctorDetail(doctor, crumbTrail) {
    const children = [];
    if (crumbTrail && crumbTrail.length) {
      const crumbNode = ViewHelpers.breadcrumb(crumbTrail.concat([{ label: Utils.driverDisplayName(doctor) }]));
      Utils.qsa("a", crumbNode).forEach((a) => a.addEventListener("click", () => Modal.close()));
      children.push(crumbNode);
    }

    children.push(Utils.el("div", { class: "detail-name-row" }, [
      Utils.el("h2", { class: "detail-name", text: Utils.driverDisplayName(doctor) }),
      Utils.el("button", { class: "icon-btn", "aria-label": Lang.t("a11y.closeModal"), html: Icons.close, onClick: () => Modal.close() })
    ]));

    children.push(doctorPhotoNode(doctor, "large"));
    children.push(statusNode(doctor, true));

    children.push(Utils.el("h3", { class: "detail-section-title", text: Lang.t("doctor.information") }));

    children.push(twoColRow(
      Lang.t("doctor.degree"), doctor.degree || "—",
      Lang.t("doctor.regNumber"), doctor.regNumber || "—"
    ));

    if (doctor.serviceArea) {
      children.push(Utils.el("div", { class: "detail-row" }, [
        Utils.el("div", { class: "detail-col detail-col--full" }, [
          Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.serviceArea") }),
          Utils.el("div", { class: "detail-col__value detail-col__value--truncate", title: doctor.serviceArea, text: doctor.serviceArea })
        ])
      ]));
    }

    const expRatingCols = [];
    if (doctor.experience) {
      expRatingCols.push(Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: Lang.t("doctor.experience") }),
        Utils.el("div", { class: "detail-col__value", text: doctor.experience })
      ]));
    }
    expRatingCols.push(Utils.el("div", { class: "detail-col" }, [
      Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.rating") }),
      Utils.el("div", { class: "detail-col__value" }, [starsNode(doctor.rating)])
    ]));
    children.push(Utils.el("div", { class: "detail-row" }, expRatingCols));

    const phoneCols = [
      Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.phone") }),
        phoneLinkNode(doctor.phone)
      ])
    ];
    if (doctor.altPhone) {
      phoneCols.push(Utils.el("div", { class: "detail-col" }, [
        Utils.el("div", { class: "detail-col__label", text: Lang.t("driver.altPhone") }),
        phoneLinkNode(doctor.altPhone)
      ]));
    }
    children.push(Utils.el("div", { class: "detail-row" }, phoneCols));

    const actionButtons = [
      Utils.el("button", {
        class: "btn btn--primary btn--sm action-row__btn",
        html: Icons.phone + "<span>" + Lang.t("doctor.call") + "</span>",
        disabled: doctor.availability !== "active" ? "true" : null,
        onClick: () => doctor.availability === "active" && handleCall(doctor)
      })
    ];
    if (doctor.altPhone) {
      actionButtons.push(Utils.el("button", {
        class: "btn btn--ghost btn--sm action-row__btn",
        html: Icons.phone + "<span>" + Lang.t("driver.callAlternative") + "</span>",
        disabled: doctor.availability !== "active" ? "true" : null,
        onClick: () => doctor.availability === "active" && handleCall(Object.assign({}, doctor, { phone: doctor.altPhone }))
      }));
    }
    const whatsappNumber = Utils.resolveWhatsApp(doctor);
    if (whatsappNumber) {
      actionButtons.push(Utils.el("a", {
        class: "whatsapp-btn", href: Utils.waLink(whatsappNumber), target: "_blank", rel: "noopener",
        "aria-label": Lang.t("driver.whatsapp"), html: Icons.whatsapp
      }));
    }
    children.push(Utils.el("div", { class: "action-row mt-5" }, actionButtons));

    const gallery = buildGallery(doctor);
    if (gallery) {
      children.push(Utils.el("h3", { class: "detail-section-title mt-5", text: Lang.t("doctor.samplePhotos") }));
      children.push(gallery);
    }

    // Personal Details — plain text OR basic HTML from the Sheet,
    // rendered as-is; the whole section (heading included) is left out
    // entirely when the column is empty. Same section name/behavior as
    // the Driver Details page.
    if (Utils.clean(doctor.personalDetails)) {
      children.push(Utils.el("div", { class: "personal-details-section mt-5" }, [
        Utils.el("h3", { class: "detail-section-title", text: Lang.t("detail.personalDetails") }),
        Utils.el("div", { class: "personal-details", html: doctor.personalDetails })
      ]));
    }

    children.push(buildRatingSection(doctor));

    const videoSection = Utils.buildVideoSection(doctor.videoUrl, Lang.t("detail.video"));
    if (videoSection) { videoSection.classList.add("mt-5"); children.push(videoSection); }

    children.push(Utils.buildFooterClone());

    openDoctorModalWithHistory(Utils.el("div", {}, children));
  }

  // ---------------------------------------------------------
  // DOCTOR LIST VIEW (/doctors)
  // ---------------------------------------------------------
  async function renderDoctorList(app) {
    app.innerHTML = "";

    const crumb = ViewHelpers.breadcrumb([
      { label: Lang.t("nav.home"), path: "/" },
      { label: Lang.t("doctor.heading") }
    ]);
    const resultsWrap = Utils.el("div", {});
    const section = Utils.el("section", { class: "section container" }, [
      crumb,
      Utils.el("div", { class: "section-head" }, [
        Utils.el("h2", { text: Lang.t("doctor.heading") }),
        Utils.el("p", { text: Lang.t("doctor.sectionSub") })
      ]),
      resultsWrap
    ]);
    app.appendChild(section);

    const alreadyCached = !!Api.peekDoctorDirectory();
    if (!alreadyCached) resultsWrap.appendChild(ViewHelpers.loadingBlock(Lang.t("drivers.loading")));

    try {
      const list = await Api.getDoctorDirectory();
      resultsWrap.innerHTML = "";
      if (!list.length) {
        resultsWrap.appendChild(ViewHelpers.emptyBlock({ message: Lang.t("empty.noDoctors") }));
        return;
      }
      const crumbTrail = [
        { label: Lang.t("nav.home"), path: "/" },
        { label: Lang.t("doctor.heading"), path: "/doctor" }
      ];
      resultsWrap.appendChild(Utils.el("div", { class: "driver-grid" }, list.map((d) => doctorCard(d, crumbTrail))));
    } catch (err) {
      resultsWrap.innerHTML = "";
      resultsWrap.appendChild(ViewHelpers.errorBlock(Lang.t("error.network"), () => renderDoctorList(app)));
    }
  }

  Router.register("/doctor", renderDoctorList, ["/"]);
})(window, document, window.Utils, window.Lang, window.Icons, window.Api, window.Router, window.ViewHelpers, window.Modal, window.Toast);
