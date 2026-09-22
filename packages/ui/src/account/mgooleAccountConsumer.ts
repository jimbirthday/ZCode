import assert from "node:assert/strict";
import { loginMgooleAccount, sessionFromLoginResult } from "./mgooleAccount.js";

const accessToken = `tok-${Math.random().toString(16).slice(2)}`;
const result = await loginMgooleAccount({
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        code: 0,
        message: "success",
        data: {
          access_token: accessToken,
          refresh_token: "refresh-consumer",
          expires_in: 3600,
          token_type: "Bearer",
          user: { id: 7, email: "user@example.com", balance: 3 },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  email: "user@example.com",
  password: "correct-password",
});

const session = sessionFromLoginResult(result);
assert.equal(result.kind, "session");
assert.ok(session);
assert.equal(session.accessToken, accessToken);
assert.equal(session.authorization, `Bearer ${accessToken}`);
console.log(`consumer-session ${session.authorization.startsWith("Bearer ")}`);
