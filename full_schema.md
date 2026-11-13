# CityVetHub Database Schema Documentation

> **Generated:** 2026-11-13T13:57:46.816Z  
> **Endpoint:** `https://sgp.cloud.appwrite.io/v1`  
> **Project ID:** `6aeff5c9002718442fdf`  
> **Database ID:** `cityvethub`  
> **Total Collections / Tables:** 27  
> **Source:** Live Inspection via Appwrite MCP Server (`tables_db_list_tables`)

---

## Executive Summary

The **CityVetHub** database is hosted on **Appwrite Cloud** (Database ID: `cityvethub`). It contains **27 structured collections/tables** partitioned across six core functional domains:
1. **User Identity & Verification:** `user_profiles`, `id_categories`, `owner_verification_requests`
2. **Pet Management, Inventory & Digital QR Traceability:** `pet_profiles`, `pet_passports`, `pet_requests`, `pets`, `pet_registry_ids`, `ownership_history`
3. **Veterinary Clinical & Medical Records:** `medical_records`, `pet_health_uploads`, `pet_passport_medical`
4. **Spatial Disease Surveillance & Outbreak Alerting:** `incident_categories`, `disease_reports`, `disease_incidents`, `disease_alerts`, `outbreak_owner_notifications`
5. **Pet Adoption & Matching Engine:** `adoption_listings`, `adoption_applications`, `pet_match_preferences`, `pet_match_notifications`
6. **Community Hub & Official Announcements:** `community_channels`, `community_memberships`, `community_posts`, `community_comments`, `community_votes`, `community_announcements`

---

## Quick Navigation / Collections Index

| # | Collection / Table ID | Display Name | Columns | Row Security | Permissions |
|---|---|---|:---:|:---:|---|
| 1 | [`pet_requests`](#pet_requests) | Pet Registration Requests | 10 | Yes | `read("team:cityvethub-admins")` |
| 2 | [`pets`](#pets) | Verified Pets | 18 | Yes | `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")` |
| 3 | [`medical_records`](#medical_records) | Medical & Vaccination Records | 8 | Yes | `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")` |
| 4 | [`disease_reports`](#disease_reports) | Unverified Disease Reports | 10 | Yes | `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")` |
| 5 | [`disease_incidents`](#disease_incidents) | Confirmed Disease Incidents | 7 | Yes | `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")` |
| 6 | [`disease_alerts`](#disease_alerts) | Official Outbreak Alerts | 10 | Yes | `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")` |
| 7 | [`adoption_listings`](#adoption_listings) | Adoption Listings | 20 | Yes | `read("users")` |
| 8 | [`adoption_applications`](#adoption_applications) | Adoption Applications | 11 | Yes | `read("team:cityvethub-admins")` |
| 9 | [`ownership_history`](#ownership_history) | Ownership History | 8 | Yes | `read("team:cityvethub-admins")` |
| 10 | [`user_profiles`](#user_profiles) | Private User Profiles | 11 | Yes | `read("team:cityvethub-admins")`, `read("any")` |
| 11 | [`pet_profiles`](#pet_profiles) | Personal Pet Inventory | 28 | Yes | `read("team:cityvethub-admins")` |
| 12 | [`pet_passports`](#pet_passports) | Public Verified Pet Passports | 17 | Yes | `read("any")` |
| 13 | [`incident_categories`](#incident_categories) | Incident Categories | 4 | Yes | `read("users")` |
| 14 | [`pet_health_uploads`](#pet_health_uploads) | Private Owner Health Uploads | 7 | Yes | `read("team:cityvethub-admins")` |
| 15 | [`pet_passport_medical`](#pet_passport_medical) | Owner-Shared Public Pet Documents | 6 | Yes | `read("any")` |
| 16 | [`pet_registry_ids`](#pet_registry_ids) | Reserved Unique CVO Pet IDs | 2 | Yes | `read("team:cityvethub-admins")` |
| 17 | [`outbreak_owner_notifications`](#outbreak_owner_notifications) | Owner-visible CVO outbreak and health notifications | 10 | Yes | `read("users")` |
| 18 | [`id_categories`](#id_categories) | Government ID Categories | 6 | Yes | `read("team:cityvethub-admins")`, `read("users")` |
| 19 | [`owner_verification_requests`](#owner_verification_requests) | Private Pet Owner Account Verification Requests | 9 | Yes | `read("team:cityvethub-admins")` |
| 20 | [`community_channels`](#community_channels) | Community Channels | 6 | Yes | `read("team:cityvethub-admins")` |
| 21 | [`community_memberships`](#community_memberships) | Community Channel Memberships | 6 | Yes | `read("team:cityvethub-admins")` |
| 22 | [`community_posts`](#community_posts) | Community Discussions | 8 | Yes | `read("team:cityvethub-admins")`, `read("any")` |
| 23 | [`community_comments`](#community_comments) | Community Comments | 8 | Yes | `read("team:cityvethub-admins")` |
| 24 | [`community_votes`](#community_votes) | Community Votes | 5 | Yes | `read("team:cityvethub-admins")` |
| 25 | [`community_announcements`](#community_announcements) | CVO Official Community Announcements | 6 | Yes | `read("team:cityvethub-admins")`, `read("any")` |
| 26 | [`pet_match_preferences`](#pet_match_preferences) | Private Adoption Matching Preferences | 9 | Yes | `read("team:cityvethub-admins")` |
| 27 | [`pet_match_notifications`](#pet_match_notifications) | Private Adoption Match Notifications | 7 | Yes | `read("team:cityvethub-admins")` |

---

## Detailed Collection Schemas

### 1. `pet_requests`

* **Collection ID:** `pet_requests`
* **Name:** Pet Registration Requests
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 10

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `ownerId` | `string` | Max Length: 64 | **Yes** | None | - |
| `ownerName` | `string` | Max Length: 128 | **Yes** | None | - |
| `petName` | `string` | Max Length: 100 | **Yes** | None | - |
| `species` | `string` | Max Length: 10 | **Yes** | None | - |
| `breed` | `string` | Max Length: 100 | **Yes** | None | - |
| `sex` | `string` | Max Length: 10 | **Yes** | None | - |
| `ageYears` | `integer` | min: 0, max: 40 | **Yes** | None | - |
| `barangay` | `string` | Max Length: 100 | **Yes** | None | - |
| `reviewStatus` | `string` | Max Length: 16 | **Yes** | None | - |
| `petProfileId` | `string` | Max Length: 36 | No | None | - |

---

### 2. `pets`

* **Collection ID:** `pets`
* **Name:** Verified Pets
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`
* **Total Attributes:** 18

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `ownerId` | `string` | Max Length: 64 | **Yes** | None | - |
| `ownerName` | `string` | Max Length: 128 | **Yes** | None | - |
| `petName` | `string` | Max Length: 100 | **Yes** | None | - |
| `species` | `string` | Max Length: 10 | **Yes** | None | - |
| `breed` | `string` | Max Length: 100 | **Yes** | None | - |
| `sex` | `string` | Max Length: 10 | **Yes** | None | - |
| `ageYears` | `integer` | min: 0, max: 40 | **Yes** | None | - |
| `barangay` | `string` | Max Length: 100 | **Yes** | None | - |
| `requestId` | `string` | Max Length: 36 | **Yes** | None | - |
| `petProfileId` | `string` | Max Length: 36 | No | None | - |
| `homeAddress` | `string` | Max Length: 200 | No | None | - |
| `photoFileId` | `string` | Max Length: 36 | No | None | - |
| `lostFoundMessage` | `string` | Max Length: 500 | No | None | - |
| `emergencyContact` | `string` | Max Length: 60 | No | None | - |
| `sharePublicAddress` | `boolean` | Boolean flag | No | None | - |
| `shareContact` | `boolean` | Boolean flag | No | None | - |
| `vaccinationStatus` | `string` | Max Length: 100 | No | None | - |
| `officialRegistryId` | `string` | Max Length: 30 | No | None | - |

---

### 3. `medical_records`

* **Collection ID:** `medical_records`
* **Name:** Medical & Vaccination Records
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`
* **Total Attributes:** 8

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `petId` | `string` | Max Length: 36 | **Yes** | None | - |
| `veterinarianId` | `string` | Max Length: 36 | **Yes** | None | - |
| `recordType` | `string` | Max Length: 20 | **Yes** | None | - |
| `medicineType` | `string` | Max Length: 100 | **Yes** | None | - |
| `description` | `string` | Max Length: 1000 | No | None | - |
| `dateAdministered` | `datetime` | ISO-8601 | **Yes** | None | - |
| `recorderNameSnapshot` | `string` | Max Length: 128 | No | None | - |
| `expiryDate` | `text` | - | No | None | - |

---

### 4. `disease_reports`

* **Collection ID:** `disease_reports`
* **Name:** Unverified Disease Reports
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`
* **Total Attributes:** 10

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `reportedById` | `string` | Max Length: 36 | **Yes** | None | - |
| `diseaseType` | `string` | Max Length: 60 | **Yes** | None | - |
| `barangay` | `string` | Max Length: 100 | No | None | - |
| `latitude` | `double` | Numeric range | **Yes** | None | - |
| `longitude` | `double` | Numeric range | **Yes** | None | - |
| `description` | `string` | Max Length: 1000 | No | None | - |
| `status` | `string` | Max Length: 16 | **Yes** | None | - |
| `reportedAt` | `datetime` | ISO-8601 | **Yes** | None | - |
| `reporterRole` | `string` | Max Length: 20 | No | None | - |
| `photoFileId` | `string` | Max Length: 36 | No | None | - |

---

### 5. `disease_incidents`

* **Collection ID:** `disease_incidents`
* **Name:** Confirmed Disease Incidents
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`
* **Total Attributes:** 7

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `reportId` | `string` | Max Length: 36 | **Yes** | None | - |
| `diseaseType` | `string` | Max Length: 60 | **Yes** | None | - |
| `barangay` | `string` | Max Length: 100 | No | None | - |
| `latitude` | `double` | Numeric range | **Yes** | None | - |
| `longitude` | `double` | Numeric range | **Yes** | None | - |
| `confirmedById` | `string` | Max Length: 36 | **Yes** | None | - |
| `confirmedAt` | `datetime` | ISO-8601 | **Yes** | None | - |

---

### 6. `disease_alerts`

* **Collection ID:** `disease_alerts`
* **Name:** Official Outbreak Alerts
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`, `read("team:cityvethub-field-officers")`
* **Total Attributes:** 10

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `title` | `string` | Max Length: 120 | **Yes** | None | - |
| `message` | `string` | Max Length: 1500 | **Yes** | None | - |
| `diseaseType` | `string` | Max Length: 60 | **Yes** | None | - |
| `barangay` | `string` | Max Length: 100 | No | None | - |
| `severity` | `string` | Max Length: 10 | **Yes** | None | - |
| `issuedById` | `string` | Max Length: 36 | **Yes** | None | - |
| `issuedAt` | `datetime` | ISO-8601 | **Yes** | None | - |
| `isActive` | `boolean` | Boolean flag | **Yes** | None | - |
| `isOutbreak` | `boolean` | Boolean flag | No | None | - |
| `notifyOwners` | `boolean` | Boolean flag | No | None | - |

---

### 7. `adoption_listings`

* **Collection ID:** `adoption_listings`
* **Name:** Adoption Listings
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("users")`
* **Total Attributes:** 20

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `petId` | `string` | Max Length: 36 | **Yes** | None | - |
| `title` | `string` | Max Length: 150 | **Yes** | None | - |
| `description` | `string` | Max Length: 1500 | No | None | - |
| `requirements` | `string` | Max Length: 1000 | No | None | - |
| `species` | `string` | Max Length: 10 | No | None | - |
| `breed` | `string` | Max Length: 100 | No | None | - |
| `barangay` | `string` | Max Length: 100 | No | None | - |
| `activityLevel` | `string` | Max Length: 12 | No | None | - |
| `housingRequirement` | `string` | Max Length: 16 | No | None | - |
| `status` | `string` | Max Length: 20 | **Yes** | None | - |
| `postedById` | `string` | Max Length: 36 | **Yes** | None | - |
| `isActive` | `boolean` | Boolean flag | **Yes** | None | - |
| `petProfileId` | `string` | Max Length: 36 | No | None | - |
| `verificationStatus` | `string` | Max Length: 20 | No | None | - |
| `photoFileId` | `string` | Max Length: 36 | No | None | - |
| `ownerAvatarFileId` | `string` | Max Length: 36 | No | None | - |
| `ownerDisplayName` | `string` | Max Length: 128 | No | None | - |
| `color` | `string` | Max Length: 50 | No | None | - |
| `sex` | `string` | Max Length: 20 | No | None | - |
| `ageYears` | `integer` | Numeric range | No | None | - |

---

### 8. `adoption_applications`

* **Collection ID:** `adoption_applications`
* **Name:** Adoption Applications
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 11

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `listingId` | `string` | Max Length: 36 | **Yes** | None | - |
| `petId` | `string` | Max Length: 36 | **Yes** | None | - |
| `applicantId` | `string` | Max Length: 36 | **Yes** | None | - |
| `applicantName` | `string` | Max Length: 128 | **Yes** | None | - |
| `message` | `string` | Max Length: 1000 | **Yes** | None | - |
| `status` | `string` | Max Length: 20 | **Yes** | None | - |
| `submittedAt` | `datetime` | ISO-8601 | **Yes** | None | - |
| `contactNumber` | `string` | Max Length: 40 | No | None | - |
| `petProfileIdSnapshot` | `string` | Max Length: 36 | No | None | - |
| `petNameSnapshot` | `string` | Max Length: 100 | No | None | - |
| `listingTitleSnapshot` | `string` | Max Length: 150 | No | None | - |

---

### 9. `ownership_history`

* **Collection ID:** `ownership_history`
* **Name:** Ownership History
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 8

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `petId` | `string` | Max Length: 36 | **Yes** | None | - |
| `previousOwnerId` | `string` | Max Length: 36 | **Yes** | None | - |
| `newOwnerId` | `string` | Max Length: 36 | **Yes** | None | - |
| `transferType` | `string` | Max Length: 40 | **Yes** | None | - |
| `transferDate` | `datetime` | ISO-8601 | **Yes** | None | - |
| `previousOwnerName` | `string` | Max Length: 128 | No | None | - |
| `newOwnerName` | `string` | Max Length: 128 | No | None | - |
| `petName` | `text` | - | No | None | - |

---

### 10. `user_profiles`

* **Collection ID:** `user_profiles`
* **Name:** Private User Profiles
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`, `read("any")`
* **Total Attributes:** 11

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `userId` | `string` | Max Length: 36 | No | None | - |
| `fullName` | `string` | Max Length: 128 | No | None | - |
| `phone` | `string` | Max Length: 40 | No | None | - |
| `address` | `string` | Max Length: 200 | No | None | - |
| `barangay` | `string` | Max Length: 100 | No | None | - |
| `profileImageId` | `string` | Max Length: 36 | No | None | - |
| `position` | `string` | Max Length: 100 | No | None | - |
| `employeeId` | `string` | Max Length: 60 | No | None | - |
| `assignedArea` | `string` | Max Length: 100 | No | None | - |
| `shareAvatarOnListings` | `boolean` | Boolean flag | No | None | - |
| `accountVerificationStatus` | `string` | Max Length: 20 | No | None | - |

---

### 11. `pet_profiles`

* **Collection ID:** `pet_profiles`
* **Name:** Personal Pet Inventory
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 28

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `ownerId` | `string` | Max Length: 36 | No | None | - |
| `petName` | `string` | Max Length: 100 | No | None | - |
| `species` | `string` | Max Length: 10 | No | None | - |
| `breed` | `string` | Max Length: 100 | No | None | - |
| `sex` | `string` | Max Length: 10 | No | None | - |
| `ageYears` | `integer` | Numeric range | No | None | - |
| `barangay` | `string` | Max Length: 100 | No | None | - |
| `homeAddress` | `string` | Max Length: 200 | No | None | - |
| `photoFileId` | `string` | Max Length: 36 | No | None | - |
| `lostFoundMessage` | `string` | Max Length: 500 | No | None | - |
| `emergencyContact` | `string` | Max Length: 60 | No | None | - |
| `sharePublicAddress` | `boolean` | Boolean flag | No | None | - |
| `shareContact` | `boolean` | Boolean flag | No | None | - |
| `verificationStatus` | `string` | Max Length: 20 | No | None | - |
| `latestRequestId` | `string` | Max Length: 36 | No | None | - |
| `profileTitle` | `string` | Max Length: 100 | No | None | - |
| `profileDescription` | `string` | Max Length: 1500 | No | None | - |
| `shareOwnerName` | `boolean` | Boolean flag | No | None | - |
| `sharePublicPhoto` | `boolean` | Boolean flag | No | None | - |
| `vaccinationStatus` | `string` | Max Length: 100 | No | None | - |
| `officialRegistryId` | `string` | Max Length: 30 | No | None | - |
| `ancestry` | `text` | - | No | None | - |
| `vitalStatus` | `string` | Enum: `"Alive"`, `"Deceased"`, `"Missing"` | No | None | - |
| `ancestryParentId` | `string` | Max Length: 36 | No | None | - |
| `ancestryParentName` | `string` | Max Length: 100 | No | None | - |
| `color` | `string` | Max Length: 50 | No | None | - |
| `ancestryParent2Id` | `text` | - | No | None | - |
| `ancestryParent2Name` | `text` | - | No | None | - |

---

### 12. `pet_passports`

* **Collection ID:** `pet_passports`
* **Name:** Public Verified Pet Passports
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("any")`
* **Total Attributes:** 17

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `petId` | `string` | Max Length: 36 | No | None | - |
| `petName` | `string` | Max Length: 100 | No | None | - |
| `species` | `string` | Max Length: 10 | No | None | - |
| `breed` | `string` | Max Length: 100 | No | None | - |
| `sex` | `string` | Max Length: 10 | No | None | - |
| `ageYears` | `integer` | Numeric range | No | None | - |
| `barangay` | `string` | Max Length: 100 | No | None | - |
| `ownerName` | `string` | Max Length: 128 | No | None | - |
| `displayAddress` | `string` | Max Length: 200 | No | None | - |
| `contact` | `string` | Max Length: 60 | No | None | - |
| `lostFoundMessage` | `string` | Max Length: 500 | No | None | - |
| `photoFileId` | `string` | Max Length: 36 | No | None | - |
| `vaccinationStatus` | `string` | Max Length: 100 | No | None | - |
| `profileTitle` | `string` | Max Length: 100 | No | None | - |
| `profileDescription` | `string` | Max Length: 1500 | No | None | - |
| `verificationStatus` | `string` | Max Length: 20 | No | None | - |
| `officialRegistryId` | `string` | Max Length: 30 | No | None | - |

---

### 13. `incident_categories`

* **Collection ID:** `incident_categories`
* **Name:** Incident Categories
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("users")`
* **Total Attributes:** 4

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `name` | `string` | Max Length: 60 | No | None | - |
| `description` | `string` | Max Length: 240 | No | None | - |
| `isActive` | `boolean` | Boolean flag | No | None | - |
| `createdById` | `string` | Max Length: 36 | No | None | - |

---

### 14. `pet_health_uploads`

* **Collection ID:** `pet_health_uploads`
* **Name:** Private Owner Health Uploads
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 7

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `ownerId` | `string` | Max Length: 36 | No | None | - |
| `petProfileId` | `string` | Max Length: 36 | No | None | - |
| `title` | `string` | Max Length: 120 | No | None | - |
| `recordDate` | `datetime` | ISO-8601 | No | None | - |
| `fileId` | `string` | Max Length: 36 | No | None | - |
| `sharePublic` | `boolean` | Boolean flag | No | None | - |
| `expiryDate` | `text` | - | No | None | - |

---

### 15. `pet_passport_medical`

* **Collection ID:** `pet_passport_medical`
* **Name:** Owner-Shared Public Pet Documents
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("any")`
* **Total Attributes:** 6

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `petProfileId` | `string` | Max Length: 36 | No | None | - |
| `title` | `string` | Max Length: 120 | No | None | - |
| `recordDate` | `datetime` | ISO-8601 | No | None | - |
| `fileId` | `string` | Max Length: 36 | No | None | - |
| `sourceLabel` | `string` | Max Length: 100 | No | None | - |
| `expiryDate` | `text` | - | No | None | - |

**Indexes:**

| Index Key | Type | Columns / Attributes | Orders |
|---|---|---|---|
| `by_pet` | `key` | `petProfileId` | ASC |

---

### 16. `pet_registry_ids`

* **Collection ID:** `pet_registry_ids`
* **Name:** Reserved Unique CVO Pet IDs
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 2

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `requestId` | `string` | Max Length: 36 | No | None | - |
| `assignedById` | `string` | Max Length: 36 | No | None | - |

---

### 17. `outbreak_owner_notifications`

* **Collection ID:** `outbreak_owner_notifications`
* **Name:** Owner-visible CVO outbreak and health notifications
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("users")`
* **Total Attributes:** 10

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `sourceAlertId` | `string` | Max Length: 36 | No | None | - |
| `title` | `string` | Max Length: 120 | No | None | - |
| `message` | `string` | Max Length: 1500 | No | None | - |
| `diseaseType` | `string` | Max Length: 60 | No | None | - |
| `barangay` | `string` | Max Length: 100 | No | None | - |
| `severity` | `string` | Max Length: 10 | No | None | - |
| `issuedById` | `string` | Max Length: 36 | No | None | - |
| `issuedAt` | `datetime` | ISO-8601 | No | None | - |
| `isActive` | `boolean` | Boolean flag | No | None | - |
| `isOutbreak` | `boolean` | Boolean flag | No | None | - |

---

### 18. `id_categories`

* **Collection ID:** `id_categories`
* **Name:** Government ID Categories
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`, `read("users")`
* **Total Attributes:** 6

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `name` | `string` | Max Length: 90 | No | None | - |
| `description` | `string` | Max Length: 240 | No | None | - |
| `isActive` | `boolean` | Boolean flag | No | None | - |
| `createdById` | `string` | Max Length: 36 | No | None | - |
| `categoryCode` | `string` | Max Length: 40 | No | None | - |
| `categoryType` | `string` | Max Length: 20 | No | None | - |

---

### 19. `owner_verification_requests`

* **Collection ID:** `owner_verification_requests`
* **Name:** Private Pet Owner Account Verification Requests
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 9

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `ownerId` | `string` | Max Length: 36 | No | None | - |
| `petProfileId` | `string` | Max Length: 36 | No | None | - |
| `idCategoryId` | `string` | Max Length: 36 | No | None | - |
| `idCategoryName` | `string` | Max Length: 90 | No | None | - |
| `documentFileId` | `string` | Max Length: 36 | No | None | - |
| `status` | `string` | Max Length: 20 | No | None | - |
| `reviewNote` | `string` | Max Length: 500 | No | None | - |
| `submittedAt` | `datetime` | ISO-8601 | No | None | - |
| `reviewedById` | `string` | Max Length: 36 | No | None | - |

---

### 20. `community_channels`

* **Collection ID:** `community_channels`
* **Name:** Community Channels
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 6

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `name` | `string` | Max Length: 80 | No | None | - |
| `description` | `string` | Max Length: 300 | No | None | - |
| `privacy` | `string` | Max Length: 12 | No | None | - |
| `createdById` | `string` | Max Length: 36 | No | None | - |
| `createdByName` | `string` | Max Length: 128 | No | None | - |
| `isArchived` | `boolean` | Boolean flag | No | None | - |

---

### 21. `community_memberships`

* **Collection ID:** `community_memberships`
* **Name:** Community Channel Memberships
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 6

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `channelId` | `string` | Max Length: 36 | No | None | - |
| `userId` | `string` | Max Length: 36 | No | None | - |
| `userName` | `string` | Max Length: 128 | No | None | - |
| `status` | `string` | Max Length: 12 | No | None | - |
| `requestedAt` | `datetime` | ISO-8601 | No | None | - |
| `reviewedAt` | `datetime` | ISO-8601 | No | None | - |

---

### 22. `community_posts`

* **Collection ID:** `community_posts`
* **Name:** Community Discussions
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`, `read("any")`
* **Total Attributes:** 8

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `channelId` | `string` | Max Length: 36 | No | None | - |
| `authorId` | `string` | Max Length: 36 | No | None | - |
| `authorName` | `string` | Max Length: 128 | No | None | - |
| `title` | `string` | Max Length: 140 | No | None | - |
| `body` | `string` | Max Length: 5000 | No | None | - |
| `imageFileIds` | `string` | Max Length: 800 | No | None | - |
| `isDeleted` | `boolean` | Boolean flag | No | None | - |
| `authorRole` | `text` | - | No | None | - |

---

### 23. `community_comments`

* **Collection ID:** `community_comments`
* **Name:** Community Comments
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 8

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `channelId` | `string` | Max Length: 36 | No | None | - |
| `postId` | `string` | Max Length: 36 | No | None | - |
| `parentCommentId` | `string` | Max Length: 36 | No | None | - |
| `authorId` | `string` | Max Length: 36 | No | None | - |
| `authorName` | `string` | Max Length: 128 | No | None | - |
| `body` | `string` | Max Length: 2000 | No | None | - |
| `isDeleted` | `boolean` | Boolean flag | No | None | - |
| `authorRole` | `text` | - | No | None | - |

---

### 24. `community_votes`

* **Collection ID:** `community_votes`
* **Name:** Community Votes
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 5

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `channelId` | `string` | Max Length: 36 | No | None | - |
| `targetType` | `string` | Max Length: 10 | No | None | - |
| `targetId` | `string` | Max Length: 36 | No | None | - |
| `userId` | `string` | Max Length: 36 | No | None | - |
| `value` | `integer` | Numeric range | No | None | - |

---

### 25. `community_announcements`

* **Collection ID:** `community_announcements`
* **Name:** CVO Official Community Announcements
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`, `read("any")`
* **Total Attributes:** 6

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `title` | `string` | Max Length: 140 | No | None | - |
| `body` | `string` | Max Length: 2000 | No | None | - |
| `audience` | `string` | Max Length: 12 | No | None | - |
| `isActive` | `boolean` | Boolean flag | No | None | - |
| `issuedById` | `string` | Max Length: 36 | No | None | - |
| `publishedAt` | `datetime` | ISO-8601 | No | None | - |

---

### 26. `pet_match_preferences`

* **Collection ID:** `pet_match_preferences`
* **Name:** Private Adoption Matching Preferences
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 9

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `ownerId` | `string` | Max Length: 36 | No | None | - |
| `species` | `string` | Max Length: 12 | No | None | - |
| `breed` | `string` | Max Length: 100 | No | None | - |
| `color` | `string` | Max Length: 50 | No | None | - |
| `sex` | `string` | Max Length: 12 | No | None | - |
| `minAgeYears` | `integer` | Numeric range | No | None | - |
| `maxAgeYears` | `integer` | Numeric range | No | None | - |
| `isEnabled` | `boolean` | Boolean flag | No | None | - |
| `pushEnabled` | `boolean` | Boolean flag | No | None | - |

---

### 27. `pet_match_notifications`

* **Collection ID:** `pet_match_notifications`
* **Name:** Private Adoption Match Notifications
* **Database ID:** `cityvethub`
* **Status:** `Enabled`
* **Row Security:** `Enabled`
* **Permissions:** `read("team:cityvethub-admins")`
* **Total Attributes:** 7

| Attribute Key | Type | Details / Format | Required | Default | Description / Constraints |
|---|---|---|:---:|---|---|
| `$id` | `string` | UUID / Custom ID (36 chars) | Yes | None | Primary Key |
| `$createdAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Document creation timestamp |
| `$updatedAt` | `datetime` | ISO-8601 Timestamp | Yes | Auto | Last document update timestamp |
| `$permissions` | `string[]` | Read/Write/Update/Delete ACLs | No | None | Document-level Access Control List |
| `ownerId` | `string` | Max Length: 36 | No | None | - |
| `listingId` | `string` | Max Length: 36 | No | None | - |
| `petName` | `string` | Max Length: 100 | No | None | - |
| `title` | `string` | Max Length: 150 | No | None | - |
| `createdAt` | `datetime` | ISO-8601 | No | None | - |
| `isRead` | `boolean` | Boolean flag | No | None | - |
| `pushStatus` | `string` | Max Length: 20 | No | None | - |

---

