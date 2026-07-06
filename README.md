# Project TOC Component

A sticky left-edge project table of contents for portfolio pages. It tracks the active section, opens dark tooltips on hover/focus, builds a small image preview slider from each project section, supports smooth section jumps, and can play lightweight Web Audio hover/press sounds.

## Demo

Live demo: https://batuhankarasakal.github.io/tableofcontent/

```sh
npm start
```

Then open `http://localhost:4174/demo/`.

## Markup

```html
<link rel="stylesheet" href="src/project-toc.css" />

<nav class="project-toc" aria-label="Project table of contents">
  <a href="#ravenna" aria-label="Ravenna" aria-current="true">
    <span class="project-toc-line" aria-hidden="true"></span>
    <span class="project-toc-tooltip" role="tooltip">
      <span class="project-toc-copy">
        <strong>Ravenna</strong>
        <span>Ravenna the agentic service desk for operation teams.</span>
      </span>
    </span>
  </a>
</nav>

<section id="ravenna" class="project-section">
  <figure class="project-shot">
    <img src="image-01.png" alt="" />
  </figure>
</section>

<script type="module">
  import { initProjectToc } from "./src/project-toc.js";

  initProjectToc();
</script>
```

Each TOC link should point to a matching section. Preview images are collected from `.project-shot img` inside that section.

## Options

```js
initProjectToc({
  tocSelector: ".project-toc",
  linkSelector: ".project-toc a",
  sectionImageSelector: ".project-shot img",
  activeMarkerRatio: 0.38,
  previewInterval: 1500,
  enableSound: true,
  smoothScroll: true
});
```

## CSS Customization

The component ships as plain CSS. The most useful variables:

```css
:root {
  --project-toc-left: 34px;
  --project-toc-top: max(160px, 30.6vh);
  --project-toc-line-width: 12px;
  --project-toc-line-active-width: 32px;
  --project-toc-line-height: 2px;
  --project-toc-line-magnetic-delta: 20px;
  --project-toc-tooltip-bg: #424346;
}
```

## Accessibility

- Links are real anchors.
- Active section is reflected with `aria-current="true"`.
- Tooltips are reachable through keyboard focus.
- Motion and sliders respect `prefers-reduced-motion`.
