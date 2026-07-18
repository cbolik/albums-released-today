# Date Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add previous-day / next-day navigation and a "Today" quick-jump link to the album view, so the user can browse albums released on adjacent calendar days without leaving the app.

**Architecture:** Minimal patch to the existing procedural code in [public/scripts.js](../../../public/scripts.js). One new module-level `selectedDate: Date`, one renamed render function that reads from it, one small `renderDateNav()` that maintains the new UI row, and one `initDateNav()` that wires three click handlers. No class introduction, no new files.

**Tech Stack:** Vanilla JavaScript, HTML, CSS. Font Awesome icons (already loaded in [index.html](../../../public/index.html)). Express is only for local dev; production is static hosting via GitHub Pages.

**Spec:** [docs/superpowers/specs/2026-07-16-date-navigation-design.md](../specs/2026-07-16-date-navigation-design.md)

## Global Constraints

- All changes confined to [public/scripts.js](../../../public/scripts.js), [public/index.html](../../../public/index.html), and [public/styles.css](../../../public/styles.css).
- No new dependencies. No build step (project has none — vanilla JS shipped directly).
- No test framework exists — verification is manual via browser at `http://localhost:8000` after `npm start`.
- No URL / storage persistence of `selectedDate` — always initialized to `new Date()` on load.
- No keyboard shortcuts, no swipe gestures.
- Layout must render acceptably on iPhone (Safari), iPad (Safari), and desktop (Chrome) with a single flexbox layout (no separate mobile media query required).
- The `-01-01` exclusion in `addAlbumToMap()` and the existing "1 year ago" pluralization stay untouched.
- The existing ordinal-suffix bug (day 23 formatted as "23th" instead of "23rd" — see [public/scripts.js:378-384](../../../public/scripts.js#L378-L384)) is **preserved as-is** — out of scope.
- Fire icon (`fa-fire`) appears **only** when the selected date equals today.

---

## File Structure

| File | Change |
|---|---|
| [public/scripts.js](../../../public/scripts.js) | Add `selectedDate` state + helpers; rename `populateTodaysAlbums()` → `populateAlbumsForSelectedDate()`; add `renderDateNav()`, `initDateNav()`, `isSelectedDateToday()`, `formatSelectedDateLabel()`, `formatSelectedMonthDayLong()`, `formatSelectedMonthDayShort()`; update copy for past dates. |
| [public/index.html](../../../public/index.html) | Insert `#date_nav` block between `#users_albums` and `#albums_released_today`. |
| [public/styles.css](../../../public/styles.css) | Add `.date-nav`, `.date-nav-btn`, `.date-nav-label`, `.date-nav-today` rules. |

Four tasks, each ending in an observable state and a commit.

---

## Task 1: Refactor to `selectedDate` state (no user-visible change)

**Goal:** Introduce module-level `selectedDate` and rename `populateTodaysAlbums()` → `populateAlbumsForSelectedDate()`, reading date info from `selectedDate` instead of `new Date()`. App behavior stays identical.

**Files:**
- Modify: [public/scripts.js](../../../public/scripts.js)

**Interfaces:**
- Consumes: nothing new
- Produces:
  - Module-level `let selectedDate` (a `Date`)
  - `getSelectedMonthDay()` → `string` in the form `-MM-DD`
  - `getSelectedYear()` → `number`
  - `populateAlbumsForSelectedDate()` — replaces `populateTodaysAlbums()`; called from the same two sites

### Steps

- [ ] **Step 1.1: Add `selectedDate` and helpers**

Insert after the `albumsList` declaration (currently [public/scripts.js:27](../../../public/scripts.js#L27)):

```js
// The date currently being viewed. Initialized to today on load; mutated by the date navigation buttons.
// Never persisted (no URL / storage) — refreshing the page always returns to today.
let selectedDate = new Date();

const getSelectedMonthDay = () => {
  const month = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
  const day = selectedDate.getDate().toString().padStart(2, '0');
  return `-${month}-${day}`;
};

const getSelectedYear = () => selectedDate.getFullYear();
```

- [ ] **Step 1.2: Rename the function and update its body**

Replace the function starting at [public/scripts.js:350](../../../public/scripts.js#L350) (`populateTodaysAlbums`) with:

```js
const populateAlbumsForSelectedDate = () => {
  let todaysMonthDay = getSelectedMonthDay();
  let todaysYear = getSelectedYear();
  let todaysAlbumsList = albumsByDate.get(todaysMonthDay);
  if (todaysAlbumsList && todaysAlbumsList.length > 0) {
    let todaysAlbumsListElem = document.getElementById("albums_released_today");
    todaysAlbumsListElem.innerHTML = "";
    for (let album of todaysAlbumsList) {
      let newItem = document.createElement("li");
      let releaseYear = album.releaseDate.split("-")[0];
      let yearsAgo = todaysYear - releaseYear;
      if (yearsAgo === 0) {
        addAlbumHtml(album, newItem, `Released today <i class="fa-solid fa-fire icon"></i>:`);
      } else {
        addAlbumHtml(album, newItem, `Released ${yearsAgo} year${yearsAgo === 1 ? "" : "s"} ago today, in ${releaseYear}:`);
      }
      todaysAlbumsListElem.appendChild(newItem);
    }
  } else {
    let todaysAlbumsListElem = document.getElementById("albums_released_today");
    todaysAlbumsListElem.innerHTML = "";
    let newItem = document.createElement("li");
    // Get selected date in the form "December 5th"
    let month = selectedDate.toLocaleString('default', { month: 'long' });
    let day = selectedDate.getDate();
    let suffix = "th";
    if (day === 1 || day === 21 || day === 31) {
      suffix = "st";
    } else if (day === 2 || day === 22) {
      suffix = "nd";
    } else if (day === 3) {
      suffix = "rd";
    }
    newItem.innerHTML = `None of your saved albums were released on ${month} ${day}${suffix}. But how about revisiting one of the following?`;
    todaysAlbumsListElem.appendChild(newItem);

    // pick 3 random albums from albumsList
    let numAlbums = albumsList.length;
    let numToPick = 3;
    let pickedAlbums = new Set();
    for (let i = 0; i < numToPick; i++) {
      let idx = Math.floor(Math.random() * numAlbums);
      while (pickedAlbums.has(idx)) {
        idx = Math.floor(Math.random() * numAlbums);
      }
      pickedAlbums.add(idx);
    }

    // sort the picked albums by release year in descending order
    pickedAlbums = Array.from(pickedAlbums);
    pickedAlbums.sort((a, b) => {
      let yearA = albumsList[a].releaseDate.split("-")[0];
      let yearB = albumsList[b].releaseDate.split("-")[0];
      return yearB - yearA;
    })


    for (let idx of pickedAlbums) {
      let album = albumsList[idx];
      let releaseYear = album.releaseDate.split("-")[0];
      let yearsAgo = todaysYear - releaseYear;
      let yearsAgoPart = "";
      if (yearsAgo === 1) {
        yearsAgoPart = " (1 year ago)";
      } else {
        yearsAgoPart = ` (${yearsAgo} years ago)`;
      }
      let newItem = document.createElement("li");
      if (album.releaseDate.split("-").length > 1) {
        addAlbumHtml(album, newItem, `Released on ${album.releaseDate}${yearsAgoPart}:`);
      } else {
        addAlbumHtml(album, newItem, `Released in ${releaseYear}${yearsAgoPart}:`);
      }
      todaysAlbumsListElem.appendChild(newItem);
    }
  }
}
```

Only two things changed from the original: the function name, and the empty-state message now derives month/day from `selectedDate` (not `new Date()`). Since `selectedDate` is initialized to `new Date()`, behavior is identical on first render.

- [ ] **Step 1.3: Update the two call sites**

In [public/scripts.js](../../../public/scripts.js), replace both remaining calls to `populateTodaysAlbums()` (at what was line 184 and line 297) with `populateAlbumsForSelectedDate()`.

- [ ] **Step 1.4: Manual verify**

Run `npm start`, open `http://localhost:8000` in Chrome. Confirm the app still displays today's albums identically to before this change (or, if cached, the "Found N saved albums" strip appears and today's list shows). No visible difference.

- [ ] **Step 1.5: Commit**

```bash
git add public/scripts.js
git commit -m "Refactor: introduce selectedDate state (no behavior change)

Rename populateTodaysAlbums() to populateAlbumsForSelectedDate() and
read date info from a new module-level selectedDate (initialized to
today). Preparation for the date navigation feature.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Add the DOM row, CSS, and `renderDateNav()` (nav row appears, buttons inert)

**Goal:** The `#date_nav` row becomes visible after albums load, showing today's date with the next button disabled and the "Today" link hidden. Clicking buttons does nothing yet.

**Files:**
- Modify: [public/index.html](../../../public/index.html)
- Modify: [public/styles.css](../../../public/styles.css)
- Modify: [public/scripts.js](../../../public/scripts.js)

**Interfaces:**
- Consumes: `selectedDate`, `getSelectedYear()` (from Task 1)
- Produces:
  - `isSelectedDateToday()` → `boolean` (compares by yyyy-mm-dd string)
  - `formatSelectedDateLabel()` → `string` (e.g. `"Sun, Jul 14"` or `"Sun, Jul 14, 2024"`)
  - `renderDateNav()` — updates label + button states; removes `hidden` from `#date_nav` on first call

### Steps

- [ ] **Step 2.1: Insert the DOM block in `index.html`**

In [public/index.html](../../../public/index.html), between the `<div id="users_albums">...</div>` line (currently line 43) and the `<ul id="albums_released_today">` line (currently line 44), insert:

```html
    <div id="date_nav" class="date-nav" hidden>
      <button type="button" id="date_prev" class="date-nav-btn" aria-label="Previous day">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <span id="date_label" class="date-nav-label"></span>
      <button type="button" id="date_next" class="date-nav-btn" aria-label="Next day">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
      <button type="button" id="date_today" class="date-nav-today" hidden>Today</button>
    </div>
```

The `hidden` attribute on `#date_nav` keeps the row invisible until albums finish loading.

- [ ] **Step 2.2: Add CSS rules**

Append to [public/styles.css](../../../public/styles.css):

```css
.date-nav {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
  font-family: Arial, Helvetica, sans-serif;
  flex-wrap: wrap;
}

.date-nav-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background-color: var(--button-color);
  color: black;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.date-nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.date-nav-label {
  font-weight: 600;
  color: white;
  min-width: 12em;
  text-align: center;
}

.date-nav-today {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background-color: transparent;
  color: white;
  cursor: pointer;
  font-family: Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 2.3: Add JS helpers and `renderDateNav()`**

In [public/scripts.js](../../../public/scripts.js), insert the following just before the `populateAlbumsForSelectedDate` function:

```js
const isSelectedDateToday = () => {
  const today = new Date();
  return selectedDate.getFullYear() === today.getFullYear()
      && selectedDate.getMonth() === today.getMonth()
      && selectedDate.getDate() === today.getDate();
};

const formatSelectedDateLabel = () => {
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (selectedDate.getFullYear() !== new Date().getFullYear()) {
    opts.year = 'numeric';
  }
  return selectedDate.toLocaleDateString('en-US', opts);
};

const renderDateNav = () => {
  const nav = document.getElementById("date_nav");
  const label = document.getElementById("date_label");
  const nextBtn = document.getElementById("date_next");
  const todayBtn = document.getElementById("date_today");

  label.textContent = formatSelectedDateLabel();

  const onToday = isSelectedDateToday();
  nextBtn.disabled = onToday;
  todayBtn.hidden = onToday;

  nav.hidden = false;
};
```

- [ ] **Step 2.4: Call `renderDateNav()` from both album-load paths**

In [public/scripts.js](../../../public/scripts.js), find the two spots that call `populateAlbumsForSelectedDate()` (updated in Task 1). Add a `renderDateNav();` call immediately before each one:

- In the cached-data early-return branch (was around line 184):
  ```js
      populateAlbumsForSelectedDate();
      return;
  ```
  becomes:
  ```js
      renderDateNav();
      populateAlbumsForSelectedDate();
      return;
  ```

- In the fresh-fetch success branch (was around line 297):
  ```js
      setInnerHTML("users_albums", `Found ${totalItems} saved albums. <button onclick="reloadAlbums()">Reload</button>`);
      populateAlbumsForSelectedDate();
  ```
  becomes:
  ```js
      setInnerHTML("users_albums", `Found ${totalItems} saved albums. <button onclick="reloadAlbums()">Reload</button>`);
      renderDateNav();
      populateAlbumsForSelectedDate();
  ```

- [ ] **Step 2.5: Manual verify**

Run `npm start`, load `http://localhost:8000` in Chrome.
- The `#date_nav` row appears between "Found N saved albums" and the album list.
- The label shows today's date (e.g. `"Thu, Jul 16"`).
- The next button (`›`) is visibly disabled (~40% opacity).
- The "Today" link is not visible.
- The previous button (`‹`) is enabled but clicking it does nothing (no handler yet — expected).
- Resize the browser to iPhone width in devtools; the row remains readable and wraps if needed.

- [ ] **Step 2.6: Commit**

```bash
git add public/index.html public/styles.css public/scripts.js
git commit -m "Add date navigation row (UI only, buttons inert)

Introduce the #date_nav row with prev/next arrows, date label, and
Today jump link. Renders after albums load, shows today's date with
next disabled and Today hidden. Click handlers wired in the next
commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Wire click handlers via `initDateNav()`

**Goal:** Prev, Next, and Today buttons update `selectedDate` and re-render both the nav row and the album list. Copy still says "today" on past dates — that's fixed in Task 4.

**Files:**
- Modify: [public/scripts.js](../../../public/scripts.js)

**Interfaces:**
- Consumes: `selectedDate`, `renderDateNav()`, `populateAlbumsForSelectedDate()` (from Tasks 1–2)
- Produces:
  - `initDateNav()` — wires the three click handlers once; safe to call more than once (uses a guard flag)

### Steps

- [ ] **Step 3.1: Add `initDateNav()` with a guard flag**

In [public/scripts.js](../../../public/scripts.js), insert just below `renderDateNav()`:

```js
let dateNavInitialized = false;

const initDateNav = () => {
  if (dateNavInitialized) return;
  dateNavInitialized = true;

  document.getElementById("date_prev").addEventListener("click", () => {
    selectedDate = new Date(selectedDate);
    selectedDate.setDate(selectedDate.getDate() - 1);
    renderDateNav();
    populateAlbumsForSelectedDate();
  });

  document.getElementById("date_next").addEventListener("click", () => {
    if (isSelectedDateToday()) return;
    selectedDate = new Date(selectedDate);
    selectedDate.setDate(selectedDate.getDate() + 1);
    renderDateNav();
    populateAlbumsForSelectedDate();
  });

  document.getElementById("date_today").addEventListener("click", () => {
    selectedDate = new Date();
    renderDateNav();
    populateAlbumsForSelectedDate();
  });
};
```

Notes:
- Each handler clones `selectedDate` before mutating so external references (if any are added later) wouldn't be affected. Cheap defensive move.
- The `next` handler double-checks `isSelectedDateToday()` — the button is also `disabled` in the DOM, so this is belt-and-suspenders.
- `setDate(getDate() - 1)` correctly handles month/year boundaries in JavaScript's `Date` (Feb 1 → Jan 31, Jan 1 → Dec 31 of prior year, Mar 1 → Feb 28 or 29).

- [ ] **Step 3.2: Call `initDateNav()` from both album-load paths**

In [public/scripts.js](../../../public/scripts.js), immediately after each `renderDateNav()` call added in Task 2, add `initDateNav();`:

- Cached-data branch:
  ```js
      renderDateNav();
      initDateNav();
      populateAlbumsForSelectedDate();
      return;
  ```

- Fresh-fetch branch:
  ```js
      renderDateNav();
      initDateNav();
      populateAlbumsForSelectedDate();
  ```

The guard flag inside `initDateNav()` means calling it from both sites is safe.

- [ ] **Step 3.3: Manual verify**

Run `npm start`, load `http://localhost:8000` in Chrome.

- **Golden path:** Click `‹` — the label shifts one day back (e.g. `"Wed, Jul 15"`), the album list re-renders for the new date, `›` becomes enabled, "Today" link appears. Click `›` — returns to today; `›` disables and "Today" hides.
- **Today link:** From today, click `‹` a few times, then click "Today". Label returns to today's date; both button and link states reset.
- **Month boundary:** Navigate back until you cross a month boundary (e.g. Jul 1 → Jun 30). Confirm the label updates correctly.
- **Year boundary:** Navigate back until you cross Jan 1 → Dec 31. Confirm the label now includes the year (`"Wed, Dec 31, 2025"`).
- **Empty date:** Navigate to a date with no released albums. Confirm the "None of your saved albums were released on..." message shows the correct selected date's month/day, and 3 random album picks appear.
- **iPhone width:** Resize devtools to 375px width. Buttons are tappable, row wraps or fits.

Note: copy for past dates still says "Released N years ago **today**" — that is expected here and fixed in Task 4.

- [ ] **Step 3.4: Commit**

```bash
git add public/scripts.js
git commit -m "Wire date navigation click handlers

Prev/Next mutate selectedDate by ± 1 calendar day (correctly
handling month and year boundaries via Date.setDate). Today resets
to now. Each handler re-renders both the nav row and the album list.

Copy adjustments for past dates come in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Copy adjustments for past dates

**Goal:** When the selected date is not today, replace phrases like "Released N years ago today, in YYYY" with "Released N years ago on Jul 14, in YYYY". The fire icon appears only on today.

**Files:**
- Modify: [public/scripts.js](../../../public/scripts.js)

**Interfaces:**
- Consumes: `isSelectedDateToday()`, `selectedDate` (from earlier tasks)
- Produces:
  - `formatSelectedMonthDayShort()` → `string` (e.g. `"Jul 14"`) — used by past-date copy

### Steps

- [ ] **Step 4.1: Add `formatSelectedMonthDayShort()`**

In [public/scripts.js](../../../public/scripts.js), insert just after `formatSelectedDateLabel()` (added in Task 2):

```js
const formatSelectedMonthDayShort = () => {
  return selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
```

- [ ] **Step 4.2: Update the "found albums" branch of `populateAlbumsForSelectedDate()`**

In [public/scripts.js](../../../public/scripts.js), find this block inside `populateAlbumsForSelectedDate()`:

```js
    for (let album of todaysAlbumsList) {
      let newItem = document.createElement("li");
      let releaseYear = album.releaseDate.split("-")[0];
      let yearsAgo = todaysYear - releaseYear;
      if (yearsAgo === 0) {
        addAlbumHtml(album, newItem, `Released today <i class="fa-solid fa-fire icon"></i>:`);
      } else {
        addAlbumHtml(album, newItem, `Released ${yearsAgo} year${yearsAgo === 1 ? "" : "s"} ago today, in ${releaseYear}:`);
      }
      todaysAlbumsListElem.appendChild(newItem);
    }
```

Replace with:

```js
    const onToday = isSelectedDateToday();
    const monthDayShort = formatSelectedMonthDayShort();
    for (let album of todaysAlbumsList) {
      let newItem = document.createElement("li");
      let releaseYear = album.releaseDate.split("-")[0];
      let yearsAgo = todaysYear - releaseYear;
      const yearsAgoText = `${yearsAgo} year${yearsAgo === 1 ? "" : "s"}`;
      if (onToday) {
        if (yearsAgo === 0) {
          addAlbumHtml(album, newItem, `Released today <i class="fa-solid fa-fire icon"></i>:`);
        } else {
          addAlbumHtml(album, newItem, `Released ${yearsAgoText} ago today, in ${releaseYear}:`);
        }
      } else {
        if (yearsAgo === 0) {
          addAlbumHtml(album, newItem, `Released on ${monthDayShort}, ${releaseYear}:`);
        } else {
          addAlbumHtml(album, newItem, `Released ${yearsAgoText} ago on ${monthDayShort}, in ${releaseYear}:`);
        }
      }
      todaysAlbumsListElem.appendChild(newItem);
    }
```

The empty-state branch (with random picks) is left alone — its "Released on YYYY-MM-DD" / "Released in YYYY" phrasing is already agnostic to whether the selected date is today.

- [ ] **Step 4.3: Manual verify**

Run `npm start`, load `http://localhost:8000` in Chrome.

- **On today:** copy is unchanged — `"Released today 🔥:"` (with fire icon) for same-year releases, `"Released N year(s) ago today, in YYYY:"` for prior years.
- **On a past date with albums:** click `‹` to a day that has releases. Copy now reads `"Released N year(s) ago on Jul 14, in YYYY:"` for prior years, and `"Released on Jul 14, YYYY:"` if there's a same-year release. **No fire icon** on past dates.
- **On a past date without albums:** the empty-state message + random picks still work (empty branch unchanged).
- **Pluralization:** confirm `"1 year ago"` (not `"1 years ago"`) still works both on today and past dates.

- [ ] **Step 4.4: Commit**

```bash
git add public/scripts.js
git commit -m "Adjust album-list copy for past selected dates

On past dates, replace \"today\" with the selected month+day (e.g.
\"Released 2 years ago on Jul 14, in 2023\"). The fire icon appears
only when viewing today. Today's copy is unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Post-implementation verification (cross-device)

After all four tasks are committed, do a final pass on real devices where possible:

- [ ] **Desktop Chrome:** golden path, boundary tests as above.
- [ ] **iPhone Safari** (via LAN URL, e.g. `http://<mac-lan-ip>:8000` after `npm start`): buttons are tappable, layout wraps sensibly, no horizontal scroll.
- [ ] **iPad Safari** (portrait and landscape): same.

If layout feels off on any device (e.g. Today link too close to the arrows, label wraps ugly), tune the CSS constants in a follow-up commit — the spec explicitly leaves final visual tuning as a manual step.

## Deployment (unchanged from existing process)

Per [CLAUDE.md](../../../CLAUDE.md#devops):

```bash
git push
git subtree push --prefix public origin gh-pages
```

---

## Self-review

**Spec coverage:** every section of the spec maps to a task:
- Motivation / scope → covered by all tasks
- Navigation row layout → Task 2 (DOM + CSS)
- Date label format → Task 2 (`formatSelectedDateLabel`)
- Navigation semantics (back/forward calendar day, boundary) → Task 3
- "Today" quick-jump + forward-disable → Task 2 (state) + Task 3 (handler)
- Empty-date fallback (3 random) → Task 1 (preserved logic, now uses selected date)
- Copy adjustments → Task 4
- No URL/storage persistence → covered by design (nothing to implement)
- No keyboard/swipe → covered by design (nothing to implement)
- Cross-device layout → verification steps in Task 2, Task 3, and post-implementation section

**Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N". All code shown in full where it appears.

**Type consistency:** function names used consistently — `renderDateNav`, `initDateNav`, `populateAlbumsForSelectedDate`, `isSelectedDateToday`, `formatSelectedDateLabel`, `formatSelectedMonthDayShort`. `selectedDate` referenced identically across all tasks.
