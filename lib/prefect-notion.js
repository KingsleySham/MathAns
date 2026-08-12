// Thin wrapper around the Notion REST API, in the same style as lib/whatsapp.js:
// credentials from the environment, global fetch, throws with the upstream
// message on a non-2xx.
//
//   NOTION_TOKEN – an internal integration token from notion.so/my-integrations.
//                  The database must also be shared with that integration, or
//                  every call comes back object_not_found.
//
// API VERSION IS PINNED and should not be bumped casually. From 2025-09-03
// Notion splits a database into one or more *data sources*, and querying moves
// from /v1/databases/{id}/query to /v1/data_sources/{id}/query with a different
// parent shape on page creation. 2022-06-28 keeps the single-database model this
// code is written against.
//
// The decisions this client feeds — what to map, what wins a conflict — live in
// lib/prefect-notion-sync.js, which is pure and unit-tested. This file is only I/O.

const NOTION_VERSION = '2022-06-28';
const API = 'https://api.notion.com/v1';

// Notion accepts ids with or without dashes, and a pasted page URL ends in the
// bare 32-hex id — take whichever the admin pasted into the settings field.
export function normalizeId(input) {
  // Drop the query and fragment first: a Notion URL ends in ?v=<view id>, and
  // hex characters from that view id would otherwise run into the real one.
  const path = String(input || '').split(/[?#]/)[0].replace(/-/g, '');
  const found = path.match(/[0-9a-fA-F]{32}/g);
  if (!found) return '';
  const id = found[found.length - 1].toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function authHeaders() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN is not set on the server');
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Notion's own message is far more useful than the status alone
    // ("Could not find database with ID …" tells you the share step was missed).
    const err = new Error(`Notion ${res.status}: ${data?.message || JSON.stringify(data).slice(0, 300)}`);
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

const plainText = (rich) => (Array.isArray(rich) ? rich.map((t) => t?.plain_text || '').join('') : '');

// ---------------------------------------------------------------------------
// Schema discovery — powers the property dropdowns on the update page, so the
// admin never has to type property names and a renamed column is one re-detect
// away rather than a code change.
// ---------------------------------------------------------------------------

export async function describeDatabase(databaseId) {
  const id = normalizeId(databaseId);
  if (!id) throw new Error('That does not look like a Notion database ID');

  let db;
  try {
    db = await call('GET', `/databases/${id}`);
  } catch (e) {
    // Easy and very common mix-up: the id of the *page* holding an inline
    // database, rather than the database itself. Say so, instead of leaving the
    // admin staring at "could not find".
    if (e.code === 'object_not_found') {
      let isPage = false;
      try { await call('GET', `/pages/${id}`); isPage = true; } catch { /* not a page either */ }
      if (isPage) {
        throw new Error(
          'That ID is a Notion page, not a database. Open the database as a full page '
          + '(or use its "Copy link to view"), and use the ID from that URL.',
        );
      }
      throw new Error(
        'Notion cannot see that database. Check the ID, and that the database is shared '
        + 'with your integration (••• → Connections → your integration).',
      );
    }
    throw e;
  }

  return {
    id: db.id,
    title: plainText(db.title) || 'Untitled',
    // `options` is carried for select/status columns so the update page can offer
    // the real choices in the day editor instead of a free-text box.
    properties: Object.entries(db.properties || {})
      .map(([name, p]) => ({
        name,
        type: p?.type || 'unknown',
        options: (p?.select?.options || p?.status?.options || p?.multi_select?.options || [])
          .map((o) => o?.name).filter(Boolean),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ---------------------------------------------------------------------------
// Reads and writes.
//
// Every call here is scoped to a date range by the caller (today → horizon), so
// past duty days are never fetched and therefore can never be written back or
// archived. That window is what keeps the roster's auto-purge away from the
// Notion history — see lib/prefect-notion-sync.js.
// ---------------------------------------------------------------------------

export async function queryDuties(databaseId, dateProp, fromDate, toDate) {
  const id = normalizeId(databaseId);
  if (!id) throw new Error('That does not look like a Notion database ID');

  const filter = dateProp
    ? {
      and: [
        { property: dateProp, date: { on_or_after: fromDate } },
        { property: dateProp, date: { on_or_before: toDate } },
      ],
    }
    : undefined;

  const pages = [];
  let cursor;
  // 100 per page; the bound is a runaway guard, not an expected limit — a
  // 70-day roster is one page.
  for (let i = 0; i < 25; i++) {
    const data = await call('POST', `/databases/${id}/query`, {
      page_size: 100,
      ...(filter ? { filter } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...(data.results || []));
    if (!data.has_more || !data.next_cursor) return pages;
    cursor = data.next_cursor;
  }
  return pages;
}

export function createDuty(databaseId, properties) {
  return call('POST', '/pages', {
    parent: { database_id: normalizeId(databaseId) },
    properties,
  });
}

// Page ids are used exactly as Notion gave them. normalizeId is for ids the
// admin typed or pasted; running it over a value that came back from the API
// only risks mangling it into an empty string and a request to /pages/.
export function updateDuty(pageId, properties) {
  return call('PATCH', `/pages/${encodeURIComponent(pageId)}`, { properties });
}

// Notion's "archived" is the restorable trash, not a hard delete — a duty day
// removed from the hub by mistake can be put back from Notion for 30 days.
export function archiveDuty(pageId) {
  return call('PATCH', `/pages/${encodeURIComponent(pageId)}`, { archived: true });
}
