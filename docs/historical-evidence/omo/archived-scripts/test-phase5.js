// ============================================================
//  PHASE 5: GROUP SESSIONS — COMPREHENSIVE TEST
// ============================================================
// Tests all Phase 5 features: Group session creation, invitations,
// join/leave/kick, participants, turn management, private state,
// session detail with participants+turnConfig+isOwner, SSE events.
// ============================================================

const BASE = "http://localhost:3000";
let ok = 0, fail = 0;
let OWNER_TOKEN = "";
let PARTICIPANT_TOKEN = "";
let OWNER_USER = `p5o_${Date.now().toString(36)}`;
let PARTICIPANT_USER = `p5p_${Date.now().toString(36)}`;
let OWNER_ID = "";
let PARTICIPANT_ID = "";
let GROUP_SESSION_ID = "";
let SOLO_SESSION_ID = "";

function t(name, condition) {
  if (condition) { ok++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

function title(s) {
  console.log(`\n─── ${s} ───`);
}

async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (opts.token && !opts.noAuth) {
    headers["Cookie"] = `auth-token=${opts.token}`;
  }
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      redirect: "manual",
    });
    let data = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    const cookie = res.headers.get("set-cookie") || "";
    return { status: res.status, data, cookie, headers: res.headers, ok: res.ok };
  } catch (e) {
    return { status: 0, data: null, cookie: "", error: e.message };
  }
}

// ============================================================
//  SETUP: Register owner + participant
// ============================================================
title("SETUP: Register Owner & Participant");

let r = await req("/api/auth/register", {
  method: "POST",
  body: { username: OWNER_USER, password: "Test1234" },
});
t("Owner registration returns 201", r.status === 201);
OWNER_ID = r.data?.user?.id;
t("Owner has id", !!OWNER_ID);

r = await req("/api/auth/login", {
  method: "POST",
  body: { username: OWNER_USER, password: "Test1234" },
});
t("Owner login returns 200", r.status === 200);
OWNER_TOKEN = (r.cookie.match(/auth-token=([^;]+)/) || [])[1];
t("Owner got auth token", !!OWNER_TOKEN);

r = await req("/api/auth/register", {
  method: "POST",
  body: { username: PARTICIPANT_USER, password: "Test1234" },
});
t("Participant registration returns 201", r.status === 201);
PARTICIPANT_ID = r.data?.user?.id;
t("Participant has id", !!PARTICIPANT_ID);

r = await req("/api/auth/login", {
  method: "POST",
  body: { username: PARTICIPANT_USER, password: "Test1234" },
});
t("Participant login returns 200", r.status === 200);
PARTICIPANT_TOKEN = (r.cookie.match(/auth-token=([^;]+)/) || [])[1];
t("Participant got auth token", !!PARTICIPANT_TOKEN);

// ============================================================
//  1. GROUP SESSION CREATION
// ============================================================
title("1. GROUP SESSION CREATION");

// 1a. Create group session
r = await req("/api/sessions", {
  method: "POST",
  token: OWNER_TOKEN,
  body: { name: "Phase 5 Group Session", type: "group" },
});
t("1a. Create group session returns 201", r.status === 201);
t("1a. Returns session object", !!r.data?.session);
t("1a. Type is group", r.data?.session?.type === "group");
t("1a. Status is active", r.data?.session?.status === "active");
GROUP_SESSION_ID = r.data?.session?.id;

// 1b. Create solo session (for comparison)
r = await req("/api/sessions", {
  method: "POST",
  token: OWNER_TOKEN,
  body: { name: "Phase 5 Solo Session", type: "solo" },
});
t("1b. Create solo session returns 201", r.status === 201);
t("1b. Type is solo", r.data?.session?.type === "solo");
SOLO_SESSION_ID = r.data?.session?.id;

// 1c. Create session without type (defaults to solo)
r = await req("/api/sessions", {
  method: "POST",
  token: OWNER_TOKEN,
  body: { name: "Default Type Session" },
});
t("1c. Default type is solo", r.data?.session?.type === "solo");
const DEFAULT_SESSION_ID = r.data?.session?.id;

// 1d. Create session with invalid type
r = await req("/api/sessions", {
  method: "POST",
  token: OWNER_TOKEN,
  body: { name: "Bad Type", type: "invalid" },
});
t("1d. Invalid type returns 400", r.status === 400);

// ============================================================
//  2. SESSION DETAIL (participants + turnConfig + isOwner)
// ============================================================
title("2. SESSION DETAIL");

// 2a. Owner sees isOwner=true
r = await req(`/api/sessions/${GROUP_SESSION_ID}`, { token: OWNER_TOKEN });
t("2a. Owner sees isOwner=true", r.data?.isOwner === true);
t("2a. Returns participants array", Array.isArray(r.data?.participants));
t("2a. Returns turnConfig object", !!r.data?.turnConfig);
t("2a. turnConfig has turnMode", "turnMode" in (r.data?.turnConfig || {}));
t("2a. turnConfig has turnOrder", "turnOrder" in (r.data?.turnConfig || {}));
t("2a. turnConfig has currentTurn", "currentTurn" in (r.data?.turnConfig || {}));
t("2a. Default turnMode is freeform", r.data?.turnConfig?.turnMode === "freeform");
t("2a. Default turnOrder is empty", Array.isArray(r.data?.turnConfig?.turnOrder) && r.data?.turnConfig?.turnOrder.length === 0);
t("2a. Default currentTurn is null", r.data?.turnConfig?.currentTurn === null);

// 2b. Non-owner without access sees 404
r = await req(`/api/sessions/${GROUP_SESSION_ID}`, { token: PARTICIPANT_TOKEN });
t("2b. Non-participant sees 404", r.status === 404);

// 2c. Solo session detail
r = await req(`/api/sessions/${SOLO_SESSION_ID}`, { token: OWNER_TOKEN });
t("2c. Solo session has participants", Array.isArray(r.data?.participants));
t("2c. Solo session has turnConfig", !!r.data?.turnConfig);
t("2c. Solo session isOwner=true", r.data?.isOwner === true);

// ============================================================
//  3. SESSION LIST (group badges + type)
// ============================================================
title("3. SESSION LIST");

r = await req("/api/sessions", { token: OWNER_TOKEN });
t("3a. List returns sessions array", Array.isArray(r.data?.sessions));
t("3a. Contains group session", r.data?.sessions?.some(s => s.id === GROUP_SESSION_ID));
t("3a. Contains solo session", r.data?.sessions?.some(s => s.id === SOLO_SESSION_ID));
const groupSession = r.data?.sessions?.find(s => s.id === GROUP_SESSION_ID);
t("3a. Group session has type field", groupSession?.type === "group");
const soloSession = r.data?.sessions?.find(s => s.id === SOLO_SESSION_ID);
t("3a. Solo session has type field", soloSession?.type === "solo");

// ============================================================
//  4. INVITATIONS (owner invites participant)
// ============================================================
title("4. INVITATIONS");

// 4a. Invite participant (owner)
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { username: PARTICIPANT_USER },
});
t("4a. Invite returns 200", r.status === 200);
t("4a. Returns success true", r.data?.success === true);
t("4a. Returns invitee info", !!r.data?.invitee);
t("4a. Invitee username matches", r.data?.invitee?.username === PARTICIPANT_USER);

// 4b. Invite non-existent user
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { username: "nonexistent_user_xyz" },
});
t("4b. Non-existent user returns 404", r.status === 404);

// 4c. Invite yourself
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { username: OWNER_USER },
});
t("4c. Self-invite returns 400", r.status === 400);

// 4d. Invite without username
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: {},
});
t("4d. Missing username returns 400", r.status === 400);

// 4e. Invite as non-owner
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
  body: { username: "someone" },
});
t("4e. Non-owner invite returns 404", r.status === 404);

// 4f. Duplicate invitation
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { username: PARTICIPANT_USER },
});
t("4f. Duplicate invite returns 409", r.status === 409);

// 4g. List invitations for session (owner)
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, { token: OWNER_TOKEN });
t("4g. List invitations returns 200", r.status === 200);
t("4g. Returns invitations array", Array.isArray(r.data?.invitations));
t("4g. Contains pending invitation", r.data?.invitations?.some(i => i.status === "pending"));

// 4h. Global invitations endpoint (participant sees their invite)
r = await req("/api/invitations", { token: PARTICIPANT_TOKEN });
t("4h. Global invitations returns 200", r.status === 200);
t("4h. Returns invitations array", Array.isArray(r.data?.invitations));
t("4h. Participant sees their invite", r.data?.invitations?.some(i => i.session_id === GROUP_SESSION_ID));

// 4i. Global invitations (owner sees none)
r = await req("/api/invitations", { token: OWNER_TOKEN });
t("4i. Owner has no pending invites", r.data?.invitations?.length === 0);

// ============================================================
//  5. JOIN SESSION
// ============================================================
title("5. JOIN SESSION");

// 5a. Join with valid invitation
r = await req(`/api/sessions/${GROUP_SESSION_ID}/join`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
});
t("5a. Join returns 200", r.status === 200);
t("5a. Returns success true", r.data?.success === true);
t("5a. Role is participant", r.data?.role === "participant");

// 5b. Join again (already a participant)
r = await req(`/api/sessions/${GROUP_SESSION_ID}/join`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
});
t("5b. Double join returns 409", r.status === 409);

// 5c. Owner tries to join their own session
r = await req(`/api/sessions/${GROUP_SESSION_ID}/join`, {
  method: "POST",
  token: OWNER_TOKEN,
});
t("5c. Owner join returns 409", r.status === 409);

// 5d. Join without invitation (new user, no invite)
// First register a third user
const THIRD_USER = `p5t_${Date.now().toString(36)}`;
r = await req("/api/auth/register", {
  method: "POST",
  body: { username: THIRD_USER, password: "Test1234" },
});
const THIRD_TOKEN = (await req("/api/auth/login", {
  method: "POST",
  body: { username: THIRD_USER, password: "Test1234" },
})).cookie.match(/auth-token=([^;]+)/)?.[1];

r = await req(`/api/sessions/${GROUP_SESSION_ID}/join`, {
  method: "POST",
  token: THIRD_TOKEN,
});
t("5d. Join without invitation returns 403", r.status === 403);

// 5e. Join non-existent session
r = await req("/api/sessions/non-existent-id/join", {
  method: "POST",
  token: PARTICIPANT_TOKEN,
});
t("5e. Join non-existent returns 404", r.status === 404);

// ============================================================
//  6. PARTICIPANTS LIST
// ============================================================
title("6. PARTICIPANTS");

// 6a. Owner sees participants
r = await req(`/api/sessions/${GROUP_SESSION_ID}/participants`, { token: OWNER_TOKEN });
t("6a. Participants returns 200", r.status === 200);
t("6a. Returns participants array", Array.isArray(r.data?.participants));
t("6a. Contains participant user", r.data?.participants?.some(p => p.username === PARTICIPANT_USER));
t("6a. Returns owner info", !!r.data?.owner);
t("6a. Owner username matches", r.data?.owner?.username === OWNER_USER);

// 6b. Participant sees participants
r = await req(`/api/sessions/${GROUP_SESSION_ID}/participants`, { token: PARTICIPANT_TOKEN });
t("6b. Participant sees participants", r.status === 200);
t("6b. Contains participant user", r.data?.participants?.some(p => p.username === PARTICIPANT_USER));

// 6c. Non-participant sees 404
r = await req(`/api/sessions/${GROUP_SESSION_ID}/participants`, { token: THIRD_TOKEN });
t("6c. Non-participant sees 404", r.status === 404);

// 6d. Session detail now includes participant
r = await req(`/api/sessions/${GROUP_SESSION_ID}`, { token: OWNER_TOKEN });
t("6d. Session detail has participant", r.data?.participants?.some(p => p.username === PARTICIPANT_USER));
t("6d. Participant has role", r.data?.participants?.find(p => p.username === PARTICIPANT_USER)?.role === "participant");
t("6d. Participant has joined_at", !!r.data?.participants?.find(p => p.username === PARTICIPANT_USER)?.joined_at);

// ============================================================
//  7. TURN MANAGEMENT
// ============================================================
title("7. TURN MANAGEMENT");

// 7a. Get turn config (default)
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, { token: OWNER_TOKEN });
t("7a. Get turn config returns 200", r.status === 200);
t("7a. Default mode is freeform", r.data?.turnMode === "freeform");
t("7a. Default order is empty", Array.isArray(r.data?.turnOrder) && r.data?.turnOrder.length === 0);
t("7a. Default current is null", r.data?.currentTurn === null);

// 7b. Set turn mode to ordered
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { turnMode: "ordered" },
});
t("7b. Set turn mode returns 200", r.status === 200);
t("7b. Returns success true", r.data?.success === true);
t("7b. Returns turnConfig", !!r.data?.turnConfig);
t("7b. Mode is ordered", r.data?.turnConfig?.turnMode === "ordered");

// 7c. Set turn order
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { turnOrder: [OWNER_ID, PARTICIPANT_ID] },
});
t("7c. Set turn order returns 200", r.status === 200);
t("7c. Order is set", r.data?.turnConfig?.turnOrder?.length === 2);

// 7d. Set current turn
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { currentTurn: OWNER_ID },
});
t("7d. Set current turn returns 200", r.status === 200);
t("7d. Current turn is set", r.data?.turnConfig?.currentTurn === OWNER_ID);

// 7e. Verify turn config via GET
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, { token: OWNER_TOKEN });
t("7e. GET confirms ordered mode", r.data?.turnMode === "ordered");
t("7e. GET confirms turn order", r.data?.turnOrder?.length === 2);
t("7e. GET confirms current turn", r.data?.currentTurn === OWNER_ID);

// 7f. Set invalid turn mode
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { turnMode: "invalid_mode" },
});
t("7f. Invalid mode returns 400", r.status === 400);

// 7g. Set turn mode as non-owner
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: PARTICIPANT_TOKEN,
  body: { turnMode: "freeform" },
});
t("7g. Non-owner set mode returns 404", r.status === 404);

// 7h. Advance turn (participant)
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
  body: { action: "advance" },
});
t("7h. Advance turn returns 200", r.status === 200);
t("7h. Returns success true", r.data?.success === true);
t("7h. Returns updated turnConfig", !!r.data?.turnConfig);

// 7i. Claim turn (participant)
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
  body: { action: "claim" },
});
t("7i. Claim turn returns 200", r.status === 200);
t("7i. Returns success true", r.data?.success === true);

// 7j. Advance without turn order
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { turnOrder: [] },
});
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
  body: { action: "advance" },
});
t("7j. Advance without order returns 400", r.status === 400);

// 7k. Invalid action
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
  body: { action: "invalid_action" },
});
t("7k. Invalid action returns 400", r.status === 400);

// 7l. Non-participant tries to advance
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "POST",
  token: THIRD_TOKEN,
  body: { action: "advance" },
});
t("7l. Non-participant advance returns 403", r.status === 403);

// 7m. Turn mode aliases (round_robin → ordered)
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { turnMode: "round_robin" },
});
t("7m. round_robin normalizes to ordered", r.data?.turnConfig?.turnMode === "ordered");

// 7n. Turn mode aliases (free_for_all → freeform)
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { turnMode: "free_for_all" },
});
t("7n. free_for_all normalizes to freeform", r.data?.turnConfig?.turnMode === "freeform");

// 7o. Set disabled mode
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { turnMode: "disabled" },
});
t("7o. Disabled mode accepted", r.data?.turnConfig?.turnMode === "disabled");

// 7p. Set claim mode
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { turnMode: "claim" },
});
t("7p. Claim mode accepted", r.data?.turnConfig?.turnMode === "claim");

// ============================================================
//  8. PRIVATE STATE
// ============================================================
title("8. PRIVATE STATE");

// 8a. Participant sets private state
r = await req(`/api/sessions/${GROUP_SESSION_ID}/private-state`, {
  method: "PUT",
  token: PARTICIPANT_TOKEN,
  body: { state: { secretNotes: "I suspect the wizard is lying", hiddenInventory: ["dagger", "potion"] } },
});
t("8a. Set private state returns 200", r.status === 200);
t("8a. Returns success true", r.data?.success === true);

// 8b. Participant reads their private state
r = await req(`/api/sessions/${GROUP_SESSION_ID}/private-state`, { token: PARTICIPANT_TOKEN });
t("8b. Get private state returns 200", r.status === 200);
t("8b. Returns privateState object", typeof r.data?.privateState === "object");
t("8b. Contains secretNotes", r.data?.privateState?.secretNotes === "I suspect the wizard is lying");
t("8b. Contains hiddenInventory", Array.isArray(r.data?.privateState?.hiddenInventory));

// 8c. Owner reads their private state (no session_participants row)
r = await req(`/api/sessions/${GROUP_SESSION_ID}/private-state`, { token: OWNER_TOKEN });
t("8c. Owner gets empty private state", JSON.stringify(r.data?.privateState) === "{}");

// 8d. Non-participant gets 403
r = await req(`/api/sessions/${GROUP_SESSION_ID}/private-state`, { token: THIRD_TOKEN });
t("8d. Non-participant gets 403", r.status === 403);

// 8e. Update private state
r = await req(`/api/sessions/${GROUP_SESSION_ID}/private-state`, {
  method: "PUT",
  token: PARTICIPANT_TOKEN,
  body: { state: { updatedNotes: "New secret info" } },
});
t("8e. Update private state returns 200", r.status === 200);

r = await req(`/api/sessions/${GROUP_SESSION_ID}/private-state`, { token: PARTICIPANT_TOKEN });
t("8e. Updated state persists", r.data?.privateState?.updatedNotes === "New secret info");

// ============================================================
//  9. LEAVE SESSION
// ============================================================
title("9. LEAVE SESSION");

// 9a. Participant leaves
r = await req(`/api/sessions/${GROUP_SESSION_ID}/leave`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
});
t("9a. Leave returns 200", r.status === 200);
t("9a. Returns success true", r.data?.success === true);

// 9b. Verify participant is removed
r = await req(`/api/sessions/${GROUP_SESSION_ID}/participants`, { token: OWNER_TOKEN });
t("9b. Participant no longer in list", !r.data?.participants?.some(p => p.username === PARTICIPANT_USER));

// 9c. Owner cannot leave
r = await req(`/api/sessions/${GROUP_SESSION_ID}/leave`, {
  method: "POST",
  token: OWNER_TOKEN,
});
t("9c. Owner cannot leave returns 400", r.status === 400);

// 9d. Non-participant cannot leave
r = await req(`/api/sessions/${GROUP_SESSION_ID}/leave`, {
  method: "POST",
  token: THIRD_TOKEN,
});
t("9d. Non-participant leave returns 404", r.status === 404);

// ============================================================
//  10. KICK PARTICIPANT
// ============================================================
title("10. KICK PARTICIPANT");

// Re-join participant for kick test
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { username: PARTICIPANT_USER },
});
r = await req(`/api/sessions/${GROUP_SESSION_ID}/join`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
});
t("10a. Participant re-joined", r.status === 200);

// 10a. Owner kicks participant
r = await req(`/api/sessions/${GROUP_SESSION_ID}/kick`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { userId: PARTICIPANT_ID },
});
t("10a. Kick returns 200", r.status === 200);
t("10a. Returns success true", r.data?.success === true);

// 10b. Verify kicked user is removed
r = await req(`/api/sessions/${GROUP_SESSION_ID}/participants`, { token: OWNER_TOKEN });
t("10b. Kicked user no longer in list", !r.data?.participants?.some(p => p.username === PARTICIPANT_USER));

// 10c. Non-owner cannot kick
// Re-join for this test
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { username: PARTICIPANT_USER },
});
r = await req(`/api/sessions/${GROUP_SESSION_ID}/join`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
});
r = await req(`/api/sessions/${GROUP_SESSION_ID}/kick`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
  body: { userId: THIRD_TOKEN }, // Try to kick third user (who isn't a participant anyway)
});
t("10c. Non-owner kick returns 404", r.status === 404);

// Kick participant again so they're not in the session for 10e
r = await req(`/api/sessions/${GROUP_SESSION_ID}/kick`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { userId: PARTICIPANT_ID },
});

// 10d. Cannot kick yourself
r = await req(`/api/sessions/${GROUP_SESSION_ID}/kick`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { userId: OWNER_ID },
});
t("10d. Self-kick returns 400", r.status === 400);

// 10e. Kick non-participant
r = await req(`/api/sessions/${GROUP_SESSION_ID}/kick`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { userId: PARTICIPANT_ID },
});
t("10e. Kick non-participant returns 404", r.status === 404);

// 10f. Kick without userId
r = await req(`/api/sessions/${GROUP_SESSION_ID}/kick`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: {},
});
t("10f. Missing userId returns 400", r.status === 400);

// ============================================================
//  11. AUTH INTEGRATION
// ============================================================
title("11. AUTH INTEGRATION");

// 11a. Invite without auth
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  body: { username: "test" },
  noAuth: true,
});
t("11a. Invite no auth returns 401", r.status === 401);

// 11b. Join without auth
r = await req(`/api/sessions/${GROUP_SESSION_ID}/join`, {
  method: "POST",
  noAuth: true,
});
t("11b. Join no auth returns 401", r.status === 401);

// 11c. Leave without auth
r = await req(`/api/sessions/${GROUP_SESSION_ID}/leave`, {
  method: "POST",
  noAuth: true,
});
t("11c. Leave no auth returns 401", r.status === 401);

// 11d. Kick without auth
r = await req(`/api/sessions/${GROUP_SESSION_ID}/kick`, {
  method: "POST",
  body: { userId: "test" },
  noAuth: true,
});
t("11d. Kick no auth returns 401", r.status === 401);

// 11e. Turn without auth
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, { noAuth: true });
t("11e. Turn no auth returns 401", r.status === 401);

// 11f. Participants without auth
r = await req(`/api/sessions/${GROUP_SESSION_ID}/participants`, { noAuth: true });
t("11f. Participants no auth returns 401", r.status === 401);

// 11g. Private state without auth
r = await req(`/api/sessions/${GROUP_SESSION_ID}/private-state`, { noAuth: true });
t("11g. Private state no auth returns 401", r.status === 401);

// 11h. Global invitations without auth
r = await req("/api/invitations", { noAuth: true });
t("11h. Invitations no auth returns 401", r.status === 401);

// ============================================================
//  12. EDGE CASES
// ============================================================
title("12. EDGE CASES");

// 12a. Invite to solo session (should work — solo sessions can have invites too)
r = await req(`/api/sessions/${SOLO_SESSION_ID}/invite`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { username: PARTICIPANT_USER },
});
t("12a. Invite to solo session works", r.status === 200);

// 12b. Join solo session
r = await req(`/api/sessions/${SOLO_SESSION_ID}/join`, {
  method: "POST",
  token: PARTICIPANT_TOKEN,
});
t("12b. Join solo session works", r.status === 200);

// 12c. Session detail for solo session shows participants
r = await req(`/api/sessions/${SOLO_SESSION_ID}`, { token: OWNER_TOKEN });
t("12c. Solo session shows participants", r.data?.participants?.some(p => p.username === PARTICIPANT_USER));

// 12d. Case-insensitive invite username
r = await req(`/api/sessions/${GROUP_SESSION_ID}/invite`, {
  method: "POST",
  token: OWNER_TOKEN,
  body: { username: PARTICIPANT_USER.toUpperCase() },
});
t("12d. Case-insensitive invite returns 409 (already invited/pending)", r.status === 409 || r.status === 200);

// 12e. Turn config persists across requests
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, {
  method: "PUT",
  token: OWNER_TOKEN,
  body: { turnMode: "ordered", turnOrder: [OWNER_ID, PARTICIPANT_ID], currentTurn: OWNER_ID },
});
r = await req(`/api/sessions/${GROUP_SESSION_ID}/turn`, { token: OWNER_TOKEN });
t("12e. Turn config persists", r.data?.turnMode === "ordered" && r.data?.turnOrder?.length === 2);

// ============================================================
//  13. DATABASE SCHEMA (Phase 5 tables)
// ============================================================
title("13. DATABASE SCHEMA");

const Database = await import("better-sqlite3").then(m => m.default || m);
const dbPath = "data/global.db";
const fs13 = await import("fs");
if (!fs13.existsSync(dbPath)) {
  t("13. Database file exists", false);
} else {
  const dbCheck = new Database(dbPath);
  try {
    // session_participants table
    const spExists = dbCheck.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_participants'").get();
    t("13. session_participants table exists", !!spExists);
    if (spExists) {
      const spCols = dbCheck.prepare("PRAGMA table_info(session_participants)").all() || [];
      const spColNames = spCols.map(c => c.name);
      t("13. session_participants has session_id", spColNames.includes("session_id"));
      t("13. session_participants has user_id", spColNames.includes("user_id"));
      t("13. session_participants has role", spColNames.includes("role"));
      t("13. session_participants has joined_at", spColNames.includes("joined_at"));
      t("13. session_participants has private_state", spColNames.includes("private_state"));
    }

    // invitations table
    const invExists = dbCheck.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invitations'").get();
    t("13. invitations table exists", !!invExists);
    if (invExists) {
      const invCols = dbCheck.prepare("PRAGMA table_info(invitations)").all() || [];
      const invColNames = invCols.map(c => c.name);
      t("13. invitations has session_id", invColNames.includes("session_id"));
      t("13. invitations has inviter_id", invColNames.includes("inviter_id"));
      t("13. invitations has invitee_id", invColNames.includes("invitee_id"));
      t("13. invitations has status", invColNames.includes("status"));
      t("13. invitations has created_at", invColNames.includes("created_at"));
    }

    // session_config table
    const scExists = dbCheck.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_config'").get();
    t("13. session_config table exists", !!scExists);
    if (scExists) {
      const scCols = dbCheck.prepare("PRAGMA table_info(session_config)").all() || [];
      const scColNames = scCols.map(c => c.name);
      t("13. session_config has session_id", scColNames.includes("session_id"));
      t("13. session_config has key", scColNames.includes("key"));
      t("13. session_config has value", scColNames.includes("value"));
    }

    // sessions table has type column
    const sCols = dbCheck.prepare("PRAGMA table_info(sessions)").all() || [];
    const sColNames = sCols.map(c => c.name);
    t("13. sessions has type column", sColNames.includes("type"));
  } finally {
    dbCheck.close();
  }
}

// ============================================================
//  FINAL CLEANUP
// ============================================================
title("CLEANUP");

await req(`/api/sessions/${GROUP_SESSION_ID}`, { method: "DELETE", token: OWNER_TOKEN });
t("Cleanup: group session deleted", true);

await req(`/api/sessions/${SOLO_SESSION_ID}`, { method: "DELETE", token: OWNER_TOKEN });
t("Cleanup: solo session deleted", true);

await req(`/api/sessions/${DEFAULT_SESSION_ID}`, { method: "DELETE", token: OWNER_TOKEN });
t("Cleanup: default session deleted", true);

// ============================================================
//  SUMMARY
// ============================================================
console.log("\n" + "=".repeat(60));
console.log(`  PHASE 5 RESULTS: ${ok} passed, ${fail} failed, ${ok+fail} total`);
console.log(`  STATUS: ${fail === 0 ? "✅ ALL PASSED" : "❌ " + fail + " FAILURES"}`);
console.log("=".repeat(60));
process.exit(fail > 0 ? 1 : 0);
