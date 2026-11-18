# 0006. Fixed windows with buttons, not long scrolling pages

Status: Superseded by 0008. Options and reasoning in `docs/layout-designs.md`.

Each tab is a fixed full-height window with a header, a row of buttons choosing what to look at, and one card in the
body, rather than a long page of stacked cards. We chose it over swipeable pages (invisible), a tile home screen
(an extra layer to go in and out of) and bottom sheets (gesture-heavy) because it removes the lankiness at its cause
and needs only button presses. The cost is one tap to reach a second card. A body scrolls only when its one card is
taller than the screen, so nothing is ever cut off.
