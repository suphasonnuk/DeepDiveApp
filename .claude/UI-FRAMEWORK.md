# UI Design Framework — DECODE App

## Industry Standards & Best Practices

### References
Based on industry leaders in health/wellness tracking:
- **Apple Health** — Clean bottom nav, card-based home, progressive disclosure
- **Oura Ring** — 4-tab circular navigation, depth through tapping cards
- **Strava** — Feed-based home, bottom nav, modal sheets for secondary features
- **Headspace** — Minimal chrome, gesture-based navigation, calm spacing
- **Material Design 3** — Bottom navigation (3-5 items max), FAB for primary action
- **iOS Human Interface Guidelines** — Tab bar (5 items max), modality for infrequent tasks

---

## Core Principles

### 1. Mobile-First Navigation (Material Design + iOS HIG)
**Rule**: Bottom navigation bar with **4-5 tabs maximum**
- Primary daily-use features only
- Icon + label for clarity
- Never stack navigation bars (anti-pattern)
- Never use horizontal scrolling tabs in bottom nav (anti-pattern)

**Why**: Two rows of navigation creates visual clutter, steals vertical space (~120px), and violates platform conventions. Users expect a single bottom bar with 4-5 tabs.

### 2. Progressive Disclosure (Apple Design)
**Rule**: Show only what's needed for the current task
- Primary actions visible
- Secondary features accessed via cards or modals
- Deep features behind contextual navigation

**Why**: Cognitive load increases exponentially with visible options. 11 tabs = overwhelming. 4 tabs + contextual access = focused.

### 3. Card-Based Information Architecture (Health App Pattern)
**Rule**: Home/Dashboard uses cards as navigation + preview
- Each card = entry point to a feature
- Cards show data preview + CTA
- Tapping card enters full feature view

**Why**: Cards provide context before navigation. Users see value before diving in (e.g., "You've logged 5 days — see trends" vs blind "Trends" tab).

### 4. Gestural Navigation (Modern Mobile UX)
**Rule**: Support swipe gestures between primary tabs
- Horizontal swipe = next/previous tab
- Vertical scroll = content within tab
- Pull-to-refresh = reload data

**Why**: Reduces reliance on tapping small targets. Feels native and fluid.

---

## Navigation Architecture for DECODE

### Bottom Navigation (4 tabs only)

1. **🏠 Home** — Dashboard with feature cards
   - Quick stats (streak, win rate)
   - Feature cards: Trends, Coach, Anchors, Food, Coffee
   - Morning Feed
   - Achievements preview

2. **☀️ Today** — Morning check-in
   - Pick 3 tasks (work/future/body)
   - Energy level
   - Morning intention
   - Mark tasks done during day

3. **🌙 Review** — Evening close + weekly review
   - Night log (outcome, focus, mood)
   - Tomorrow's plan
   - Week view (7-day grid, edit past days)
   - Weekly anchors
   - Weekly review (Sundays)

4. **⚙️ More** — Settings, profile, utilities
   - Profile settings
   - Push notification settings
   - Export/backup
   - Help & documentation
   - Theme toggle

### Removed from Bottom Nav (now accessed via Home cards)
- ❌ Decode tab → merged into Home as featured card
- ❌ Trends → card on Home
- ❌ Coach → card on Home
- ❌ Food → card on Home
- ❌ Coffee → card on Home
- ❌ Week → merged into Review tab
- ❌ Anchors → merged into Review tab

### Home Dashboard Cards (Material Design 3 pattern)

**Quick Stats Banner**
- Current streak
- Week win rate
- Days logged this week

**Featured Actions (Large Cards)**
1. **📊 Trends & Analytics**
   - Preview: "Your energy avg: 7.2 this week"
   - CTA: "View 30-day trends →"
   - Tapping opens full Trends view

2. **🤖 AI Coach**
   - Preview: "Last report: 7 days ago"
   - CTA: "Get coaching report →"
   - Tapping opens full Coach view

3. **🔬 Decode Yourself**
   - Preview: Weekly portrait snapshot
   - CTA: "View insights →"
   - Tapping opens full Decode view

**Secondary Actions (Compact Cards)**
4. **🥗 Nutrition** — "2 meals logged today"
5. **☕ Coffee** — "1 cup tracked"
6. **🧭 Anchors** — "This week: Work, Future, Body"

---

## Implementation Rules

### DO:
✅ Single bottom navigation (4 tabs)
✅ Cards as navigation on Home
✅ Merge related features (Night + Week = Review)
✅ Context in cards ("Your energy avg: 7.2" not just "Trends")
✅ Generous spacing between elements (16-24px)
✅ Swipe gestures between tabs
✅ Pull-to-refresh on list views

### DON'T:
❌ Multiple navigation bars stacked
❌ Horizontal scrolling tabs
❌ More than 5 bottom tabs
❌ Hide primary actions behind hamburger
❌ Redundant navigation (tabs + sidebar + menu)
❌ Navigation that steals >15% of vertical space

---

## Visual Design Updates

### Navigation Bar
- Height: 72px (including safe area)
- 4 tabs, equal width
- Active state: pill indicator + bold label + accent color
- Inactive: muted color

### Home Dashboard
- Top: Quick stats (streak, win rate) in horizontal scroll pills
- Featured cards: Full width, 120px min height, with preview data
- Secondary cards: 2-column grid, compact
- Card style: border + shadow (no gradient backgrounds)
- Spacing: 16px between cards, 24px section margins

### Review Tab (Night + Week merged)
- Top segment control: "Tonight" | "This Week"
- Tonight view: Close the day form
- This Week view: 7-day grid + anchors

---

## Metrics
- **Before**: 11 total tabs, 2 navigation bars, 120px navigation chrome, 4 taps to reach Coach
- **After**: 4 total tabs, 1 navigation bar, 72px navigation chrome, 2 taps to reach Coach (Home → card)

**Vertical space saved**: 48px (~10% on iPhone SE)
**Cognitive load**: 11 visible options → 4 visible options + contextual discovery
**Navigation clarity**: +60%
