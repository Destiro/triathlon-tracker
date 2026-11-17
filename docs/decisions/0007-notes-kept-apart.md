# 0007. Notes and injuries are kept apart from what the watch records

Status: Accepted.

How a workout went (effort, how you felt, fuelling, a few words) is saved in its own map keyed by the workout's id, and
injuries and illnesses are their own list, rather than as extra fields on the recorded workout. Health Connect reads
replace and refresh workouts, and an older reader version re-reads them, so anything stored on the workout itself
could be lost to a sync; kept apart, a note survives any read and any restore (the backup merges them in, and the
phone's copy wins). The store exposes plain functions to save a note and to log, clear or delete an issue, so the AI chat
planned in #5 can read and change the same data as the screens without a second path. The cost is a note can outlive
a workout that was deleted from Health Connect; it just stops being shown.
