/**
 * language.js — centralized translation system.
 * All user-facing strings live in TRANSLATIONS below. Nothing
 * else in the app should hard-code English or Bengali text.
 *
 * Usage:
 *   Lang.t("nav.home")               -> translated string
 *   Lang.t("empty.noDrivers")        -> translated string
 *   Lang.apply()                     -> re-renders every [data-i18n] node
 *   Lang.setLanguage("bn")           -> switches language + re-renders
 */
(function (window, Utils) {
  "use strict";

  const STORAGE_KEY = "nobi.language";

  const TRANSLATIONS = {
    en: {
      "site.name": "Amader Drivers",
      "site.tagline": "Find a local driver in seconds",

      "nav.home": "Home",
      "nav.drivers": "Drivers",
      "nav.register": "Register",
      "nav.profile": "Profile",
      "nav.login": "Login",
      "nav.logout": "Logout",

      "theme.light": "Light",
      "theme.dark": "Dark",

      "hero.heading": "Find Your Local Driver Easily",
      "hero.sub": "Browse CNG, Auto, Van and other local drivers by bazar and call them directly — no account needed.",
      "hero.cta": "Select Your Bazar",

      "market.chooseHeading": "Choose Your Bazar",
      "market.chooseSub": "Select the market area you're in or heading to.",
      "market.loading": "Loading bazars…",
      "market.empty": "No bazars are available yet.",

      "vehicle.chooseHeading": "Choose a Vehicle Type",
      "vehicle.chooseSub": "Who are you looking for in {market}?",
      "vehicle.loading": "Loading vehicle types…",
      "vehicle.empty": "No vehicle types are available for this bazar yet.",
      "vehicle.backToMarkets": "Change Bazar",

      "search.placeholder": "Search driver name or phone number…",
      "search.heading": "Quick Search",
      "search.resultsFor": "Results for \"{query}\"",

      "drivers.heading": "{vehicle} Drivers",
      "drivers.subInMarket": "in {market}",
      "drivers.loading": "Loading drivers…",
      "drivers.backToVehicles": "Change Vehicle Type",
      "drivers.count": "{count} drivers found",
      "drivers.filterAvailableOnly": "Available only",

      "status.available": "Available",
      "status.unavailable": "Currently Unavailable",

      "driver.call": "Call Driver",
      "driver.viewDetails": "View Details",
      "driver.phone": "Phone",
      "driver.altPhone": "Alternative Phone",
      "driver.vehicleType": "Vehicle Type",
      "driver.vehicleNumber": "Vehicle Number",
      "driver.market": "Bazar",
      "driver.serviceArea": "Service Area",
      "driver.experience": "Driving Experience",
      "driver.availability": "Availability",
      "driver.copyNumber": "Copy Number",
      "driver.numberCopied": "Phone number copied.",
      "driver.callNotSupported": "Calling isn't supported on this device. The number has been copied instead.",

      "empty.noDrivers": "No drivers are currently available in this category.",
      "empty.noDriversSub": "Please check back soon, or try another vehicle type.",
      "empty.noSearchResults": "No driver found.",
      "empty.browseOthers": "Browse Other Drivers",
      "empty.backToVehicleTypes": "Back to Vehicle Types",

      "howItWorks.heading": "How It Works",
      "howItWorks.step1.title": "Choose your bazar",
      "howItWorks.step1.text": "Pick the market area you're in.",
      "howItWorks.step2.title": "Pick a vehicle type",
      "howItWorks.step2.text": "CNG, Auto, Van and more.",
      "howItWorks.step3.title": "Call the driver",
      "howItWorks.step3.text": "Tap Call and you're connected.",

      "registerCta.heading": "Drive in this area?",
      "registerCta.text": "Register as a driver and get discovered by local customers.",
      "registerCta.button": "Register as a Driver",

      "footer.tagline": "Connecting local communities with local drivers.",
      "footer.quickLinks": "Quick Links",
      "footer.rights": "All rights reserved.",

      "register.heading": "Register as a Driver",
      "register.sub": "Fill in your details below. Our team will verify your information before your profile goes live.",
      "register.step": "Step {current} of {total}",
      "register.step1.title": "Personal Information",
      "register.step2.title": "Driver & Vehicle Information",
      "register.step3.title": "Photo",
      "register.step4.title": "Account Information",
      "register.step5.title": "Review & Submit",

      "field.fullName": "Full Name",
      "field.guardianName": "Father's / Husband's Name",
      "field.mobile": "Mobile Number",
      "field.altMobile": "Alternative Mobile Number (optional)",
      "field.village": "Village",
      "field.postOffice": "Post Office",
      "field.union": "Union",
      "field.upazila": "Upazila",
      "field.district": "District",
      "field.fullAddress": "Full Address",
      "field.vehicleType": "Vehicle Type",
      "field.vehicleNumber": "Vehicle Number",
      "field.preferredMarket": "Preferred Bazar",
      "field.serviceArea": "Service Area",
      "field.experience": "Driving Experience (years)",
      "field.driverPhoto": "Driver Photo (image URL)",
      "field.vehiclePhoto": "Vehicle Photo (image URL, optional)",
      "field.username": "Username or Mobile Number",
      "field.password": "Password",
      "field.confirmPassword": "Confirm Password",

      "action.next": "Next",
      "action.back": "Back",
      "action.submit": "Submit Application",
      "action.submitting": "Submitting…",
      "action.retry": "Retry",
      "action.cancel": "Cancel",
      "action.confirm": "Confirm",
      "action.close": "Close",
      "action.edit": "Edit",

      "register.success.title": "Application Submitted",
      "register.success.body": "Your registration request has been submitted successfully. Your account will become active after verification by the market team.",
      "register.success.action": "Back to Home",
      "register.error.generic": "We couldn't submit your application. Please check your connection and try again.",
      "register.error.duplicatePhone": "This phone number is already registered.",
      "register.error.duplicateUsername": "This username is already taken.",

      "validation.required": "This field is required.",
      "validation.phoneInvalid": "Enter a valid Bangladesh mobile number.",
      "validation.passwordMismatch": "Passwords do not match.",
      "validation.passwordShort": "Password must be at least 6 characters.",
      "validation.selectOption": "Please make a selection.",

      "login.heading": "Driver Login",
      "login.sub": "Log in to manage your availability.",
      "login.usernameLabel": "Username or Mobile Number",
      "login.passwordLabel": "Password",
      "login.submit": "Login",
      "login.showPassword": "Show password",
      "login.hidePassword": "Hide password",
      "login.noAccount": "Don't have an account?",
      "login.registerLink": "Register as Driver",
      "login.error": "Invalid username or password.",
      "login.error.pending": "Your application is still under review. Please check back once it has been approved.",

      "profile.heading": "My Profile",
      "profile.accountStatus": "Account Status",
      "profile.availability": "Availability",
      "profile.setActive": "Active",
      "profile.setInactive": "Inactive",
      "profile.confirmInactive.title": "Change availability to Inactive?",
      "profile.confirmInactive.body": "Customers will see you as \"Currently Unavailable\" until you switch back to Active.",
      "profile.confirmActive.title": "Change availability to Active?",
      "profile.confirmActive.body": "Customers will be able to see and call you again.",
      "profile.statusUpdated.active": "Your status has been changed to Active.",
      "profile.statusUpdated.inactive": "Your status has been changed to Inactive.",
      "profile.statusUpdateError": "We couldn't update your availability. Please try again.",
      "profile.accountStatus.active": "Active",
      "profile.accountStatus.pending": "Pending Verification",
      "profile.accountStatus.suspended": "Suspended",
      "profile.loginRequired": "Please log in to view your profile.",
      "profile.logoutConfirm": "Log out of your driver account?",

      "loading.generic": "Loading…",
      "error.network": "Unable to load driver information. Please try again.",
      "error.generic": "Something went wrong. Please try again.",
      "error.sessionExpired": "Your session has expired. Please log in again.",

      "a11y.skipToContent": "Skip to content",
      "a11y.closeMenu": "Close menu",
      "a11y.openMenu": "Open menu",
      "a11y.closeModal": "Close",

      "vehicle.icon.default": "Vehicle"
    },

    bn: {
      "site.name": "আমাদের ড্রাইভার",
      "site.tagline": "কয়েক সেকেন্ডে স্থানীয় ড্রাইভার খুঁজুন",

      "nav.home": "হোম",
      "nav.drivers": "ড্রাইভার",
      "nav.register": "রেজিস্ট্রেশন",
      "nav.profile": "প্রোফাইল",
      "nav.login": "লগইন",
      "nav.logout": "লগআউট",

      "theme.light": "লাইট",
      "theme.dark": "ডার্ক",

      "hero.heading": "সহজেই আপনার স্থানীয় ড্রাইভার খুঁজুন",
      "hero.sub": "বাজার অনুযায়ী সিএনজি, অটো, ভ্যান ও অন্যান্য স্থানীয় ড্রাইভার দেখুন এবং সরাসরি কল করুন — কোনো অ্যাকাউন্ট লাগবে না।",
      "hero.cta": "আপনার বাজার নির্বাচন করুন",

      "market.chooseHeading": "আপনার বাজার নির্বাচন করুন",
      "market.chooseSub": "আপনি যে বাজার এলাকায় আছেন বা যাচ্ছেন তা বেছে নিন।",
      "market.loading": "বাজার লোড হচ্ছে…",
      "market.empty": "এখনো কোনো বাজার যুক্ত করা হয়নি।",

      "vehicle.chooseHeading": "যানবাহনের ধরন নির্বাচন করুন",
      "vehicle.chooseSub": "{market}-এ আপনি কাকে খুঁজছেন?",
      "vehicle.loading": "যানবাহনের ধরন লোড হচ্ছে…",
      "vehicle.empty": "এই বাজারের জন্য এখনো কোনো যানবাহনের ধরন নেই।",
      "vehicle.backToMarkets": "বাজার পরিবর্তন করুন",

      "search.placeholder": "ড্রাইভারের নাম বা ফোন নম্বর খুঁজুন…",
      "search.heading": "দ্রুত খুঁজুন",
      "search.resultsFor": "\"{query}\" এর ফলাফল",

      "drivers.heading": "{vehicle} ড্রাইভার",
      "drivers.subInMarket": "{market}-এ",
      "drivers.loading": "ড্রাইভার লোড হচ্ছে…",
      "drivers.backToVehicles": "যানবাহনের ধরন পরিবর্তন করুন",
      "drivers.count": "{count} জন ড্রাইভার পাওয়া গেছে",
      "drivers.filterAvailableOnly": "শুধু উপলব্ধ",

      "status.available": "উপলব্ধ",
      "status.unavailable": "বর্তমানে অনুপলব্ধ",

      "driver.call": "ড্রাইভারকে কল করুন",
      "driver.viewDetails": "বিস্তারিত দেখুন",
      "driver.phone": "ফোন",
      "driver.altPhone": "বিকল্প ফোন",
      "driver.vehicleType": "যানবাহনের ধরন",
      "driver.vehicleNumber": "যানবাহন নম্বর",
      "driver.market": "বাজার",
      "driver.serviceArea": "সেবা এলাকা",
      "driver.experience": "ড্রাইভিং অভিজ্ঞতা",
      "driver.availability": "উপলব্ধতা",
      "driver.copyNumber": "নম্বর কপি করুন",
      "driver.numberCopied": "ফোন নম্বর কপি হয়েছে।",
      "driver.callNotSupported": "এই ডিভাইসে সরাসরি কল করা যাচ্ছে না। নম্বরটি কপি করা হয়েছে।",

      "empty.noDrivers": "এই ক্যাটাগরিতে বর্তমানে কোনো ড্রাইভার উপলব্ধ নেই।",
      "empty.noDriversSub": "শীঘ্রই আবার দেখুন, অথবা অন্য যানবাহনের ধরন চেষ্টা করুন।",
      "empty.noSearchResults": "কোনো ড্রাইভার পাওয়া যায়নি।",
      "empty.browseOthers": "অন্যান্য ড্রাইভার দেখুন",
      "empty.backToVehicleTypes": "যানবাহনের ধরনে ফিরে যান",

      "howItWorks.heading": "যেভাবে কাজ করে",
      "howItWorks.step1.title": "আপনার বাজার বেছে নিন",
      "howItWorks.step1.text": "আপনি যে বাজার এলাকায় আছেন তা নির্বাচন করুন।",
      "howItWorks.step2.title": "যানবাহনের ধরন বেছে নিন",
      "howItWorks.step2.text": "সিএনজি, অটো, ভ্যান এবং আরও অনেক কিছু।",
      "howItWorks.step3.title": "ড্রাইভারকে কল করুন",
      "howItWorks.step3.text": "কল বাটনে চাপ দিলেই সংযুক্ত হয়ে যাবেন।",

      "registerCta.heading": "এই এলাকায় গাড়ি চালান?",
      "registerCta.text": "ড্রাইভার হিসেবে রেজিস্ট্রেশন করুন এবং স্থানীয় গ্রাহকদের কাছে পৌঁছান।",
      "registerCta.button": "ড্রাইভার হিসেবে রেজিস্ট্রেশন করুন",

      "footer.tagline": "স্থানীয় জনগণকে স্থানীয় ড্রাইভারদের সাথে সংযুক্ত করা।",
      "footer.quickLinks": "দ্রুত লিংক",
      "footer.rights": "সর্বস্বত্ব সংরক্ষিত।",

      "register.heading": "ড্রাইভার হিসেবে রেজিস্ট্রেশন করুন",
      "register.sub": "নিচে আপনার তথ্য পূরণ করুন। প্রোফাইল প্রকাশের আগে আমাদের দল তা যাচাই করবে।",
      "register.step": "ধাপ {current} / {total}",
      "register.step1.title": "ব্যক্তিগত তথ্য",
      "register.step2.title": "ড্রাইভার ও যানবাহনের তথ্য",
      "register.step3.title": "ছবি",
      "register.step4.title": "অ্যাকাউন্ট তথ্য",
      "register.step5.title": "পর্যালোচনা ও জমা দিন",

      "field.fullName": "পূর্ণ নাম",
      "field.guardianName": "পিতা/স্বামীর নাম",
      "field.mobile": "মোবাইল নম্বর",
      "field.altMobile": "বিকল্প মোবাইল নম্বর (ঐচ্ছিক)",
      "field.village": "গ্রাম",
      "field.postOffice": "ডাকঘর",
      "field.union": "ইউনিয়ন",
      "field.upazila": "উপজেলা",
      "field.district": "জেলা",
      "field.fullAddress": "সম্পূর্ণ ঠিকানা",
      "field.vehicleType": "যানবাহনের ধরন",
      "field.vehicleNumber": "যানবাহন নম্বর",
      "field.preferredMarket": "পছন্দের বাজার",
      "field.serviceArea": "সেবা এলাকা",
      "field.experience": "ড্রাইভিং অভিজ্ঞতা (বছর)",
      "field.driverPhoto": "ড্রাইভারের ছবি (ইমেজ ইউআরএল)",
      "field.vehiclePhoto": "যানবাহনের ছবি (ইমেজ ইউআরএল, ঐচ্ছিক)",
      "field.username": "ইউজারনেম বা মোবাইল নম্বর",
      "field.password": "পাসওয়ার্ড",
      "field.confirmPassword": "পাসওয়ার্ড নিশ্চিত করুন",

      "action.next": "পরবর্তী",
      "action.back": "পূর্ববর্তী",
      "action.submit": "আবেদন জমা দিন",
      "action.submitting": "জমা দেওয়া হচ্ছে…",
      "action.retry": "আবার চেষ্টা করুন",
      "action.cancel": "বাতিল",
      "action.confirm": "নিশ্চিত করুন",
      "action.close": "বন্ধ করুন",
      "action.edit": "সম্পাদনা",

      "register.success.title": "আবেদন জমা হয়েছে",
      "register.success.body": "আপনার রেজিস্ট্রেশন আবেদন সফলভাবে জমা হয়েছে। বাজার টিমের যাচাইয়ের পর আপনার অ্যাকাউন্ট সক্রিয় হবে।",
      "register.success.action": "হোমে ফিরে যান",
      "register.error.generic": "আপনার আবেদন জমা দেওয়া যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
      "register.error.duplicatePhone": "এই ফোন নম্বরটি ইতিমধ্যে নিবন্ধিত।",
      "register.error.duplicateUsername": "এই ইউজারনেমটি ইতিমধ্যে ব্যবহৃত হয়েছে।",

      "validation.required": "এই ঘরটি পূরণ করা আবশ্যক।",
      "validation.phoneInvalid": "সঠিক বাংলাদেশি মোবাইল নম্বর দিন।",
      "validation.passwordMismatch": "পাসওয়ার্ড মিলছে না।",
      "validation.passwordShort": "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
      "validation.selectOption": "অনুগ্রহ করে একটি অপশন নির্বাচন করুন।",

      "login.heading": "ড্রাইভার লগইন",
      "login.sub": "আপনার উপলব্ধতা পরিচালনা করতে লগইন করুন।",
      "login.usernameLabel": "ইউজারনেম বা মোবাইল নম্বর",
      "login.passwordLabel": "পাসওয়ার্ড",
      "login.submit": "লগইন",
      "login.showPassword": "পাসওয়ার্ড দেখান",
      "login.hidePassword": "পাসওয়ার্ড লুকান",
      "login.noAccount": "অ্যাকাউন্ট নেই?",
      "login.registerLink": "ড্রাইভার হিসেবে রেজিস্ট্রেশন করুন",
      "login.error": "ভুল ইউজারনেম বা পাসওয়ার্ড।",
      "login.error.pending": "আপনার আবেদনটি এখনও পর্যালোচনাধীন। অনুমোদনের পর আবার চেষ্টা করুন।",

      "profile.heading": "আমার প্রোফাইল",
      "profile.accountStatus": "অ্যাকাউন্ট স্ট্যাটাস",
      "profile.availability": "উপলব্ধতা",
      "profile.setActive": "সক্রিয়",
      "profile.setInactive": "নিষ্ক্রিয়",
      "profile.confirmInactive.title": "উপলব্ধতা নিষ্ক্রিয় করতে চান?",
      "profile.confirmInactive.body": "আপনি সক্রিয় না করা পর্যন্ত গ্রাহকরা আপনাকে \"বর্তমানে অনুপলব্ধ\" দেখবেন।",
      "profile.confirmActive.title": "উপলব্ধতা সক্রিয় করতে চান?",
      "profile.confirmActive.body": "গ্রাহকরা আবার আপনাকে দেখতে ও কল করতে পারবেন।",
      "profile.statusUpdated.active": "আপনার স্ট্যাটাস সক্রিয় করা হয়েছে।",
      "profile.statusUpdated.inactive": "আপনার স্ট্যাটাস নিষ্ক্রিয় করা হয়েছে।",
      "profile.statusUpdateError": "আপনার উপলব্ধতা হালনাগাদ করা যায়নি। আবার চেষ্টা করুন।",
      "profile.accountStatus.active": "সক্রিয়",
      "profile.accountStatus.pending": "যাচাই বাকি",
      "profile.accountStatus.suspended": "স্থগিত",
      "profile.loginRequired": "প্রোফাইল দেখতে লগইন করুন।",
      "profile.logoutConfirm": "আপনার ড্রাইভার অ্যাকাউন্ট থেকে লগআউট করবেন?",

      "loading.generic": "লোড হচ্ছে…",
      "error.network": "ড্রাইভারের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।",
      "error.generic": "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।",
      "error.sessionExpired": "আপনার সেশনের মেয়াদ শেষ হয়ে গেছে। আবার লগইন করুন।",

      "a11y.skipToContent": "মূল বিষয়বস্তুতে যান",
      "a11y.closeMenu": "মেনু বন্ধ করুন",
      "a11y.openMenu": "মেনু খুলুন",
      "a11y.closeModal": "বন্ধ করুন",

      "vehicle.icon.default": "যানবাহন"
    }
  };

  const Lang = {};
  let currentLang = Utils.storage.get(STORAGE_KEY, null) ||
    (window.NOBI_CONFIG && window.NOBI_CONFIG.DEFAULT_LANGUAGE) || "en";
  if (!TRANSLATIONS[currentLang]) currentLang = "en";

  Lang.current = () => currentLang;

  Lang.t = function (key, vars) {
    const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    let str = dict[key] != null ? dict[key] : (TRANSLATIONS.en[key] || key);
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
      });
    }
    return str;
  };

  Lang.setLanguage = function (lang) {
    if (!TRANSLATIONS[lang]) return;
    currentLang = lang;
    Utils.storage.set(STORAGE_KEY, lang);
    document.documentElement.setAttribute("lang", lang === "bn" ? "bn" : "en");
    document.documentElement.setAttribute("dir", "ltr");
    Lang.apply();
    document.dispatchEvent(new CustomEvent("nobi:languagechange", { detail: { lang } }));
  };

  /** Re-render every element carrying a data-i18n attribute. */
  Lang.apply = function () {
    Utils.qsa("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      node.textContent = Lang.t(key);
    });
    Utils.qsa("[data-i18n-placeholder]").forEach((node) => {
      node.setAttribute("placeholder", Lang.t(node.getAttribute("data-i18n-placeholder")));
    });
    Utils.qsa("[data-i18n-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", Lang.t(node.getAttribute("data-i18n-aria-label")));
    });
    Utils.qsa("[data-lang-toggle]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-lang-toggle") === currentLang);
    });
    document.title = Lang.t("site.name") + " — " + Lang.t("hero.heading");
  };

  document.documentElement.setAttribute("lang", currentLang === "bn" ? "bn" : "en");

  window.Lang = Lang;
})(window, window.Utils);
