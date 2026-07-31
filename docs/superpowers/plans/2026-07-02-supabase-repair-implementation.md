# Supabase Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down `public.posts`, move mutations behind RPCs, fix the remaining client consistency issues, and harden `dongchedi-user` against XSS.

**Architecture:** Keep the current static front end, add a tiny shared browser helper layer for testable pure logic, push authorization and counter mutation into Supabase `SECURITY DEFINER` functions, and make the browser consume those RPCs plus safer local persistence helpers.

**Tech Stack:** Static HTML/CSS/JS, Node built-in test runner, Supabase Postgres + RPC + RLS

---

### Task 1: Add shared browser helpers with executable regression tests

**Files:**
- Create: `D:\swnb-website\shared-browser-utils.js`
- Create: `D:\swnb-website\tests\shared-browser-utils.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  escapeHtml,
  getOrCreateVisitorKey,
  getViewWindowStart,
  safeStorageSet,
} = require('../shared-browser-utils.js');

test('escapeHtml escapes dangerous characters', () => {
  assert.equal(escapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
});

test('getOrCreateVisitorKey persists and reuses one key', () => {
  const storage = new Map();
  const api = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
  };

  const first = getOrCreateVisitorKey(api);
  const second = getOrCreateVisitorKey(api);

  assert.equal(first, second);
  assert.match(first, /^visitor_/);
});

test('getViewWindowStart rounds down to the start of the hour', () => {
  assert.equal(
    getViewWindowStart(new Date('2026-07-02T10:41:22Z')),
    '2026-07-02T10:00:00.000Z',
  );
});

test('safeStorageSet returns false instead of throwing on quota errors', () => {
  const storage = {
    setItem() {
      throw new Error('quota exceeded');
    },
  };

  assert.equal(safeStorageSet(storage, 'k', 'v'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shared-browser-utils.test.cjs`  
Expected: FAIL because `shared-browser-utils.js` does not exist yet

- [ ] **Step 3: Write minimal implementation**

```js
(function (root, factory) {
  const api = factory();
  root.SwnbShared = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeHtml(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, (char) => map[char]);
  }

  function getOrCreateVisitorKey(storage, keyName = 'swnb_visitor_key') {
    try {
      const existing = storage && storage.getItem ? storage.getItem(keyName) : null;
      if (existing) return existing;
      const created = 'visitor_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      if (storage && storage.setItem) storage.setItem(keyName, created);
      return created;
    } catch {
      return 'visitor_ephemeral';
    }
  }

  function getViewWindowStart(input) {
    const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
    date.setUTCMinutes(0, 0, 0);
    return date.toISOString();
  }

  function safeStorageSet(storage, key, value) {
    try {
      if (storage && storage.setItem) storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  return { escapeHtml, getOrCreateVisitorKey, getViewWindowStart, safeStorageSet };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shared-browser-utils.test.cjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared-browser-utils.js tests/shared-browser-utils.test.cjs
git commit -m "test: add shared browser helper coverage"
```

### Task 2: Apply the Supabase migration for RLS, RPCs, and view dedupe

**Files:**
- Modify: Supabase project `szbgotjjhurfxhyktbus` via migration

- [ ] **Step 1: Capture the failing baseline**

Run: Supabase advisors/security check for `public.posts`  
Expected: `rls_disabled_in_public` is present for `public.posts`

- [ ] **Step 2: Apply the migration**

Migration must:

```sql
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY posts_public_read
ON public.posts
FOR SELECT
TO anon, authenticated
USING (true);

CREATE TABLE public.post_view_events (
  post_id bigint NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  visitor_key text NOT NULL,
  window_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (post_id, visitor_key, window_start)
);

ALTER TABLE public.post_view_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.verify_admin_password_rpc(admin_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN encode(extensions.digest(coalesce(admin_password, ''), 'sha256'), 'hex')
    = '<server-side hash literal>';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_post_rpc(...)
RETURNS public.posts
...

CREATE OR REPLACE FUNCTION public.update_post_rpc(...)
RETURNS public.posts
...

CREATE OR REPLACE FUNCTION public.delete_post_rpc(post_id bigint, admin_password text)
RETURNS boolean
...

CREATE OR REPLACE FUNCTION public.increment_post_views_rpc(post_id bigint, visitor_key text)
RETURNS integer
...
```

- [ ] **Step 3: Verify the migration**

Checks:

1. Security advisors no longer report RLS disabled for `public.posts`
2. `public.posts` still allows anonymous `select`
3. Direct anonymous row mutations are blocked
4. `increment_post_views_rpc` increments once per `(post_id, visitor_key, hour)`

- [ ] **Step 4: Commit the migration record in project history**

```bash
git commit --allow-empty -m "feat: document Supabase repair migration applied"
```

### Task 3: Switch the main app to shared helpers, RPC mutations, and safe local persistence

**Files:**
- Modify: `D:\swnb-website\index.html`
- Modify: `D:\swnb-website\app.js`
- Create: `D:\swnb-website\tests\main-source-regression.test.cjs`

- [ ] **Step 1: Write the failing regression test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('main app no longer embeds an admin password hash', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.equal(source.includes('ADMIN_PASSWORD_HASH'), false);
});

test('main app loads the shared helper script', () => {
  const source = fs.readFileSync('index.html', 'utf8');
  assert.match(source, /shared-browser-utils\\.js/);
});

test('main app references RPC-based admin verification', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  assert.match(source, /verify_admin_password_rpc/);
  assert.match(source, /increment_post_views_rpc/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/main-source-regression.test.cjs`  
Expected: FAIL because `ADMIN_PASSWORD_HASH` is still present and RPC hooks are missing

- [ ] **Step 3: Write minimal implementation**

Implementation checklist:

1. Load `shared-browser-utils.js` before `app.js`
2. Remove `ADMIN_PASSWORD_HASH` and the now-unused client-side hash comparison
3. Add helpers for safe post/log persistence
4. Add `verify_admin_password_rpc` call for admin unlock
5. Route create/update/delete through Supabase RPCs and use returned row IDs
6. Add `visitor_key` generation plus `increment_post_views_rpc`
7. Restore local post fallback whenever cloud read fails

- [ ] **Step 4: Run regression tests**

Run: `node --test tests/shared-browser-utils.test.cjs tests/main-source-regression.test.cjs`  
Expected: PASS

- [ ] **Step 5: Static-check the main app**

Run: `node --check app.js`  
Expected: exit code 0

- [ ] **Step 6: Commit**

```bash
git add index.html app.js tests/main-source-regression.test.cjs
git commit -m "feat: move main site writes behind Supabase RPCs"
```

### Task 4: Harden dongchedi-user rendering paths against XSS

**Files:**
- Modify: `D:\swnb-website\dongchedi-user\index.html`
- Modify: `D:\swnb-website\dongchedi-user\app.js`
- Create: `D:\swnb-website\tests\dongchedi-source-regression.test.cjs`

- [ ] **Step 1: Write the failing regression test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('dongchedi page loads the shared helper script', () => {
  const source = fs.readFileSync('dongchedi-user/index.html', 'utf8');
  assert.match(source, /\\.\\.\\/shared-browser-utils\\.js/);
});

test('dongchedi app uses escapeHtml on comment text rendering', () => {
  const source = fs.readFileSync('dongchedi-user/app.js', 'utf8');
  assert.match(source, /escapeHtml\\(c\\.text\\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dongchedi-source-regression.test.cjs`  
Expected: FAIL because the shared helper is not loaded and the render path is still raw

- [ ] **Step 3: Write minimal implementation**

Implementation checklist:

1. Load `../shared-browser-utils.js` before `dongchedi-user/app.js`
2. Use shared `escapeHtml`
3. Escape all plain-text dynamic fields interpolated into `innerHTML`
4. Leave the hard-coded curated `fullContent` HTML untouched

- [ ] **Step 4: Run regression tests**

Run: `node --test tests/shared-browser-utils.test.cjs tests/dongchedi-source-regression.test.cjs`  
Expected: PASS

- [ ] **Step 5: Static-check the subproject app**

Run: `node --check dongchedi-user/app.js`  
Expected: exit code 0

- [ ] **Step 6: Commit**

```bash
git add dongchedi-user/index.html dongchedi-user/app.js tests/dongchedi-source-regression.test.cjs
git commit -m "fix: escape dongchedi-user dynamic rendering"
```

### Task 5: Full verification

**Files:**
- Verify only

- [ ] **Step 1: Run local JS verification**

Run: `node --test tests/shared-browser-utils.test.cjs tests/main-source-regression.test.cjs tests/dongchedi-source-regression.test.cjs`
Expected: PASS

- [ ] **Step 2: Run syntax verification**

Run:

```bash
node --check app.js
node --check dongchedi-user/app.js
```

Expected: both exit 0

- [ ] **Step 3: Run Supabase verification**

Checks:

1. Security advisors are clean for `public.posts`
2. RPCs exist
3. Duplicate same-window view calls with the same `visitor_key` do not keep increasing the counter

- [ ] **Step 4: Commit any final cleanups**

```bash
git add .
git commit -m "chore: finalize Supabase repair package"
```
