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
        fail(api.readableError(error));
        const retryWhenOnline = () => {
            api.context().then(() => window.location.reload()).catch(() => {});
        };
        window.addEventListener('online', retryWhenOnline);
        setInterval(() => { if (navigator.onLine !== false) retryWhenOnline(); }, 5000);
        return;
    }
    if (current.user.prefs?.requireEmailVerification && !current.user.emailVerification) {
        try { await api.logout(); } catch {}
        return window.location.replace('./login.html?verify=sent&email=' + encodeURIComponent(current.user.email || ''));
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
        officer: ['home','pets','medical','surveillance','alerts','community','traceability','profile'],
        owner: ['home','pets','medical','surveillance','community','adoptions','traceability','profile']
    };
    const role = current.role;
    const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const escapeHtml = escHtml;
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
        const keyMap=role==='officer'?['pets','medical','diseaseReports','diseaseAlerts']:['pets','petRequests',role==='owner'?'ownerAlerts':'diseaseAlerts','adoptionListings'];
        try{
            const counts=await Promise.all(keyMap.map(async key=>{
                const result=await api.tablesDB.listRows({databaseId:api.config.databaseId,tableId:api.config.tables[key],queries:[window.Appwrite.Query.limit(100)]});
                return key==='diseaseAlerts'||key==='ownerAlerts'?(result.rows||[]).filter(r=>r.isActive).length:key==='adoptionListings'?(result.rows||[]).filter(r=>r.isActive).length:key==='diseaseReports'?(result.rows||[]).filter(r=>r.status!=='archived').length:(result.rows||[]).length;
            }));
            const labels=role==='officer'?['Verified registry pets','Official medical entries','Incident reports','Active staff alerts']:['Verified pets','Registration requests','Active alerts','Adoption listings'];
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
            else openRegistry.reload(true);
        }
        
        // Toggle feature panels (safely closing what can be closed)
        const panel=document.getElementById('featurePanel');
        panel.hidden = key==='home' || key==='pets';
        
        if(key!=='home' && key!=='pets') {
            if (key==='community' || (key==='alerts' && role==='officer')) {
                phase4Hub.close();
                featureHub.close?.();
                if (!communityHub) { panel.textContent='Community scripts did not load.'; }
                else communityHub.open(key==='alerts' ? 'officer-notices' : 'community');
            } else {
                communityHub?.close();
                if (['surveillance','reports','profile'].includes(key)) { featureHub.close?.(); phase4Hub.open(key); }
                else { phase4Hub.close(); featureHub.open(key); }
            }
        } else {
            phase4Hub.close();
            featureHub.close?.();
            communityHub?.close();
        }
        
        document.getElementById('pageTitle').textContent=pageDefs[key].title;
        document.getElementById('searchInput').value='';
    }
    document.querySelectorAll('#sideNav,#moduleGrid').forEach(parent=>parent.addEventListener('click',event=>{
        const control=event.target.closest('[data-module]');if (control) openModule(control.dataset.module);
    }));
    const searchInputEl=document.getElementById('searchInput');
    const searchPanelEl=searchInputEl?.closest('.SEARCH_PANEL');
    const cmdMenu=document.createElement('div');
    cmdMenu.className='CV_CMD_DROPDOWN';
    cmdMenu.hidden=true;
    searchPanelEl?.appendChild(cmdMenu);
    function renderCmdMenu(raw=''){
        const q=String(raw||'').trim().toLowerCase();
        const matches=allowed.filter(k=>k!=='home'&&(!q||pageDefs[k].title.toLowerCase().includes(q)||String(pageDefs[k].description||'').toLowerCase().includes(q)));
        if(!matches.length){cmdMenu.hidden=true;return;}
        cmdMenu.innerHTML=`<div class="CV_CMD_HEADER">Quick jump to module</div>`+matches.map((k,i)=>`<button type="button" class="CV_CMD_ITEM ${i===0&&q?'is-active':''}" data-cmd-mod="${k}"><span class="CV_CMD_ICON"><i class="fa-solid ${pageDefs[k].icon}"></i></span><span class="CV_CMD_TEXT"><strong>${escapeHtml(pageDefs[k].title)}</strong><small>${escapeHtml(pageDefs[k].description||'')}</small></span></button>`).join('');
        cmdMenu.hidden=false;
    }
    searchInputEl.addEventListener('focus',()=>renderCmdMenu(searchInputEl.value));
    searchInputEl.addEventListener('blur',()=>setTimeout(()=>{cmdMenu.hidden=true;},150));
    searchInputEl.addEventListener('keydown',e=>{
        if(e.key==='Escape'){cmdMenu.hidden=true;searchInputEl.blur();}
        else if(e.key==='Enter'){
            const first=cmdMenu.querySelector('.CV_CMD_ITEM.is-active,.CV_CMD_ITEM');
            if(first&&!cmdMenu.hidden&&searchInputEl.value.trim()){
                e.preventDefault();
                cmdMenu.hidden=true;
                openModule(first.dataset.cmdMod);
            }
        }
    });
    cmdMenu.addEventListener('mousedown',e=>{
        const btn=e.target.closest('[data-cmd-mod]');
        if(!btn)return;
        e.preventDefault();
        cmdMenu.hidden=true;
        openModule(btn.dataset.cmdMod);
    });
    searchInputEl.addEventListener('input',event=>{
        const term=event.target.value.toLowerCase().trim();
        renderCmdMenu(term);
        window.CityVetUI?.setPageSearch(term);
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
    const BRGY_TAG_RE=/^\[Barangay:\s*([^\]]+)\]\s*\n?/i;
    function parseAnnouncementBrgy(item){
        const raw=String(item?.body||item?.message||'');
        const m=raw.match(BRGY_TAG_RE);
        const barangay=String(item?.barangay||(m?m[1]:'')||'').trim();
        const body=m?raw.replace(BRGY_TAG_RE,''):raw;
        return {barangay,body};
    }
    const myBarangays=new Set();
    const normBrgy=s=>String(s||'').trim().toLowerCase().replace(/^brgy\.?\s*/i,'').replace(/\s*\(pob\.\)\s*/i,'').trim();
    function matchUserBarangay(target){
        if(role==='admin'||!target)return true;
        const t=normBrgy(target);
        if(!t||t==='all'||t==='citywide')return true;
        if(role==='officer'&&myBarangays.size===0)return true;
        for(const b of myBarangays){
            const u=normBrgy(b);
            if(u&&(u===t||u.includes(t)||t.includes(u)))return true;
        }
        return false;
    }
    window.CityVetMatchBarangay=matchUserBarangay;
    async function syncUserBarangays(){
        if(role==='admin')return;
        try{
            const [prof,invPets,verPets]=await Promise.all([
                api.tablesDB.getRow({databaseId:api.config.databaseId,tableId:api.config.tables.userProfiles,rowId:user.$id}).catch(()=>null),
                api.tablesDB.listRows({databaseId:api.config.databaseId,tableId:api.config.tables.petProfiles,queries:[window.Appwrite.Query.limit(80)]}).then(r=>r.rows||[]).catch(()=>[]),
                api.tablesDB.listRows({databaseId:api.config.databaseId,tableId:api.config.tables.pets,queries:[window.Appwrite.Query.limit(80)]}).then(r=>r.rows||[]).catch(()=>[])
            ]);
            if(prof?.barangay)myBarangays.add(prof.barangay);
            if(prof?.assignedArea)myBarangays.add(prof.assignedArea);
            if(prof?.address)myBarangays.add(prof.address);
            for(const p of invPets)if(p.ownerId===user.$id&&p.barangay)myBarangays.add(p.barangay);
            for(const p of verPets)if(p.ownerId===user.$id&&p.barangay)myBarangays.add(p.barangay);
        }catch{}
    }
    await syncUserBarangays();
    const seenOfficialAnnouncements=new Set();let announcementsLoaded=false;
    async function checkCommunityAnnouncements(){
       try{const r=await api.operate('communityOverview');const items=(r?.notices||[]).filter(x=>(!x.category||x.category==='announcement')&&x.isActive!==false);
         for(const n of items){
           const parsed=parseAnnouncementBrgy(n);
           if(!matchUserBarangay(parsed.barangay))continue;
           if(announcementsLoaded&&!seenOfficialAnnouncements.has(n.id)){
             showLiveAlert({title:n.title,message:parsed.body,barangay:parsed.barangay?'Brgy. '+parsed.barangay:'CityVetHub',diseaseType:'Announcement',isActive:true});
           }
           seenOfficialAnnouncements.add(n.id);
         }
         announcementsLoaded=true;
       }catch{/* Community migration not active yet; other pages remain available. */}
    }
    await checkCommunityAnnouncements();

    // --- Unified Notification Center (All Roles: Owner, Officer, Admin) ---
    const notifButton=document.getElementById('notifButton');
    const notifBadge=document.getElementById('notifBadge');
    const notifDropdown=document.getElementById('notifDropdown');
    const notifList=document.getElementById('notifList');
    const notifSubCount=document.getElementById('notifSubCount');
    const notifMarkAllBtn=document.getElementById('notifMarkAllBtn');
    const notifTabs=document.getElementById('notifTabs');
    const readStorageKey='cv_notif_read_'+user.$id;
    const metricTsStorageKey='cv_notif_metric_ts_'+user.$id;
    const readIds=new Set((()=>{try{return JSON.parse(localStorage.getItem(readStorageKey)||'[]');}catch{return[];}})());
    const metricTs=(()=>{try{return JSON.parse(localStorage.getItem(metricTsStorageKey)||'{}')||{};}catch{return{};}})();
    function saveReadIds(){
        try{localStorage.setItem(readStorageKey,JSON.stringify([...readIds].slice(-500)));}catch{}
    }
    function saveMetricTs(){
        try{
            const entries=Object.entries(metricTs).slice(-250);
            localStorage.setItem(metricTsStorageKey,JSON.stringify(Object.fromEntries(entries)));
        }catch{}
    }
    function trackMetricTimestamp(key,count,fallbackIso,recentBoost=false){
        const prev=metricTs[key];
        const nowIso=new Date().toISOString();
        if(prev&&Number(count)>Number(prev.count||0)){
            metricTs[key]={count,ts:nowIso};
            saveMetricTs();
            return nowIso;
        }
        if(!prev){
            const ts=recentBoost?nowIso:(fallbackIso||nowIso);
            metricTs[key]={count,ts};
            saveMetricTs();
            return ts;
        }
        if(Number(count)<Number(prev.count||0)){
            metricTs[key]={count,ts:prev.ts||fallbackIso||nowIso};
            saveMetricTs();
        }
        return metricTs[key].ts||fallbackIso||nowIso;
    }
    let notifItems=[];
    let activeNotifFilter='all';
    let notifLoading=false;
    let notifQueued=false;
    let lastLocalNotifAction={action:'',at:0};
    const relTime=iso=>{
        if(!iso)return '';
        const t=new Date(iso).getTime();
        if(!Number.isFinite(t))return '';
        const ms=Date.now()-t;
        if(ms<0)return 'Just now';
        const sec=Math.max(1,Math.floor(ms/1000));
        if(sec<60)return 'Just now';
        const min=Math.floor(sec/60);
        if(min<60)return min+'m ago';
        const hr=Math.floor(min/60);
        if(hr<24)return hr+'h ago';
        const days=Math.floor(hr/24);
        if(days<7)return days+'d ago';
        try{return new Date(t).toLocaleDateString('en-PH',{month:'short',day:'numeric'});}catch{return '';}
    };
    const parseTime=iso=>{
        if(!iso)return 0;
        const n=new Date(iso).getTime();
        return Number.isFinite(n)?n:0;
    };
    function notifIconSpec(item){
        if(item.kind==='like_post'||item.kind==='like_comment')return {cls:'is-like',icon:'fa-heart'};
        if(item.category==='community')return {cls:'is-community',icon:'fa-comments'};
        if(item.category==='adoptions')return {cls:'is-adoptions',icon:item.kind==='match'?'fa-heart-pulse':'fa-paw'};
        if(item.category==='medical')return {cls:'is-medical',icon:item.kind==='vaccine_expiry'?'fa-calendar-xmark':'fa-stethoscope'};
        if(item.category==='alerts')return {cls:'is-alerts',icon:item.kind==='outbreak'?'fa-triangle-exclamation':'fa-bullhorn'};
        return {cls:'is-staff',icon:'fa-user-check'};
    }
    function renderNotifications(){
        if(!notifList)return;
        const unreadCount=notifItems.filter(n=>!n.isRead).length;
        if(notifBadge){
            notifBadge.hidden=unreadCount===0;
            notifBadge.textContent=unreadCount>99?'99+':String(unreadCount);
        }
        if(notifSubCount){
            notifSubCount.textContent=unreadCount?`${unreadCount} unread notification${unreadCount===1?'':'s'}`:'All caught up';
        }
        const filtered=notifItems.filter(n=>{
            if(activeNotifFilter==='all')return true;
            if(activeNotifFilter==='unread')return !n.isRead;
            return n.category===activeNotifFilter;
        });
        if(!filtered.length){
            notifList.innerHTML=`<div class="CV_NOTIF_EMPTY"><i class="fa-regular fa-bell-slash"></i><p>${activeNotifFilter==='unread'?'No unread notifications right now.':'No notifications in this category yet.'}</p></div>`;
            return;
        }
        notifList.innerHTML=filtered.map(n=>{
            const spec=notifIconSpec(n);
            const modTitle=pageDefs[n.module]?.title||'View';
            return `<button type="button" class="CV_NOTIF_ITEM ${n.isRead?'':'is-unread'}" data-notif-id="${escHtml(n.id)}"><span class="CV_NOTIF_ICON ${spec.cls}"><i class="fa-solid ${spec.icon}"></i></span><span class="CV_NOTIF_BODY"><span class="CV_NOTIF_TOP"><strong>${escHtml(n.title)}</strong><span class="CV_NOTIF_TIME">${escHtml(relTime(n.createdAt))}</span></span><p>${escHtml(n.message)}</p><span class="CV_NOTIF_META"><i class="fa-solid fa-arrow-right"></i> ${escHtml(modTitle)}</span></span>${n.isRead?'':'<span class="CV_NOTIF_DOT" aria-label="Unread"></span>'}</button>`;
        }).join('');
    }
    async function loadNotifications(){
        if(notifLoading){notifQueued=true;return;}
        notifLoading=true;notifQueued=false;
        const collected=[];
        const seenId=new Set();
        const pushItem=(item)=>{
            if(!item?.id||seenId.has(item.id))return;
            seenId.add(item.id);
            const isRead=Boolean(item.serverRead||readIds.has(item.id));
            if(item.serverRead)readIds.add(item.id);
            collected.push({...item,isRead});
        };
        const safeList=async(tableKey,limit=50)=>{
            const tableId=api.config.tables[tableKey];
            if(!tableId)return [];
            try{
                const res=await api.tablesDB.listRows({
                    databaseId:api.config.databaseId,
                    tableId,
                    queries:[window.Appwrite.Query.orderDesc('$createdAt'),window.Appwrite.Query.limit(limit)]
                });
                return res.rows||[];
            }catch{
                try{
                    const res=await api.tablesDB.listRows({
                        databaseId:api.config.databaseId,
                        tableId,
                        queries:[window.Appwrite.Query.limit(limit)]
                    });
                    return res.rows||[];
                }catch{return [];}
            }
        };
        const recentActionBoost=(actionNames,windowMs=20000)=>actionNames.includes(lastLocalNotifAction.action)&&(Date.now()-lastLocalNotifAction.at)<windowMs;
        try{
            // 1. Community notifications (likes/upvotes, comments, replies, join requests, official notices, deleted items)
            let commLoaded=false;
            try{
                const commRes=await api.operate('communityNotifications');
                if(Array.isArray(commRes?.notifications)){
                    commLoaded=true;
                    for(const n of commRes.notifications){
                        if(n.kind==='announcement'){
                            const parsed=parseAnnouncementBrgy({barangay:n.barangay,body:n.message});
                            if(!matchUserBarangay(parsed.barangay))continue;
                            pushItem({
                                ...n,
                                title:parsed.barangay&&!String(n.title||'').includes(parsed.barangay)?`CVO Announcement (${parsed.barangay}): ${String(n.title||'').replace(/^CVO Announcement:\s*/i,'')}`:n.title,
                                message:parsed.body||n.message
                            });
                        }else{
                            pushItem(n);
                        }
                    }
                }
            }catch{}
            // Client fallback if the Function hasn't been redeployed with communityNotifications yet
            if(!commLoaded){
                try{
                    const ov=await api.operate('communityOverview');
                    for(const n of (ov?.notices||[])){
                        const parsed=parseAnnouncementBrgy(n);
                        if(!matchUserBarangay(parsed.barangay))continue;
                        pushItem({
                            id:'comm_notice_'+n.id,
                            category:'alerts',
                            kind:n.category||'announcement',
                            title:n.category==='outbreak'?`Declared Outbreak: ${n.title}`:n.category==='advisory'?`CVO Advisory: ${n.title}`:(parsed.barangay?`CVO Announcement (${parsed.barangay}): ${n.title}`:`CVO Announcement: ${n.title}`),
                            message:`${parsed.barangay?'Brgy. '+parsed.barangay+' · ':''}${String(parsed.body||'').slice(0,100)}`,
                            createdAt:n.date,
                            module:role==='officer'?'alerts':'community'
                        });
                    }
                    const readableCh=(ov?.channels||[]).filter(c=>c.canRead).slice(0,12);
                    const chData=await Promise.allSettled(readableCh.map(c=>api.operate('communityChannel',{channelId:c.id})));
                    const commentTargets=[];
                    for(let i=0;i<chData.length;i++){
                        if(chData[i].status!=='fulfilled')continue;
                        const chName=readableCh[i].name;
                        const chId=readableCh[i].id;
                        for(const p of (chData[i].value?.posts||[])){
                            if((p.commentCount||0)>0){
                                commentTargets.push({p,chName,chId});
                            }
                            if(p.authorId===user.$id&&(p.upvotes||0)>0){
                                const voteTs=trackMetricTimestamp('up_p_'+p.id,p.upvotes,p.createdAt,recentActionBoost(['communityVote']));
                                pushItem({
                                    id:`comm_upvotes_${p.id}_${p.upvotes}`,
                                    category:'community',
                                    kind:'like_post',
                                    title:`${p.upvotes} upvote${p.upvotes===1?'':'s'} on your discussion`,
                                    message:`"${p.title}" in #${chName} has ${p.upvotes} upvote${p.upvotes===1?'':'s'}.`,
                                    createdAt:voteTs,
                                    module:'community',
                                    channelId:chId,
                                    postId:p.id
                                });
                            }
                        }
                    }
                    // Fetch exact comment details & timestamps so new comments ALWAYS sort strictly on top
                    commentTargets.sort((a,b)=>((b.p.authorId===user.$id?1:0)-(a.p.authorId===user.$id?1:0))||(parseTime(b.p.createdAt)-parseTime(a.p.createdAt)));
                    const recentCommentTargets=commentTargets.slice(0,20);
                    const commentResults=await Promise.allSettled(
                        recentCommentTargets.map(t=>api.operate('communityComments',{postId:t.p.id}))
                    );
                    for(let i=0;i<recentCommentTargets.length;i++){
                        const {p,chName,chId}=recentCommentTargets[i];
                        const res=commentResults[i];
                        if(res.status==='fulfilled'){
                            const list=(res.value?.comments||[]).filter(c=>!c.isDeleted);
                            const byId=new Map(list.map(c=>[c.id,c]));
                            for(const c of list){
                                const parent=c.parentCommentId?byId.get(c.parentCommentId):null;
                                const cleanAuthor=String(c.authorName||'A community member').replace(/\s*\[(Admin|Field Officer)\]\s*$/i,'').trim();
                                if(c.authorId!==user.$id&&parent&&!parent.isDeleted&&parent.authorId===user.$id){
                                    pushItem({
                                        id:'comm_reply_'+c.id,
                                        category:'community',
                                        kind:'comment_reply',
                                        title:`${cleanAuthor} replied to your comment`,
                                        message:`"${String(c.body||'').slice(0,85)}" in "${p.title}"`,
                                        createdAt:c.createdAt,
                                        module:'community',
                                        channelId:chId,
                                        postId:p.id
                                    });
                                }else if(p.authorId===user.$id){
                                    const isSelf=c.authorId===user.$id;
                                    pushItem({
                                        id:'comm_comment_'+c.id,
                                        category:'community',
                                        kind:'post_comment',
                                        title:isSelf?'New comment on your discussion':`${cleanAuthor} commented on your discussion`,
                                        message:`${isSelf?'You commented on':'On'} "${p.title}": "${String(c.body||'').slice(0,80)}" (#${chName})`,
                                        createdAt:c.createdAt,
                                        module:'community',
                                        channelId:chId,
                                        postId:p.id
                                    });
                                }
                                if(c.authorId===user.$id&&(c.upvotes||0)>0){
                                    const cVoteTs=trackMetricTimestamp('up_c_'+c.id,c.upvotes,c.createdAt,recentActionBoost(['communityVote']));
                                    pushItem({
                                        id:`comm_c_upvotes_${c.id}_${c.upvotes}`,
                                        category:'community',
                                        kind:'like_comment',
                                        title:`${c.upvotes} upvote${c.upvotes===1?'':'s'} on your comment`,
                                        message:`"${String(c.body||'').slice(0,65)}" on "${p.title}"`,
                                        createdAt:cVoteTs,
                                        module:'community',
                                        channelId:chId,
                                        postId:p.id
                                    });
                                }
                            }
                        }else if(p.authorId===user.$id){
                            const cmTs=trackMetricTimestamp('cm_p_'+p.id,p.commentCount,p.createdAt,recentActionBoost(['communityCreateComment']));
                            pushItem({
                                id:`comm_comments_${p.id}_${p.commentCount}`,
                                category:'community',
                                kind:'post_comment',
                                title:`${p.commentCount} comment${p.commentCount===1?'':'s'} on your discussion`,
                                message:`"${p.title}" in #${chName} has ${p.commentCount} comment${p.commentCount===1?'':'s'}.`,
                                createdAt:cmTs,
                                module:'community',
                                channelId:chId,
                                postId:p.id
                            });
                        }
                    }
                }catch{}
            }

            // 2. Gather core tables in parallel based on user role
            const [pets,petProfiles,petRequests,medicalRecords,adoptionApps,adoptionListings,matchNotifs,ownershipRows,alertRows,diseaseReports,idRequests,staffPets]=await Promise.all([
                safeList('pets',80),
                safeList('petProfiles',80),
                safeList('petRequests',60),
                safeList('medical',60),
                safeList('adoptionApplications',60),
                safeList('adoptionListings',60),
                role==='owner'?safeList('petMatchNotifications',40):Promise.resolve([]),
                safeList('ownership',50),
                safeList(role==='owner'?'ownerAlerts':'diseaseAlerts',40),
                (role==='admin'||role==='officer')?safeList('diseaseReports',50):Promise.resolve([]),
                safeList('ownerVerificationRequests',50),
                (role==='admin'||role==='officer')?api.operate('getStaffPetDirectory').then(r=>r?.pets||[]).catch(()=>[]):Promise.resolve([])
            ]);

            const petNameById=new Map();
            for(const p of petProfiles)if(p.$id&&p.petName)petNameById.set(p.$id,p.petName);
            for(const p of pets){
                if(p.$id&&p.petName)petNameById.set(p.$id,p.petName);
                if(p.petProfileId&&p.petName)petNameById.set(p.petProfileId,p.petName);
            }
            for(const p of staffPets||[]){
                if(p.$id&&p.petName)petNameById.set(p.$id,p.petName);
                if(p.petProfileId&&p.petName)petNameById.set(p.petProfileId,p.petName);
            }
            const listingById=new Map(adoptionListings.map(l=>[l.$id,l]));

            // 3. Adoption Match Preferences Notifications (Pet Owners)
            for(const m of matchNotifs){
                pushItem({
                    id:'match_notif_'+m.$id,
                    matchRowId:m.$id,
                    serverRead:Boolean(m.isRead),
                    category:'adoptions',
                    kind:'match',
                    title:`Adoption Match: ${m.petName||m.title||'New companion'}`,
                    message:m.message||`${m.title||'A new pet listing'} matches your adoption preferences.`,
                    createdAt:m.createdAt||m.$createdAt,
                    module:'adoptions'
                });
            }

            const appRowById=new Map(adoptionApps.map(a=>[a.$id,a]));
            // 4. Incoming Adoption Applications on User's Listed Pets (Pet Owners)
            if(role==='owner'){
                try{
                    const ownApps=await api.operate('listOwnListingApplications');
                    for(const a of (ownApps?.applications||[])){
                        const listing=listingById.get(a.listingId);
                        const fullApp=appRowById.get(a.$id);
                        const pName=a.petNameSnapshot||listing?.title||petNameById.get(a.petId)||'your listed pet';
                        if(a.status==='pending'){
                            pushItem({
                                id:'adopt_in_pending_'+a.$id,
                                category:'adoptions',
                                kind:'application_incoming',
                                title:`New adoption request for ${pName}`,
                                message:`${a.applicantName||'A citizen'} applied to adopt ${pName}: "${String(a.message||'').slice(0,75)}"`,
                                createdAt:a.submittedAt||a.$createdAt||fullApp?.$createdAt,
                                module:'adoptions'
                            });
                        }else if(a.status==='owner_approved'||a.status==='approved'){
                            pushItem({
                                id:'adopt_in_approved_'+a.$id,
                                category:'adoptions',
                                kind:'application_handover',
                                title:`Handover ready for ${pName}`,
                                message:`You approved ${a.applicantName||'the applicant'}. Confirm the transfer once handover is complete.`,
                                createdAt:a.reviewedAt||a.$updatedAt||fullApp?.$updatedAt||a.submittedAt||a.$createdAt,
                                module:'adoptions'
                            });
                        }
                    }
                }catch{}
            }

            // 5. User's Submitted Adoption Applications & Status Updates
            for(const a of adoptionApps){
                const listing=listingById.get(a.listingId);
                const pName=a.petNameSnapshot||a.listingTitleSnapshot||listing?.title||petNameById.get(a.petId)||'Pet listing';
                if(a.applicantId===user.$id){
                    if(a.status==='owner_approved'||a.status==='approved'){
                        pushItem({
                            id:`adopt_my_${a.$id}_approved`,
                            category:'adoptions',
                            kind:'application_status',
                            title:`Adoption application approved!`,
                            message:`Your request to adopt ${pName} was approved by the owner.`,
                            createdAt:a.reviewedAt||a.$updatedAt||a.submittedAt||a.$createdAt,
                            module:'adoptions'
                        });
                    }else if(a.status==='completed'){
                        pushItem({
                            id:`adopt_my_${a.$id}_completed`,
                            category:'adoptions',
                            kind:'application_status',
                            title:`Adoption completed: ${pName}`,
                            message:`${pName} has been officially transferred to your account.`,
                            createdAt:a.completedAt||a.$updatedAt||a.submittedAt||a.$createdAt,
                            module:'adoptions'
                        });
                    }else if(a.status==='rejected'){
                        pushItem({
                            id:`adopt_my_${a.$id}_rejected`,
                            category:'adoptions',
                            kind:'application_status',
                            title:`Update on your adoption request`,
                            message:`Your application for ${pName} was not selected.`,
                            createdAt:a.reviewedAt||a.$updatedAt||a.submittedAt||a.$createdAt,
                            module:'adoptions'
                        });
                    }else{
                        pushItem({
                            id:`adopt_my_${a.$id}_submitted`,
                            category:'adoptions',
                            kind:'application_status',
                            title:`Adoption application submitted`,
                            message:`Your request for ${pName} is awaiting review by the pet owner.`,
                            createdAt:a.submittedAt||a.$createdAt,
                            module:'adoptions'
                        });
                    }
                }else if(role==='admin'&&a.status==='pending'){
                    pushItem({
                        id:'admin_adopt_app_'+a.$id,
                        category:'adoptions',
                        kind:'application_incoming',
                        title:`Adoption application: ${pName}`,
                        message:`${a.applicantName||'Applicant'} applied for ${pName}.`,
                        createdAt:a.submittedAt||a.$createdAt,
                        module:'adoptions'
                    });
                }
            }

            // 6. Treatments, Vaccinations & Expiry Reminders
            const EXP_RE=/\s*\[Exp:\s*(\d{4}-\d{2}-\d{2})\]\s*$/i;
            const myPetIds=new Set([
                ...petProfiles.filter(p=>p.ownerId===user.$id).map(p=>p.$id),
                ...pets.filter(p=>p.ownerId===user.$id).map(p=>p.$id)
            ]);
            for(const m of medicalRecords){
                const isMine=role==='owner'?myPetIds.has(m.petId):true;
                if(!isMine)continue;
                const pName=petNameById.get(m.petId)||'Pet';
                const expMatch=String(m.description||'').match(EXP_RE);
                const expDate=m.expiryDate||(expMatch?expMatch[1]:'');
                const adminDateLabel=m.dateAdministered?(()=>{try{return new Date(m.dateAdministered).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'});}catch{return String(m.dateAdministered).slice(0,10);}})():'record';
                const expLabel=expDate?String(expDate).slice(0,10):'';
                if(role==='owner'||m.veterinarianId!==user.$id){
                    pushItem({
                        id:'med_rec_'+m.$id,
                        category:'medical',
                        kind:'treatment',
                        title:`${m.recordType||'Medical record'} recorded for ${pName}`,
                        message:`${m.medicineType||'Treatment'} administered on ${adminDateLabel}${expLabel?` (Expires ${expLabel})`:''}.`,
                        createdAt:m.$createdAt||m.dateAdministered,
                        module:'medical'
                    });
                }
                if(expDate){
                    const daysLeft=Math.ceil((new Date(expDate).getTime()-Date.now())/(1000*60*60*24));
                    if(Number.isFinite(daysLeft)&&daysLeft<=30){
                        pushItem({
                            id:`med_exp_${m.$id}_${expLabel}`,
                            category:'medical',
                            kind:'vaccine_expiry',
                            title:daysLeft<0?`${pName}: ${m.medicineType||'Vaccination'} expired`:`${pName}: ${m.medicineType||'Vaccination'} expiring soon`,
                            message:daysLeft<0?`${m.medicineType||'Vaccine'} expired on ${expLabel}. Schedule a booster with CVO.`:`${m.medicineType||'Vaccine'} expires on ${expLabel} (${daysLeft} day${daysLeft===1?'':'s'} remaining).`,
                            createdAt:m.$updatedAt||m.$createdAt||expDate,
                            module:'medical'
                        });
                    }
                }
            }

            // 7. Pet Verification & Registration Status / Ownership Transfers
            if(role==='owner'){
                for(const p of petProfiles.filter(x=>x.ownerId===user.$id)){
                    if(p.verificationStatus==='verified'){
                        pushItem({
                            id:`pet_ver_${p.$id}_verified`,
                            category:'medical',
                            kind:'pet_verified',
                            title:`${p.petName||'Your pet'} is CVO Verified`,
                            message:`Official CVO verification and digital QR identity are active for ${p.petName}.`,
                            createdAt:p.$updatedAt||p.$createdAt,
                            module:'pets'
                        });
                    }else if(p.verificationStatus==='rejected'){
                        pushItem({
                            id:`pet_ver_${p.$id}_rejected`,
                            category:'medical',
                            kind:'pet_rejected',
                            title:`Verification update for ${p.petName||'your pet'}`,
                            message:`CVO requested updates on your verification request${p.reviewNotes?`: "${p.reviewNotes}"`:'.'}`,
                            createdAt:p.$updatedAt||p.$createdAt,
                            module:'pets'
                        });
                    }
                }
                for(const req of idRequests.filter(x=>(x.ownerId||x.userId)===user.$id)){
                    if(req.status==='approved'||req.status==='verified'){
                        pushItem({
                            id:`id_ver_${req.$id}_approved`,
                            category:'medical',
                            kind:'id_verified',
                            title:'Pet Owner ID Verified',
                            message:'Your CVO account verification was approved. Full Community and registry features are unlocked.',
                            createdAt:req.reviewedAt||req.$updatedAt||req.$createdAt,
                            module:'profile'
                        });
                    }else if(req.status==='rejected'){
                        const reason=req.reviewNote||req.rejectionReason;
                        pushItem({
                            id:`id_ver_${req.$id}_rejected`,
                            category:'medical',
                            kind:'id_rejected',
                            title:'Account ID verification update',
                            message:reason?`Reason: ${reason}`:'Please review and resubmit your valid ID in My Profile.',
                            createdAt:req.reviewedAt||req.$updatedAt||req.$createdAt,
                            module:'profile'
                        });
                    }
                }
            }

            // Ownership transfers involving the user
            for(const h of ownershipRows){
                if(h.newOwnerId===user.$id||h.previousOwnerId===user.$id||role==='admin'){
                    const pName=h.petName||h.petNameSnapshot||petNameById.get(h.petId)||'Registered pet';
                    pushItem({
                        id:'own_hist_'+h.$id,
                        category:'adoptions',
                        kind:'transfer',
                        title:`Ownership transfer: ${pName}`,
                        message:`Transferred from ${h.previousOwnerName||'previous owner'} to ${h.newOwnerName||'new owner'}.`,
                        createdAt:h.transferDate||h.$createdAt,
                        module:'traceability'
                    });
                }
            }

            // 8. CVO Outbreak & Public Health Alerts
            for(const a of alertRows.filter(x=>x.isActive)){
                pushItem({
                    id:'cvo_alert_'+a.$id,
                    category:'alerts',
                    kind:a.isOutbreak?'outbreak':'advisory',
                    title:a.isOutbreak?`Outbreak Alert: ${a.title}`:`Health Advisory: ${a.title}`,
                    message:`${a.barangay||'Iligan City'} · ${a.diseaseType||'Advisory'} — ${String(a.message||'').slice(0,90)}`,
                    createdAt:a.issuedAt||a.$createdAt,
                    module:role==='owner'?'community':'alerts'
                });
            }

            // 9. Staff Queue Notifications (Admin & Field Officers)
            if(role==='admin'||role==='officer'){
                for(const r of diseaseReports.filter(x=>x.status==='pending')){
                    pushItem({
                        id:'staff_report_'+r.$id,
                        category:'alerts',
                        kind:'incident_report',
                        title:`Pending Incident: ${r.diseaseType||'Report'} in ${r.barangay||'Iligan City'}`,
                        message:r.description?String(r.description).slice(0,90):'Awaiting CVO surveillance review.',
                        createdAt:r.reportedAt||r.$createdAt,
                        module:'surveillance'
                    });
                }
            }
            if(role==='admin'){
                for(const r of petRequests.filter(x=>(x.reviewStatus||x.status)==='pending')){
                    pushItem({
                        id:'staff_petreq_'+r.$id,
                        category:'medical',
                        kind:'pet_request',
                        title:`Pet verification request: ${r.petName||'Pet'}`,
                        message:`Submitted by ${r.ownerName||'Pet Owner'} (${r.species||'Pet'} · ${r.barangay||'Iligan City'}).`,
                        createdAt:r.submittedAt||r.$createdAt,
                        module:'pets'
                    });
                }
                for(const r of idRequests.filter(x=>x.status==='pending')){
                    pushItem({
                        id:'staff_idreq_'+r.$id,
                        category:'medical',
                        kind:'id_request',
                        title:`Owner ID verification: ${r.userName||r.ownerName||'Pet Owner'}`,
                        message:`Submitted ${r.idCategoryName||r.categoryName||'valid ID'} for CVO account verification.`,
                        createdAt:r.submittedAt||r.$createdAt,
                        module:'users'
                    });
                }
            }

            collected.sort((a,b)=>parseTime(b.createdAt)-parseTime(a.createdAt));
            notifItems=collected.slice(0,80);
            renderNotifications();
        }finally{
            notifLoading=false;
            if(notifQueued){
                notifQueued=false;
                setTimeout(()=>loadNotifications(),60);
            }
        }
    }
    if(notifButton&&notifDropdown){
        notifButton.addEventListener('click',e=>{
            e.stopPropagation();
            const open=notifDropdown.hidden;
            notifDropdown.hidden=!open;
            notifButton.classList.toggle('is-open',open);
            notifButton.setAttribute('aria-expanded',open?'true':'false');
            if(open)loadNotifications();
        });
        document.addEventListener('click',e=>{
            if(!notifDropdown.hidden&&!e.target.closest('#notifWrap')){
                notifDropdown.hidden=true;
                notifButton.classList.remove('is-open');
                notifButton.setAttribute('aria-expanded','false');
            }
        });
        document.addEventListener('keydown',e=>{
            if(e.key==='Escape'&&!notifDropdown.hidden){
                notifDropdown.hidden=true;
                notifButton.classList.remove('is-open');
                notifButton.setAttribute('aria-expanded','false');
            }
        });
        notifTabs?.addEventListener('click',e=>{
            const tab=e.target.closest('[data-notif-filter]');
            if(!tab)return;
            activeNotifFilter=tab.dataset.notifFilter||'all';
            notifTabs.querySelectorAll('[data-notif-filter]').forEach(b=>b.classList.toggle('is-active',b===tab));
            renderNotifications();
        });
        notifMarkAllBtn?.addEventListener('click',async()=>{
            const unreadMatches=notifItems.filter(n=>!n.isRead&&n.matchRowId);
            for(const n of notifItems){
                n.isRead=true;
                readIds.add(n.id);
            }
            saveReadIds();
            renderNotifications();
            for(const m of unreadMatches){
                api.operate('markAdoptionMatchRead',{notificationId:m.matchRowId}).catch(()=>{});
            }
        });
        notifList?.addEventListener('click',async e=>{
            const btn=e.target.closest('[data-notif-id]');
            if(!btn)return;
            const item=notifItems.find(x=>x.id===btn.dataset.notifId);
            if(!item)return;
            item.isRead=true;
            readIds.add(item.id);
            saveReadIds();
            if(item.matchRowId){
                api.operate('markAdoptionMatchRead',{notificationId:item.matchRowId}).catch(()=>{});
            }
            renderNotifications();
            notifDropdown.hidden=true;
            notifButton.classList.remove('is-open');
            notifButton.setAttribute('aria-expanded','false');
            if(item.module&&allowed.includes(item.module)){
                openModule(item.module);
                if(item.module==='community'&&(item.channelId||item.postId)&&communityHub?.focusTarget){
                    setTimeout(()=>communityHub.focusTarget({channelId:item.channelId,postId:item.postId}),120);
                }
            }
        });
    }
    loadNotifications();
    // Realtime + automatic background sync for all tables and modules.
    let syncTimer=null,pendingSync=false,notifSyncTimer=null;
    function scheduleNotifSync(delay=160){
        clearTimeout(notifSyncTimer);
        notifSyncTimer=setTimeout(()=>loadNotifications(),delay);
    }
    window.CityVetRefreshNotifications=()=>scheduleNotifSync(120);
    function isNetworkErrorText(text){
        return /failed to fetch|networkerror|network request failed|load failed|offline|unable to load|could not load/i.test(String(text||''));
    }
    function clearNetworkErrors(){
        const selectors=['#cvNotice','#phase4Notice','#p46Notice','#communityNotice','.CV_MODAL_ERROR','.P4_FORM_ERRORS','.COMM_MODAL_ERROR','.CV412_CONFIRM_ERROR','.CV422_MODAL_ERROR'];
        for(const el of document.querySelectorAll(selectors.join(','))){
            if(!el.hidden&&isNetworkErrorText(el.textContent)){
                el.hidden=true;
                el.textContent='';
            }
        }
    }
    function canRunBackgroundSync(){
        const activeEl=document.activeElement;
        if(activeEl&&['INPUT','TEXTAREA','SELECT'].includes(activeEl.tagName)&&activeEl.id!=='searchInput'&&!activeEl.closest('.P4_SIDE_FILTERS,.CV49_ALERT_FILTERS,.CV_FILTER_BOX'))return false;
        const modals=[...document.querySelectorAll('.CV_MODAL,.COMM_MODAL')];
        const hasBlockingModal=modals.some(m=>!m.classList.contains('P46_DETAILS_MODAL')&&!m.classList.contains('CV422_REPORT_MODAL')&&!m.hasAttribute('data-comments-post-id'));
        return !hasBlockingModal;
    }
    async function refreshActiveModule(){
        if(navigator.onLine!==false)clearNetworkErrors();
        if(!canRunBackgroundSync()){pendingSync=true;return;}
        pendingSync=false;
        loadHeaderAvatar();
        checkAlertFeed();
        checkCommunityAnnouncements();
        loadNotifications();
        const activeKey=document.querySelector('#sideNav .is-active')?.dataset.module||'home';
        const hasModuleError=Boolean(moduleContainer.querySelector('.CV_ERROR,.COMM_ERROR'));
        if(activeKey==='home'){
            if(role==='owner'){
                loadOwnerFeaturedAdoptions();
                loadOwnerCommunityDiscussions();
                loadOwnerAnnouncements();
            }else{
                refreshOverview();
            }
        }else if(activeKey==='pets'){
            openRegistry?.reload(!hasModuleError);
        }else if(activeKey==='community'||(activeKey==='alerts'&&role==='officer')){
            communityHub?.refresh(!hasModuleError);
        }else if(['surveillance','reports','profile'].includes(activeKey)){
            if(activeKey!=='profile'||!document.activeElement?.closest('#profileInfoForm'))phase4Hub.refresh(!hasModuleError);
        }else{
            featureHub.refresh?.(!hasModuleError);
        }
    }
    function scheduleDynamicSync(delay=380){
        clearTimeout(syncTimer);
        syncTimer=setTimeout(()=>refreshActiveModule(),delay);
    }
    window.addEventListener('online',()=>{
        clearNetworkErrors();
        scheduleNotifSync(80);
        scheduleDynamicSync(80);
    });
    api.subscribeRealtime?.(event=>{
        const row=event?.payload;
        if(row?.$id&&alertTable&&(event?.channels||[]).some(c=>c.includes(alertTable))&&!seenAlerts.has(row.$id)&&row.isActive){
            seenAlerts.add(row.$id);
            showLiveAlert(row);
        }
        scheduleNotifSync(180);
        scheduleDynamicSync(350);
    });
    window.addEventListener('cityvet:data-changed',e=>{
        if(e?.detail?.source==='local'){
            if(e?.detail?.action)lastLocalNotifAction={action:e.detail.action,at:Date.now()};
            scheduleNotifSync(180);
            scheduleDynamicSync(450);
        }
    });
    document.addEventListener('focusout',()=>{if(pendingSync)scheduleDynamicSync(300);});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleDynamicSync(150);});
    setInterval(()=>{if(!document.hidden)scheduleDynamicSync(100);},20000);
    overlay.hidden = true;
    view.hidden = false;

    
    let ownerCommOverviewPromise = null;
    function fetchOwnerCommunityOverview() {
        if (!ownerCommOverviewPromise) {
            ownerCommOverviewPromise = api.operate('communityOverview').finally(() => {
                setTimeout(() => { ownerCommOverviewPromise = null; }, 500);
            });
        }
        return ownerCommOverviewPromise;
    }

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
            let posts = [];
            try {
                const ov = await fetchOwnerCommunityOverview();
                const readable = (ov?.channels || []).filter(c => c.canRead).slice(0, 4);
                const chResults = await Promise.allSettled(readable.map(c => api.operate('communityChannel', { channelId: c.id })));
                for (let i = 0; i < chResults.length; i++) {
                    if (chResults[i].status === 'fulfilled') {
                        const chName = readable[i].name;
                        const chId = readable[i].id;
                        for (const p of (chResults[i].value?.posts || [])) {
                            posts.push({ ...p, channelName: chName, channelId: chId });
                        }
                    }
                }
                posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                posts = posts.slice(0, 3);
            } catch {
                const tableId = api.config.tables.communityPosts;
                const response = await api.tablesDB.listRows({
                    databaseId: api.config.databaseId,
                    tableId,
                    queries: [window.Appwrite.Query.limit(3)]
                });
                posts = (response.rows || []).reverse();
            }
            if (!posts.length) {
                container.className = 'EMPTY_STATE';
                container.innerHTML = '<p>No community discussions yet.</p>';
                return;
            }
            container.className = 'LIST_CONTENT';
            container.replaceChildren(...posts.map(item => {
                const row = document.createElement('div');
                row.className = 'LIST_ITEM';
                row.style.cursor = 'pointer';
                row.addEventListener('click', () => {
                    document.querySelector('[data-module="community"]')?.click();
                    if ((item.channelId || item.id) && communityHub?.focusTarget) {
                        setTimeout(() => communityHub.focusTarget({ channelId: item.channelId, postId: item.id || item.$id }), 120);
                    }
                });

                const details = document.createElement('div');
                details.className = 'ITEM_DETAILS';

                const h4 = document.createElement('h4');
                h4.textContent = item.title || 'Community Post';

                const sub = document.createElement('p');
                sub.className = 'SUB_TEXT';
                const bodyText = item.body || '';
                const prefix = item.channelName ? `#${item.channelName} · ` : '';
                sub.textContent = prefix + (bodyText.length > 55 ? bodyText.substring(0, 55) + '…' : (bodyText || 'Join the discussion'));

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
                queries: [window.Appwrite.Query.limit(10)]
            });
            const listings = (response.rows || []).filter(l => l.isActive !== false && l.status !== 'adopted').slice(-3).reverse();
            if (!listings.length) {
                container.className = 'EMPTY_STATE';
                container.innerHTML = '<p>No pets currently listed for adoption.</p>';
                return;
            }
            container.className = 'LIST_CONTENT';
            container.replaceChildren(...listings.map(item => {
                const row = document.createElement('div');
                row.className = 'LIST_ITEM';
                row.style.cursor = 'pointer';
                row.addEventListener('click', () => document.querySelector('[data-module="adoptions"]')?.click());

                const details = document.createElement('div');
                details.className = 'ITEM_DETAILS';

                const h4 = document.createElement('h4');
                h4.textContent = item.title || item.petName || 'Adoptable Pet';

                const sub = document.createElement('p');
                sub.className = 'SUB_TEXT';
                const meta = [item.species, item.breed, item.barangay ? `Brgy. ${item.barangay}` : ''].filter(Boolean).join(' · ');
                sub.textContent = meta || item.description || 'Ready for adoption';

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
            let announcements = [];
            try {
                const res = await fetchOwnerCommunityOverview();
                announcements = (res?.notices || []).filter(r => r.isActive !== false);
            } catch {
                const tableId = api.config.tables.ownerAlerts;
                const response = await api.tablesDB.listRows({
                    databaseId: api.config.databaseId,
                    tableId,
                    queries: [window.Appwrite.Query.limit(10)]
                });
                announcements = (response.rows || []).filter(r => r.isActive !== false);
            }
            announcements = announcements.filter(r => matchUserBarangay(parseAnnouncementBrgy(r).barangay));
            if (!announcements.length) {
                container.innerHTML = '<p class="CV_OWNER_ANNOUNCE_EMPTY">No official announcements for your barangay at this time.</p>';
                return;
            }
            const topItems = announcements.slice(0, 1);
            container.innerHTML = `<div class="CV_OWNER_ANNOUNCE_LIST">` + topItems.map(item => {
                const parsed = parseAnnouncementBrgy(item);
                const isOutbreak = item.category === 'outbreak' || item.isOutbreak;
                const dateText = item.date || item.issuedAt || item.$createdAt;
                const fmtDate = dateText ? new Date(dateText).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                return `<div class="CV_OWNER_ANNOUNCE_ITEM ${isOutbreak ? 'is-outbreak' : ''}">
                    <div class="CV_OWNER_ANNOUNCE_TOP">
                        <strong>${escapeHtml(item.title || 'Official CVO Notice')}</strong>
                        <div class="CV_OWNER_ANNOUNCE_TAGS">
                            ${parsed.barangay ? `<span class="CV_OWNER_ANNOUNCE_TAG"><i class="fa-solid fa-location-dot"></i> Brgy. ${escapeHtml(parsed.barangay)}</span>` : '<span class="CV_OWNER_ANNOUNCE_TAG">Citywide</span>'}
                            ${fmtDate ? `<span class="CV_OWNER_ANNOUNCE_DATE">${escapeHtml(fmtDate)}</span>` : ''}
                        </div>
                    </div>
                    <p>${escapeHtml(parsed.body || item.message || '')}</p>
                </div>`;
            }).join('') + `</div>`;
        } catch (e) {
            console.warn('Owner announcements failed:', e);
            container.innerHTML = '<p class="CV_OWNER_ANNOUNCE_EMPTY">Unable to load official announcements right now.</p>';
        }
    }

})();
