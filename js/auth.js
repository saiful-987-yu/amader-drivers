/**
 * auth.js — driver session state. Stores only a session token
 * client-side (never a password). Talks to Api for the actual
 * login/verification work.
 */
(function (window, Utils, Api) {
  "use strict";

  const TOKEN_KEY = "nobi.session.token";
  const Auth = {};

  Auth.getToken = () => Utils.storage.get(TOKEN_KEY, null);

  Auth.isLoggedIn = () => !!Auth.getToken();

  Auth.login = async function (identifier, password) {
    const result = await Api.login(Utils.clean(identifier), password);
    Utils.storage.set(TOKEN_KEY, result.token);
    document.dispatchEvent(new CustomEvent("nobi:authchange", { detail: { loggedIn: true } }));
    return result.driver;
  };

  Auth.logout = function () {
    Utils.storage.remove(TOKEN_KEY);
    document.dispatchEvent(new CustomEvent("nobi:authchange", { detail: { loggedIn: false } }));
  };

  Auth.getProfile = async function () {
    const token = Auth.getToken();
    if (!token) return null;
    try {
      return await Api.getProfile(token);
    } catch (err) {
      if (err.code === "SESSION_EXPIRED") {
        Auth.logout();
      }
      throw err;
    }
  };

  Auth.updateAvailability = async function (availability) {
    const token = Auth.getToken();
    if (!token) throw new Error("SESSION_EXPIRED");
    return Api.updateAvailability(token, availability);
  };

  window.Auth = Auth;
})(window, window.Utils, window.Api);
