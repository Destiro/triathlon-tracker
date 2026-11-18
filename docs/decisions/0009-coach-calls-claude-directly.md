# 0009. The coach calls Claude from the phone with your own key, and asks before changing anything

Status: Accepted.

The Coach tab is Claude (Sonnet 5.5 by default; Haiku or Opus in Settings) through Anthropic's Messages API, called
straight from the phone, because the app has no server (0002) and adding one for a single person would be more to run
than it is worth. Your API key lives in the phone's secure storage, never in the saved data, so it is never in a
backup file. Claude reads the plan, workouts, sleep and notes through tools that answer from what is on the phone, with
each lookup capped in size. Anything that would change your data comes back as a card with Apply and Cancel, and only
Apply saves it; Claude is told what you chose with your next message. The costs: each message is billed to your
Anthropic account, your training data is sent to Anthropic when the coach looks it up, and the coach needs a
connection.
