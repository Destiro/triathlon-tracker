# Layout designs (issue #6)

The complaint: the app is too lanky. Today alone is a header, a sleep card, workouts with every step spelled out, a
week summary and a strip, and you scroll past most of it to find the one thing you opened the app for. The bonus ask
was a fixed window with no scrolling, driven only by buttons.

## Options considered

**A. Trim the scroll.** Keep long pages, cut widgets. Cheap, but it is what #4 already did, and the pages are still
long: Stats alone has seven cards on one page.

**B. Fixed windows, one thing at a time.** Every tab is a fixed full-height window: a header, a row of buttons that
choose what to look at, and one card in the body. Nothing is scrolled past; you press a button to change what you see.
Costs a tap to reach the second card; gains that each screen is one glance.

**C. Swipeable pages.** The same as B but you swipe sideways between cards. Feels natural, but swipes are invisible:
nothing says there is a page to the right, and it was asked for as button presses.

**D. Home grid.** A home screen of big tiles (Workout, Sleep, Fitness, Race) each opening a full screen. Very
glanceable, but every look costs a tap in and a back out, and it adds a layer to the navigation.

**E. Bottom sheets.** A fixed home screen with details sliding up over it. Keeps context, but sheets stacked on
sheets (the Move and Add sheets already exist) get fiddly, and a lot of new gesture code for little gain.

## Choice: B

It is the only one that fixes the cause (many cards on one page) and meets the bonus ask (a window that does not
scroll), without gestures or extra depth. How it is applied:

- **Today**: a header, then two buttons, Today and This week. Today lists every workout as one line; the first one
  still to do is open, showing its steps, and tapping another opens it instead. This week has the rings and the strip.
- **Stats**: the three pages (Progress, Records, Health) each get a row of buttons, one per card, and show one card.
- **Race**: Race day keeps the countdown as a slim bar so the prediction fits. Ready? gets Road, Distance and Form
  buttons.
- **Plan**: already a fixed calendar with the chosen day under it.
- **Safety valve**: a window never clips. If one card is taller than the screen (a long checklist, a phone with a
  small display) just that body scrolls. Nothing scrolls when it fits.
