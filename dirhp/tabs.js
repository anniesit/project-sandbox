/**
 * MAST Tabs — Custom build
 * Based on: https://cdn.jsdelivr.net/gh/nocodesupplyco/mast@latest/tabs.min.js
 *
 * Changes from original:
 * 1. Unminified and commented for readability
 * 2. FIX: Static markup starting state — first tab/panel pair is set to active
 *    before JS fully runs, so slow/blocked JS doesn't show all panels at once.
 * 3. FIX: aria-controls wiring — each tab button gets aria-controls pointing
 *    to its panel's id, so screen readers can associate them programmatically.
 */

(function () {
  "use strict";

  // ─── FIX 1: Static starting state ───────────────────────────────────────────
  // Runs immediately (before the main init) to correct the broken default state
  // in exported Webflow HTML, where all tabs are aria-selected="false" and all
  // panels are aria-hidden="false". Sets the first tab/panel as active so that
  // if JS is slow or blocked, the page still makes sense visually and for AT.
  function setStaticStartingState() {
    document.querySelectorAll("[data-tabs-component]").forEach(function (component) {
      const links = component.querySelectorAll("[data-tabs-link]");
      const panes = component.querySelectorAll("[data-tabs-pane]");

      // Find which tab should be active: URL hash → cc-active class → first tab
      let activeIndex = 0;
      if (window.location.hash) {
        const hashId = window.location.hash.substring(1);
        const hashIndex = Array.from(links).findIndex((l) => l.id === hashId);
        if (hashIndex !== -1) activeIndex = hashIndex;
      } else {
        const ccIndex = Array.from(links).findIndex((l) =>
          l.classList.contains("cc-active")
        );
        if (ccIndex !== -1) activeIndex = ccIndex;
      }

      // Set correct aria state on all tabs and panels
      links.forEach(function (link, i) {
        link.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
        link.classList.toggle("cc-active", i === activeIndex);
      });
      panes.forEach(function (pane, i) {
        pane.setAttribute("aria-hidden", i !== activeIndex ? "true" : "false");
      });
    });
  }

  // ─── FIX 2: aria-controls wiring ────────────────────────────────────────────
  // Adds unique IDs to each panel and wires aria-controls on each tab button
  // so screen readers can programmatically associate a tab with its panel.
  // Runs once per component on init. IDs are auto-generated if not already set.
  function wireAriaControls(component, links, panes) {
    links.forEach(function (link, i) {
      const pane = panes[i];
      if (!pane) return;

      // Give the pane an ID if it doesn't have one
      if (!pane.id) {
        // Use component id + index, or fall back to a random suffix
        const componentId = component.id || "tabs-" + Math.random().toString(36).slice(2, 7);
        pane.id = componentId + "-panel-" + i;
      }

      // Wire the tab button to its panel
      const button = link.querySelector("[data-tabs-link-button]");
      if (button) {
        button.setAttribute("aria-controls", pane.id);
      }
    });
  }

  // ─── Main tab initialiser (original MAST logic, variable names restored) ────
  function initTabComponent(component) {
    const menu         = component.querySelector("[data-tabs-menu]");
    const dropdownMenu = component.querySelector("[data-tabs-menu-dropdown-menu]");
    const menuWrapper  = component.querySelector("[data-tabs-menu-wrapper]");
    const linkElements = component.querySelectorAll("[data-tabs-link]");
    const paneElements = component.querySelectorAll("[data-tabs-pane]");

    // Bail if the required elements aren't found
    if (!(menu && dropdownMenu && menuWrapper && linkElements.length && paneElements.length)) return;

    const links = Array.from(linkElements);
    const panes = Array.from(paneElements);

    // State
    let activeIndex        = 0;
    let dropdownToggle     = menu.querySelector("[data-tabs-menu-dropdown-toggle]");
    let dropdownText       = dropdownToggle ? dropdownToggle.querySelector("[data-tabs-menu-dropdown-text]") : null;
    let isMobileDropdown   = "true" === menu.getAttribute("data-tab-mobile-dropdown");
    let autoplayToggle     = component.querySelector("[data-tabs-autoplay-toggle]");
    let autoplayEnabled    = "true" === menu.getAttribute("data-tabs-autoplay");
    let autoplayDuration   = parseFloat(menu.getAttribute("data-tabs-autoplay-duration")) || 5;
    let autoplayHoverPause = "true" === menu.getAttribute("data-tabs-autoplay-hover-pause");
    let autoplayTimer      = null;
    let intersectionObs    = null;
    let isPaused           = false;
    let timerStartedAt     = null;
    let timeElapsed        = 0;
    let windowWidth        = window.innerWidth;
    let resizeTimer        = null;

    // Event listener registry (for cleanup)
    const listeners = [];

    // ─── FIX 2: Wire aria-controls before any interaction ───────────────────
    wireAriaControls(component, links, panes);

    // ── activateTab: the core function that switches tabs ───────────────────
    function activateTab(index) {
      if (index < 0 || index >= links.length) return;

      const buttons   = [];
      const isActive  = [];

      for (let i = 0; i < links.length; i++) {
        const btn = links[i].querySelector("[data-tabs-link-button]");
        buttons.push(btn);
        isActive.push(i === index);
      }

      // Update tab aria and active class
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const active = isActive[i];
        link.setAttribute("aria-selected", active);
        link.classList.toggle("cc-active", active);
        if (buttons[i]) buttons[i].setAttribute("tabindex", active ? "0" : "-1");
      }

      // Show/hide panels
      for (let i = 0; i < panes.length; i++) {
        panes[i].setAttribute("aria-hidden", i !== index);
      }

      activeIndex = index;

      // Update dropdown text label (mobile dropdown mode)
      if (dropdownText && isMobileDropdown) {
        const name = links[index].getAttribute("data-tab-link-name");
        dropdownText.textContent = name || links[index].textContent;
      }

      // Close dropdown if open
      if (dropdownToggle && dropdownMenu.classList.contains("cc-open")) {
        closeDropdown();
      }

      // Scroll tab into view on horizontal scroll menus
      if (!isMobileDropdown) {
        const link      = links[index];
        const wrapper   = menuWrapper;
        const scrollLeft = wrapper.scrollLeft;
        const wrapperW  = wrapper.clientWidth;
        const linkLeft  = link.offsetLeft;
        const linkW     = link.offsetWidth;
        if (linkLeft < scrollLeft || linkLeft + linkW > scrollLeft + wrapperW) {
          wrapper.scrollTo({ left: linkLeft, behavior: "smooth" });
        }
      }

      // Handle autoplay progress reset
      if (autoplayEnabled) {
        if (isPaused) {
          timeElapsed = 0;
        } else {
          resetAndRestartAutoplay();
        }
      }
    }

    // ── Dropdown helpers ─────────────────────────────────────────────────────
    function closeDropdown() {
      if (!dropdownToggle || !dropdownMenu) return;
      dropdownMenu.classList.remove("cc-open");
      dropdownToggle.classList.remove("cc-open");
      dropdownToggle.setAttribute("aria-expanded", "false");
    }

    function toggleDropdown() {
      if (dropdownMenu.classList.contains("cc-open")) {
        closeDropdown();
      } else if (dropdownToggle && dropdownMenu) {
        dropdownMenu.classList.add("cc-open");
        dropdownToggle.classList.add("cc-open");
        dropdownToggle.setAttribute("aria-expanded", "true");
      }
    }

    // ── Autoplay helpers ─────────────────────────────────────────────────────
    function startAutoplayTimer() {
      if (!autoplayEnabled || isPaused) return;
      cancelAutoplayTimer();
      const remaining = 1000 * autoplayDuration - timeElapsed;
      timerStartedAt = Date.now();
      autoplayTimer = setTimeout(function () {
        activateTab((activeIndex + 1) % links.length);
      }, remaining);
    }

    function cancelAutoplayTimer() {
      if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
      timerStartedAt = null;
    }

    function resetAndRestartAutoplay() {
      if (!autoplayEnabled) return;
      timeElapsed = 0;
      const progressEl = links[activeIndex].querySelector("[data-tabs-autoplay-progress]");
      if (progressEl) {
        progressEl.style.animation = "none";
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { progressEl.style.animation = ""; });
        });
      }
      startAutoplayTimer();
    }

    function updateAutoplayToggleLabel() {
      if (!autoplayToggle) return;
      autoplayToggle.setAttribute("aria-label", isPaused ? "Play autoplay" : "Pause autoplay");
    }

    function pauseAutoplay() {
      if (!autoplayEnabled) return;
      if (timerStartedAt !== null) timeElapsed += Date.now() - timerStartedAt;
      isPaused = true;
      component.classList.add("autoplay-paused");
      cancelAutoplayTimer();
      updateAutoplayToggleLabel();
    }

    function resumeAutoplay() {
      if (!autoplayEnabled) return;
      isPaused = false;
      component.classList.remove("autoplay-paused");
      startAutoplayTimer();
      updateAutoplayToggleLabel();
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    (function init() {

      // Mobile dropdown setup
      (function setupMobileDropdown() {
        if (!isMobileDropdown || !dropdownToggle) return;
        dropdownToggle.setAttribute("aria-haspopup", "true");
        dropdownToggle.setAttribute("aria-expanded", "false");

        const activeLink =
          component.querySelector('[data-tabs-link][aria-selected="true"]') ||
          component.querySelector("[data-tabs-link].cc-active") ||
          links[0];
        if (dropdownText && activeLink) {
          const name = activeLink.getAttribute("data-tab-link-name");
          dropdownText.textContent = name || activeLink.textContent;
        }

        const onToggleClick = function (e) { e.stopPropagation(); toggleDropdown(); };
        dropdownToggle.addEventListener("click", onToggleClick);
        listeners.push({ element: dropdownToggle, type: "click", handler: onToggleClick });

        const onDocClick = function (e) { if (!component.contains(e.target)) closeDropdown(); };
        document.addEventListener("click", onDocClick);
        listeners.push({ element: document, type: "click", handler: onDocClick });

        const onEsc = function (e) {
          if (e.key === "Escape" && dropdownMenu.classList.contains("cc-open")) {
            closeDropdown();
            dropdownToggle.focus();
          }
        };
        document.addEventListener("keydown", onEsc);
        listeners.push({ element: document, type: "keydown", handler: onEsc });
      })();

      // Autoplay setup
      if (autoplayEnabled) component.style.setProperty("--autoplay-duration", autoplayDuration + "s");

      if (autoplayEnabled) {
        intersectionObs = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            entry.isIntersecting ? resumeAutoplay() : pauseAutoplay();
          });
        }, { threshold: 0.5 });
        intersectionObs.observe(component);
      }

      // Hover pause
      (function setupHoverPause() {
        if (!autoplayEnabled || !autoplayHoverPause) return;
        const onEnter = function () { pauseAutoplay(); };
        const onLeave = function () { resumeAutoplay(); };
        component.addEventListener("mouseenter", onEnter);
        component.addEventListener("mouseleave", onLeave);
        listeners.push({ element: component, type: "mouseenter", handler: onEnter });
        listeners.push({ element: component, type: "mouseleave", handler: onLeave });
      })();

      // Autoplay toggle button
      (function setupAutoplayToggle() {
        if (!autoplayEnabled || !autoplayToggle) return;
        const onClick = function () { isPaused ? resumeAutoplay() : pauseAutoplay(); };
        autoplayToggle.addEventListener("click", onClick);
        listeners.push({ element: autoplayToggle, type: "click", handler: onClick });
      })();

      // Activate correct starting tab
      activateTab((function getStartingIndex() {
        if (window.location.hash) {
          const hashId = window.location.hash.substring(1);
          const i = links.findIndex(function (l) { return l.id === hashId; });
          if (i !== -1) return i;
        }
        const i = links.findIndex(function (l) { return l.classList.contains("cc-active"); });
        return i !== -1 ? i : 0;
      })());

      // Click handlers on each tab
      links.forEach(function (link, i) {
        const btn = link.querySelector("[data-tabs-link-button]");
        if (!btn) return;
        const onClick = function (e) {
          e.preventDefault();
          activateTab(i);
          if (windowWidth < 768 && !isMobileDropdown) {
            link.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          }
        };
        btn.addEventListener("click", onClick);
        listeners.push({ element: btn, type: "click", handler: onClick });
      });

      // Keyboard navigation (arrow keys, Home, End)
      (function setupKeyboard() {
        const total = links.length;
        links.forEach(function (link) {
          const btn = link.querySelector("[data-tabs-link-button]");
          if (!btn) return;
          const onKeydown = function (e) {
            let next = activeIndex;
            switch (e.key) {
              case "ArrowLeft":  e.preventDefault(); next = activeIndex > 0 ? activeIndex - 1 : total - 1; break;
              case "ArrowRight": e.preventDefault(); next = activeIndex < total - 1 ? activeIndex + 1 : 0; break;
              case "Home":       e.preventDefault(); next = 0; break;
              case "End":        e.preventDefault(); next = total - 1; break;
              default: return;
            }
            activateTab(next);
            const nextBtn = links[next].querySelector("[data-tabs-link-button]");
            if (nextBtn) nextBtn.focus();
          };
          btn.addEventListener("keydown", onKeydown);
          listeners.push({ element: btn, type: "keydown", handler: onKeydown });
        });
      })();

      // Window resize debounce
      (function setupResize() {
        const onResize = function () {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(function () { windowWidth = window.innerWidth; }, 150);
        };
        window.addEventListener("resize", onResize);
        listeners.push({ element: window, type: "resize", handler: onResize });
      })();

      if (autoplayEnabled) startAutoplayTimer();

      // Hash change navigation
      const onHashChange = function () {
        if (window.location.hash) {
          const hashId = window.location.hash.substring(1);
          const i = links.findIndex(function (l) { return l.id === hashId; });
          if (i !== -1) activateTab(i);
        }
      };
      window.addEventListener("hashchange", onHashChange);
      listeners.push({ element: window, type: "hashchange", handler: onHashChange });

    })(); // end init

    // Cleanup function (removes all event listeners, stops observers/timers)
    component.__tabsCleanup = function () {
      listeners.forEach(function (l) { l.element.removeEventListener(l.type, l.handler); });
      if (intersectionObs) intersectionObs.disconnect();
      cancelAutoplayTimer();
      clearTimeout(resizeTimer);
    };
  }

  // ─── Bootstrap ──────────────────────────────────────────────────────────────
  // FIX 1 runs immediately (synchronously) to correct static markup state.
  // Main init runs after DOM is ready.
  setStaticStartingState();

  function initAll() {
    const components = document.querySelectorAll("[data-tabs-component]");
    if (components.length) components.forEach(initTabComponent);
  }

  if (document.querySelectorAll("[data-tabs-component]").length) {
    if ("loading" === document.readyState) {
      document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }

})();