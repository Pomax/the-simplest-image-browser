/**
 * A super-simple but super-useful image browsing script.
 * Run as `node browse.js` in whatever toplevel dir houses
 * all your images, and then just fire up http:/localhost:8080
 * 
 * Navigation is pretty self explanatory, and clicking an image
 * in an image gallery will make it fullscreen.
 * 
 * While on an image gallery, you have the following controls
 * while no image is loaded yet:
 * 
 *   click an image = load that image
 *   home/end = load first/last image
 *   left/right = load prev/next image
 *   pgup/pgdn = same
 *   up/esc = go up a dir
 * 
 * when in full screen:
 * 
 *   up/esc/click top25% of the image = exit full screen
 *   home/end = load first/last image
 *   left/right = load prev/next image
 *   pgup/pgdn = same
 * 
 * The URL will update based on what you're doing, and you 
 * can always reload/copy-paste the link to get the same
 * view you were looking at for that URL. That should be
 * obvious, but not every web based tool bothers with that.
 */

import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  readdirSync,
  readFileSync,
  statSync,
  stat,
  unlinkSync,
  rmSync,
} from "node:fs";

const port = 8080;
const base = dirname(fileURLToPath(import.meta.url));
const npm = process.platform === `win32` ? `npm.cmd` : `npm`;
const unwantedDataPaths = [`@eaDir`, `.DS_Store`, `Thumbs.db`];
const formats = [`jpg`, `jpeg`, `png`, `webp`];
const contentType = `Content-Type`;

function isImage(string) {
  return formats.find((format) =>
    string.toLowerCase().endsWith(`.${format.toLowerCase()}`),
  );
}

/**
 * Our "main" function, because why not.
 */
(function main() {
  const server = createServer(routeHandler);
  server.listen(port, () => console.log(`server listening on port ${port}`));
})();

/**
 * Route handling either yields a dir listing, and image gallery,
 * or actual images, depending on the URL and what it maps to.
 */
function routeHandler(req, res) {
  let { url } = req;
  url = decodeURIComponent(url);
  if (url.includes(`favicon`)) return res.end();
  const imageExtension = isImage(url);

  if (!url.endsWith(`/`) && !imageExtension) {
    // Is this a direct "show me this image" line?
    const imageIndex = parseFloat(url.match(/\d+$/)?.[0]);
    if (!isNaN(imageIndex)) {
      url = url.substring(0, url.lastIndexOf(`/`) + 1);
    }
    // Redirect to the correct dir URL if this is a dir request without / suffix
    else {
      res.writeHead(302, { Location: encodeURI(url) + `/` });
      return res.end();
    }
  }

  // Construct the local file path and see what we need to do:
  const path = base + decodeURI(url);

  // Images are served as static content.
  if (imageExtension) {
    res.writeHead(200, { [contentType]: `image/${imageExtension}` });
    return res.end(readFileSync(path));
  }

  // Dirs are served as a "folder view".
  try {
    const isDir = statSync(path).isDirectory();
    if (!isDir) throw new Error(`not a dir`);
    const html = createPage(path, isDir, url === `/`);
    res.writeHead(200, { [contentType]: `text/HTML` });
    res.end(`<!doctype html>${html}`);
  } catch (e) {
    console.warn(e);
    res.end();
  }
}

/**
 * A very simple HTML document builder
 */
function createPage(path, isDir, root = false) {
  const html = `<head>
  <meta charset="utf-8">
  <title>${path.match(/[^\/]+\/?$/)?.[0]?.replaceAll(`/`, ``)}</title>
  <style>* { font-size: 2vh; }</style>
</head>
  `;

  if (isDir) {
    const content = readdirSync(path).filter((e) => filterForImage(path, e));
    const hasImages = content.some(isImage);

    if (!hasImages) {
      return html + generateDirListing(path, content, root);
    }

    sortDirContent(path, content);
    return html + generateGallery(path, content);
  }

  return html;
}

/**
 * A filter function that keeps all dirs and images in a
 * dir listing, but removes everything else.
 */
function filterForImage(path, e) {
  if (unwantedDataPaths.includes(e)) {
    // Some file/dir paths are too stupid to allow, so if we
    // see them, we immediately force-delete them.
    rmSync(`${path}/${e}`, { recursive: true, force: true });
    return false;
  }

  return statSync(`${path}/${e}`).isDirectory() || isImage(e);
}

/**
 * Sort directory content - dirs go first, after
 * that images get sorted based on numerical suffix
 */
function sortDirContent(path, content) {
  content.sort((a, b) => {
    const naiveSort = a < b ? -1 : a > b ? 1 : 0;

    // Are one or both directories?
    const sa = statSync(`${path}/${a}`).isDirectory();
    const sb = statSync(`${path}/${b}`).isDirectory();
    if (sa && sb) return naiveSort;
    if (sa) return -1;
    if (sb) return 1;

    // If not, find the numerical suffix and sort on that.
    const r = new RegExp(`\\d+\\.(${formats.join(`,`)})$`);
    const ia = parseFloat(a.match(r));
    const ib = parseFloat(b.match(r));
    if (isNaN(ia) || isNaN(ib)) return naiveSort;
    return ia - ib;
  });
}

/**
 * Navigate to the current URL's parent path.
 * This code gets inlined as a function via toString.
 */
function goUp() {
  const newURL = location.toString().replace(/[^\/]+\/?$/, ``);
  if (newURL === `http://`) return;
  window.location.href = newURL;
}

/**
 * In normal dir listings, we want "esc" to go up a dir.
 */
function goUpKeyHandler() {
  document.addEventListener(`keydown`, (evt) => {
    const { key } = evt;
    if (key === `Escape` || key === `ArrowUp`) {
      evt.preventDefault();
      goUp();
    }
  });
}

/**
 * Add image navigation to all <img> on the page.
 * This code gets inlined as a function via toString.
 */
function imageNavigation() {
  let fullscreen;
  const imgs = [...document.querySelectorAll(`img`)];

  function unload(bypassHistory = false) {
    fullscreen?.classList.remove(`full`);
    fullscreen = undefined;
    if (!bypassHistory) history.pushState({}, ``, `./`);
  }

  function load(idx, bypassHistory = false) {
    if (idx === false) return unload();
    fullscreen?.classList.remove(`full`);
    fullscreen = imgs[idx];
    fullscreen.classList.add(`full`);
    if (!bypassHistory) history.pushState({}, ``, `./${idx}`);
  }

  function prev(pos = imgs.indexOf(fullscreen)) {
    if (pos > 0) load(pos - 1);
  }

  function next(pos = imgs.indexOf(fullscreen)) {
    if (pos < imgs.length - 1) load(pos + 1);
  }

  function cancel(evt) {
    evt?.preventDefault();
    fullscreen ? load(false) : goUp();
  }

  document.addEventListener(`keydown`, (evt) => {
    const { key } = evt;
    if (key === `Escape` || key === `ArrowUp`) cancel(evt);
    if (key === `ArrowLeft` || key === `PageUp`)
      fullscreen ? prev() : load(imgs.length - 1);
    if (key === `ArrowRight` || key === `PageDown`)
      fullscreen ? next() : load(0);
    if (key === `Home`) load(0);
    if (key === `End`) load(imgs.length - 1);
  });

  document.addEventListener(`click`, (evt) => {
    const img = evt.target;

    // Is this a "show image" request?
    let pos = -1;
    if (img.tagName === `IMG`) {
      pos = imgs.indexOf(img);
      if (!fullscreen && pos >= 0) {
        return load(pos);
      }
    }

    // If not, is this a fullscreen interaction?
    if (fullscreen) {
      pos = imgs.indexOf(fullscreen);
      const rx = evt.pageX / innerWidth;
      const ry = evt.pageY / innerHeight;
      console.log(rx, ry, pos);
      if (ry < 0.25) return cancel();
      if (rx < 0.5) prev(pos);
      if (rx > 0.5) next(pos);
    }
  });

  window.addEventListener(`popstate`, (event) => {
    const bypass = true;
    const loc = location.toString().split(`/`);
    const last = loc.at(-1);
    if (!last && fullscreen) {
      unload(bypass);
    } else if (last) {
      load(parseFloat(last), bypass);
    }
  });

  const loadPos = parseFloat(location.toString().match(/\d+$/)?.[0]);

  if (!isNaN(loadPos)) {
    const img = imgs[loadPos];
    img.src = encodeURIComponent(img.dataset.src);
    load(loadPos);
  }

  (function loadImages(loadList) {
    if (loadList.length === 0) return;
    const img = loadList.shift();
    if (img.src) return loadImages(loadList);
    img.onload = () => {
      img.classList.remove(`loading`);
      loadImages(loadList);
    };
    img.classList.add(`loading`);
    img.src = img.dataset.src;
  })(Array.from(imgs));
}

const galleryCSS = `
html {
  h1 {
    display: inline-block;
    font-size: 2rem !important;
    margin: 0;
    padding-left: 2rem;
    text-transform: capitalize;
  }

  &:has(.gallery img.full) {
    cursor: pointer;
    h1 { display: none; }
    span { display: none; }
  }

  .gallery {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    user-select: none;

    &:has(.full) {
      img:not(.full) {
        display: none;
      }
    }

    img {
      cursor: pointer;

      .loading {
        opacity: 0;
      }

      &.full {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: auto;
        max-width: 100%;
        height: 100%;
        max-height: 100%;
        margin: auto;
        object-fit: contain;
      }

      &:not(.full) {
        max-width: 200px;
        max-height: 300px;
        object-fit: contain;
        background: #eee6;
        border: 1px solid black;
        margin: 0.25em;
      }
    }
  }
}
`;

/**
 * Generate the gallery HTML
 */
function generateGallery(path, content) {
  const title = path.split(`/`).at(-2);
  return `
    <style>
      ${galleryCSS}
    </style>
    <span><a href="..">[↰ up]</a></span><h1>${title}</h1>
    <div class="gallery">
    ${content
      .map(
        (e) =>
          `<img width="200" height="300" title="${e}" data-src="./${encodeURIComponent(e)}">`,
      )
      .join(`\n`)}
    </div>
    <script>
      ${goUp.toString()}
      (${imageNavigation.toString()})();
    </script>`;
}

/**
 * Generate a dir listing
 */
function generateDirListing(path, content, root) {
  return `
    <p>${root ? `` : `<a href="..">[↰ up]</a>`}</p>
    <ul>
    ${content
      .map((e) => {
        const isDir = statSync(path + `/` + e).isDirectory();
        return `<li><a href="./${e}/">${isDir ? `📁 ` : ``}${e}</a></li>`;
      })
      .join(`\n`)}
    </ul>
    <script>
      ${goUp.toString()}
      (${goUpKeyHandler.toString()})();
    </script>
  `;
}
