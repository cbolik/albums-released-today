# Date Navigation Design

**Date:** 2026-07-16
**Feature:** Allow the user to navigate one calendar day back or forward from "today", within the existing "Today's Albums" app, to see which of their saved albums were released on that date in prior years.

## Motivation

The app currently only shows albums released on the actual current date. Users have no way to browse adjacent days — e.g. to see what was released on a date they missed, or to explore back through the calendar. The header "Today's Albums" and app identity stay unchanged; date navigation is a transient exploration on top of today.

## Scope

**In scope:**
- A navigation row with previous / next arrow buttons and a date label, added underneath the "Found N saved albums" strip.
- A "Today" quick-jump link, visible only when the selected date is not today.
- Behavior consistent with the current "today" experience when navigating to any past date (including the same 3-random-album fallback on empty dates).
- Copy adjustments so phrases referring to "today" remain accurate when the selected date is not today.
- Works on iPhone, iPad, and desktop with the same layout (flexbox scales; no separate mobile variant needed).

**Out of scope:**
- URL or storage persistence of the selected date (always resets to today on load).
- Keyboard shortcuts (arrow keys).
- Swipe / touch gestures.
- Any refactor of the auth flow, album fetch code, or fallback random-picks logic.
- Any change to the January 1st exclusion or the "1 year ago" pluralization.
- Rework of the [CLAUDE.md](../../../CLAUDE.md) architecture section (its class list is aspirational and does not match the code; worth fixing but as a separate task).

## User-facing behavior

### The navigation row

Rendered between the `#users_albums` strip and the `#albums_released_today` list. Layout is centered arrows flanking the date label, with a small "Today" jump link to the right when off-today:

```
Found 483 saved albums.  [Reload]

     [ ‹ ]   Sun, Jul 14, 2024   [ › ]   · Today

Released 1 year ago on Jul 14, in 2024:
...
```

When the selected date is today, the forward button is disabled and the "Today" link is hidden.

### Date label format

- Same year as today: `"Sun, Jul 14"`
- Different year (occurs when navigating back across a Jan 1 boundary): `"Sun, Dec 31, 2025"`

### Navigation semantics

- **Back:** move `selectedDate` one calendar day earlier. Feb 1 → Jan 31; Mar 1 → Feb 28 (or 29 in leap years); Jan 1 → Dec 31 of the prior year. The `-MM-DD` map lookup is year-agnostic, so the year change is invisible to album filtering but reflected in the label when the year no longer matches today's year.
- **Forward:** symmetric, but disabled when `selectedDate` already equals today.
- **Today:** reset `selectedDate` to a fresh `new Date()` (start-of-day equivalence — comparing yyyy-mm-dd strings). Hidden when already on today.

### Empty-date behavior

When no albums exist for the selected `-MM-DD`, the same fallback used today is shown: the "None of your saved albums were released on ..." message plus 3 random album picks from the user's library. Picks are reshuffled on every render (matching current behavior).

### Copy adjustments

The existing copy hardcodes "today". When the selected date is a past date, replace those phrases:

| Case | Selected date IS today | Selected date is past |
|---|---|---|
| Same year as selected | `Released today 🔥:` | `Released on Jul 14, YYYY:` |
| Prior year | `Released N years ago today, in YYYY:` | `Released N years ago on Jul 14, in YYYY:` |
| Empty state | `None of your saved albums were released on July 16th. But how about revisiting one of the following?` | Same wording with the selected month and day. |

The 🔥 fire icon appears only when the selected date IS today (the "heat" metaphor doesn't apply to past dates).

## Implementation approach

Minimal patch to the existing procedural code in [public/scripts.js](../../../public/scripts.js). No class introduction, no wider refactor.

### New module-level state

```js
let selectedDate = new Date(); // initialized on load, never persisted
```

Plus derived helpers `getSelectedMonthDay()` returning `-MM-DD` and `getSelectedYear()` returning the calendar year.

`getTodaysMonthDay()` and `getTodaysYear()` are kept and used only to compute "is the selected date today?" (via yyyy-mm-dd string equality) for the forward-button disable and the Today link visibility.

### Rename and parameterize

`populateTodaysAlbums()` → `populateAlbumsForSelectedDate()`. It reads from `selectedDate` (via the helpers) instead of calling `getTodaysMonthDay()` / `getTodaysYear()` directly.

Called from:
- End of `spotifyGetUsersSavedAlbums()` (initial render after load)
- The cached-data early-return branch in the same function
- Click handlers on `#date_prev`, `#date_next`, `#date_today`

### New small functions

- `renderDateNav()` — updates `#date_label`, toggles `#date_next` `disabled`, toggles `#date_today` `hidden`, removes the `hidden` attribute on `#date_nav` on first call. Called from the same paths as `populateAlbumsForSelectedDate()`.
- `initDateNav()` — wires the three click handlers once, after the first render. Handlers mutate `selectedDate`, then call `renderDateNav()` + `populateAlbumsForSelectedDate()`.
- `isSelectedDateToday()` — small predicate used by `renderDateNav()`.

### DOM additions in [public/index.html](../../../public/index.html)

Inserted between `#users_albums` and `#albums_released_today`:

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

The container is `hidden` until albums finish loading, avoiding a half-rendered intermediate state during auth/fetch.

### CSS additions in [public/styles.css](../../../public/styles.css)

- `.date-nav` — flexbox, centered, `gap: 12px`, modest vertical margin.
- `.date-nav-btn` — ~40×40px circular-ish button, existing `--button-color` palette, disabled state at ~40% opacity with `cursor: default`.
- `.date-nav-label` — same sans-serif family as the rest, medium weight, a `min-width` so the row doesn't jump when the label length changes (e.g. between "Sun, Jul 14" and "Sun, Jul 14, 2024").
- `.date-nav-today` — small pill/link style, subtle, positioned after the next-button in the flex row.
- No new media query needed — flexbox with `gap` scales cleanly from iPhone width up.

## Error handling

None new. All navigation operates on in-memory data (`albumsByDate` / `albumsList`). No network calls. If the user has zero saved albums, `#date_nav` stays hidden.

## Testing

The project has no test framework. Verification is manual:

- **iPhone Safari, iPad Safari, desktop Chrome** — the row is legible and the buttons are tappable at each size.
- **Golden path** — click back, then forward, then Today. List updates correctly at each step.
- **Boundary** — at today, forward is visibly disabled and "Today" link is hidden. Clicking Today from a past date returns to today.
- **Empty date** — navigate to a date with no releases and confirm the "None of your saved albums..." message plus 3 random picks appear, and that the picks reshuffle on re-navigation.
- **Month/year boundary** — navigate from Mar 1 back to Feb 28 (or 29 in leap years) and from Jan 1 back to Dec 31 of the prior year, confirming the label shows the year on the year-crossing.

## Estimated size

~50 lines net in [public/scripts.js](../../../public/scripts.js), one small block in [public/index.html](../../../public/index.html), one small block in [public/styles.css](../../../public/styles.css).
