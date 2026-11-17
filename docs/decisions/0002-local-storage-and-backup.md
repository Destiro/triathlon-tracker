# 0002. Keep everything on the phone, with a backup file

Status: Accepted.

All data (workouts, health history, plan edits, settings) lives in AsyncStorage under one versioned key, because this is
a one-person app and a server would add an account, a database and a privacy question for no benefit. The risk is
losing the phone, so Settings can export a single JSON file through the share sheet and restore it later. Restoring
only adds what is missing and never removes anything, and every sync merges in the same way, so data is never lost
to a bad read.
