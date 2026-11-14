# CityVetHub Mobile App Integration Guide — Missing Pet QR Alerts & Hidden Community Channels

This reference document summarizes the backend Appwrite Function contracts, database conventions, and UI/notification behavior implemented on the CityVetHub web/backend so the mobile app stays 100% in sync.

---

## 1. Backend Connection Reference

* **Appwrite Endpoint:** `https://sgp.cloud.appwrite.io/v1`
* **Project ID:** `6aeff5c9002718442fdf`
* **Database ID:** `cityvethub`
* **Privileged Operations Function ID:** `cityvethub-operations`
* **Authentication:** All calls to `cityvethub-operations` require an authenticated user JWT in the `X-Appwrite-User-JWT` header (or Appwrite SDK `functions.createExecution` with an active user session/JWT).
* **Request Body:** JSON object `{ "action": "<actionName>", ...payload }`
* **Response Format:** `{ "ok": true, "data": ... }` (or HTTP 4xx/5xx with `{ "ok": false, "error": "..." }` on failure).

---

## 2. Feature 1: Declare Pet Missing & QR Scan Alerts

### A. Owner Action: Declare Missing / Mark as Found
Pet Owners can toggle a pet's missing status from their **My Pets** screen by calling `cityvethub-operations`:

* **Action:** `setPetMissingStatus`
* **Role Required:** Pet Owner (`owner`, must own the `petProfileId`)
* **Request Payload:**
  ```json
  {
    "action": "setPetMissingStatus",
    "petProfileId": "<pet_profiles.$id>",
    "missing": true,
    "lostFoundMessage": "Optional last-seen location or contact instructions (max 480 chars)"
  }
  ```
  * Pass `"missing": false` to mark the pet as found (`vitalStatus` returns to `"Alive"`).
  * `lostFoundMessage` is optional; if omitted, the existing message is preserved.
  * Note: A pet with `vitalStatus === "Deceased"` cannot be declared missing (returns `409`).
* **Backend Side Effects:**
  * Updates `pet_profiles.vitalStatus` (`"Missing"` or `"Alive"`), and `pets.vitalStatus` if verified.
  * Updates the public `pet_passports` row (`rowId === petProfileId`).

---

### B. Detecting Missing Status When Scanning a QR Code
When a user scans a pet's QR code (`.../passport.html?pet=<petProfileId>`), extract `<petProfileId>` and fetch the public row from table `pet_passports` (`rowId = petProfileId`).

* **How to detect if the pet is missing:**
  ```text
  rawNote = passport.lostFoundMessage || ""
  isMissing = (passport.vitalStatus == "Missing") || rawNote starts with "[MISSING]" (case-insensitive)
  cleanNote = rawNote with leading /^\[MISSING\]\s*/i stripped
  ```
  > **Why both checks?** `pet_profiles` has `vitalStatus`, while `pet_passports` encodes `[MISSING] ` at the start of `lostFoundMessage` (so it works without requiring extra schema columns on `pet_passports`, and also reads `vitalStatus` if present).
* **Required Mobile UI on the Digital Pet Passport Screen:**
  * If `isMissing` is `true`, display a prominent **red alert banner at the very top** of the Digital Pet Passport screen:
    * **Title:** `DECLARED MISSING PET`
    * **Body:** Display `cleanNote` (or fallback: `"This pet has been declared missing by its owner. Please contact the owner or the City Veterinary Office immediately."`).
  * Always render `cleanNote` (without `[MISSING]`) in the normal **If found** section below.

---

### C. Notifying the Owner When Someone Scans a Missing Pet's QR
Right after loading the passport on mobile, **if `isMissing` is `true`**, call `cityvethub-operations`:

* **Action:** `reportMissingPetScan`
* **Role Required:** Any signed-in user (`admin`, `officer`, or `owner`)
* **Request Payload:**
  ```json
  {
    "action": "reportMissingPetScan",
    "petProfileId": "<petProfileId>"
  }
  ```
* **Behavior & Guards (handled server-side):**
  * **Self-scan ignored:** If the logged-in scanner is the pet's owner, returns `{ "notified": false, "reason": "self_scan" }`.
  * **Non-missing ignored:** If the pet is not missing, returns `{ "notified": false, "reason": "not_missing" }`.
  * **5-minute deduplication:** Repeated scans by the same user within a 5-minute window return `{ "notified": false, "reason": "deduplicated" }` so the owner is not spammed.
  * **On success:** Returns `{ "notified": true, "petName": "...", "scannerName": "..." }`.
  * **Owner In-App Notification:** Creates a row in `pet_match_notifications` with:
    * `ownerId`: `<owner user ID>`
    * `listingId`: `<petProfileId>`
    * `petName`: `<petName>`
    * `title`: `"<petName>'s QR was scanned by <scannerName>"`
    * `pushStatus`: `"missing_scan"`
    * `isRead`: `false`
  * **Owner Push Notification:** Sends a push via Appwrite Messaging with:
    * `title`: `"Missing Pet QR Scanned: <petName>"`
    * `body`: `"<scannerName> just scanned <petName>'s QR passport."`
    * `data`: `{ "type": "missing_pet_scan", "petProfileId": "<petProfileId>" }`

---

### D. Displaying Missing-Scan Notifications in the Owner's Notification Center
* When listing rows from `pet_match_notifications` for the signed-in owner:
  * If `row.pushStatus === "missing_scan"`:
    * Label it as a **Missing Pet QR Scan** alert (instead of an Adoption Match).
    * Show `row.title` (e.g. `"Buddy's QR was scanned by Juan Dela Cruz"`).
    * Tapping it should navigate to the owner's **My Pets** / pet profile (`row.listingId` holds the `petProfileId`).
    * Mark as read using existing `markMatchNotificationRead` (`{ "action": "markMatchNotificationRead", "notificationId": row.$id }`).
* When handling incoming push notifications:
  * If `data.type === "missing_pet_scan"`, navigate to the pet profile for `data.petProfileId`.

---

## 3. Feature 2: Community Hidden Channels (`staff` & `invite`)

### A. Channel `privacy` Values (`community_channels`)
| `privacy` Value | Who Can See in Channel List | Who Can Read / Post | Can Users Request to Join? |
|---|---|---|---|
| `"public"` | Everyone | Everyone (verified to post) | No (open) |
| `"private"` | Everyone | Creator, Admin, approved members | Yes (`communityRequestJoin`) |
| `"staff"` | **Admins & Field Officers only** | Admins & Field Officers only | No (hidden from Pet Owners) |
| `"invite"` | **Admins, Creator, & invited members only** | Admins, Creator, & approved members | No (hidden unless invited) |

### B. Mobile Community UI Updates
1. **Channel List (`communityOverview`):**
   * The backend already filters out `staff` and `invite` channels from `data.channels` for users who do not have access.
   * Update channel card badges/icons to handle `"staff"` (e.g. **Staff Only**, shield icon) and `"invite"` (e.g. **Invite Only**, eye-slash icon).
   * Do **not** show a **Request to join** button for `"staff"` or `"invite"` channels.
2. **Admin Channel Creation & Visibility:**
   * When `role === "admin"`, allow selecting `"staff"` (**Hidden — Field Officers & Admins only**) and `"invite"` (**Hidden — Invited members only**) in `communityCreateChannel` and `communitySetPrivacy`.
3. **Admin / Creator Member Management (for `"invite"` & `"private"` channels):**
   * `communityChannelMembers`: `{ "action": "communityChannelMembers", "channelId": "..." }` → returns `{ "members": [{ id, userId, userName, isCreator, addedAt }] }`
   * `communitySearchUsers`: `{ "action": "communitySearchUsers", "channelId": "...", "query": "..." }` → returns `{ "users": [{ userId, fullName, barangay, role }] }`
   * `communityInviteMember`: `{ "action": "communityInviteMember", "channelId": "...", "userId": "...", "userName": "..." }` → adds/approves member and sends push `data.type = "join_status"`.
   * `communityRemoveMember`: `{ "action": "communityRemoveMember", "channelId": "...", "userId": "..." }` → removes member (creator cannot be removed).

---

## 4. Quick Mobile Implementation Checklist
- [ ] Update Digital Pet Passport screen to check `vitalStatus === "Missing" || lostFoundMessage.startsWith("[MISSING]")`, strip `[MISSING]`, and show a top red **DECLARED MISSING PET** banner.
- [ ] Call `reportMissingPetScan` on `cityvethub-operations` whenever a signed-in user scans a missing pet's QR code.
- [ ] Add **Declare Missing** / **Mark as Found** UI for Pet Owners calling `setPetMissingStatus`.
- [ ] Handle `pushStatus === "missing_scan"` in `pet_match_notifications` and push `data.type === "missing_pet_scan"`.
- [ ] Support `privacy` values `"staff"` and `"invite"` in Community channel badges/creation/visibility and member invite UI for Admins.
