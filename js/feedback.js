(function () {
  "use strict";

  const FEEDBACK_ENDPOINT = "https://formsubmit.co/ajax/ethan_quam@trimble.com";

  const modalEl = document.getElementById("feedback-modal");
  const formEl = document.getElementById("feedback-form");
  const successEl = document.getElementById("feedback-success");
  const statusEl = document.getElementById("feedback-status");
  const subjectEl = document.getElementById("feedback-subject");
  const messageEl = document.getElementById("feedback-message");
  const submitBtn = document.getElementById("feedback-submit");

  let lastFocusedEl = null;

  function currentPageLabel() {
    const hash = (location.hash || "#converters").replace(/^#/, "").toLowerCase();
    const surveyHashes = new Set(["survey", "point-distance-heading", "plane-grade-heading"]);
    const convenienceHashes = new Set([
      "convenience",
      "convenience-intro-heading",
      "temperature-converter-heading",
      "travel-distance-converter-heading",
      "cooking-fluid-converter-heading",
      "cooking-weight-converter-heading",
      "data-size-converter-heading",
    ]);
    if (surveyHashes.has(hash)) return "Survey Tools";
    if (convenienceHashes.has(hash)) return "Convenience Converters";
    return "Construction Converters & Calculators";
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function openFeedbackModal() {
    if (!modalEl || !formEl) return;

    lastFocusedEl = document.activeElement;
    modalEl.hidden = false;
    modalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-feedback-open");

    formEl.hidden = false;
    if (successEl) successEl.hidden = true;
    setStatus("", false);

    if (subjectEl && !subjectEl.value.trim()) {
      subjectEl.value = "Dynamic Converter Feedback";
    }
    if (messageEl) {
      messageEl.value = "";
    }

    window.setTimeout(() => {
      (messageEl || subjectEl)?.focus();
    }, 0);
  }

  function closeFeedbackModal() {
    if (!modalEl) return;

    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-feedback-open");
    setStatus("", false);

    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
      lastFocusedEl.focus();
    }
  }

  async function submitFeedback(event) {
    event.preventDefault();
    if (!formEl || !submitBtn) return;

    const subject = subjectEl?.value.trim() || "Dynamic Converter Feedback";
    const message = messageEl?.value.trim() || "";

    if (!message) {
      setStatus("Please enter a message before sending.", true);
      messageEl?.focus();
      return;
    }

    setStatus("", false);
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    const formData = new FormData(formEl);
    formData.set("subject", subject);
    formData.set("message", message);
    formData.set("page", currentPageLabel());
    formData.set("_subject", `[Dynamic Converter] ${subject}`);
    formData.set("_template", "table");
    formData.set("_captcha", "false");

    try {
      const response = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {
        payload = null;
      }

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || "Unable to send feedback right now.");
      }

      formEl.hidden = true;
      if (successEl) successEl.hidden = false;
      formEl.reset();
      if (subjectEl) subjectEl.value = "Dynamic Converter Feedback";
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to send feedback right now.",
        true
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send feedback";
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-feedback-link]")) {
      event.preventDefault();
      event.stopPropagation();
      openFeedbackModal();
      return;
    }

    if (event.target.closest("[data-feedback-close]")) {
      event.preventDefault();
      closeFeedbackModal();
    }
  });

  formEl?.addEventListener("submit", submitFeedback);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modalEl && !modalEl.hidden) {
      closeFeedbackModal();
    }
  });

  window.openFeedbackModal = openFeedbackModal;
})();
