# Mobile Sync Handoff: Adoption Match Alerts, Outbreak Notices & Resolved Outbreak Reports

This guide documents the latest Web and Appwrite Function (`cityvethub-operations`) updates so the mobile app stays in sync for **Pet Owner** and **Field Officer** accounts.

> **Role scope:** Mobile only has **Pet Owner (`owner`)** and **Field Officer (`officer`)** users (no Admin flows are needed on mobile). No Appwrite database schema changes were made.
>
> **Important Deployment Note:** Make sure the **newly rebuilt `functions/cityvethub-operations.tar.gz`** is deployed in the Appwrite Console. It merges your latest backend updates (`addMedical` deceased/missing guard, Field Officer `submitDisease` auto-confirm, and `community.js` updates) with the `declareOutbreak` / `deactivateAlert` / TablesDB `queries[]` pagination fixes.

---

## 1. Pet Owner — Adoption Match Alerts (`pet_match_notifications`)

### Why this changed
The `pet_match_notifications` table is shared between two different notification types:
- **Adoption match alerts** (`pushStatus` is `"pending"`, `"not_requested"`, `"sent"`, or `"failed"`, and `listingId` is an `adoption_listings.$id`).
- **Missing pet collar QR scan alerts** (`pushStatus === "missing_scan"`, where `listingId` holds the `pet_profiles.$id`).

Previously, showing raw rows from `pet_match_notifications` inside the **Adoption Match Alerts** panel caused QR scan alerts (e.g., *"Bosh's QR was scanned by..."*) to show up as adoption matches.

### Required Mobile Changes (Pet Owner → Adoptions)
1. **Exclude QR scan alerts from Adoption Match Alerts:**
   - Filter `pet_match_notifications` so:
     - `pushStatus !== "missing_scan"`
     - `ownerId === currentUser.$id` (if `ownerId` is present)
   - Keep `pushStatus === "missing_scan"` rows strictly inside the **My Pets / Missing Pet Collar QR Scans** UI and general notifications feed.
2. **Show only the latest match alert:**
   - Sort the filtered adoption match notifications descending by `createdAt` (fallback `$createdAt`).
   - Display **only the single latest match alert** (`[0]`) in the **Adoption Match Alert** card (if none exist, show the empty state: *"No adoption matches yet. Matches will appear here when eligible new listings are published."*).
3. **Tap to open the matched adoption listing:**
   - Make the match alert card tappable. When tapped:
     1. Look up the listing in `adoption_listings` where `$id === notification.listingId`.
     2. If the listing does not exist or `listing.status === "adopted"`, show a message/toast: *"This adoption listing is no longer available."*
     3. Otherwise, navigate directly to / open the detail sheet for that adoption listing so the Pet Owner can inspect and apply immediately.
     4. If `!notification.isRead`, mark it as read in the background by calling the `cityvethub-operations` Function action:
        ```json
        { "action": "markAdoptionMatchRead", "notificationId": "<notification.$id>" }
        ```
   - Keep any separate **"Mark read"** button action independent so tapping it marks the alert read without forcing navigation if desired.

---

## 2. Pet Owner & Field Officer — Outbreak Declarations in Community (`Official CVO Notices`) & Home

### Why this changed
When an Admin declares an outbreak and checks **"Also notify Pet Owners"**, the backend creates an active record in `outbreak_owner_notifications` with `isOutbreak: true` and `barangay` set to the **affected outbreak location** (for example, `"Mandulog"`), and returns it inside `communityOverview.notices` with `category: "outbreak"`.

If the client filters all `notices` by the user's own barangay (`matchUserBarangay(notice.barangay)`), Pet Owners whose profile/pets are in a different barangay will receive the push/bell notification but **cannot see the outbreak declaration** inside **Community → Official CVO Notices** or the **Home Announcements** widget.

### Required Mobile Changes
1. **Never filter `outbreak` or `advisory` notices by user barangay:**
   - In **Community → Official CVO Notices**, **From CityVetHub CVO** preview, and the **Pet Owner Home Announcements** widget:
     - Always keep items where `category === "outbreak"`, `category === "advisory"`, or `isOutbreak === true` visible to all Pet Owners (as long as `isActive !== false`), regardless of the Pet Owner's barangay.
     - Only apply user-barangay matching (`matchUserBarangay`) to **`category === "announcement"`** notices that carry a `[Barangay: ...]` target tag (and always show citywide announcements where barangay is empty/`"all"`/`"citywide"`).
2. **Route Outbreak / Advisory / Official Notice taps directly to `Official Notices`:**
   - When a Pet Owner taps an Outbreak Alert, Health Advisory, or Official Announcement in the **in-app Notification drawer**, **live alert banner**, or **push notification** (`data.tab === "notices"` or `data.type === "outbreak"` / `"advisory"`):
     - Navigate to **Community** and automatically select the **Official Notices** tab (instead of landing on the Community Feed tab).
3. **Deduplicate Notification Drawer Items (if merging sources):**
   - Because `communityNotifications` / `communityOverview.notices` returns `comm_notice_<alertId>` and `outbreak_owner_notifications` / `disease_alerts` also contains `<alertId>`, deduplicate by the underlying alert `$id` so the same outbreak declaration only appears once in the notification drawer.

---

## 3. Field Officer — Resolved Outbreaks & Archived Incident Reports

### Backend Behavior (Already Live Once Function Archive Is Deployed)
When an Admin resolves/deactivates an outbreak declaration on Web (`deactivateAlert` with `isOutbreak === true` or `"Declared outbreak..."`):
- `disease_alerts` and `outbreak_owner_notifications` are updated to `isActive: false`.
- All non-archived, non-dismissed `disease_reports` matching that outbreak's normalized `barangay` and `diseaseType` are automatically updated to `status: "archived"`.

### Required Mobile Verification (Field Officer → Incident Surveillance)
No Admin resolution UI is needed on mobile. Just verify the Field Officer Surveillance screen handles resolved outbreaks cleanly:
1. **Hide archived & dismissed reports from active counts/map:**
   - Active incident report lists and counts must exclude rows where `status === "archived"` or `status === "dismissed"`.
   - Map markers and heatmaps must only render non-archived, non-dismissed cases (and confirmed cases in `disease_incidents` as currently configured).
2. **Hide inactive outbreaks on the map:**
   - Only draw pulsing outbreak barangay boundaries/beacons for `disease_alerts` rows where `isActive === true` and (`isOutbreak === true` or `title` starts with `"Declared outbreak"`).
   - Once an Admin resolves the outbreak (`isActive: false`), refreshing/reloading Surveillance should automatically clear the red outbreak polygon/beacon and archived reports.

---

## 4. Additional Merged Backend Behaviors to Accommodate on Mobile

1. **Field Officer `submitDisease` Auto-Confirmation:**
   - In `cityvethub-operations`, Field Officer (`officer`) incident reports now default to **`status: "confirmed"`** and automatically create a `disease_incidents` record (unless the mobile payload passes `keepPending: true` or `confirmImmediately: false`).
   - Make sure the Field Officer mobile UI reflects that their submitted incident reports are immediately confirmed (or pass `confirmImmediately: false` if your mobile UI has an unverified/pending submission toggle).
2. **`addMedical` Guards for Deceased & Missing Pets:**
   - Calling `addMedical` on a pet whose `vitalStatus` is `"Deceased"` or `"Missing"` now returns HTTP **`409`** with a clear message (*"Cannot record a vaccination or treatment for a deceased pet."* or *"This pet is currently declared Missing..."*).
   - Ensure the Field Officer medical form displays the backend error message cleanly (or disables treatment logging on deceased/missing pets).
3. **Community `communityChannels` & Missing Sighting `petProfileId`:**
   - A lightweight `communityChannels` action is now available alongside `communityOverview`.
   - `missing_sighting` push/notification payloads now normalize `petProfileId` to `targetPet.petProfileId || targetPet.$id`, so tapping a sighting notification should navigate cleanly using `petProfileId`.
4. **Appwrite TablesDB Pagination (`Query.limit`):**
   - Appwrite TablesDB defaults to **25 rows** if `limit` is not passed inside `queries[]` (`Query.limit(100)` / cursor pagination). Verify all mobile list queries for `disease_reports`, `disease_alerts`, `outbreak_owner_notifications`, `adoption_listings`, and `pet_match_notifications` use `Query.limit(100)` (or pagination) so records beyond the first 25 are never missed.

---

## Quick Verification Checklist for Mobile
- [ ] **Backend Function Deployed:** Latest `functions/cityvethub-operations.tar.gz` is uploaded and active in Appwrite Console (fixes `declareOutbreak` failing past 25 rows).
- [ ] **Pet Owner → Adoptions:** `Adoption Match Alert` never displays `missing_scan` QR scan alerts, shows only the single newest match, and tapping it opens that adoption listing's details (and marks it read).
- [ ] **Pet Owner → Community → Official CVO Notices:** Declared outbreaks (with *"Notify Pet Owners"* enabled) appear for **all** Pet Owners regardless of their registered barangay.
- [ ] **Pet Owner → Notification / Push Tap:** Tapping an outbreak/advisory notification opens **Community → Official Notices** directly, without duplicate entries in the notification list.
- [ ] **Field Officer → Medical & Surveillance:** Deceased/missing `409` errors on `addMedical` are surfaced cleanly, `submitDisease` auto-confirmation matches UI expectations, and resolved (`isActive: false` / `archived`) outbreaks & reports are excluded from active surveillance views.
