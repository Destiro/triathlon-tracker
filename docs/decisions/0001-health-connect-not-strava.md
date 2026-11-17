# 0001. Read workouts from Health Connect, not Strava

Status: Accepted. Replaced the Strava sync (see commit fe37d22).

The watch records the workout, Samsung Health shares it with Health Connect, and the app reads it there, so one
source gives workouts, heart rate, sleep and VO2 max with no sign-in, no server and no API limits. Strava needed a
Cloudflare Worker to hold the client secret, rate-limited the heart rate streams that zones need, and could not
supply sleep at all. The cost is that Health Connect is native code, so the app needs a development or preview
build and cannot run in Expo Go, and it only sees what Samsung Health chooses to share. Workouts saved from Strava
stay in the app untouched.
