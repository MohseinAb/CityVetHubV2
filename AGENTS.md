# Project Architectural Rules & Agent Guidelines

## Tech Stack & Architecture
* **Frontend:** Vanilla HTML5, CSS, and JavaScript. No frontend frameworks (e.g., React, Vue) are used.
* **Backend & Database:** Appwrite (Web SDK + Serverless Node Function).
* **Routing/Structure:** Single-Page Application (SPA) shell in `index.html`. Pages/modules are dynamically mounted into containers (`#featurePanel`, `#registryPanel`, `#ownerOverviewPanel`, `#overviewPanel`).
* **Cache Busting:** All local scripts and stylesheets linked in `index.html`, `login.html`, etc. use version query strings (e.g. `?v=4.26.6`). Always bump the version when updating CSS/JS so client browsers immediately reflect changes.

---

## Quick Reference / Memory Index

### 1. Appwrite Backend Configuration
* **Endpoint:** `https://sgp.cloud.appwrite.io/v1`
* **Project ID:** `6aeff5c9002718442fdf`
* **Database ID:** `cityvethub`
* **Storage Bucket:** `cityvethub-media`
* **Privileged Operations Function ID:** `cityvethub-operations` (`functions/cityvethub-operations/`)
* **Teams / Roles:**
  * `cityvethub-admins` -> `admin`
  * `cityvethub-field-officers` -> `officer`
  * Regular authenticated users with verified profile -> `owner` (Pet Owner)
  * Unapproved officers -> `pending_officer` (routed to `pending.html`)

### 2. Database Tables Map (`config.js`)
| Logical Key | Appwrite Table ID | Purpose |
|---|---|---|
| `petRequests` | `pet_requests` | Pet registration requests pending CVO verification |
| `pets` | `pets` | Official CVO-verified pets registry |
| `petProfiles` | `pet_profiles` | Citizen inventory pet profiles (pre- or post-verification) |
| `userProfiles` | `user_profiles` | User profile data, barangay, account verification status |
| `passports` | `pet_passports` | Digital QR pet passport data |
| `medical` | `medical_records` | Vaccinations, deworming, clinical treatments |
| `diseaseReports` | `disease_reports` | Public incident reports / disease alerts |
| `diseaseIncidents` | `disease_incidents` | CVO-verified disease cases & surveillance markers |
| `diseaseAlerts` | `disease_alerts` | Field staff disease & outbreak notifications |
| `ownerAlerts` | `outbreak_owner_notifications`| Citizen/owner outbreak alerts |
| `adoptionListings`| `adoption_listings` | Pets available for citizen adoption |
| `adoptionApplications` | `adoption_applications` | Adoption adoption forms submitted by users |
| `ownership` | `ownership_history` | Pet ownership transfer & audit logs |
| `incidentCategories` | `incident_categories` | Categories for disease/incident tagging |
| `petHealthUploads` | `pet_health_uploads` | Citizen uploaded vet certificates & records |
| `passportMedical` | `pet_passport_medical` | Public health items surfaced on passport QR view |
| `idCategories` | `id_categories` | Accepted valid ID types for identity verification |
| `ownerVerificationRequests` | `owner_verification_requests` | Owner ID verification requests |
| `petMatchPreferences` | `pet_match_preferences` | Adoption notification preferences |
| `petMatchNotifications` | `pet_match_notifications` | Adoption match alerts |
| `communityChannels` | `community_channels` | Discussion channels (General, Dogs, Cats, etc.) |
| `communityMemberships` | `community_memberships` | Channel subscriptions |
| `communityPosts` | `community_posts` | Discussion feed threads |
| `communityComments`| `community_comments`| Thread replies/comments |
| `communityVotes` | `community_votes` | Likes / upvotes |
| `communityAnnouncements` | `community_announcements` | CVO official announcements (`audience: owners, officers, both`) |
| `petRegistryIds` (Internal) | `pet_registry_ids` | Internal backend concurrency mutex table for atomic CVO ID reservation (`CVH-2026-XXXX`) |

> Full live Appwrite database export with all attributes, data types, and index constraints is documented in `full_schema.md`.

### 3. Frontend Script Responsibilities (`scripts/`)
* **`config.js`**: Frozen `window.CITYVET_CONFIG` containing IDs and table names.
* **`appwrite.js`**: Core Appwrite Client wrapper (`window.CityVet`). Handles auth (`context()`, `login()`, `logout()`), `operate(action, data)` for privileged backend function calls, `subscribeRealtime()`, and error formatting.
* **`dashboard.js`**: Application controller. Shell initialization, role-based navigation, top navbar, command palette, notification dropdown, and Owner Home widgets (`loadOwnerAnnouncements`, `loadOwnerFeaturedAdoptions`, `loadOwnerCommunityDiscussions`).
* **`iligan-barangays.js`**: `window.CityVetBarangays`. 44 Iligan City barangays list, fuzzy matcher, combobox auto-suggest upgrade, universal client-side pagination & filter helper (`CV_PAGINATE`), modal enhancement.
* **`registry-v4.js`**: `window.CityVetRegistry`. Pet Registry UI for Owners (`My Pets`) and Admins/Officers (`Verification`, `Verified Pet Registry`, digital passports, QR generation). `Edit identity` (`petForm` -> `updateInventoryPet`) is enabled for all owned pets (including verified and adopted pets); `Send for verification` and `Delete pet` apply only to `draft` / `rejected` profiles. (`registry.js` is legacy and not loaded by `index.html`.)
* **`features.js`**: `window.CityVetFeatures`. Mounts standard modules:
  * `medical`: Vaccination, rabies logs, deworming, clinical treatment records.
  * `alerts`: Staff alerts & CVO notifications.
  * `adoptions`: Adoption listings management & public listings.
  * `traceability`: Microchip, QR passports, ownership change logs.
  * `users`: Account verification, role assignment.
* **`phase4-features.js`**: `window.CityVetPhase4`. Advanced modules:
  * `surveillance`: Interactive Leaflet map, Iligan barangay boundary overlays, incident reports, status filtering (`Unverified`, `Confirmed`, `Dismissed`), and staff case confirmation/dismissal (dismissed reports are excluded from the heatmap and map markers).
  * `reports`: CVO analytics, charts (Chart.js), exportable summaries.
  * `profile`: User personal settings, ID submission for CVO verification, theme toggle.
* **`community.js`**: `window.CityVetCommunity`. Community discussions, channel filtering, threaded comments, voting, CVO announcement broadcasting.
* **`auth.js`**: Handles login and registration pages (`login.html`, `register.html`), auto user-type detection, password resets.
* **`breed-catalog.js`**: Static canine/feline breed taxonomy for dropdowns.

### 4. Stylesheet Structure (`styles/`)
* **`main_styles.css` & `dashboard_styles.css`**: Core base layout, typography, navigation sidebar, top header, basic card panels.
* **`phase4.css`**: Phase 4 component designs (incident map, profile, analytics, charts, dialogs).
* **`phase422.css`**: Latest polish layer:
  * Single-row compact stat cards (`.CV_STATS`, `.P4_SUMMARY_GRID`, `.P4_REPORT_KPIS`).
  * Modern borderless pill filter dropdowns (`.CV_PAGINATE_FILTER_SELECT`).
  * Directory cards (`.CV49_DIRECTORY_CARD`) and pet cards (`.P4_PET_CARD`).
  * Pet Owner Home widgets (`.CV_OWNER_ANNOUNCE_ITEM`, `.OWNER_HERO_CARD`, `.card-panel`).
* **`community.css`**: Styles for community forum feed, channel lists, threads, comment trees.
* **`registry_styles.css` & `features_styles.css`**: Pet registry tables, verification badges, modals.
* **`buttons_styles.css` & `inputs_styles.css`**: Form controls, buttons, combobox dropdowns.

### 5. Backend Functions Architecture (`functions/cityvethub-operations/`)
* **`index.js`**: Main entrypoint for Appwrite Function (`node-22`). Verifies user JWT, enforces role authorization, and routes action calls (`createInventoryPet`, `updateInventoryPet`, `updatePetDetails`, `reviewPet`, `completeAdoption`, `transferOwnership`, `getStaffPetDirectory`, `confirmIncidentReport`, `dismissIncidentReport`, `reopenIncidentReport`, `community*`, etc.). `updateInventoryPet` lets owners update identity fields across `pet_profiles`, `pet_passports`, `pets`, `pet_requests`, and active `adoption_listings` (including adopted/verified pets, preserving `officialRegistryId`).
* **`community.js`**: Server-side logic for community discussions, channel CRUD, comment nesting, and CVO announcement publishing/filtering by role and barangay.
* **`matching.js`**: Adoption notification and preference matching engine.
* **`../cityvethub-operations.tar.gz`**: Manual Appwrite Console deployment archive. Appwrite MCP API key lacks `functions.write` scope, so always rebuild `functions/cityvethub-operations.tar.gz` (`tar -czf functions/cityvethub-operations.tar.gz -C functions/cityvethub-operations index.js community.js matching.js package.json`) whenever modifying backend function code so the user can upload it directly.

### 6. Thesis Documentation (`Thesis Paper files/`)
* **`Thesis - Abdulgani,Lucasan (1) (3).docx` & `Thesis - Abdulgani,Lucasan (1) (3) - Updated.docx`**: Main thesis manuscript (Book Antiqua 12pt, double-spaced justified prose, `Figure X.Y` captions centered below screenshots; Chapter 4 contains Pet Owner Figures `4.1`–`4.9` followed by Administrator Figures `4.10`–`4.20`). `Figure 3.4` (Entity Relationship Diagram) embeds high-resolution PNG (`cityvethub_erd.png`, 3520x2190) with clean Crow's Foot cardinality notation (`||`, `>o`), strictly parallel routing channels with zero collinear line overlaps, plain unadorned black relationship text positioned on top of horizontal lines or safely indented to the side of vertical lines with zero merging into cardinalities or table boxes, automatic line-crossover jumper curves (`⌒`), full bottom and right margin clearances (zero text clipping), header banners/domain pills removed for academic presentation, and `community_announcements` (`issuedById`) linked to `user_profiles`.
* **`Pet Owner/` & `Admin/`**: Web application screenshots organized by user role for Chapter 4 (`Description of the Prototype`).
* **`cityvethub_erd.png` & `cityvethub_erd.svg`**: Complete 27-table pure ERD assets generated from live Appwrite schema (`full_schema.md`) with Crow's Foot cardinalities, parallel routing channels, expanded column gaps (180px), vertical table gaps (60px), zero collinear overlaps, and zero text/cardinality collisions. Accompanied by interactive pan/zoom viewer `erd_viewer.html`.

---

## Design & UI Constraints (Strict)
* **Preserve Existing Designs:** Do not radically alter the current CSS, layout, or color schemes unless explicitly instructed. 
* **Match Existing Styles:** When adding new UI elements, mimic the existing CSS classes and styling patterns found in the project.
* **No Colored Left Borders:** Avoid heavy or colored left borders (e.g. `border-left: 4px solid ...`) on toasts, alerts, announcement items, or info cards. Use clean, uniform border outlines (`border: 1px solid ...`) and soft tinted backgrounds or icons instead.
* **Toast-Only Success Feedback:** Success confirmations should appear once via `window.CityVetUI.toast(..., 'success')` — do not render duplicate inline success banners on the page or replay saved notices inside `reload(true)` / `refresh(true)`.
* **No External Frameworks:** Do not introduce Tailwind CSS, Bootstrap, or other external CSS libraries. Stick to the existing vanilla CSS approach.
* **Minimal Refactoring:** Keep UI refactoring to an absolute minimum to avoid unintended visual regressions.

---

## JavaScript & Dynamic Loading Rules
* **DOM Manipulation:** All dynamic content injection should target the designated container elements in `index.html`.
* **Modularity:** Keep new JavaScript logic compartmentalized within the `scripts/` folder, separating API calls from DOM updates where possible.
* **Vanilla JS:** Use modern Vanilla JavaScript (ES6+). Do not use jQuery or suggest installing Node.js bundler dependencies unless asked.

---

## Appwrite Backend Rules
* **SDK Usage:** Use the official Appwrite Web SDK for all database, auth, and storage operations.
* **Client-Side Security:** Never expose Appwrite Server API keys in this frontend codebase. Only use the Project ID and API endpoint.
* **Data Integrity:** When writing queries or adding new database inserts, ensure the payload matches the existing implied schema used across the `scripts/` folder.
You're appwrite permission is read only

---

## Agent Operational Constraints
* **Consult & Maintain AGENTS.md:** Always reference `AGENTS.md` first to locate tables, components, and script responsibilities. Whenever adding or refactoring database collections, scripts, or architectural rules, immediately update `AGENTS.md` to keep project memory current.
* **Read Before Writing:** Always review the specific script in the `scripts/` folder and the linked CSS before making structural changes to how a page loads.
* **Scope of Changes:** If a request asks for a functional update (e.g., "fix this Appwrite query"), do not bundle it with unsolicited CSS/design changes.
* **Cache Busters:** Always update `?v=` in `index.html` (and other HTML files) whenever you modify any `.js` or `.css` file.