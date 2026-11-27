const confetti = ["🎂", "🍰", "🧁", "🎈", "🎀", "🎉", "🎊", "✨", "💖", "💕", "💫", "🎁", "⭐", "🥳"];

function getWish() {
  const encoded = new URLSearchParams(location.search).get("w");
  if (!encoded) return {};

  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const wish = JSON.parse(new TextDecoder().decode(bytes));
    if (!wish || typeof wish !== "object" || Array.isArray(wish)) {
      throw new Error("The wish data is not an object.");
    }
    return wish;
  } catch {
    return { decodeError: "This wish link could not be opened." };
  }
}

function makeConfetti() {
  const balloonRain = getWish().rainStyle === "balloons";
  const layer = document.createElement("div");
  layer.className = "wish-confetti-layer";
  layer.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 96; index += 1) {
    const piece = document.createElement("span");
    piece.className = balloonRain ? "wish-balloon-item" : "wish-confetti-piece";
    piece.textContent = balloonRain && index % 8 < 6 ? "🎈" : confetti[index % confetti.length];
    piece.style.left = `${(index * 37 + 11) % 100}%`;
    piece.style.animationDelay = `${(index % 12) * 55}ms`;
    piece.style.animationDuration = `${2800 + (index % 7) * 220}ms`;
    piece.style.setProperty("--confetti-drift", `${(index % 9 - 4) * 28}px`);
    piece.style.setProperty("--confetti-spin", index % 2 === 0 ? "360deg" : "-360deg");
    piece.style.setProperty("--rain-drift", `${(index % 9 - 4) * 28}px`);
    piece.style.setProperty("--rain-spin", index % 2 === 0 ? "360deg" : "-360deg");
    if (balloonRain) piece.style.bottom = "-12%";
    else piece.style.top = "-12vh";
    layer.append(piece);
  }

  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 6000);
}

function showWish() {
  const wish = getWish();
  const overlay = document.createElement("div");
  overlay.className = "wish-reveal-overlay";

  const card = document.createElement("section");
  card.className = "wish-reveal-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "wish-reveal-title");

  const badge = document.createElement("span");
  badge.className = "wish-reveal-badge";
  badge.id = "wish-reveal-title";
  badge.textContent = "Your wish";
  card.append(badge);

  if (wish.decodeError) {
    const errorMessage = document.createElement("p");
    errorMessage.className = "wish-reveal-note";
    errorMessage.textContent = wish.decodeError;
    card.append(errorMessage);
  }

  for (const [key, className] of [
    ["wishTo", "wish-reveal-to"],
    ["wishHeadline", "wish-reveal-headline"],
    ["wishNote", "wish-reveal-note"],
  ]) {
    if (!wish[key]) continue;
    const paragraph = document.createElement("p");
    paragraph.className = className;
    paragraph.textContent = wish[key];
    card.append(paragraph);
  }

  const closeButton = document.createElement("button");
  closeButton.className = "wish-reveal-close";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => overlay.remove());
  card.append(closeButton);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  overlay.append(card);
  document.body.append(overlay);
  closeButton.focus();
}

function encodeWish(wish) {
  const bytes = new TextEncoder().encode(JSON.stringify(wish));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function showElement(element) {
  const overlay = document.createElement("div");
  overlay.className = "wish-reveal-overlay";

  const card = document.createElement("section");
  card.className = "wish-reveal-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");

  if (element.kind === "photo" && element.src) {
    const image = document.createElement("img");
    image.src = element.src;
    image.alt = element.caption || "A memory";
    image.className = "wishbox-element-photo";
    card.append(image);
  }

  for (const text of [element.from, element.caption, element.text, element.line]) {
    if (!text) continue;
    const paragraph = document.createElement("p");
    paragraph.className = "wish-reveal-note";
    paragraph.textContent = text;
    card.append(paragraph);
  }

  const closeButton = document.createElement("button");
  closeButton.className = "wish-reveal-close";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => overlay.remove());
  card.append(closeButton);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  overlay.append(card);
  document.body.append(overlay);
  closeButton.focus();
}

function applyWishEdits() {
  const wish = getWish();
  const page = document.querySelector("body > div.relative.min-h-screen");
  const heading = page?.querySelector("h1");
  const titleGroup = heading?.parentElement;
  const eyebrow = titleGroup?.querySelector("span");
  const intro = titleGroup?.querySelector("p");

  if (heading) heading.textContent = wish.name || "Your wish";
  if (eyebrow) eyebrow.textContent = wish.eyebrow || "";
  if (intro) intro.textContent = wish.intro || "";

  if (page) {
    if (wish.backgroundStyle === "dark") {
      page.style.backgroundColor = "#171717";
      page.style.color = "#fffaf2";
    } else if (wish.backgroundStyle === "gradient") {
      page.style.backgroundImage = `linear-gradient(135deg, ${wish.backgroundGradientFrom || "#fef3c7"}, ${wish.backgroundGradientTo || "#fecdd3"})`;
    } else if (wish.backgroundStyle === "image" && wish.backgroundImage) {
      page.style.backgroundImage = `linear-gradient(rgba(0,0,0,.12), rgba(0,0,0,.12)), url(${JSON.stringify(wish.backgroundImage)})`;
      page.style.backgroundSize = "cover";
      page.style.backgroundPosition = "center";
      page.style.backgroundRepeat = "no-repeat";
      page.style.color = "#171717";
    } else if (wish.backgroundStyle === "color") {
      page.style.backgroundColor = wish.backgroundColor || "#fffaf2";
    }
  }

  const editorLink = page?.querySelector('a[href*="/edit"]');
  if (editorLink && new URLSearchParams(location.search).has("w")) {
    const editorUrl = new URL("./edit.html", location.href);
    editorUrl.searchParams.set("w", encodeWish(wish));
    editorLink.href = `${editorUrl.pathname}${editorUrl.search}`;
  }

  if (Array.isArray(wish.elements) && wish.elements.length) {
    const wishButton = page?.querySelector("button.group.grid");
    const stage = wishButton?.parentElement?.parentElement;
    if (!stage) return;

    const layer = document.createElement("div");
    layer.className = "wishbox-element-layer";
    for (const element of wish.elements) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "wishbox-element";
      card.style.left = `${Number(element.x) || 0}%`;
      card.style.top = `${Number(element.y) || 0}%`;
      card.style.setProperty("--element-rotation", `${Number(element.rot) || 0}deg`);
      card.style.backgroundColor =
        {
          white: "#fff",
          butter: "rgba(255, 227, 151, .7)",
          sky: "rgba(177, 219, 236, .5)",
          sage: "rgba(190, 210, 170, .5)",
          coral: "rgba(244, 111, 83, .25)",
        }[element.tone] || "rgba(255, 250, 242, .85)";

      if (element.kind === "photo" && element.src) {
        const image = document.createElement("img");
        image.src = element.src;
        image.alt = element.caption || "A memory";
        image.className = "wishbox-element-photo";
        card.append(image);
      }

      const text = element.caption || element.text || element.from || "A memory";
      const label = document.createElement("span");
      label.textContent = text;
      card.append(label);
      card.addEventListener("click", () => showElement(element));
      layer.append(card);
    }
    stage.append(layer);
  }
}

let cakeLit = true;
let revealTimer;
const installedWishButtons = new WeakSet();
const isEditor = /\/edit(?:\.html)?\/?$/.test(location.pathname);

function handleCakeClick(wishButton) {
  cakeLit = !cakeLit;
  wishButton.dataset.cakeLit = String(cakeLit);
  window.clearTimeout(revealTimer);

  if (isEditor) {
    const rainButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Make it rain"),
    );
    rainButton?.click();
    return;
  }

  makeConfetti();
  if (!cakeLit) revealTimer = window.setTimeout(showWish, 3000);
}

function installWishButton() {
  for (const wishButton of document.querySelectorAll("button.group.grid")) {
    if (installedWishButtons.has(wishButton)) continue;
    installedWishButtons.add(wishButton);
    wishButton.dataset.cakeLit = String(cakeLit);
    wishButton.setAttribute("aria-label", "Make a wish and blow out the candle");
    wishButton.addEventListener("click", () => handleCakeClick(wishButton));
  }
}

if (isEditor) {
  const waitForHydration = () => {
    const wishButton = document.querySelector("button.group.grid");
    const hasReactProps =
      wishButton &&
      Object.keys(wishButton).some((key) => key.startsWith("__reactProps$"));

    if (window.$_TSR || !hasReactProps) {
      window.setTimeout(waitForHydration, 50);
      return;
    }

    window.setTimeout(() => {
      const currentButton = document.querySelector("button.group.grid");
      const hydrated =
        currentButton &&
        Object.keys(currentButton).some((key) => key.startsWith("__reactProps$"));
      if (window.$_TSR || !hydrated) {
        waitForHydration();
        return;
      }

      installWishButton();
      const appContent = document.getElementById("root") || document.body;
      new MutationObserver(installWishButton).observe(appContent, {
        childList: true,
        subtree: true,
      });
    }, 500);
  };

  window.addEventListener("load", waitForHydration, { once: true });
} else {
  installWishButton();
}

if (!isEditor) {
  applyWishEdits();
  const rainButton = [...document.querySelectorAll("button")].find((button) =>
    button.textContent.includes("Make it rain"),
  );
  rainButton?.addEventListener("click", () => makeConfetti());

  const copyButton = [...document.querySelectorAll("button")].find((button) =>
    button.textContent.includes("Link"),
  );
  copyButton?.addEventListener("click", async () => {
    const originalContent = copyButton.innerHTML;
    try {
      await navigator.clipboard.writeText(location.href);
      copyButton.textContent = "Copied!";
    } catch {
      copyButton.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      copyButton.innerHTML = originalContent;
    }, 2000);
  });
}
