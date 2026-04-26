# Example: Refactor with continuous-improvement

## Scenario

Refactor authentication to use a new auth SDK (v2) across the app.

## Agent without the framework

```
You: Refactor our auth to use the new AuthSDK v2.

Agent: I'll update all auth-related files to use the new SDK.
       *changes authService.ts*
       *changes loginController.ts*
       *changes signupController.ts*
       *changes middleware/auth.ts*
       *changes userProfile.ts*
       *changes 3 test files*
       Done! I've migrated all 8 files to AuthSDK v2.

You: The build is broken.

Agent: Let me check... the types changed in v2. Fixing...
       *fixes 4 type errors*

You: Tests are failing now.

Agent: The mock structure changed. Fixing test mocks...
       *updates 3 test files*
       Wait, loginController tests still fail because I changed the
       response shape. Let me fix that...

You: The app crashes on startup. The SDK needs initialization in app.ts.

Agent: Right, v2 needs AuthSDK.init() before any calls. Adding that...
       *adds init to app.ts*
       Now the signup flow is broken because v2 sends email verification
       differently...
```

Changed 8 files in one shot. Broke the build, tests, and runtime. Spent 30 minutes debugging cascading failures.

## Agent with continuous-improvement

```
You: Refactor our auth to use the new AuthSDK v2.

Agent: **[Law 1: Research]**
       Reading AuthSDK v2 migration guide...
       - Breaking change: requires AuthSDK.init({ apiKey }) at startup
       - Breaking change: login() returns { session, user } instead of { token, user }
       - Breaking change: Session type replaces string tokens
       - Non-breaking: signup() API unchanged
       - 6 files import from authService.ts

       **[Law 2: Plan]**
       Migration order (each step independently verifiable):
       1. Add SDK init to app.ts — app should still start
       2. Update authService.ts internals — tests should still pass
       3. Update middleware/auth.ts for Session type — protected routes should work
       4. Update controllers one at a time — each with its own test run
       WILL NOT: Change all files at once, modify response shapes for clients
       VERIFY: npm test + manual login flow after each step

       **[Law 3 + Law 6: One thing, iterate]**

       Step 1: SDK initialization
       - Added AuthSDK.init() to app.ts
       ✓ App starts without error
       ✓ npm test — 45/45 passing (no behavior change yet)

       Step 2: authService.ts internals
       - Updated login() to use new SDK, adapted return type
       - Kept the same external interface for callers
       ✓ npm test — 45/45 passing

       Step 3: middleware/auth.ts
       - Updated to use Session object instead of token string
       ✓ npm test — 45/45 passing
       ✓ curl /api/users with valid session — 200 OK

       Step 4: loginController.ts
       - Uses new session response from authService
       ✓ npm test — 45/45 passing

       Step 5: signupController.ts
       - No changes needed (API unchanged in v2)
       ✓ Confirmed — already works

       **[Law 4: Verify]**
       ✓ Full test suite: 45/45 passing
       ✓ Manual flow: signup → login → access protected route → logout
       ✓ Build passes
       ✓ No unused imports or dead code from v1

       **[Law 5: Reflect]**
       - What worked: Migrating one file at a time with tests between each
       - What failed: Nothing — incremental approach caught issues early
       - What I'd do differently: Verify the unchanged path (Step 5) was
         a no-op before adding it to the plan — would have removed it from
         the WILL list and saved a planning step
       - Rule to add: "For SDK migrations, update the service layer first,
         keep external interfaces stable, then update callers"
       - Iteration — Next best recommendations (ranked, top 3):
         1. None — goal met, stop.

       Done. 4 files changed. Tests green after every step.
```

## Which laws made the difference?

| Law | Impact |
|-----|--------|
| **Law 1: Research** | Read the migration guide first — found 3 breaking changes before touching code |
| **Law 2: Plan** | Defined a safe migration order with independent verification at each step |
| **Law 3 + 6: One thing + Iterate** | Changed one file at a time, ran tests between each |
| **Law 4: Verify** | Caught issues immediately instead of after changing 8 files |
| **Law 5: Reflect** | Captured a reusable migration pattern for next time |
