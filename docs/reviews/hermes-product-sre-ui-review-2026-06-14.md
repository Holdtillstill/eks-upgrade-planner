# EKS Upgrade Planner — Product, SRE/DevOps, UI/UX Review

**Date:** 2026-06-14
**Reviewed URL:** `http://127.0.0.1:5176/app`
**Repo:** `/Users/user/eks-upgrade-planner`
**Reviewer:** Product/SRE/UI review pass
**Audience:** Implementation handoff

---

## Review scope

The review evaluated the app as:

1. **Product manager** — is this a credible product workflow for EKS upgrade planning?
2. **SRE/DevOps buyer/user** — would a platform engineer trust this while planning EKS cluster upgrades?
3. **UI/UX/frontend designer** — is the interface polished, understandable, accessible, and maintainable?

Pages/surfaces inspected in the served browser:

- Overview
- Lifecycle
- Cost, including Fleet aggregate and Single release
- Plan, including Fleet change plan, Single release, Rolling, and Blue/Green
- Scanner, including default example, empty manifest, and scan result states
- Guides, including lower code/citation sections
- Add-ons, including checklist interaction
- Packet, including waiver owner/reason behavior
- Collapsed sidebar
- Dark/light theme

Source files inspected:

- `src/App.tsx`
- `src/app-v2/App.tsx`
- `src/app-v2/data/eks-data.ts`
- `src/lib/scanner-state.ts`
- `src/app-v2/components/screens/ScannerScreen.tsx`
- `src/app-v2/components/screens/GuidesScreen.tsx`
- `src/app-v2/components/screens/CostScreen.tsx`
- `src/app-v2/components/screens/PacketScreen.tsx`
- `src/app-v2/components/layout/NavRail.tsx`
- `src/app-v2/components/ui/SegmentedControl.tsx`
- `src/app-v2/components/ui/CopyButton.tsx`

Browser console checks during page visits showed no app JavaScript errors. The review environment could not run `npm run typecheck`: the non-login shell had no `npm`, and a login-shell retry was blocked by the tool confirmation guard. Treat this as a **browser + source review**, not a test-suite validation.

---

## Executive summary

This is already much stronger than a generic portfolio demo. The app has the right product primitives for a serious EKS upgrade planner:

- lifecycle registry,
- extended-support cost model,
- upgrade hop planner,
- deprecated API scanner,
- add-on readiness checks,
- change-packet generation,
- local/no-upload trust framing,
- light/dark theme.

The visual design is generally polished and credible. The biggest problem is **trustworthiness of evidence and domain data**. For an SRE/DevOps viewer, incorrect Kubernetes removal data and contradictory approval states are high-severity issues. The app should not imply a production change is clean or approval-ready unless the evidence model supports that claim.

Top priorities:

1. Fix incorrect Kubernetes API removal data.
2. Make scanner evidence stateful and truthful.
3. Fix Packet approval/waiver contradictions.
4. Add maintenance window as a real gate.
5. Fix Guides markdown rendering.
6. Add accessibility fixes for hidden mobile nav and collapsed sidebar.

---

# Findings and required fixes

## P0 — Incorrect Kubernetes API removal data for HPA

### Problem

The app says:

```text
autoscaling/v2beta2 / HorizontalPodAutoscaler removed in k8s 1.32
```

This appears in the Scanner, Guides, and hardcoded domain data.

The review verified against the Kubernetes deprecation guide via direct fetch: `autoscaling/v2beta2` HorizontalPodAutoscaler is **no longer served as of Kubernetes v1.26**, not v1.32.

### Why this matters

This is a trust blocker. A real SRE is likely to know or verify Kubernetes API removals. If the planner gets known deprecation data wrong, the rest of the packet becomes questionable.

### Files likely affected

- `src/lib/scanner-state.ts`
- `src/app-v2/data/eks-data.ts`
- `src/app-v2/components/screens/GuidesScreen.tsx`
- Any tests/snapshots that assert the old value

### Required fix

- Change HPA removed version to `k8s 1.26` everywhere.
- Centralize deprecation rules so Scanner, Guides, Packet, and copy output derive from one source.
- Add regression tests for known API removals.
- Link scanner findings to the Kubernetes API deprecation guide, not only generic HPA docs.

### Suggested new test file

Create:

- `src/lib/scanner-state.test.ts`

Test at minimum:

- `policy/v1beta1` + `PodSecurityPolicy` reports removed in `k8s 1.25`.
- `autoscaling/v2beta2` + `HorizontalPodAutoscaler` reports removed in `k8s 1.26`.
- Scanner captures correct line numbers.
- Scanner does not report unrelated `autoscaling/v2` HPAs.

---

## P0/P1 — Empty scanner result is treated as clean evidence

### Problem

The review tested this flow:

1. Open Scanner.
2. Click **Clear manifest**.
3. Click **Scan manifest**.

The UI showed:

```text
0 findings
No deprecated API matches detected
This manifest appears clean for the modeled EKS target range.
```

Then Packet reported:

```text
API deprecation evidence
No deprecated API findings in latest scan
Passed
```

### Why this matters

An empty manifest is not evidence of a clean fleet. It is missing evidence. The app must distinguish:

- not scanned,
- empty input,
- clean scan,
- scan with findings,
- stale scan,
- failed scan.

### Required fix

Replace findings-only scanner storage with an evidence object.

Suggested model:

```ts
export type ScanStatus =
  | 'not_scanned'
  | 'empty_input'
  | 'clean'
  | 'findings'
  | 'scan_error';

export interface ScannerEvidence {
  status: ScanStatus;
  scannedAt: string | null;
  manifestLineCount: number;
  manifestHash: string | null;
  findings: ScannerFinding[];
}
```

Rules:

- Empty manifest + scan => `empty_input`, not `clean`.
- Packet API gate must not pass for `not_scanned` or `empty_input`.
- Packet should show scan timestamp, line count, and manifest hash when evidence exists.
- Overview “Deprecated APIs” KPI should distinguish `not scanned` vs `0 findings`.

### Files likely affected

- `src/lib/scanner-state.ts`
- `src/app-v2/components/screens/ScannerScreen.tsx`
- `src/app-v2/components/screens/PacketScreen.tsx`
- `src/app-v2/components/screens/OverviewScreen.tsx`
- Tests under `src/lib/` and `src/app-v2/`

---

## P1 — Packet approval state contradicts itself after waiver input

### Problem

The review entered waiver owner and waiver reason on Packet.

The top badge changed to:

```text
Approval-ready packet
```

But the red panel still said:

```text
Approval is blocked
```

Evidence gates still showed:

```text
Add-on readiness — Blocked
4/5 passed
```

The generated markdown still included unchecked gates:

```text
[ ] Add-on readiness complete
[ ] Maintenance window approved
Status: Approval-ready with waiver
```

### Why this matters

This creates a dangerous compliance/approval ambiguity. “Approval-ready” cannot coexist with “blocked” unless the product explicitly models an accepted waiver.

### Required fix

Use explicit packet statuses:

```ts
type PacketStatus =
  | 'draft'
  | 'blocked'
  | 'waiver_recorded'
  | 'approval_ready_with_waiver'
  | 'approval_ready';
```

Recommended semantics:

- `blocked`: blocking gates exist and no waiver has been recorded.
- `waiver_recorded`: waiver owner/reason entered, but app does not know whether change approver accepted it.
- `approval_ready_with_waiver`: only if app explicitly models waiver acceptance/approval.
- `approval_ready`: all required gates passed and no blockers remain.

If you do not implement waiver approval, do **not** label the packet “Approval-ready with waiver.” Use:

```text
Waiver recorded — approver review required
```

### Files likely affected

- `src/app-v2/components/screens/PacketScreen.tsx`
- Any packet markdown/report tests

---

## P1 — Maintenance window appears in packet markdown but is not a real UI gate

### Problem

Generated packet markdown includes:

```text
[ ] Maintenance window approved
```

Overview shows:

```text
Maintenance window — Not yet scheduled — Queued
```

But Packet evidence gates only count 5 gates and do not expose a real maintenance-window input/control. A packet can appear “approval-ready” while maintenance is still unapproved.

### Required fix

Make maintenance window a first-class gate in Packet and Overview.

Add fields:

- maintenance start
- maintenance end
- timezone
- impacted services
- comms channel
- change owner
- approver
- rollback owner
- status: `missing | scheduled | approved`

The packet should not be approval-ready until the maintenance gate is approved or explicitly waived.

---

## P1 — Scanner rule depth is too shallow for the current wording

### Problem

The scanner checks two sample rules. That is acceptable for a local/demo scanner, but some UI copy makes it sound more authoritative than it is.

### Required fix

Either:

### Option A — Keep it as a clearly scoped demo/static scanner

Change copy to be explicit:

```text
Demo static scanner: checks selected high-risk deprecated APIs locally. Not a complete kube-no-trouble replacement.
```

### Option B — Expand scanner credibility

Add more removed APIs by Kubernetes target version and show rule coverage:

- target version selected,
- path/hop where an API becomes blocking,
- rule count,
- last updated date,
- source citation per rule.

---

## P2 — Guides markdown rendering breaks code blocks and citations

### Problem

Guides lower sections render poorly:

- code blocks with blank lines split into multiple paragraphs,
- commands become run-on text,
- source citations render as raw markdown-ish text instead of clean links,
- ordered lists are flattened.

Likely source: `MdBody` in `GuidesScreen.tsx` splits markdown by `\n\n`, which breaks fenced code blocks that contain blank lines. It also handles bullet/list blocks before markdown-link blocks, so citation lines like `- [EKS Kubernetes versions](...)` render incorrectly.

### Required fix

Preferred: install and use a real markdown renderer:

- `react-markdown`
- `remark-gfm`
- optionally `rehype-external-links`

If adding deps is undesirable, rewrite `MdBody` to tokenize fenced code blocks before paragraph splitting and support GFM tables/links safely.

### Acceptance criteria

- Post-upgrade validation remains one code block.
- Source citations are clickable links.
- Tables render as tables.
- Ordered lists render as ordered lists.
- Bullet links render as links, not raw `[text](url)`.

---

## P2 — Add-ons readiness/status model is confusing

### Problem

The Add-ons left rail shows items like:

```text
Amazon VPC CNI
0/4 validation checks
```

But the detail panel simultaneously shows readiness gates such as:

```text
Version compatible with EKS 1.35 — Passed
Warm pool sizing reviewed — Passed
No pending IPAMD restarts — Warning
```

This makes it unclear whether an add-on is compatible, evidence-complete, warning, or blocked.

### Required fix

Separate concepts visually and in copy:

```text
Compatibility: 2 passed / 1 warning
Evidence: 0/4 captured
Overall: Warning
```

Add a small legend for left-rail colored dots:

- green = passed,
- amber = warning,
- red = blocked.

Packet add-on rows should use the same model.

---

## P2 — Hidden mobile bottom nav buttons are still focusable on desktop

### Problem

DOM inspection showed hidden mobile bottom nav buttons at desktop with zero width/height but `tabIndex: 0`.

Observed hidden focusable buttons included:

```text
Overview
Lifecycle
Cost
Plan
More…
```

### Why this matters

Keyboard users can tab into invisible controls.

### Likely file

- `src/app-v2/App.tsx`

### Required fix

Ensure mobile nav controls are not focusable/exposed when hidden. Options:

- conditionally render mobile nav based on media-query state,
- apply `inert` when hidden,
- ensure CSS truly uses `display: none` and verify tab order,
- set `aria-hidden` plus `tabIndex={-1}` for hidden descendants if necessary.

Add/adjust tests if practical.

---

## P2 — Collapsed sidebar icon buttons need explicit accessible names

### Problem

Collapsed nav uses `title`, but buttons do not have explicit `aria-label`. Active page also lacks `aria-current`.

### Likely file

- `src/app-v2/components/layout/NavRail.tsx`

### Required fix

Add:

```tsx
aria-label={collapsed ? label : undefined}
aria-current={isActive ? 'page' : undefined}
```

For collapse toggle:

```tsx
aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
```

---

## P3 — CopyButton silently swallows clipboard failures

### Problem

`CopyButton.tsx` catches clipboard errors silently:

```ts
catch { /* fallback silently */ }
```

### Required fix

Show a failure state:

```text
Copy failed — select text manually
```

or provide a fallback textarea/select behavior.

### Likely file

- `src/app-v2/components/ui/CopyButton.tsx`

---

## P3 — Microcopy polish

Improve trust and clarity:

- `ext end` → `Extended support ends`
- `5c` → `5 clusters`
- `3c` → `3 clusters`
- `4mo` → `4 months` in primary contexts
- `local scanner` → `Local scanner · no upload`
- `$0.6` → `$0.60`

Keep compact labels only where there is a tooltip or legend.

---

# Product recommendations

## Keep the current design direction

Do not throw away the UI. The current V2 shell, cards, tables, scanner, add-ons, and packet flow already feel like a credible internal platform tool. The next iteration should improve evidence semantics and correctness, not restart the design.

## Strengthen the real SRE workflow

The ideal end-to-end workflow should be:

1. Define fleet scope.
2. Confirm lifecycle risk.
3. Quantify cost exposure.
4. Scan manifests.
5. Validate add-ons.
6. Choose execution model.
7. Schedule maintenance.
8. Generate approval packet.
9. Track per-hop execution.

The app already covers most of this at a prototype level. Make the gates truthful and evidence-backed.

## Add approval-grade fields

For Packet, eventually add:

- change owner,
- approver,
- SRE reviewer,
- security reviewer,
- maintenance window,
- comms channel,
- rollback owner,
- rollback constraints,
- canary cluster,
- monitoring links,
- acceptance criteria.

---

# Implementation plan

## Task 1 — Centralize EKS deprecation rules and fix HPA removal version

**Objective:** Make deprecation data correct and single-sourced.

**Files:**

- Modify/create: `src/domain/eks/deprecations.ts` or equivalent
- Modify: `src/lib/scanner-state.ts`
- Modify: `src/app-v2/data/eks-data.ts`
- Modify: `src/app-v2/components/screens/GuidesScreen.tsx`
- Test: `src/lib/scanner-state.test.ts`

**Requirements:**

- HPA `autoscaling/v2beta2` removed in `k8s 1.26`.
- PodSecurityPolicy `policy/v1beta1` removed in `k8s 1.25`.
- Scanner, Guides, and Packet must derive from the same rule objects.

**Verification:**

- Scanner displays HPA removed in `k8s 1.26`.
- Guides table displays HPA removed in `k8s 1.26`.
- Packet markdown uses the same value.
- Unit tests pass.

---

## Task 2 — Replace findings-only scanner state with scanner evidence

**Objective:** Prevent empty/not-scanned data from being treated as clean.

**Files:**

- Modify: `src/lib/scanner-state.ts`
- Modify: `src/app-v2/components/screens/ScannerScreen.tsx`
- Modify: `src/app-v2/components/screens/PacketScreen.tsx`
- Modify: `src/app-v2/components/screens/OverviewScreen.tsx` if it reads scanner summary
- Test: `src/lib/scanner-state.test.ts`

**Requirements:**

- Store scanner evidence object with status, timestamp, line count, hash, findings.
- Empty input scan produces `empty_input`.
- Packet API gate does not pass for `not_scanned` or `empty_input`.
- UI copy must say “No manifest scanned” or “Empty manifest — no evidence captured,” not “clean.”

**Verification:**

- Clear manifest + Scan => no “appears clean” message.
- Packet shows API evidence blocked/queued for empty input.
- Load example + Scan => Packet shows findings/blocker.
- Clean non-empty manifest + Scan => Packet API evidence passes.

---

## Task 3 — Fix Packet gate/status semantics and add maintenance window gate

**Objective:** Eliminate approval contradictions and model maintenance approval explicitly.

**Files:**

- Modify: `src/app-v2/components/screens/PacketScreen.tsx`
- Possibly create: `src/lib/packet-state.ts`
- Possibly modify: `src/app-v2/components/screens/OverviewScreen.tsx`

**Requirements:**

- Implement explicit `PacketStatus`.
- Do not show “Approval-ready” while visible copy says “Approval is blocked.”
- Waiver owner/reason should produce “Waiver recorded — approver review required” unless actual waiver acceptance is modeled.
- Add maintenance window fields and gate.
- Packet markdown must match visible UI state.

**Verification:**

- No waiver + blocker => status Blocked.
- Waiver owner/reason + blocker => status Waiver recorded, not clean approval-ready.
- All gates passed + maintenance approved => Approval-ready.
- Markdown status equals visible badge/alert status.

---

## Task 4 — Fix Guides markdown rendering

**Objective:** Render guides as readable technical documentation.

**Files:**

- Modify: `src/app-v2/components/screens/GuidesScreen.tsx`
- Possibly add dependency: `react-markdown`, `remark-gfm`
- Update: `package.json` if adding dependencies

**Requirements:**

- Fenced code blocks survive blank lines.
- GFM tables render correctly.
- Ordered lists render correctly.
- Source citations are clickable links.
- Copy buttons still work for code blocks.

**Verification:**

- Visit Guides > EKS 1.31.
- Scroll to deprecated API checks, managed add-on checks, post-upgrade validation, source citations.
- Confirm commands are not flattened into run-on paragraphs.
- Confirm citations are clickable anchors.

---

## Task 5 — Accessibility fixes

**Objective:** Fix hidden focusable controls and collapsed nav labeling.

**Files:**

- Modify: `src/app-v2/App.tsx`
- Modify: `src/app-v2/components/layout/NavRail.tsx`

**Requirements:**

- Hidden desktop-invisible mobile nav buttons are not keyboard-focusable.
- Collapsed nav buttons have accessible labels.
- Active nav item has `aria-current="page"`.
- Collapse button has explicit `aria-label`.

**Verification:**

- Use keyboard Tab at desktop width; focus should not land on invisible mobile tabs.
- Collapse sidebar; screen-reader-accessible names exist for icon-only buttons.

---

## Task 6 — UI copy and copy-button polish

**Objective:** Improve trust copy and clipboard feedback.

**Files:**

- Modify: `src/app-v2/components/layout/TopBar.tsx`
- Modify: `src/app-v2/components/screens/OverviewScreen.tsx`
- Modify: `src/app-v2/components/screens/CostScreen.tsx`
- Modify: `src/app-v2/components/ui/CopyButton.tsx`

**Requirements:**

- Replace cryptic labels: `ext end`, `5c`, `4mo` in primary contexts.
- Format rate as `$0.60`.
- CopyButton shows success and failure states.

**Verification:**

- Topbar says “Extended support ends” or similar readable copy.
- Scope pills are understandable without decoding `c`.
- Clipboard failure is not silent.

---

# Validation checklist

After implementation, verify in the served browser at `http://127.0.0.1:5176/app`:

## Browser routes / flows

- Overview
  - KPIs still load.
  - Scope labels are readable.
  - Scanner/API gate reflects real scanner evidence status.

- Lifecycle
  - No visual regressions.
  - Fleet markers still render.

- Cost
  - Fleet and Single release tabs switch correctly.
  - `$0.60` formatting is used consistently.

- Plan
  - Rolling/Blue-Green still work.
  - Markdown output still updates.

- Scanner
  - Default example shows PodSecurityPolicy and HPA findings.
  - HPA says removed in `k8s 1.26`.
  - Empty scan does not say clean.
  - Clean non-empty manifest can pass.

- Guides
  - Tables, code blocks, ordered lists, bullets, and citations render correctly.

- Add-ons
  - Readiness vs validation progress is clear.
  - Checkbox progress updates.

- Packet
  - Empty/not-scanned scanner state blocks or queues API evidence.
  - Findings block API evidence.
  - Clean evidence passes API gate.
  - Maintenance window is a real gate.
  - Waiver state does not contradict visible blocker messaging.
  - Markdown matches visible status.

- Collapsed nav
  - Icon-only nav remains understandable/accessibly named.

- Dark/light theme
  - No contrast regressions.

## Commands to run if available

Run from `/Users/user/eks-upgrade-planner`:

```bash
npm run typecheck
npm test
npm run build
```

If `npm` is not available in the shell, report that honestly and still complete served-browser validation.

---

# Ready-to-paste implementation prompt

```text
You are working in /Users/user/eks-upgrade-planner.

Read docs/reviews/hermes-product-sre-ui-review-2026-06-14.md fully, then implement the required fixes. Do not redesign the whole app. Keep the current V2 visual direction. Focus on correctness, scanner evidence semantics, packet gate truthfulness, guide rendering, accessibility, and small trust-copy polish.

Must-fix items:

1. Correct Kubernetes deprecation data:
   - autoscaling/v2beta2 HorizontalPodAutoscaler is removed/no longer served as of Kubernetes v1.26, not v1.32.
   - Update every rendered UI/source reference.
   - Centralize deprecation rules so Scanner, Guides, and Packet do not duplicate values.
   - Add regression tests.

2. Scanner evidence model:
   - Replace raw findings-only scanner state with a scanner evidence object: status, scannedAt, manifestLineCount, manifestHash, findings.
   - Empty manifest scan must not render as clean.
   - Packet API evidence must not pass for not_scanned or empty_input.
   - Show timestamp/line count/hash where useful.

3. Packet gate/status semantics:
   - Remove contradiction where top badge says Approval-ready while alert says Approval is blocked.
   - Implement clear statuses: draft, blocked, waiver_recorded, approval_ready_with_waiver only if modeled, approval_ready.
   - If waiver is only entered but not approved, label it “Waiver recorded — approver review required,” not clean approval-ready.
   - Add maintenance window as a visible required gate.
   - Packet markdown must match visible UI state exactly.

4. Guides markdown rendering:
   - Fix code blocks with blank lines, GFM tables, ordered lists, bullet links, and citations.
   - Prefer react-markdown + remark-gfm if appropriate.
   - Source citations must be clickable anchors.

5. Accessibility:
   - Hidden mobile nav controls must not be focusable on desktop.
   - Collapsed sidebar icon buttons need aria-label.
   - Active nav should use aria-current="page".
   - Collapse/expand needs aria-label.

6. UI polish:
   - ext end -> Extended support ends.
   - 5c/3c -> readable cluster labels or tooltip/legend.
   - $0.6 -> $0.60.
   - CopyButton must show failure feedback rather than silently catching errors.

Verification required:
- Run npm run typecheck, npm test, npm run build if npm is available.
- Validate served browser at http://127.0.0.1:5176/app.
- Check Overview, Scanner empty/finding/clean states, Guides lower sections, Add-ons checklist, Packet with and without waiver, maintenance gate, dark/light theme, and collapsed nav.
- Provide exact files changed, commands run, and browser validation notes.
- Do not deploy cloud resources or require real AWS credentials.
```

---

## Final note

The product idea and visual foundation are strong. Do not spend the next pass making it prettier. Spend it making the tool **truthful enough for an SRE to trust**.
