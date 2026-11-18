# 0008. One scrolling page of cards, not one card at a time

Status: Accepted. Replaces 0006.

In use, a button per card was the harder way to read the app: Stats > Progress alone had six, and the Plan screen
scrolled only its bottom half. Each screen is now one page that scrolls, with every card that has something to show
stacked in it (`CardStack` and `ScrollBody` in `src/components/layout.tsx`). Stats keeps Progress, Records and Health
and Race keeps its three pages as a row of buttons, but nothing below that level hides a card behind a button; the
chips inside a card that switch its chart stay. Screens with no tab bar leave the phone's navigation bar inset free at
the bottom. The cost is the lankiness 0006 set out to remove: long pages to scroll, so the most used card goes first.
