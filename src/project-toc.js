const defaultSounds = {
  hover: {
    gain: 0.024,
    duration: 0.055,
    layers: [
      { type: "sine", start: 520, end: 720 },
      { type: "triangle", start: 980, end: 1220, gain: 0.34 }
    ]
  },
  press: {
    gain: 0.032,
    duration: 0.075,
    layers: [
      { type: "sine", start: 360, end: 230 },
      { type: "triangle", start: 620, end: 420, gain: 0.38 }
    ]
  }
};

const defaultOptions = {
  tocSelector: ".project-toc",
  linkSelector: ".project-toc a",
  sectionImageSelector: ".project-shot img",
  previewInterval: 1500,
  activeMarkerRatio: 0.38,
  enableSound: true,
  smoothScroll: true,
  sounds: defaultSounds
};

let audioContext;
let audioUnlocked = false;
let lastHoverSoundAt = 0;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    audioContext = new AudioContextClass();
  }

  return audioContext;
}

function primeAudio() {
  const context = getAudioContext();

  if (!context || audioUnlocked) {
    return;
  }

  const buffer = context.createBuffer(1, 1, 22050);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
  audioUnlocked = true;
}

async function unlockAudio() {
  const context = getAudioContext();

  if (!context) {
    return false;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  primeAudio();
  return context.state === "running";
}

async function playSound(name, sounds = defaultSounds) {
  const context = getAudioContext();
  const sound = sounds[name];

  if (!context || !sound) {
    return;
  }

  if (context.state !== "running") {
    const unlocked = await unlockAudio();

    if (!unlocked) {
      return;
    }
  }

  const now = context.currentTime;
  const output = context.createGain();
  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(sound.gain, now + 0.006);
  output.gain.exponentialRampToValueAtTime(0.0001, now + sound.duration);
  output.connect(context.destination);

  sound.layers.forEach((layer) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = layer.type;
    oscillator.frequency.setValueAtTime(layer.start, now);
    oscillator.frequency.exponentialRampToValueAtTime(layer.end, now + sound.duration);
    gain.gain.setValueAtTime(layer.gain ?? 1, now);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(now);
    oscillator.stop(now + sound.duration + 0.01);
  });
}

function playHoverSound(name, sounds) {
  const now = performance.now();

  if (now - lastHoverSoundAt < 90) {
    return;
  }

  lastHoverSoundAt = now;
  playSound(name, sounds);
}

function preloadPreviewImage(image) {
  if (image.ready) {
    return image.ready;
  }

  const preload = new Image();

  image.ready = new Promise((resolve) => {
    preload.addEventListener("load", resolve, { once: true });
    preload.addEventListener("error", resolve, { once: true });
  });

  preload.src = image.src;
  image.preload = preload;

  return image.ready;
}

function getImageRatio(image) {
  const shot = image.closest(".project-shot");
  const rect = shot?.getBoundingClientRect();
  const width = rect?.width || image.naturalWidth || 4;
  const height = rect?.height || image.naturalHeight || 3;

  return `${width} / ${height}`;
}

export function initProjectToc(userOptions = {}) {
  const options = { ...defaultOptions, ...userOptions };
  const toc = document.querySelector(options.tocSelector);
  const links = Array.from(document.querySelectorAll(options.linkSelector));
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!toc || !links.length) {
    return () => {};
  }

  const sections = links
    .map((link) => {
      const id = link.hash.slice(1);
      const section = document.getElementById(id);
      return section ? { id, link, section } : null;
    })
    .filter(Boolean);

  if (!sections.length) {
    return () => {};
  }

  let activeId = "";
  let hoveredLink = null;
  let hoverClearTimeout;
  let magnetFrame = 0;
  let pendingMagnetY = null;
  const previewStates = new Map();
  const cleanups = [];

  function setPreviewIndex(link, index, animate = true) {
    const state = previewStates.get(link);

    if (!state || !state.images.length) {
      return;
    }

    const nextIndex = ((index % state.images.length) + state.images.length) % state.images.length;
    const nextImage = state.images[nextIndex];

    state.index = nextIndex;
    state.switchToken += 1;
    const switchToken = state.switchToken;

    state.dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === nextIndex);
    });

    const updateImage = () => {
      if (state.switchToken !== switchToken) {
        return;
      }

      if (!animate || prefersReducedMotion) {
        state.image.src = nextImage.src;
        state.image.alt = "";
        state.image.classList.add("is-visible");
        state.standbyImage.classList.remove("is-visible");
        state.standbyImage.removeAttribute("src");
        return;
      }

      const incomingImage = state.standbyImage;
      const outgoingImage = state.image;

      incomingImage.src = nextImage.src;
      incomingImage.alt = "";
      incomingImage.classList.remove("is-visible");

      window.requestAnimationFrame(() => {
        if (state.switchToken !== switchToken) {
          return;
        }

        incomingImage.classList.add("is-visible");
        outgoingImage.classList.remove("is-visible");
      });

      window.setTimeout(() => {
        if (state.switchToken !== switchToken) {
          return;
        }

        state.image = incomingImage;
        state.standbyImage = outgoingImage;
        state.standbyImage.removeAttribute("src");
      }, 340);
    };

    if (animate && !prefersReducedMotion) {
      preloadPreviewImage(nextImage).then(updateImage);
    } else {
      updateImage();
    }
  }

  function stopPreview(link) {
    const state = previewStates.get(link);

    if (!state?.timer) {
      return;
    }

    window.clearInterval(state.timer);
    state.timer = null;
  }

  function startPreview(link) {
    const state = previewStates.get(link);

    if (!state || state.images.length < 2 || prefersReducedMotion) {
      return;
    }

    stopPreview(link);
    state.timer = window.setInterval(() => {
      setPreviewIndex(link, state.index + 1);
    }, options.previewInterval);
  }

  function buildPreview(link, section) {
    const tooltip = link.querySelector(".project-toc-tooltip");
    const copy = link.querySelector(".project-toc-copy");

    if (!tooltip || !copy) {
      return;
    }

    const images = Array.from(section.querySelectorAll(options.sectionImageSelector))
      .map((image) => ({
        ratio: getImageRatio(image),
        src: image.currentSrc || image.src
      }))
      .filter((image) => image.src)
      .slice(0, 10);

    if (!images.length) {
      return;
    }

    images.forEach(preloadPreviewImage);

    const preview = document.createElement("span");
    preview.className = "project-toc-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.style.setProperty("--project-toc-preview-ratio", images[0].ratio);

    const previewImage = document.createElement("img");
    previewImage.className = "project-toc-preview-image is-visible";
    previewImage.decoding = "async";
    previewImage.loading = "lazy";

    const standbyImage = document.createElement("img");
    standbyImage.className = "project-toc-preview-image";
    standbyImage.decoding = "async";
    standbyImage.loading = "lazy";

    const dots = document.createElement("span");
    dots.className = "project-toc-preview-dots";

    const dotElements = images.map(() => {
      const dot = document.createElement("span");
      dot.className = "project-toc-preview-dot";
      dots.appendChild(dot);
      return dot;
    });

    preview.append(previewImage, standbyImage, dots);
    tooltip.insertBefore(preview, copy);

    previewStates.set(link, {
      dots: dotElements,
      image: previewImage,
      images,
      index: 0,
      preview,
      standbyImage,
      switchToken: 0,
      timer: null
    });

    setPreviewIndex(link, 0, false);
  }

  function setHoveredLink(link) {
    if (hoverClearTimeout) {
      window.clearTimeout(hoverClearTimeout);
      hoverClearTimeout = null;
    }

    if (hoveredLink === link) {
      return;
    }

    if (hoveredLink) {
      stopPreview(hoveredLink);
      hoveredLink.classList.remove("is-hovered");
    }

    hoveredLink = link;

    if (hoveredLink) {
      hoveredLink.classList.add("is-hovered");
      updateMagnetFromLink(hoveredLink);
      setPreviewIndex(hoveredLink, 0, false);
      startPreview(hoveredLink);
    }
  }

  function setMagnetStrength(link, strength) {
    const nextStrength = Math.max(0, Math.min(1, strength));

    if (nextStrength <= 0.01) {
      link.style.removeProperty("--project-toc-magnet");
      return;
    }

    link.style.setProperty("--project-toc-magnet", nextStrength.toFixed(3));
  }

  function updateMagnetFromY(pointerY) {
    const influence = 112;

    sections.forEach(({ link }) => {
      const rect = link.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const distance = Math.abs(pointerY - centerY);
      const strength = Math.pow(Math.max(0, 1 - distance / influence), 1.7);

      setMagnetStrength(link, strength);
    });
  }

  function updateMagnetFromLink(link) {
    const rect = link.getBoundingClientRect();
    updateMagnetFromY(rect.top + rect.height / 2);
  }

  function requestMagnetUpdate(pointerY) {
    pendingMagnetY = pointerY;

    if (magnetFrame) {
      return;
    }

    magnetFrame = window.requestAnimationFrame(() => {
      magnetFrame = 0;

      if (pendingMagnetY !== null) {
        updateMagnetFromY(pendingMagnetY);
      }
    });
  }

  function clearMagnet() {
    pendingMagnetY = null;

    if (magnetFrame) {
      window.cancelAnimationFrame(magnetFrame);
      magnetFrame = 0;
    }

    sections.forEach(({ link }) => {
      link.style.removeProperty("--project-toc-magnet");
    });
  }

  function shouldUpdateMagnet(event) {
    return !(event.target instanceof Element && event.target.closest(".project-toc-tooltip"));
  }

  function clearHoveredLink(link, delay = 90) {
    if (hoverClearTimeout) {
      window.clearTimeout(hoverClearTimeout);
    }

    hoverClearTimeout = window.setTimeout(() => {
      if (hoveredLink === link) {
        stopPreview(link);
        setHoveredLink(null);
      }
    }, delay);
  }

  function setActive(id) {
    if (activeId === id) {
      return;
    }

    activeId = id;

    sections.forEach(({ id: sectionId, link }) => {
      const isActive = sectionId === id;
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function updateActiveFromScroll() {
    const marker = window.innerHeight * options.activeMarkerRatio;
    const current = sections.reduce((candidate, item) => {
      const rect = item.section.getBoundingClientRect();
      return rect.top <= marker ? item : candidate;
    }, sections[0]);

    setActive(current.id);
  }

  function addListener(target, eventName, callback, listenerOptions) {
    target.addEventListener(eventName, callback, listenerOptions);
    cleanups.push(() => target.removeEventListener(eventName, callback, listenerOptions));
  }

  sections.forEach(({ link, section }) => {
    buildPreview(link, section);

    addListener(link, "pointerenter", (event) => {
      if (shouldUpdateMagnet(event)) {
        requestMagnetUpdate(event.clientY);
      }

      setHoveredLink(link);

      if (options.enableSound) {
        playHoverSound("hover", options.sounds);
      }
    });

    addListener(link, "pointermove", (event) => {
      if (!shouldUpdateMagnet(event)) {
        return;
      }

      requestMagnetUpdate(event.clientY);
    });

    addListener(link, "pointerleave", (event) => {
      if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) {
        return;
      }

      clearHoveredLink(link);
    });

    addListener(link, "focus", () => {
      updateMagnetFromLink(link);
      setHoveredLink(link);

      if (options.enableSound) {
        playHoverSound("hover", options.sounds);
      }
    });

    addListener(link, "blur", () => {
      clearHoveredLink(link, 0);
      clearMagnet();
    });

    addListener(link, "pointerdown", () => {
      if (options.enableSound) {
        playSound("press", options.sounds);
      }
    });

    addListener(link, "click", (event) => {
      if (!options.smoothScroll) {
        return;
      }

      event.preventDefault();

      const id = link.hash.slice(1);
      const target = document.getElementById(id);

      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start"
      });

      window.history.pushState(null, "", `#${id}`);
      setActive(id);
    });
  });

  addListener(toc, "pointermove", (event) => {
    if (!shouldUpdateMagnet(event)) {
      return;
    }

    requestMagnetUpdate(event.clientY);
  });

  addListener(toc, "pointerleave", (event) => {
    if (event.relatedTarget instanceof Node && toc.contains(event.relatedTarget)) {
      return;
    }

    clearMagnet();
  });

  addListener(window, "scroll", updateActiveFromScroll, { passive: true });
  addListener(window, "resize", updateActiveFromScroll);
  updateActiveFromScroll();

  return () => {
    if (hoverClearTimeout) {
      window.clearTimeout(hoverClearTimeout);
    }

    clearMagnet();
    previewStates.forEach((_, link) => stopPreview(link));
    cleanups.forEach((cleanup) => cleanup());
  };
}
