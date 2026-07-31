const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20260702135000_secure_posts_with_admin_rpcs_and_view_dedupe.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/blog-api/index.ts', 'utf8');

test('migration removes the browser-callable password oracle and embedded hash', () => {
  assert.match(migration, /drop function if exists public\.verify_admin_password_rpc\(text\)/i);
  assert.match(migration, /drop function if exists public\._is_admin_password_valid\(text\)/i);
  assert.doesNotMatch(migration, /digest\(|sha256|2926a273/i);
  assert.doesNotMatch(migration, /grant execute[^;]+anon/i);
});

test('write RPCs no longer receive the administrator password', () => {
  assert.match(migration, /create or replace function public\.create_post_rpc\(\s*title text/i);
  assert.match(migration, /create or replace function public\.update_post_rpc\(\s*target_post_id bigint/i);
  assert.match(migration, /create or replace function public\.delete_post_rpc\(target_post_id bigint\)/i);
  assert.doesNotMatch(migration, /create or replace function public\.create_post_rpc\(\s*admin_password/i);
});

test('posts remain public-read while mutation and view RPCs are service-role only', () => {
  assert.match(migration, /grant select on table public\.posts to anon, authenticated/i);
  for (const signature of [
    'create_post_rpc\\(text, text, text, text, text, text\\)',
    'update_post_rpc\\(bigint, text, text, text, text, text\\)',
    'delete_post_rpc\\(bigint\\)',
    'increment_post_views_rpc\\(bigint, text\\)',
  ]) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${signature} from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to service_role`, 'i'));
  }
});

test('view events deduplicate server fingerprints by hour', () => {
  assert.match(migration, /primary key \(post_id, visitor_key, window_start\)/i);
  assert.match(migration, /date_trunc\('hour'/i);
  assert.match(migration, /on conflict do nothing/i);
});

test('edge function validates admin secrets without exposing a raw database error', () => {
  assert.match(edge, /Deno\.env\.get\('ADMIN_PASSWORD_SHA256'\)/);
  assert.match(edge, /timingSafeEqual/);
  assert.match(edge, /consumeRateLimit/);
  assert.match(edge, /VIEW_HASH_SECRET/);
  assert.match(edge, /crypto\.subtle\.sign\('HMAC'/);
  assert.match(edge, /status === 500 \? 'request failed'/);
  assert.doesNotMatch(edge, /return json\([^\n]+error\.message/);
});

test('edge CORS is origin-scoped and payload size is limited', () => {
  assert.match(edge, /Deno\.env\.get\('SITE_ORIGIN'\)/);
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin': '\*'/);
  assert.match(edge, /DEFAULT_BODY_LIMIT/);
  assert.match(edge, /payload_too_large/);
});
