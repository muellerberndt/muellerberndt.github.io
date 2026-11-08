(() => {
  const form = document.querySelector("form.contact");
  if (!form) return;
  const ENDPOINT = "https://xrvowfsbmfoggykbeabo.functions.supabase.co/contact";
  // Google Ads conversion actions, one per form (filled in once the actions exist).
  const CONVERSIONS = { join: "AW-18551449316/3Ge2CPiNq7QdEOTNgo5F", investors: "AW-18551449316/mzVvCPuNq7QdEOTNgo5F" };
  const opened = Date.now();
  const status = form.querySelector(".status");
  const button = form.querySelector("button");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.kind = form.dataset.kind;
    data.elapsed = Date.now() - opened;
    button.disabled = true;
    status.className = "status";
    status.textContent = "sending...";
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || "Sending failed. Please try again in a minute.");
      form.reset();
      form.classList.add("sent");
      status.className = "status ok";
      status.textContent = "Sent. Thank you.";
      if (window.gtag) {
        gtag("event", "generate_lead", { form_kind: data.kind });
        const label = CONVERSIONS[data.kind];
        if (label) gtag("event", "conversion", { send_to: label });
      }
    } catch (err) {
      status.className = "status err";
      status.textContent = err.message;
      button.disabled = false;
    }
  });
})();
