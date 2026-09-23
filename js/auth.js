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

  /** Synchronous cache peek — lets the Profile page paint instantly with the last-known driver data (if any) before its own await Auth.getProfile() confirms/refreshes it. */
  Auth.peekProfile = function () {
    const token = Auth.getToken();
    return token ? Api.peekProfile(token) : undefined;
  };

  Auth.updateAvailability = async function (availability) {
    const token = Auth.getToken();
    if (!token) throw new Error("SESSION_EXPIRED");
    return Api.updateAvailability(token, availability);
  };

  /** `fields` is a plain {key: value} object of only the driver-editable Profile fields being changed (see updateProfile() in Code.gs for the fixed list). */
  Auth.updateProfile = async function (fields) {
    const token = Auth.getToken();
    if (!token) throw new Error("SESSION_EXPIRED");
    return Api.updateProfile(token, fields);
  };

  Auth.changePassword = async function (oldPassword, newPassword) {
    const token = Auth.getToken();
    if (!token) throw new Error("SESSION_EXPIRED");
    return Api.changePassword(token, oldPassword, newPassword);
  };

  window.Auth = Auth;
})(window, window.Utils, window.Api);
