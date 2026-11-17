# 0005. Logic in plain modules, screens only draw

Status: Accepted.

Anything that decides something (matching workouts to the plan, predicting a finish, training load, recovery) lives in a
plain TypeScript module with its own tests, and screens only call it and draw the result. This is why the logic tests
run with no phone. The cost is a few more files; every screen also gets a render test against a fake store so a crash while drawing fails in CI.
