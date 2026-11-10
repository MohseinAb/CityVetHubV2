// Public project details only. NEVER place an API key or admin password here.
window.CITYVET_CONFIG = Object.freeze({
    endpoint: 'https://sgp.cloud.appwrite.io/v1',
    projectId: '6aeff5c9002718442fdf',
    databaseId: 'cityvethub',
    // Leave empty for SAME-COMPUTER preview. For QR codes scanned on another device,
    // set to the reachable site's base URL, e.g. http://192.168.1.25:8000/ on one Wi-Fi.
    // A true public QR requires a deployed HTTPS website (Appwrite Sites later).
    publicSiteUrl: '',
    tables: Object.freeze({
        petRequests: 'pet_requests', pets: 'pets', petProfiles: 'pet_profiles', userProfiles: 'user_profiles', passports: 'pet_passports', medical: 'medical_records',
        diseaseReports: 'disease_reports', diseaseIncidents: 'disease_incidents',
        diseaseAlerts: 'disease_alerts', ownerAlerts:'outbreak_owner_notifications', adoptionListings: 'adoption_listings',
        adoptionApplications: 'adoption_applications', ownership: 'ownership_history', incidentCategories:'incident_categories', petHealthUploads:'pet_health_uploads', passportMedical:'pet_passport_medical',idCategories:'id_categories',ownerVerificationRequests:'owner_verification_requests',petMatchPreferences:'pet_match_preferences',petMatchNotifications:'pet_match_notifications',communityChannels:'community_channels',communityMemberships:'community_memberships',communityPosts:'community_posts',communityComments:'community_comments',communityVotes:'community_votes',communityAnnouncements:'community_announcements'
    }),
    buckets: Object.freeze({media:'cityvethub-media'}),
    functions: Object.freeze({ operations: 'cityvethub-operations' }),
    teams: Object.freeze({ admin:'cityvethub-admins',officer:'cityvethub-field-officers' })
});
