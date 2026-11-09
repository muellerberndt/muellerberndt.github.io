// Counts clicks from the OPH page to the book, textbooks, papers and code (GA event + Ads conversion).
(() => {
  const SEND_TO = "AW-18551449316/_Fq7CK6E7LQdEOTNgo5F";
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='http']");
    if (!a || typeof gtag !== "function") return;
    const u = new URL(a.href);
    if (u.hostname === location.hostname) return;
    const spot = (a.closest("[data-cta]") || {}).dataset;
    gtag("event", "oph_go_deeper", { link_domain: u.hostname, link_url: a.href, position: (spot && spot.cta) || "text" });
    gtag("event", "conversion", { send_to: SEND_TO });
  });
})();
