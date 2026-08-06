/* Accordion JS */
/* Source: https://cdn.jsdelivr.net/gh/nocodesupplyco/mast@latest/accordion.min.js */
/* Original: https://github.com/nocodesupplyco/mast/blob/master/accordion.js */

/**
 * Minified by jsDelivr using Terser v5.39.0.
 * Original file: /gh/nocodesupplyco/mast@master/accordion.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
/*
 * CUSTOM: data-accordion-tablet-close="true"
 * Add this attribute to any <details> that should start CLOSED on viewports
 * 991px and below (it overrides data-accordion-start-open="true" on those
 * viewports). Accordions without this attribute are unaffected.
 */
!function(){"use strict";function e(){const e=document.querySelectorAll("details");if(0===e.length)return;window.matchMedia("(max-width: 991px)").matches&&e.forEach((e=>{"true"===e.getAttribute("data-accordion-tablet-close")&&e.setAttribute("data-accordion-start-open","false")}));const t=document.createElement("style");t.textContent="details[data-accordion-animating]::details-content{content-visibility:visible!important;display:block!important;}",document.head.appendChild(t);let o=!1,i=null;try{i=window.matchMedia("(prefers-reduced-motion: reduce)"),o=i.matches,i.addEventListener("change",(e=>{o=e.matches}))}catch(e){o=!1}document.querySelectorAll("details[open]").forEach((e=>{"true"!==e.getAttribute("data-accordion-start-open")&&e.removeAttribute("open")})),e.forEach((e=>{const t=e.querySelector("summary"),i=e.querySelector("[data-accordion='content']");if(!t||!i)return;"true"!==e.getAttribute("data-accordion-start-open")&&("undefined"!=typeof gsap?gsap.set(i,{height:0,overflow:"clip"}):(i.style.height="0px",i.style.overflow="clip")),t.addEventListener("click",(t=>{if(e.hasAttribute("open"))t.preventDefault(),o?e.removeAttribute("open"):(i.style.height=`${i.scrollHeight}px`,i.offsetHeight,"undefined"!=typeof gsap?(gsap.killTweensOf(i),gsap.to(i,{height:0,duration:.4,ease:"power3.inOut",onComplete:()=>{e.removeAttribute("open")}})):(i.style.transition="height 0.4s ease-in-out",i.style.height="0px",setTimeout((()=>{e.removeAttribute("open"),i.style.transition=""}),400)));else{const t=e.getAttribute("name");if(t&&!o){document.querySelectorAll(`details[name="${t}"][open]`).forEach((t=>{if(t===e)return;const o=t.querySelector("[data-accordion='content']");o&&("undefined"!=typeof gsap&&gsap.killTweensOf(o),o.style.height=`${o.scrollHeight}px`,o.style.overflow="clip",o.style.display="block",t.dataset.accordionAnimating="closing",o.offsetHeight,"undefined"!=typeof gsap?gsap.to(o,{height:0,duration:.4,ease:"power3.inOut",onComplete:()=>{delete t.dataset.accordionAnimating,o.style.height="0px",o.style.display=""}}):(o.style.transition="height 0.4s ease-in-out",o.style.height="0px",setTimeout((()=>{delete t.dataset.accordionAnimating,o.style.transition="",o.style.display=""}),400)))}))}}})),e.addEventListener("toggle",(()=>{if(e.open){const e=i.scrollHeight;o?i.style.height="auto":"undefined"!=typeof gsap?(gsap.killTweensOf(i),gsap.to(i,{height:e,duration:.4,ease:"power3.out",onComplete:()=>{i.style.height="auto"}})):(i.style.transition="height 0.4s ease-out",i.style.height=`${e}px`,setTimeout((()=>{i.style.height="auto",i.style.transition=""}),400))}}))}))}"loading"===document.readyState?document.addEventListener("DOMContentLoaded",e):e()}();
//# sourceMappingURL=/sm/7163013e4f2798c2e784b05784355973312e6b1f1423cb4480bc854fc3c26d91.map
