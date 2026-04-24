import { register } from "@shopify/web-pixels-extension";



function getCookie(name, cookieString) {

  var encodedName = encodeURIComponent(name) + "=";

  var source = typeof cookieString === "string" ? cookieString : "";

  if (!source) {

    return null;

  }



  var parts = source.split("; ");

  for (var i = 0; i < parts.length; i += 1) {

    if (parts[i].indexOf(encodedName) === 0) {

      return decodeURIComponent(parts[i].slice(encodedName.length));

    }

  }



  return null;

}



async function hmacSha256Hex(secret, message) {

  var enc = new TextEncoder();

  var key = await crypto.subtle.importKey(

    "raw",

    enc.encode(secret),

    { name: "HMAC", hash: "SHA-256" },

    false,

    ["sign"],

  );

  var sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));

  var bytes = new Uint8Array(sig);

  var hex = "";

  for (var j = 0; j < bytes.length; j += 1) {

    hex += bytes[j].toString(16).padStart(2, "0");

  }

  return hex;

}



function buildSignaturePayload(

  shop,

  orderId,

  amount,

  timestamp,

  affiliateCode,

  campaignSlug,

) {

  var amountKey = Number(amount).toFixed(2);

  var aff = affiliateCode ? String(affiliateCode).trim() : "";

  var camp = campaignSlug ? String(campaignSlug).trim().toLowerCase() : "";

  return (

    shop +

    "|" +

    orderId +

    "|" +

    amountKey +

    "|" +

    timestamp +

    "|" +

    aff +

    "|" +

    camp

  );

}



function safeNumber(value) {

  var n = Number(value);

  return Number.isFinite(n) ? n : null;

}



function summarizeLineItems(checkout) {

  var lines = checkout?.lineItems || checkout?.cartLineItems;

  if (!Array.isArray(lines)) {

    return [];

  }

  var out = [];

  var max = 25;

  for (var i = 0; i < lines.length && out.length < max; i += 1) {

    var li = lines[i];

    var qty = li?.quantity ?? li?.qty ?? 1;

    var title = li?.title ?? li?.merchandise?.title ?? "";

    var sku = li?.sku ?? li?.variant?.sku ?? "";

    var price = safeNumber(

      li?.finalLinePrice?.amount ??

        li?.linePrice?.amount ??

        li?.cost?.totalAmount?.amount,

    );

    out.push({

      quantity: qty,

      title: String(title).slice(0, 200),

      sku: String(sku).slice(0, 120),

      lineTotal: price,

    });

  }

  return out;

}



function buildConversionReport(event) {

  var checkout = event?.data?.checkout || {};

  var order = checkout.order || {};

  var currencyCode =

    checkout.totalPrice?.currencyCode ||

    checkout.currencyCode ||

    order.currencyCode ||

    null;

  var total = safeNumber(checkout.totalPrice?.amount);

  var subtotal = safeNumber(checkout.subtotalPrice?.amount);

  var tax = safeNumber(checkout.totalTax?.amount);

  var shipping = safeNumber(checkout.totalShippingPrice?.amount);

  var discounts = safeNumber(checkout.totalDiscounts?.amount);

  return {

    eventName: "checkout_completed",

    currencyCode: currencyCode,

    totals: {

      total: total,

      subtotal: subtotal,

      tax: tax,

      shipping: shipping,

      discounts: discounts,

    },

    lineItems: summarizeLineItems(checkout),

    orderName: order.name ? String(order.name).slice(0, 64) : null,

  };

}



register(({ analytics, browser, init, settings }) => {

  analytics.subscribe("checkout_completed", async (event) => {

    try {

      var apiUrl = String(settings.conversionApiUrl || "").trim();

      var sharedSecret = String(settings.conversionSharedSecret || "").trim();

      var optionalApiKey = String(settings.conversionApiKey || "").trim();



      if (!apiUrl || !sharedSecret) {

        console.error(

          "Affiliate pixel: conversionApiUrl and conversionSharedSecret are required in pixel settings",

        );

        return;

      }



      var shop = init?.data?.shop?.myshopifyDomain || "";

      if (!shop) {

        console.error("Affiliate pixel: missing shop domain from init");

        return;

      }



      var orderId = event?.data?.checkout?.order?.id ?? "";

      var totalPrice = Number(event?.data?.checkout?.totalPrice?.amount ?? 0);



      var affiliateCode = null;

      try {

        affiliateCode = await browser.localStorage.getItem("affiliate_ref");

      } catch (_e) {

        affiliateCode = null;

      }

      if (!affiliateCode) {

        try {

          var cookieValue = await browser.cookie.get();

          affiliateCode = getCookie("affiliate_ref", cookieValue);

        } catch (_e2) {

          affiliateCode = null;

        }

      }



      var campaignSlug = null;

      try {

        campaignSlug = await browser.localStorage.getItem("affiliate_campaign");

      } catch (_e3) {

        campaignSlug = null;

      }

      if (!campaignSlug) {

        try {

          var cookieValue2 = await browser.cookie.get();

          campaignSlug = getCookie("affiliate_campaign", cookieValue2);

        } catch (_e4) {

          campaignSlug = null;

        }

      }



      var report = buildConversionReport(event);



      console.log(

        "Affiliate conversion: ref=" +

          (affiliateCode || "null") +

          " camp=" +

          (campaignSlug || "null"),

      );



      var timestamp = new Date().toISOString();

      var signature = await hmacSha256Hex(

        sharedSecret,

        buildSignaturePayload(

          shop,

          String(orderId),

          totalPrice,

          timestamp,

          affiliateCode,

          campaignSlug,

        ),

      );



      var headers = {

        "Content-Type": "application/json",

      };

      if (optionalApiKey) {

        headers["x-api-key"] = optionalApiKey;

      }



      await fetch(apiUrl, {

        method: "POST",

        headers: headers,

        body: JSON.stringify({

          shop: shop,

          orderId: String(orderId),

          amount: totalPrice,

          affiliateCode: affiliateCode || null,

          campaignSlug: campaignSlug

            ? String(campaignSlug).trim().toLowerCase()

            : null,

          report: report,

          timestamp: timestamp,

          signature: signature,

        }),

      });

    } catch (error) {

      console.error("Failed to send conversion event", error);

    }

  });

});

