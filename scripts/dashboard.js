(async function () {
    'use strict';
    const api = window.CityVet;
    const overlay = document.getElementById('loadingPanel');
    const errorPanel = document.getElementById('dashboardError');
    const view = document.getElementById('dashboardView');
    function fail(message) {
        overlay.hidden = true;
        errorPanel.hidden = false;
        errorPanel.querySelector('[data-error]').textContent = message;
    }
    if (!api.ready) return fail('Configure Appwrite in scripts/config.js before using this dashboard.');
    let current;
    try {
        current = await api.context();
    } catch (error) {
        if (error.code === 401) return window.location.replace('./login.html');
        return fail(api.readableError(error));
    }
    if (current.role === 'pending_officer') return window.location.replace('./pending.html');
    const ROLE_NAMES = {admin:'Administrator',officer:'Field Officer',owner:'Pet Owner'};
    const pageDefs = {
        home: { title:'Dashboard', description:'Your CityVetHub workspace and activity overview.', icon:'fa-house' },
        pets: { title:'Pet Registry', description:'Pet profiles, registration and digital QR identity.', icon:'fa-paw' },
        medical: { title:'Medical & Vaccination', description:'Authorized health and vaccination workflows.', icon:'fa-stethoscope' },
        surveillance: { title:'Incident Surveillance', description:'Barangay boundaries, incident reports, CVO review and outbreak alerts.', icon:'fa-map-location-dot' },
        alerts: { title:'Staff Alerts & Announcements', description:'Official outbreak notifications and CVO announcements for field staff.', icon:'fa-bacterium' },
        community: { title:'Community', description:'Pet owner channels, discussions, votes, CVO announcements and outbreak advisories.', icon:'fa-comments' },
        adoptions: { title:'Adoptions', description:'Animal listings and citizen applications.', icon:'fa-heart' },
        traceability: { title:'Ownership & Traceability', description:'QR passports and ownership records.', icon:'fa-id-card-clip' },
        users: { title:'Account Management', description:'Member verification and role management.', icon:'fa-users' },
        reports: { title:'Administrative Reports', description:'CVO operational summaries and logs.', icon:'fa-file-lines' },
        profile: { title:'My Profile', description:'Manage personal details, avatar, and account security.', icon:'fa-user-gear' }
    };
    const modulesByRole = {
        admin: ['home','pets','medical','surveillance','alerts','community','adoptions','traceability','users','reports','profile'],
        officer: ['home','pets','medical','surveillance','alerts','traceability','profile'],
        owner: ['home','pets','medical','surveillance','community','adoptions','traceability','profile']
    };
    const role = current.role;
    const themeButton=document.getElementById('themeButton');
    function applyTheme(dark){
        document.body.classList.toggle('dark-theme',!!dark);
        themeButton.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');
        themeButton.querySelector('i').className='fa-solid '+(dark?'fa-moon':'fa-sun');
    }
    applyTheme(userTheme(current.user)==='dark');
    function userTheme(account){return account.prefs?.theme==='dark'?'dark':'light';}

    if(role==='owner')pageDefs.pets.title='My Pets';
    let openRegistry = null;
    if (!window.CityVetFeatures?.mount) return fail('The CityVetHub feature scripts did not load. Make sure scripts/features.js exists and reload the page.');
    const featureHub = window.CityVetFeatures.mount({api,current,container:document.getElementById('featurePanel')});
    const phase4Hub=window.CityVetPhase4.mount({api,current,container:document.getElementById('featurePanel')});
    const communityHub=window.CityVetCommunity?.mount({api,current,container:document.getElementById('featurePanel')});
    const allowed = modulesByRole[role];
    const user = current.user;
    document.getElementById('userName').textContent = user.name || user.email;
    document.getElementById('userRole').textContent = ROLE_NAMES[role];
    document.getElementById('initials').textContent = (user.name || user.email).trim().split(/[\s@]+/).slice(0,2).map(n=>n[0]||'').join('').toUpperCase();
    document.getElementById('welcomeName').textContent = (user.name||'there').split(' ')[0];
    document.getElementById('rolePill').textContent = ROLE_NAMES[role];
    document.getElementById('accountEmail').textContent = user.email;
    async function loadHeaderAvatar(){
        try{
            const result=await api.tablesDB.getRow({databaseId:api.config.databaseId,tableId:api.config.tables.userProfiles,rowId:user.$id});
            if(role==='owner'&&result.accountVerificationStatus==='verified'){
                const target=document.getElementById('initials');
                if(!target.parentElement.classList.contains('CV411_AVATAR_WRAP')){
                    const wrap=document.createElement('span');wrap.className='CV411_AVATAR_WRAP';
                    target.before(wrap);wrap.append(target);
                    const badge=document.createElement('span');badge.className='CV411_HEADER_VERIFIED';badge.title='CVO verified Pet Owner';badge.setAttribute('aria-label','CVO verified Pet Owner');
                    badge.innerHTML='<i class="fa-solid fa-check"></i>';wrap.append(badge);
                }
            }
            if(result.profileImageId){
                const target=document.getElementById('initials');
                const img=document.createElement('img');img.alt='Profile picture';img.src=String(api.storage.getFileView({bucketId:api.config.buckets.media,fileId:result.profileImageId}));
                img.style.cssText='height:100%;width:100%;border-radius:50%;object-fit:cover';
                img.onerror=()=>{img.remove();target.textContent=(user.name||user.email).trim().slice(0,1).toUpperCase();};target.textContent='';target.append(img);
            }
        }catch(e){/* New users may not have saved their personal profile yet. */}
    }
    loadHeaderAvatar();
    async function refreshOverview(){
        const metrics=document.getElementById('dashboardMetrics');
        const status=document.getElementById('metricsStatus');
        const keyMap=['pets','petRequests',role==='owner'?'ownerAlerts':'diseaseAlerts','adoptionListings'];
        try{
            const counts=await Promise.all(keyMap.map(async key=>{
                const result=await api.tablesDB.listRows({databaseId:api.config.databaseId,tableId:api.config.tables[key],queries:[window.Appwrite.Query.limit(100)]});
                return key==='diseaseAlerts'||key==='ownerAlerts'?(result.rows||[]).filter(r=>r.isActive).length:key==='adoptionListings'?(result.rows||[]).filter(r=>r.isActive).length:(result.rows||[]).length;
            }));
            const labels=['Verified pets','Registration requests','Active alerts','Adoption listings'];
            metrics.replaceChildren();
            labels.forEach((label,i)=>{
                const card=document.createElement('div');card.className='CV_STAT';
                const small=document.createElement('span');small.textContent=label;
                const value=document.createElement('strong');value.textContent=String(counts[i]);
                card.append(small,value);metrics.append(card);
            });
            status.textContent='UPDATED';
        }catch(e){status.textContent='NOT CONNECTED';metrics.textContent='Dashboard statistics will appear after Appwrite tables and permissions are configured.';}
    }
    const grid = document.getElementById('moduleGrid');
    const nav = document.getElementById('sideNav');
    const navTooltip=document.createElement('div');
    navTooltip.className='CV410_NAV_TOOLTIP';navTooltip.hidden=true;navTooltip.setAttribute('role','tooltip');
    document.body.append(navTooltip);
    function showNavTooltip(button){
        navTooltip.textContent=pageDefs[button.dataset.module]?.title||'Navigation';
        const rect=button.getBoundingClientRect();
        navTooltip.style.left=Math.min(rect.right+12,window.innerWidth-205)+'px';
        navTooltip.style.top=Math.max(6,Math.min(window.innerHeight-45,rect.top+(rect.height-38)/2))+'px';
        navTooltip.hidden=false;
    }
    nav.addEventListener('pointerover',e=>{const btn=e.target.closest('[data-module]');if(btn)showNavTooltip(btn);});
    nav.addEventListener('pointerout',e=>{if(e.target.closest('[data-module]'))navTooltip.hidden=true;});
    nav.addEventListener('focusin',e=>{const btn=e.target.closest('[data-module]');if(btn)showNavTooltip(btn);});
    nav.addEventListener('focusout',()=>navTooltip.hidden=true);
    nav.addEventListener('scroll',()=>navTooltip.hidden=true);
    window.addEventListener('resize',()=>navTooltip.hidden=true);
    allowed.forEach((key,i) => {
        const d = pageDefs[key];
        const a = document.createElement('button');
        a.type='button';a.className='BUTTON_TYPE1 SIDENAV_ITEM' + (i===0?' is-active':'');
        a.dataset.module = key;
        a.setAttribute('aria-label', d.title);
        const icon = document.createElement('i');icon.className='fa-solid '+d.icon;
        a.append(icon); nav.append(a);
        if (i===0) return;
        const card=document.createElement('button');card.type='button';card.className='MODULE_CARD';card.dataset.module=key;
        const bubble=document.createElement('span');bubble.className='MODULE_ICON';
        const pict=document.createElement('i');pict.className='fa-solid '+d.icon;bubble.append(pict);
        const cardTitle=document.createElement('strong');cardTitle.textContent=d.title;
        const desc=document.createElement('span');desc.textContent=d.description;
        card.append(bubble,cardTitle,desc);grid.append(card);
    });
    function openModule(key) {
        if (!allowed.includes(key)) return;
        document.querySelectorAll('#sideNav [data-module]').forEach(a=>a.classList.toggle('is-active',a.dataset.module===key));
        
        const adminPanel = document.getElementById('overviewPanel');
        const ownerPanel = document.getElementById('ownerOverviewPanel');
        
        // Toggle dashboard views based on role
        if (key === 'home') {
            if (role === 'owner' && ownerPanel) {
                if (adminPanel) adminPanel.hidden = true;
                ownerPanel.hidden = false;
                if (typeof loadOwnerFeaturedAdoptions === 'function') loadOwnerFeaturedAdoptions();
                if (typeof loadOwnerCommunityDiscussions === 'function') loadOwnerCommunityDiscussions();
                if (typeof loadOwnerAnnouncements === 'function') loadOwnerAnnouncements();
            } else {
                if (ownerPanel) ownerPanel.hidden = true;
                adminPanel.hidden = false;
                refreshOverview();
            }
        } else {overlay.hidden=true;  
         view.hidden=false;
            adminPanel.hidden = true;
            if (ownerPanel) ownerPanel.hidden = true;
        }

        // Toggle pet registry
        document.getElementById('registryPanel').hidden = key!=='pets';
        if (key==='pets') {
            if (!openRegistry) openRegistry = window.CityVetRegistry.mount({ api, current });
            else openRegistry.reload();
        }
        
        // Toggle feature panels (safely closing what can be closed)
        const panel=document.getElementById('featurePanel');
        panel.hidden = key==='home' || key==='pets';
        
        if(key!=='home' && key!=='pets') {
            if (key==='community' || (key==='alerts' && role==='officer')) {
                phase4Hub.close();
                if (!communityHub) { panel.textContent='Community scripts did not load.'; }
                else communityHub.open(key==='alerts' ? 'officer-notices' : 'community');
            } else {
                communityHub?.close();
                if (['surveillance','reports','profile'].includes(key)) phase4Hub.open(key);
                else { phase4Hub.close(); featureHub.open(key); }
            }
        } else {
            phase4Hub.close();
            communityHub?.close();
        }
        
        document.getElementById('pageTitle').textContent=pageDefs[key].title;
        document.getElementById('searchInput').value='';
    }
    document.querySelectorAll('#sideNav,#moduleGrid').forEach(parent=>parent.addEventListener('click',event=>{
        const control=event.target.closest('[data-module]');if (control) openModule(control.dataset.module);
    }));
    document.getElementById('searchInput').addEventListener('input',event=>{
        const term=event.target.value.toLowerCase().trim();
        if (!document.getElementById('registryPanel').hidden && openRegistry) openRegistry.filter(term);
        if (!document.getElementById('featurePanel').hidden) {
            const mod=document.querySelector('#sideNav .is-active')?.dataset.module;
            if(mod==='community'||(mod==='alerts'&&role==='officer'))communityHub?.search(term);
            else if(['surveillance','reports','profile'].includes(mod))phase4Hub.search(term);
            else featureHub.search(term);
        }
        grid.querySelectorAll('.MODULE_CARD').forEach(card=>{
            card.hidden = term !== '' && !card.textContent.toLowerCase().includes(term);
        });
    });
    document.getElementById('logoutButton').addEventListener('click',async()=>{
        const button=document.getElementById('logoutButton');button.disabled=true;
        try { await api.logout();window.location.replace('./login.html'); }
        catch(error) { button.disabled=false;alert(api.readableError(error)); }
    });
    themeButton.addEventListener('click',async()=>{
        if(themeButton.disabled)return;
        const dark=!document.body.classList.contains('dark-theme');
        const currentPrefs={...(current.user.prefs||{})};
        applyTheme(dark);themeButton.disabled=true;
        try{
            await api.account.updatePrefs({prefs:{...currentPrefs,theme:dark?'dark':'light'}});
            current.user.prefs={...currentPrefs,theme:dark?'dark':'light'};
        }catch(e){applyTheme(!dark);alert('Unable to save your theme to Appwrite: '+api.readableError(e));}
        finally{themeButton.disabled=false;}
    });
    // Live in-app CVO notifications. Row permissions define the audience:
    // Field Officers read disease_alerts; Pet Owners read owner_alerts only.
    const alertTable=role==='owner'?api.config.tables.ownerAlerts:api.config.tables.diseaseAlerts;
    const alertRegion=document.createElement('div');alertRegion.className='CV49_LIVE_ALERT';alertRegion.hidden=true;
    alertRegion.setAttribute('role','status');alertRegion.setAttribute('aria-live','polite');
    alertRegion.innerHTML='<span class="CV49_ALERT_BELL"><i class="fa-solid fa-bell"></i></span><div><strong id="cv49LiveTitle">CVO alert</strong><p id="cv49LiveMessage"></p></div><button type="button" id="cv49OpenAlerts">View updates</button><button type="button" class="CV49_ALERT_DISMISS" id="cv49DismissAlerts" aria-label="Dismiss alert">×</button>';
    document.querySelector('.DASHBOARD_CONTENT .BREADCRUMBS')?.after(alertRegion);
    alertRegion.querySelector('#cv49OpenAlerts').addEventListener('click',()=>openModule(role==='owner'?'community':'alerts'));
    alertRegion.querySelector('#cv49DismissAlerts').addEventListener('click',()=>alertRegion.hidden=true);
    const seenAlerts=new Set();let loadedAlerts=false;
    function showLiveAlert(row,initial=false){
        if(!row?.isActive)return;
        alertRegion.querySelector('#cv49LiveTitle').textContent=initial?'Active CVO outbreak advisory':row.title||'New CVO alert';
        alertRegion.querySelector('#cv49LiveMessage').textContent=initial?row.title||'Review the current outbreak instructions.':`${row.barangay||'Iligan City'} · ${row.diseaseType||'Public health'} — ${row.message||'Open alerts for details.'}`;
        alertRegion.hidden=false;
    }
    async function checkAlertFeed(){
      if(!alertTable)return;
      try{
        const result=await api.tablesDB.listRows({databaseId:api.config.databaseId,tableId:alertTable,queries:[window.Appwrite.Query.orderDesc('$createdAt'),window.Appwrite.Query.limit(20)]});
        const rows=(result.rows||[]).filter(x=>x.isActive);
        for(const row of rows){
          const isNew=!seenAlerts.has(row.$id);
          seenAlerts.add(row.$id);
          if(loadedAlerts&&isNew)showLiveAlert(row,false);
        }
        if(!loadedAlerts&&rows.length&&role==='officer')showLiveAlert(rows[0],true);
        loadedAlerts=true;
      }catch{/* Feed is optional if migrations have not run; never expose another user's records. */}
    }
    await checkAlertFeed();
    const seenOfficialAnnouncements=new Set();let announcementsLoaded=false;
    async function checkCommunityAnnouncements(){
       try{const r=await api.operate('communityOfficialNotices');const items=(r.notices||[]).filter(x=>x.category==='announcement'&&x.isActive);
         for(const n of items){if(announcementsLoaded&&!seenOfficialAnnouncements.has(n.id))showLiveAlert({title:n.title,message:n.body,barangay:'CityVetHub',diseaseType:'Announcement',isActive:true});seenOfficialAnnouncements.add(n.id);}announcementsLoaded=true;
       }catch{/* Community migration not active yet; other pages remain available. */}
    }
    await checkCommunityAnnouncements();
    // Realtime is available in the current Appwrite SDK; an on-focus refresh
    // catches messages missed while the browser was sleeping or disconnected.
    try{
      const channel=`tablesdb.${api.config.databaseId}.tables.${alertTable}.rows`;
      if(window.Appwrite.Realtime&&api.client){
        const live=new window.Appwrite.Realtime(api.client);
        Promise.resolve(live.subscribe([channel],event=>{
          const row=event?.payload;
          if(row?.$id&&!seenAlerts.has(row.$id)&&row.isActive){seenAlerts.add(row.$id);showLiveAlert(row);}
        })).catch(()=>{});
      }else if(api.client?.subscribe){api.client.subscribe(channel,event=>{if(event?.payload?.isActive&&!seenAlerts.has(event.payload.$id)){seenAlerts.add(event.payload.$id);showLiveAlert(event.payload);}});}
    }catch{/* Focus and polling provide fallback on older SDK builds. */}
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkAlertFeed();checkCommunityAnnouncements();}});
    setInterval(()=>{checkAlertFeed();checkCommunityAnnouncements();},60000);
    overlay.hidden = true;
    view.hidden = false;

    
    if (role === 'owner') {
        openModule('home');
    } else {
        refreshOverview();
        const deepLink = new URLSearchParams(window.location.search).get('module');
        if (deepLink && allowed.includes(deepLink)) openModule(deepLink);
    }

    async function loadOwnerCommunityDiscussions() {
        const container = document.getElementById('ownerCommunityDiscussions');
        if (!container) return;
        try {
            const tableId = api.config.tables.communityPosts;
            const response = await api.tablesDB.listRows({
                databaseId: api.config.databaseId,
                tableId,
                // Removed orderDesc('$createdAt') to fix the index error
                queries: [window.Appwrite.Query.limit(3)]
            });
            const posts = response.rows || [];
            if (!posts.length) {
                container.className = 'EMPTY_STATE';
                container.innerHTML = '<p>No community discussions yet.</p>';
                return;
            }
            container.className = 'LIST_CONTENT';
            container.replaceChildren(...posts.reverse().map(item => { // Reverse to show latest
                const row = document.createElement('div');
                row.className = 'LIST_ITEM';
                row.style.cursor = 'pointer';
                row.addEventListener('click', () => document.querySelector('[data-module="community"]').click());
                
                const details = document.createElement('div');
                details.className = 'ITEM_DETAILS';
                
                const h4 = document.createElement('h4');
                h4.textContent = item.title || 'Community Post';
                
                const sub = document.createElement('p');
                sub.className = 'SUB_TEXT';
                const bodyText = item.body || '';
                sub.textContent = bodyText.length > 55 ? bodyText.substring(0, 55) + '...' : (bodyText || 'Join the discussion');
                
                details.append(h4, sub);
                
                const badge = document.createElement('span');
                badge.className = 'LINK_PRIMARY';
                badge.textContent = 'View →';
                
                row.append(details, badge);
                return row;
            }));
        } catch (e) {
            container.className = 'EMPTY_STATE';
            container.innerHTML = '<p>Unable to load discussions.</p>';
        }
    }

    async function loadOwnerFeaturedAdoptions() {
        const container = document.getElementById('ownerFeaturedAdoptions');
        if (!container) return;
        try {
            const tableId = api.config.tables.adoptionListings;
            const response = await api.tablesDB.listRows({
                databaseId: api.config.databaseId,
                tableId,
                // Removed orderDesc('$createdAt') to fix the index error
                queries: [window.Appwrite.Query.limit(3)]
            });
            const listings = response.rows || [];
            if (!listings.length) {
                container.className = 'EMPTY_STATE';
                container.innerHTML = '<p>No pets currently listed for adoption.</p>';
                return;
            }
            container.className = 'LIST_CONTENT';
            container.replaceChildren(...listings.reverse().map(item => { // Reverse to show latest
                const row = document.createElement('div');
                row.className = 'LIST_ITEM';
                row.style.cursor = 'pointer';
                row.addEventListener('click', () => document.querySelector('[data-module="adoptions"]').click());
                
                const details = document.createElement('div');
                details.className = 'ITEM_DETAILS';
                
                const h4 = document.createElement('h4');
                h4.textContent = item.title || item.petName || 'Adoptable Pet';
                
                const sub = document.createElement('p');
                sub.className = 'SUB_TEXT';
                sub.textContent = item.description || 'Ready for adoption';
                
                details.append(h4, sub);
                
                const badge = document.createElement('span');
                badge.className = 'LINK_PRIMARY';
                badge.textContent = 'View →';
                
                row.append(details, badge);
                return row;
            }));
        } catch (e) {
            container.className = 'EMPTY_STATE';
            container.innerHTML = '<p>Unable to load adoption listings.</p>';
        }
    }

    async function loadOwnerAnnouncements() {
        const container = document.getElementById('ownerAnnouncements');
        if (!container) return;
        try {
            const tableId = api.config.tables.communityAnnouncements;
            const response = await api.tablesDB.listRows({
                databaseId: api.config.databaseId,
                tableId,
                queries: [window.Appwrite.Query.limit(10)]
            });
            const announcements = (response.rows || []).filter(r => r.isActive !== false);
            
            if (!announcements.length) {
                container.innerHTML = '<p style="color: #6B7280; font-size: 0.95rem; margin: 0;">No official announcements at this time.</p>';
                return;
            }
            const item = announcements[announcements.length - 1]; // Grabs the latest entry
            container.innerHTML = `
                <p style="color: #111827; font-weight: 600; margin: 0 0 0.25rem 0;">${item.title || 'Official Notice'}</p>
                <p style="color: #6B7280; font-size: 0.95rem; margin: 0;">${item.body || item.message || ''}</p>
            `;
        } catch (e) {
            container.innerHTML = '<p style="color: #6B7280; font-size: 0.95rem; margin: 0;">Unable to load announcements.</p>';
        }
    }

})();
