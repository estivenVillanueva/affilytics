(function () {
  var STORAGE_REF = "affiliate_ref";
  var STORAGE_CAMP = "affiliate_campaign";
  var COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

  function getCookieValue(key) {
    var encodedKey = encodeURIComponent(key) + "=";
    var cookies = document.cookie ? document.cookie.split("; ") : [];
    for (var i = 0; i < cookies.length; i += 1) {
      if (cookies[i].indexOf(encodedKey) === 0) {
        return decodeURIComponent(cookies[i].slice(encodedKey.length));
      }
    }
    return null;
  }

  function setPairCookie(refValue, campValue) {
    var maxAge = "; path=/; max-age=" + COOKIE_MAX_AGE_SECONDS;
    document.cookie =
      encodeURIComponent(STORAGE_REF) +
      "=" +
      encodeURIComponent(refValue) +
      maxAge;
    if (campValue) {
      document.cookie =
        encodeURIComponent(STORAGE_CAMP) +
        "=" +
        encodeURIComponent(campValue) +
        maxAge;
    } else {
      document.cookie =
        encodeURIComponent(STORAGE_CAMP) + "=; path=/; max-age=0";
    }
  }

  function normalizeCamp(raw) {
    if (!raw) {
      return "";
    }
    var s = String(raw).trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(s) || s.length > 64) {
      return "";
    }
    return s;
  }

  var params = new URLSearchParams(window.location.search);
  var refParam = params.get("ref");
  var campParam =
    params.get("c") || params.get("campaign") || params.get("camp") || "";
  var normalizedCamp = normalizeCamp(campParam);

  var existingRef =
    window.localStorage.getItem(STORAGE_REF) || getCookieValue(STORAGE_REF);

  if (refParam) {
    var normalizedRef = refParam.trim();
    if (!normalizedRef) {
      return;
    }
    if (!existingRef) {
      window.localStorage.setItem(STORAGE_REF, normalizedRef);
      if (normalizedCamp) {
        window.localStorage.setItem(STORAGE_CAMP, normalizedCamp);
      } else {
        window.localStorage.removeItem(STORAGE_CAMP);
      }
      setPairCookie(normalizedRef, normalizedCamp || "");
      console.log(
        "Affiliate stored: " +
          normalizedRef +
          (normalizedCamp ? " camp:" + normalizedCamp : ""),
      );
    }
    return;
  }

  if (existingRef && normalizedCamp) {
    window.localStorage.setItem(STORAGE_CAMP, normalizedCamp);
    document.cookie =
      encodeURIComponent(STORAGE_CAMP) +
      "=" +
      encodeURIComponent(normalizedCamp) +
      "; path=/; max-age=" +
      COOKIE_MAX_AGE_SECONDS;
    console.log("Affiliate campaign updated: " + normalizedCamp);
  }
})();
