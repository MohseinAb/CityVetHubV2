# Mobile Sync Handoff: Seen-Only / Conditional Channels & `#Missing & Found Pets` Rules

This guide documents the backend Function (`cityvethub-operations`) and Web contracts for **Seen-Only / Conditional Community Channels** and **Automated Missing Pet Channel Posting** so the mobile app stays 100% in sync with the Web app and Appwrite backend.

> **No Appwrite database schema changes are needed.** Channel policies are stored by the backend Function inside `community_channels.description` using a `[CVP:p=<code >;c=<code >] ` prefix, which the backend automatically strips before returning `description` to clients.

---

## 1. Backend Channel Object Contract (`cityvethub-operations`)

The following Community actions now return these additional fields on every channel object (`communityOverview`, `communityChannels`, `communityChannel`, `communitySearch`):

```json
{
  "id": "channel_id",
  "name": "Missing & Found Pets",
  "description": "Cleaned description without [CVP:...] tag",
  "privacy": "public",
  "postPolicy": "missing_pet",
  "commentPolicy": "everyone",
  "isReadOnly": true,
  "isCreator": false,
  "createdByName": "CVO Admin",
  "membership": "approved",
  "canRead": true,
  "canPost": false,
  "canComment": true,
  "postRestrictionReason": "Missing & Found Pets: Normal manual posting is disabled for members. Pet owners automatically post here when declaring a pet missing under My Pets (or reporting a sighting via QR passport).",
  "commentRestrictionReason": "",
  "createdAt": "2026-..."
}
```

### Allowed Policy Values

- **`postPolicy`** (who can create normal manual posts):
  - `"everyone"` — All verified members with read access can post.
  - `"admin"` — **Seen-only:** Only CVO Administrators (`admin`) can post.
  - `"staff"` — **Seen-only:** Only CVO Administrators and Field Officers (`officer`) can post.
  - `"verified_pet"` — **Conditional:** CVO staff + Pet Owners with **at least one CVO-verified pet** (`pets` row or `pet_profiles` row with `verificationStatus === "verified"`).
  - `"missing_pet"` — **Conditional (`Missing & Found Pets`):** Normal manual posting is blocked for Pet Owners (`canPost: false`); posts are only allowed for Admins/or via verified missing-pet / sighting payloads (see Section 3).

- **`commentPolicy`** (who can comment / reply):
  - `"everyone"` — All verified members with read access can comment and reply.
  - `"staff"` — Only CVO Administrators and Field Officers can comment or reply.
  - `"admin"` — **Comments disabled for members** (Admins only; strict seen-only mode).

### Default Rule for `#Missing & Found Pets`
Even if a channel named `Missing & Found Pets` (or matching `missing ... found`) was created before this update with no `[CVP:...]` tag in `description`, the backend automatically treats it as:
- `postPolicy: "missing_pet"`
- `commentPolicy: "everyone"`

Admins can override this anytime via `communitySetPrivacy`.

---

## 2. Admin Actions (`communityCreateChannel` & `communitySetPrivacy`)

Only authenticated CVO Administrators (`admin`) can set or modify `postPolicy` and `commentPolicy` (non-admins receive HTTP `403`).

### `communityCreateChannel`
Request payload additions:
```json
{
  "name": "CVO Advisories",
  "description": "Official updates from City Vet Office",
  "privacy": "public",
  "postPolicy": "admin",
  "commentPolicy": "admin"
}
```
Response:
```json
{ "id": "...", "name": "CVO Advisories", "postPolicy": "admin", "commentPolicy": "admin" }
```

### `communitySetPrivacy`
Request payload additions:
```json
{
  "channelId": "<channelId>",
  "privacy": "public",
  "postPolicy": "missing_pet",
  "commentPolicy": "everyone"
}
```
Response:
```json
{ "privacy": "public", "postPolicy": "missing_pet", "commentPolicy": "everyone" }
```

---

## 3. Conditional Missing Pet & Sighting Posts (`communityCreatePost`)

In a `postPolicy: "missing_pet"` channel, `canPost` is `false` for Pet Owners and Field Officers, so normal manual `communityCreatePost` calls are rejected with HTTP `403`.

To allow **automatic missing pet declaration posts** and **sighting posts**, include one of these IDs in `communityCreatePost`:

1. **Declaring a pet missing (Pet Owner):**
   Pass `missingPetId`:
   ```json
   {
     "channelId": "<missingChannelId>",
     "title": "[MISSING PET] ...",
     "body": "...",
     "imageFileIds": ["<photoFileId>"],
     "missingPetId": "<pet_profiles.$id>"
   }
   ```
   - Backend checks `pet_profiles[missingPetId]` exists, `pet.ownerId === user.$id`, and the pet is currently Missing (`vitalStatus === "Missing"` or `lostFoundMessage` starts with `"[MISSING]"`).
   - **Important ordering:** Update the pet's status to `Missing` in `pet_profiles` **first**, then call `communityCreatePost` with `missingPetId`.

2. **Reporting a sighting (any verified user / QR passport scan):**
   Pass `sightingPetId`:
   ```json
   {
     "channelId": "<missingChannelId>",
     "title": "[SIGHTING] ...",
     "body": "...",
     "imageFileIds": [],
     "sightingPetId": "<pet_profiles.$id>"
   }
   ```
   - Backend checks `pet_profiles[sightingPetId]` exists and the pet is currently Missing.

> When auto-selecting `#Missing & Found Pets` in mobile code, prefer matching `channel.postPolicy === "missing_pet"` first (falling back to name matching).

---

## 4. Comment Gating (`communityComments` & `communityCreateComment`)

- **`communityComments`** now returns:
  ```json
  {
    "post": { ... },
    "comments": [ ... ],
    "canComment": true,
    "commentRestrictionReason": ""
  }
  ```
- **`communityCreateComment`** enforces `commentPolicy` server-side and returns HTTP `403` with `commentRestrictionReason` when blocked.

---

## 5. Mobile UI Sync Checklist

1. **Feed / General "Create Post" Composer:**
   - Filter the target channel dropdown to **only** channels where `channel.canRead && channel.canPost === true`.
   - Channels with `postPolicy: "missing_pet"` or seen-only rules (`canPost === false`) must **not** appear in the manual post channel picker.
2. **Channel Screen:**
   - Hide/disable the **New Post / New Discussion** button whenever `!channel.canPost`.
   - Show an info banner using `channel.postRestrictionReason` (or `channel.commentRestrictionReason` when `!channel.canComment`).
   - Display concise policy badges on channel cards/headers (e.g., `Seen Only`, `Admin Posts`, `Staff Posts`, `Verified Pets`, `Missing Alerts`, `Comments Off`, `Staff Comments`, `Comments Open`).
3. **Pet Missing Declaration Flow (`My Pets` -> Declare Missing):**
   - Find the channel with `postPolicy === "missing_pet"` (`canPost` will be `false`—do **not** filter it out for this automated flow).
   - Update `pet_profiles` to `vitalStatus: "Missing"` first, then call `communityCreatePost` with `missingPetId: pet.$id`.
4. **QR Passport / Missing Pet Sighting Flow:**
   - Target the channel with `postPolicy === "missing_pet"` and include `sightingPetId: pet.$id` in `communityCreatePost`.
5. **Comments Sheet / Modal:**
   - Use `data.canComment` from `communityComments`.
   - When `canComment === false`, hide the comment composer, reply buttons, and comment vote actions, and show `data.commentRestrictionReason`.
   - When `canComment === true` (such as inside `#Missing & Found Pets`), keep commenting and replying enabled normally.
6. **Admin Channel Settings (`Create Channel` & `Visibility & Rules`):**
   - For Admins only, add `postPolicy` (`everyone`, `admin`, `staff`, `verified_pet`, `missing_pet`) and `commentPolicy` (`everyone`, `staff`, `admin`) pickers and send them to `communityCreateChannel` / `communitySetPrivacy`.
7. **Deploy Backend:**
   - Make sure `functions/cityvethub-operations.tar.gz` has been uploaded and deployed in the Appwrite Console before testing mobile changes against live data.
