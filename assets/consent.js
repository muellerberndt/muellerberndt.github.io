// Cookie choice for visitors in Europe. The consent defaults live inline in each page's head.
(() => {
  let saved = null;
  try { saved = localStorage.getItem("fp_consent"); } catch (e) {}
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  const european = /^Europe\//.test(tz) || /^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$/.test(tz);
  function show() {
  if (document.querySelector(".consent")) return;
  const bar = document.createElement("div");
  bar.className = "consent";
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Cookie choice");
  bar.innerHTML =
    '<p>This site uses cookies to count visits and measure ads. <a href="/privacy/">privacy</a></p>' +
    '<span class="links"><a href="#" data-c="granted">accept</a><a href="#" data-c="denied">decline</a></span>';
  bar.addEventListener("click", (e) => {
    const c = e.target.closest("[data-c]");
    if (!c) return;
    e.preventDefault();
    const g = c.dataset.c === "granted" ? "granted" : "denied";
    try { localStorage.setItem("fp_consent", g); } catch (err) {}
    if (window.gtag) gtag("consent", "update", { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: g });
    dispatchEvent(new CustomEvent("fp-consent", { detail: g }));
    bar.remove();
  });
  document.body.appendChild(bar);
  }
  if ((!saved && european) || location.hash === "#cookies") show();
  addEventListener("hashchange", () => { if (location.hash === "#cookies") show(); });
})();
