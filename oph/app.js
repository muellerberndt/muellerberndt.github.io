(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });

    document.querySelectorAll(".reveal").forEach((item) => observer.observe(item));
  } else {
    document.querySelectorAll(".reveal").forEach((item) => item.classList.add("visible"));
  }

  document.querySelectorAll(".decode, [data-decode]").forEach((element) => {
    element.textContent = element.textContent || "";
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    if (typeof window.gtag !== "function") return;

    const url = new URL(link.href, window.location.href);
    const isTracked =
      link.dataset.trackLink ||
      url.origin !== window.location.origin ||
      url.pathname.startsWith("/oph/");

    if (!isTracked) return;

    window.gtag("event", "navigation_click", {
      link_label: link.dataset.trackLink || "",
      link_text: (link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
      link_url: url.toString(),
      page_section: document.body.classList.contains("landing-page") ? "oph_landing_page" : "oph_hub"
    });
  });
})();
