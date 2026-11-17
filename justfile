# One-line tasks for this project. Install just: https://github.com/casey/just (winget install Casey.Just).
# Each recipe is a plain npm script, so everything works without just too.

set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# List the recipes.
default:
    @just --list

# Install dependencies from the lockfile.
setup:
    npm ci

# Start the dev server. Needs a development build on the phone, since Health Connect is native code.
dev:
    npm start

# Run the tests, or one file: just test src/__tests__/plan.test.ts
test *args:
    npx jest {{args}}

# Typecheck, lint and test: run this before calling anything done.
check:
    npm run check

# Compile the Android bundle, as CI does.
bundle:
    npx expo export --platform android

# Dependency health, and what Expo wants updated.
doctor:
    npx expo-doctor

# Installable APK on EAS. Commit first: EAS builds what is committed.
build:
    npm run build:android

# AI evals. Not written yet: they arrive with the chatbot (issues #5 and #7).
eval:
    @echo "No evals yet. They come with the AI chat: see issues #5 and #7."
    @exit 1

# Sample data for trying the app. Not written yet.
seed:
    @echo "No seed data yet."
    @exit 1
