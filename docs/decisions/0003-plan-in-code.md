# 0003. The training plan is data in the repo

Status: Accepted.

The 20-week plan is entered by hand in `src/plan/data.ts`, and the calendar is built from it by counting back from the
race date, because the source page is behind a login and the plan is fixed. Your changes (moved workouts, added gym
sessions, removed ones) are saved separately as edits layered on top, so fixing a mistake in the plan never touches
what you have done, and editing a plan day never rewrites the plan itself. The cost is that a different plan means
editing code. Where the page disagrees with itself, the plan follows the page as written.
