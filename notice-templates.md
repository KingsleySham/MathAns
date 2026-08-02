# Prefect Hub — notice templates

The three notice templates from the brief (seven approved templates total:
four for the duty flow — see `api/whatsapp/README.md` — and these three).
Sent by hand from WhatsApp Manager when needed, not by code.

All category **Utility**. Per the constraints: congratulatory or social
messages belong in the WhatsApp group, not here — these exist only for
operational notices that previously lived in the roster PDF's SPECIAL
REMARKS box. Wording below is a draft; the VHP finalises the text before
submitting to Meta (template bodies are hard to change after approval).

**`prefect_schedule_change`** — a duty or roster change:

```
Prefect duty update for {{1}}: {{2}}. The duty calendar on the handbook page has been updated.
```

Samples: `Thu 25 June`, `front gate duty moves to 7:30am for the fire drill`.

**`prefect_briefing_notice`** — a meeting or briefing announcement:

```
Prefect briefing: {{1}} at {{2}}, {{3}}. Attendance is expected — tell the VHP ahead of time if you cannot come.
```

Samples: `Fri 27 June`, `1:15pm`, `Room 302`.

**`prefect_policy_notice`** — a standing-procedure change (the SPECIAL
REMARKS replacement):

```
Prefect procedures have changed: {{1}}. Full details are on the handbook page.
```

Sample: `late students now sign in at the General Office, not the gate`.
