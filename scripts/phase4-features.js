/* Phase 4 UI: responsive surveillance, profile management, and analytics. */
(function(){
'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const D=v=>v?new Date(v).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}):'—';
const config=window.CITYVET_CONFIG;
const dateTime=v=>v?new Date(v).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'—';
const roleLabel=v=>({owner:'Pet Owner',officer:'Field Officer',admin:'Administrator',unknown:'Unclassified'}[v]||'Unclassified');
function kde(map,cases){
 if(!cases.length)return null;
 const bound=map.getBounds(),s=map.getSize(),width=Math.min(520,Math.max(240,Math.round(s.x))),height=Math.min(450,Math.max(230,Math.round(s.y)));
 const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');const image=ctx.createImageData(width,height),weights=new Float32Array(width*height);
 const factor=width/Math.max(1,s.x),zoom=map.getZoom();let max=0;
 for(const row of cases){const pt=map.latLngToContainerPoint([row.latitude,row.longitude]);const px=pt.x*factor,py=pt.y*(height/Math.max(1,s.y));
   const metersPerPixel=156543.03*Math.cos(row.latitude*Math.PI/180)/Math.pow(2,zoom);
   // Approximately 250 m Gaussian bandwidth. No giant constant-size blob at low zoom.
   const sigma=Math.max(4,Math.min(17,(250/metersPerPixel)*factor));const r=Math.ceil(sigma*2.7);
   for(let y=Math.max(0,Math.floor(py-r));y<Math.min(height,Math.ceil(py+r));y++)for(let x=Math.max(0,Math.floor(px-r));x<Math.min(width,Math.ceil(px+r));x++){
     const dx=x-px,dy=y-py,t=Math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma));weights[y*width+x]+=t;
   }
 }
 for(const v of weights)if(v>max)max=v;
 for(let i=0;i<weights.length;i++){
  const v=max?weights[i]/max:0;if(v<.085)continue;const ix=i*4;
  const rgb=v<.33?[55,145,246]:v<.60?[255,202,85]:v<.82?[253,135,57]:[220,58,62];
  image.data[ix]=rgb[0];image.data[ix+1]=rgb[1];image.data[ix+2]=rgb[2];image.data[ix+3]=Math.round(165*Math.pow(v,.8));
 }
 ctx.putImageData(image,0,0);
 return window.L.imageOverlay(c.toDataURL('image/png'),bound,{interactive:false,opacity:.74}).addTo(map);
}
function earthKm(a,b){const r=Math.PI/180,lat=(a.latitude-b.latitude)*r,lng=(a.longitude-b.longitude)*r,p=Math.sin(lat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(lng/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(p)));}
function dbscan(points,eps=1.5,min=3){const labels=Array(points.length).fill(undefined),sets=[];const near=i=>points.map((p,j)=>earthKm(points[i],p)<=eps?j:-1).filter(j=>j!==-1);
 for(let i=0;i<points.length;i++){if(labels[i]!==undefined)continue;const n=near(i);if(n.length<min){labels[i]=-1;continue;}const cid=sets.length;sets.push([]);labels[i]=cid;const queue=[...n],seen=new Set(queue);for(let k=0;k<queue.length;k++){const j=queue[k];if(labels[j]===-1)labels[j]=cid;if(labels[j]!==undefined&&labels[j]!==cid)continue;labels[j]=cid;const around=near(j);if(around.length>=min)for(const nxt of around)if(!seen.has(nxt)){queue.push(nxt);seen.add(nxt);}}}
 labels.forEach((v,i)=>{if(v>=0)sets[v].push(points[i]);});return sets;
}
function csvDownload(name,rows){const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),900);}
function mount({api,current,container}){
 const admin=current.role==='admin',officer=current.role==='officer',role=current.role,owner=current.role==='owner';
 const Q=window.Appwrite.Query;let key='',filter='',map=null,heat=null,charts=[],profile=null;
 const survState={selected:null,reportTab:'active',category:'',barangay:'',reporter:'',showMarkers:true,showBorders:true,mapCenter:null,mapZoom:null,feedScroll:0,cachedGeo:null,cachedGeoSource:''};
 async function fetchTable(name){const result=await api.tablesDB.listRows({databaseId:config.databaseId,tableId:config.tables[name],queries:[Q.orderDesc('$createdAt'),Q.limit(100)]});return result.rows||[];}
 // Incident backlogs need pagination: the old single 100-row request hid older archives.
 // Cursor pagination avoids duplicate/omitted records when newer reports arrive.
 async function fetchReportBacklog(){
   const records=[],seen=new Set();let last=null,limited=false;
   for(let pageIndex=0;pageIndex<20;pageIndex++){
     const queries=[Q.orderDesc('$createdAt'),Q.limit(100)];
     if(last){if(typeof Q.cursorAfter!=='function'){limited=true;break;}queries.push(Q.cursorAfter(last));}
     const result=await api.tablesDB.listRows({databaseId:config.databaseId,tableId:config.tables.diseaseReports,queries});
     const batch=result.rows||[];
     for(const row of batch)if(row.$id&&!seen.has(row.$id)){seen.add(row.$id);records.push(row);}
     if(batch.length<100)break;
     const id=batch.at(-1)?.$id;
     if(!id||id===last){limited=true;break;}last=id;
     if(pageIndex===19)limited=true;
   }
   return {records,limited};
 }
 function notice(text,err=false){let n=container.querySelector('#phase4Notice');if(!n)return;n.hidden=!text;n.className='P4_NOTICE '+(err?'P4_NOTICE_ERROR':'P4_NOTICE_SUCCESS');n.textContent=text;}
 async function uploadIncidentEvidence(form){
   const file=form.querySelector('input[name="reportImage"]')?.files?.[0];
   if(!file)return '';
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5000000)throw Error('Incident evidence must be JPG, PNG or WEBP, maximum 5 MB.');
   const A=window.Appwrite;
   const permissions=[A.Permission.read(A.Role.user(current.user.$id)),A.Permission.update(A.Role.user(current.user.$id)),A.Permission.delete(A.Role.user(current.user.$id))];
   const image=await api.storage.createFile({bucketId:config.buckets.media,fileId:A.ID.unique(),file,permissions});
   return image.$id;
 }
 function cleanup(){charts.forEach(c=>{try{c.destroy();}catch{}});charts=[];if(map){map.remove();map=null;heat=null;}}
 function head(label,title,description,button=''){return `<div class="CV_HEAD"><div><div class="CV_KICKER">${E(label)}</div><h2>${E(title)}</h2><p>${E(description)}</p></div><div class="CV_ACTION_BAR">${button}</div></div>`;}
 function html(body){
  if(map){try{survState.mapCenter=map.getCenter();survState.mapZoom=map.getZoom();}catch{}}
  const catEl=container.querySelector('#p4DiseaseType'),statEl=container.querySelector('#p4Status'),repEl=container.querySelector('#p4ReporterType');
  if(catEl)survState.category=catEl.value;if(statEl)survState.barangay=statEl.value;if(repEl)survState.reporter=repEl.value;
  const mChk=container.querySelector('#p46ShowMarkers'),bChk=container.querySelector('#p46ShowBorders'),feedEl=container.querySelector('#p4ReportRows');
  if(mChk)survState.showMarkers=mChk.checked;if(bChk)survState.showBorders=bChk.checked;if(feedEl)survState.feedScroll=feedEl.scrollTop;
  const scroller=document.querySelector('.DASHBOARD_CONTENT')||document.documentElement;
  const scrollTop=scroller.scrollTop;
  cleanup();
  container.innerHTML=`<div class="CV_WORKSPACE"><div id="phase4Notice" hidden></div>${body}</div>`;
  scroller.scrollTop=scrollTop;
 }
 function btn(name,label,icon='fa-plus',extra=''){return `<button class="CV_BUTTON ${extra||'PRIMARY_ACTION'}" type="button" data-f4="${name}"><i class="fa-solid ${icon}"></i> ${E(label)}</button>`;}
 function stat(label,value,icon,foot){return `<article class="P4_STAT"><div class="P4_STAT_TOP"><span>${E(label)}</span><i class="fa-solid ${icon}"></i></div><strong>${E(value)}</strong><small>${E(foot)}</small></article>`;}
 async function open(name){const same=key===name&&container.querySelector('.CV_WORKSPACE');key=name;filter='';await refresh(Boolean(same));}
 async function refresh(silent=false){
  if(!key)return;
  const prevNotice=container.querySelector('#phase4Notice');
  const savedNotice=prevNotice&&!prevNotice.hidden&&!prevNotice.classList.contains('P4_NOTICE_ERROR')?{text:prevNotice.textContent,err:false}:null;
  if(!silent){cleanup();container.innerHTML='<div class="CV_LOADING"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading records…</div>';}
  try{
   if(key==='surveillance')await surveillance();else if(key==='reports')await reports();else if(key==='profile')await profilePage();
   if(silent&&savedNotice)notice(savedNotice.text,savedNotice.err);
  }
  catch(e){if(!silent)html(head('DATA CONNECTION','Unable to load this module','Check your connection and access permissions.')+`<div class="CV_ERROR">${E(api.readableError(e))}</div>`);}
 }
 function search(value){filter=String(value||'').toLowerCase().trim();if(key)refresh(true);}
 function popupForm(title,fields,onSave,successMsg='Saved successfully.'){const d=document.createElement('div');d.className='CV_MODAL';d.innerHTML=`<div class="CV_MODAL_CARD P4_DIALOG"><div class="CV_MODAL_HEAD"><h3>${E(title)}</h3><button type="button" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><form class="P4_PET_FORM">${fields}<div class="P4_FORM_ERRORS" role="alert" hidden></div><div class="P4_FORM_FOOT"><button type="button" class="CV_SOFT CV_BUTTON" data-close>Cancel</button><button type="submit" class="PRIMARY_ACTION">Send Report</button></div></form></div>`;
  d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-close]'))d.remove();});d.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;b.textContent='Saving…';try{await onSave(e.currentTarget);d.remove();await refresh(true);notice(successMsg);}catch(x){const err=d.querySelector('.P4_FORM_ERRORS');err.hidden=false;err.textContent=api.readableError(x);}finally{b.disabled=false;b.textContent='Save changes';}});document.body.append(d);return d;}
 async function profilePage(){
  const user=current.user, name=user.name||user.email;
  try{profile=await api.tablesDB.getRow({databaseId:config.databaseId,tableId:config.tables.userProfiles,rowId:user.$id});}catch(e){if(e.code===404)profile=null;else throw e;}
  const avatar=profile?.profileImageId?String(api.storage.getFileView({bucketId:config.buckets.media,fileId:profile.profileImageId})):'';
  const verificationStatus=profile?.accountVerificationStatus||'unverified';
  const badge=owner&&verificationStatus==='verified';
  let availableCategories=[],ownedPets=[],verificationRequests=[];
  if(owner){
    [availableCategories,ownedPets,verificationRequests]=await Promise.all([
      fetchTable('idCategories').catch(()=>[]),fetchTable('petProfiles').catch(()=>[]),fetchTable('ownerVerificationRequests').catch(()=>[])
    ]);
    availableCategories=availableCategories.filter(c=>c.isActive);
    ownedPets=ownedPets.filter(p=>p.ownerId===user.$id);
    verificationRequests=verificationRequests.filter(r=>r.ownerId===user.$id);
  }
  const pendingVerification=verificationRequests.find(r=>r.status==='pending');
  const roleText=admin?'Administrator':officer?'Field Officer':'Pet Owner';
  html(head('ACCOUNT SETTINGS','My Profile','Manage your personal information, profile image and account security.')+
   `<section class="P4_PROFILE_GRID CV49_PROFILE_GRID"><article class="P4_PROFILE_CARD"><div class="P4_PROFILE_COVER"><span class="CV49_COVER_BADGE"><i class="fa-solid fa-paw"></i> CITYVETHUB ACCOUNT</span></div><div class="P4_PROFILE_AVATAR">${avatar?`<img src="${E(avatar)}" alt="Profile picture" onerror="this.hidden=true">`:`<i class="fa-solid fa-user"></i>`}${badge?`<span class="CV411_VERIFIED_CHECK" title="CVO verified Pet Owner" aria-label="Verified Pet Owner"><i class="fa-solid fa-check"></i></span>`:''}</div><div class="P4_PROFILE_BODY"><h3>${E(profile?.fullName||name)}</h3><p>${E(user.email)}</p><div class="P4_ROLE_ROW"><span class="P4_ROLE_TAG"><i class="fa-solid fa-shield-halved"></i> ${E(roleText)}</span><span class="P4_ROLE_TAG P4_ROLE_SOFT"><i class="fa-solid fa-calendar-days"></i> Member since ${E(D(user.$createdAt))}</span></div><div class="CV49_PROFILE_SUBHEAD">Your CityVetHub identity <span>Account overview</span></div><div class="P4_PROFILE_META"><span>Account role <b>${E(roleText)}</b></span><span>City / municipality <b>Iligan City</b></span><span>Barangay <b>${E(profile?.barangay||'Not set')}</b></span><span>Phone <b>${E(profile?.phone||'Not provided')}</b></span><span>Address <b>${E(profile?.address||'Not provided')}</b></span>${owner?'':`<span>Assigned area <b>${E(profile?.assignedArea||'Not set')}</b></span>`}</div></div></article>`+
   `<article class="P4_PROFILE_FORM_CARD"><div class="P4_SECTION_HEADING CV49_SECTION_HEAD"><h3>Personal information</h3><span>Contact details remain private; your photo appears in Community</span></div><div class="CV49_PROFILE_BANNER"><span><i class="fa-solid fa-pen-to-square"></i> Account details</span><small>Maintain accurate contact information for veterinary services and adoption coordination.</small></div><form id="profileInfoForm" class="P4_PET_FORM">`+
    `<label>Full name <input name="fullName" required maxlength="128" value="${E(profile?.fullName||name)}"></label>`+
    `<label>Email <input name="email" type="email" value="${E(user.email)}" readonly title="Use Change email for account security"></label>`+
    `<label>Phone <input name="phone" maxlength="40" value="${E(profile?.phone||'')}"></label>`+
    `<label>Barangay <input name="barangay" maxlength="100" value="${E(profile?.barangay||'')}"></label>`+
    `<label class="P4_FORM_WIDE">Home address <input name="address" maxlength="200" value="${E(profile?.address||'')}"></label>`+
    (owner?'':`<label>Position <input name="position" maxlength="100" value="${E(profile?.position||'')}"></label><label>Officer / Employee ID <input name="employeeId" maxlength="60" value="${E(profile?.employeeId||'')}"></label><label>Assigned Area <input name="assignedArea" maxlength="100" value="${E(profile?.assignedArea||'')}"></label>`)+
    `<label class="P4_FORM_WIDE">Profile picture (JPG, PNG, WEBP; max 5 MB)<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp"><small>Your photo will appear beside your discussions and comments for signed-in Community readers. No photo? Your initials will appear instead.</small></label>`+
    `<label class="P4_CHECK CV49_PROFILE_SHARE"><input type="checkbox" name="shareAvatarOnListings" ${profile?.shareAvatarOnListings?'checked':''}> Allow my profile picture to appear on my public adoption listings <small>This setting affects adoption listings only. Your Community avatar is displayed separately.</small></label>`+
    `<div class="P4_FORM_FOOT"><button class="PRIMARY_ACTION" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save profile</button></div></form>`+
    `<div class="P4_PROFILE_SECURITY"><h3>Account security</h3><p>Change your email or password using Appwrite's authenticated account settings.</p>${btn('changePassword','Change password','fa-key','CV_SOFT')}${btn('changeEmail','Change email','fa-envelope','CV_SOFT')}</div></article></section>`+
   (owner?`<section class="CV411_VERIFICATION_PANEL"><div class="CV411_VERIFICATION_HEAD"><div><span class="CV_KICKER">ACCOUNT IDENTITY</span><h3><i class="fa-solid fa-id-card"></i> Pet Owner Verification</h3><p>To verify your account, you need at least one saved pet and a photo of an accepted government-issued ID. Only CVO staff may view your ID document.</p></div><span class="CV411_VERIFY_STATUS CV411_VERIFY_${E(verificationStatus)}">${badge?'✔ Verified Pet Owner':verificationStatus==='pending'?'Awaiting CVO review':verificationStatus==='rejected'?'Verification rejected':'Not yet verified'}</span></div><div class="CV411_VERIFY_STEPS"><span><i class="fa-solid fa-${ownedPets.length?'circle-check':'circle'}"></i> ${ownedPets.length} pet${ownedPets.length===1?'':'s'} in your inventory</span><span><i class="fa-solid fa-id-card"></i> Government ID required</span><span><i class="fa-solid fa-shield-halved"></i> CVO approval</span></div>${verificationStatus==='pending'?`<p class="CV411_VERIFY_HELP">Your verification request is awaiting CVO review. If your ID image cannot be opened, you may replace it without starting a new request.</p>${pendingVerification?'<button type="button" class="CV_SOFT CV_BUTTON" id="cv413ReplaceGovernmentID"><i class="fa-solid fa-file-arrow-up"></i> Replace government ID photo</button>':''}`:badge?'<p class="CV411_VERIFY_HELP">Your account is verified. A green check now appears on your profile picture. You are eligible to report incidents.</p>':`<button type="button" class="PRIMARY_ACTION" id="cv411RequestAccount"><i class="fa-solid fa-paper-plane"></i> Request account verification</button>${!availableCategories.length?'<p class="CV411_VERIFY_HELP">The CVO must first create an accepted government ID category.</p>':''}`}</section>`:'')
  );
  container.querySelector('#cv413ReplaceGovernmentID')?.addEventListener('click',()=>{
    if(!pendingVerification)return;
    popupForm('Replace private government ID',`<label class="P4_FORM_WIDE">New government ID image (JPG, PNG or WEBP, max 5 MB)<input type="file" name="document" accept="image/jpeg,image/png,image/webp" required></label><p class="CV_HINT P4_FORM_WIDE">Your request remains pending. Only the new private document will be used for the CVO review.</p>`,async form=>{
      const file=form.elements.document.files[0];
      if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5000000)throw Error('Choose a JPG, PNG or WEBP image under 5 MB.');
      const A=window.Appwrite;
      const image=await api.storage.createFile({bucketId:config.buckets.media,fileId:A.ID.unique(),file,permissions:[A.Permission.read(A.Role.user(user.$id)),A.Permission.update(A.Role.user(user.$id)),A.Permission.delete(A.Role.user(user.$id))]});
      await api.operate('replaceVerificationDocument',{requestId:pendingVerification.$id,documentFileId:image.$id});
    });
  });
  container.querySelector('#cv411RequestAccount')?.addEventListener('click',()=>{
    if(!ownedPets.length||!availableCategories.length){
      const missing=!ownedPets.length?'You need at least one pet saved in My Pets.':'The CVO has not yet created an active government ID category.';
      const next=!ownedPets.length?'Go to My Pets, save a pet, then return here.':'Ask the CVO Administrator to open Account Management and select Create ID category. Once an accepted ID is added, return here and submit your photo.';
      const overlay=document.createElement('div');overlay.className='CV_MODAL CV412_VERIFY_PREREQ';
      overlay.innerHTML=`<div class="CV_MODAL_CARD CV412_PREREQ_CARD" role="dialog" aria-modal="true"><div class="CV_MODAL_HEAD"><h3>Account verification requirements</h3><button type="button" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="CV412_PREREQ_MESSAGE"><i class="fa-solid fa-circle-info"></i><div><strong>${E(missing)}</strong><p>${E(next)}</p></div></div><div class="CV412_CONFIRM_FOOT"><button type="button" class="PRIMARY_ACTION CV_BUTTON" data-close>Understood</button></div></div>`;
      overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-close]'))overlay.remove();});
      document.body.append(overlay);return;
    }
    const fields=`<label>Choose your pet<select name="petProfileId" required><option value="">Select one of your pets</option>${ownedPets.map(p=>`<option value="${E(p.$id)}">${E(p.petName)} (${E(p.species)})</option>`).join('')}</select></label>`+
      `<label>Government ID category<select name="idCategoryId" required><option value="">Select accepted ID</option>${availableCategories.map(c=>`<option value="${E(c.$id)}">${E(c.name)}</option>`).join('')}</select></label>`+
      `<label class="P4_FORM_WIDE">Photo of government ID (JPG, PNG, WEBP — maximum 5 MB)<input type="file" name="document" accept="image/jpeg,image/png,image/webp" required></label>`+
      `<p class="CV_HINT P4_FORM_WIDE"><i class="fa-solid fa-lock"></i> Only authorized administrators can review this private identity document. It is never shown on public QR profiles or adoption listings.</p>`;
    const dialog=popupForm('Request Pet Owner account verification',fields,async form=>{
      const file=form.elements.document.files[0];
      if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5000000)throw Error('Choose a JPG, PNG or WEBP ID image under 5 MB.');
      const A=window.Appwrite;
      const upload=await api.storage.createFile({bucketId:config.buckets.media,fileId:A.ID.unique(),file,permissions:[A.Permission.read(A.Role.user(user.$id)),A.Permission.update(A.Role.user(user.$id)),A.Permission.delete(A.Role.user(user.$id))]});
      await api.operate('requestAccountVerification',{petProfileId:form.elements.petProfileId.value,idCategoryId:form.elements.idCategoryId.value,documentFileId:upload.$id});
    });
    dialog.querySelector('[type=submit]').textContent='Submit verification request';
  });
  container.querySelector('#profileInfoForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,save=form.querySelector('[type=submit]');save.disabled=true;
    const values=new FormData(form),picture=form.querySelector('[name=avatar]').files[0];
    const fullName=String(values.get('fullName')||'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim();
    if(!fullName){notice('Enter a valid full name.',true);save.disabled=false;return;}
    let savedText=false,photoWarning='',nameWarning='',newPhotoId=profile?.profileImageId||'';
    try{
      // Save text first. Photo uploads and identity changes are independent steps.
      await api.operate('saveProfile',{
        fullName,phone:String(values.get('phone')||''),address:String(values.get('address')||''),
        barangay:String(values.get('barangay')||''),position:String(values.get('position')||''),
        employeeId:String(values.get('employeeId')||''),assignedArea:String(values.get('assignedArea')||'')
      });
      savedText=true;
      if(picture){
        try{
          if(!['image/jpeg','image/png','image/webp'].includes(picture.type)||picture.size>5_000_000)throw Error('Use JPG, PNG or WEBP up to 5 MB.');
          const A=window.Appwrite;
          const image=await api.storage.createFile({bucketId:config.buckets.media,fileId:A.ID.unique(),file:picture,permissions:[A.Permission.read(A.Role.user(user.$id)),A.Permission.update(A.Role.user(user.$id)),A.Permission.delete(A.Role.user(user.$id))]});
          await api.operate('saveProfileImage',{profileImageId:image.$id});
          newPhotoId=image.$id;
        }catch(e){photoWarning=' Photo was not changed: '+api.readableError(e);}
      }
      const shareAvatarOnListings=form.querySelector('[name=shareAvatarOnListings]').checked;
      if(shareAvatarOnListings!==!!profile?.shareAvatarOnListings){
        try{await api.operate('setProfilePhotoSharing',{shareAvatarOnListings});}
        catch(e){photoWarning+=' Profile photo sharing preference could not be updated: '+api.readableError(e);}
      }
      if(fullName!==current.user.name){
        try{await api.account.updateName({name:fullName});current.user.name=fullName;}
        catch(e){nameWarning=' Auth display name could not be synchronized: '+api.readableError(e);}
      }
      document.getElementById('userName').textContent=fullName;
      const avatarBox=document.getElementById('initials');
      if(newPhotoId&&avatarBox){
        const pictureNode=document.createElement('img');pictureNode.alt='Profile picture';
        pictureNode.src=String(api.storage.getFileView({bucketId:config.buckets.media,fileId:newPhotoId}));
        pictureNode.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%';
        pictureNode.onerror=()=>{avatarBox.textContent=fullName.slice(0,1).toUpperCase();};
        avatarBox.replaceChildren(pictureNode);
      }
      await refresh(true);notice('Profile information saved.'+photoWarning+nameWarning,!!(photoWarning||nameWarning));
    }catch(e){notice((savedText?'Some profile changes may have saved. ':'Profile was not saved. ')+api.readableError(e),true);}
    finally{save.disabled=false;}
  });
  container.querySelectorAll('[data-f4]').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.f4==='changePassword')popupForm('Change password',`<label class="P4_FORM_WIDE">Current password <input name="old" type="password" required autocomplete="current-password"></label><label>New password <input name="new" type="password" required minlength="12" autocomplete="new-password"></label><label>Confirm new password <input name="confirm" type="password" required minlength="12" autocomplete="new-password"></label>`,async f=>{const d=new FormData(f);if(d.get('new')!==d.get('confirm'))throw Error('New passwords do not match');await api.account.updatePassword({password:String(d.get('new')),oldPassword:String(d.get('old'))});});
    if(b.dataset.f4==='changeEmail')popupForm('Change email',`<label>New email <input name="email" type="email" required></label><label>Current password <input name="password" type="password" required></label>`,async f=>{const d=new FormData(f);await api.account.updateEmail({email:String(d.get('email')),password:String(d.get('password'))});current.user.email=String(d.get('email'));document.getElementById('accountEmail').textContent=current.user.email;});
  }));
 }
 async function surveillance(){
  const staff=admin||officer;
  if(owner){
    const ownerProfile=await api.tablesDB.getRow({databaseId:config.databaseId,tableId:config.tables.userProfiles,rowId:current.user.$id}).catch(e=>e.code===404?null:Promise.reject(e));
    const ownerVerified=ownerProfile?.accountVerificationStatus==='verified';
    // Citizens cannot see other people's incident reports or case counts; unverified owners cannot submit.

    const categories=await fetchTable('incidentCategories');
    const available=categories.filter(c=>c.isActive).map(c=>c.name).sort();
    function ownerForm(seed={}){
      if(!ownerVerified)return notice('Only CVO-verified Pet Owners can report incidents. Go to My Profile to request verification.',true);
      if(!available.length)return notice('Incident reporting is not available until the CVO creates an incident category.',true);
      const fields=`<label>Incident category<select required name="diseaseType"><option value="" disabled selected>Choose a category</option>${available.map(t=>`<option>${E(t)}</option>`).join('')}</select></label><label>Barangay<input required name="barangay" maxlength="100" value="${E(seed.barangay||'')}"></label><label>Latitude<input name="latitude" required type="number" step="any" value="${E(seed.latitude??'8.228')}"></label><label>Longitude<input name="longitude" required type="number" step="any" value="${E(seed.longitude??'124.245')}"></label><label class="P4_FORM_WIDE">Incident details<textarea name="description" maxlength="1000" rows="4" placeholder="Describe what you observed (animal type, symptoms, etc.)"></textarea></label><label class="P4_FORM_WIDE">Photo evidence (optional) <input type="file" name="reportImage" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG or WEBP up to 5 MB. Private to CVO staff and the reporting owner.</small></label>`;
      const d=popupForm('Report a suspected incident',fields,async f=>{const payload=Object.fromEntries(new FormData(f));payload.photoFileId=await uploadIncidentEvidence(f);delete payload.reportImage;await api.operate('submitDisease',payload);});
      if(d&&seed.latitude!=null){fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${seed.latitude}&lon=${seed.longitude}&zoom=14`,{signal:AbortSignal.timeout(5000)}).then(r=>r.json()).then(x=>{if(d.isConnected){const input=d.querySelector('[name=barangay]');const suggested=x.address?.suburb||x.address?.village||x.address?.neighbourhood||'';const matched=window.CityVetBarangays?.match(suggested)||'';if(input&&!input.value&&matched)input.value=matched;}}).catch(()=>{});}
    }
    html(head('INCIDENT REPORTING','Report an Incident','Send a suspected animal-health incident to the CVO. Reports are confidential and do not appear on a public case map.',ownerVerified?btn('reportDisease','Report incident','fa-plus'):btn('goVerification','Verify account first','fa-shield-halved'))+
      `<div class="P47_OWNER_REPORT"><div class="P4_SIDE_CARD"><div class="P47_OWNER_REPORT_ICON"><i class="fa-solid fa-clipboard-list"></i></div><h3>Help protect animals in your barangay</h3><p>Share what you observed, where it happened, and any relevant details. The CVO will review submitted information before making public announcements.</p><p><strong>Privacy:</strong> Other people's incident submissions are not shown here.</p>${ownerVerified?'<div class="CV411_VERIFIED_NOTICE"><i class="fa-solid fa-circle-check"></i> Verified account — incident reporting enabled</div>':'<div class="CV411_LOCKED_NOTICE"><i class="fa-solid fa-lock"></i> Incident reporting is for verified Pet Owners only. Request verification in My Profile.</div>'}</div><div class="P4_MAP_CARD"><div class="P4_MAP_HEAD"><div><h3>Choose a report location</h3><p>Tap the map to prefill the incident coordinates</p></div></div><div class="P4_MAP" id="p4Map"></div><div class="P4_MAP_FOOT">Choose a location to start a new report. The map does not display other users' reports.</div></div></div>`);
    container.querySelector('[data-f4=reportDisease]')?.addEventListener('click',()=>ownerForm());
    container.querySelector('[data-f4=goVerification]')?.addEventListener('click',()=>document.querySelector('#sideNav [data-module=profile]')?.click());
    if(window.L){map=window.L.map('p4Map',{scrollWheelZoom:false}).setView([8.228,124.245],12);window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);if(ownerVerified)map.on('click',e=>ownerForm({latitude:e.latlng.lat.toFixed(6),longitude:e.latlng.lng.toFixed(6)}));setTimeout(()=>map?.invalidateSize(),150);}
    return;
  }
  const [backlog,cases,categories,alerts]=await Promise.all([
    fetchReportBacklog(),staff?fetchTable('diseaseIncidents'):Promise.resolve([]),fetchTable('incidentCategories'),fetchTable('diseaseAlerts')
  ]);
  const reports=backlog.records;
  const selectedCategories=categories.filter(c=>c.isActive).map(c=>c.name).sort();
  const reporterOptions=['','owner','officer','admin','unknown'];
  const roles=reports.filter(r=>r.status!=='archived').map(r=>({...r,reporterRole:r.reporterRole||'unknown'}));
  const archivedRoles=reports.filter(r=>r.status==='archived').map(r=>({...r,reporterRole:r.reporterRole||'unknown'}));
  if(staff){
    const unknownIds=[...new Set([...roles,...archivedRoles].filter(r=>r.reporterRole==='unknown'&&r.reportedById).map(r=>r.reportedById))].slice(0,40);
    if(unknownIds.length)try{const x=await api.operate('resolveReporterRoles',{userIds:unknownIds});for(const r of [...roles,...archivedRoles])if(r.reporterRole==='unknown'&&x?.roles?.[r.reportedById])r.reporterRole=x.roles[r.reportedById];}catch{}
  }
  const normalizedName=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(brgy|barangay)\b/g,'').replace(/[^a-z0-9]/g,'').trim();
  const groups=new Map();
  for(const report of roles){const name=report.barangay||'Unknown barangay',k=normalizedName(name);if(!groups.has(k))groups.set(k,{name,reports:[],key:k});groups.get(k).reports.push(report);}
  const sortedGroups=[...groups.values()].sort((a,b)=>b.reports.length-a.reports.length||a.name.localeCompare(b.name));
  const archiveMap=new Map();for(const r of archivedRoles){const name=r.barangay||'Unknown barangay',k=normalizedName(name);if(!archiveMap.has(k))archiveMap.set(k,{name,key:k,reports:[]});archiveMap.get(k).reports.push(r);}
  const archivedGroups=[...archiveMap.values()].sort((a,b)=>b.reports.length-a.reports.length||a.name.localeCompare(b.name));
  const outbreaks=alerts.filter(a=>a.isOutbreak||String(a.title||'').startsWith('Declared outbreak'));
  const declared=outbreaks.filter(a=>a.isActive);
  const outbreakBarangays=new Set(declared.map(a=>normalizedName(a.barangay)));
  const hasOutbreak=(name)=>outbreakBarangays.has(normalizedName(name));
  const incidentCount=declared.length;
  const severity=count=>count>=11?'red':count>=3?'yellow':count>=1?'green':'neutral';
  const borderColor=count=>({red:'#ef4444',green:'#22a06b',yellow:'#f5bc36',neutral:'#94a3b8'}[severity(count)]);
  let selected=survState.selected,reportTab=survState.reportTab||'active',boundary=null,geoLayer=null,markers=null,pulseMarkers=null;
  const preset=String.raw`<label>Incident category <select name="diseaseType" required><option value="" selected disabled>Select a category</option>${selectedCategories.map(t=>`<option>${E(t)}</option>`).join('')}</select></label>`;
  function incidentForm(seed={}){
    return `${preset}<label>Barangay <input name="barangay" maxlength="100" required value="${E(seed.barangay||'')}"></label><label>Latitude <input name="latitude" required type="number" step="any" value="${E(seed.latitude??'8.228')}"></label><label>Longitude <input name="longitude" required type="number" step="any" value="${E(seed.longitude??'124.245')}"></label><label class="P4_FORM_WIDE">Case notes <textarea name="description" maxlength="1000" rows="3" placeholder="Symptoms, animal and context"></textarea></label><label class="P4_FORM_WIDE">Photo evidence (optional) <input type="file" name="reportImage" accept="image/jpeg,image/png,image/webp"><small>Only the report owner and authorized staff can view the original photo.</small></label><p class="CV_HINT P4_FORM_WIDE">This records an incident report, not a confirmed disease or outbreak.</p>`;
  }
  function openIncidentForm(seed={}){if(!selectedCategories.length){notice('An administrator must first create at least one incident category.',true);return null;}return popupForm('Report suspected incident',incidentForm(seed),async form=>{const d=Object.fromEntries(new FormData(form));d.photoFileId=await uploadIncidentEvidence(form);delete d.reportImage;await api.operate('submitDisease',d);});}
  html(head('INCIDENT INTELLIGENCE','Incident Surveillance','Barangay-focused incident reporting, CVO-defined categories, and geographic monitoring.',
    (admin?btn('createCategory','Create category','fa-plus','CV_SOFT'):'')+btn('reportDisease','Report incident','fa-plus'))+
    `<div class="P4_SURVEILLANCE_LAYOUT CV49_SURVEILLANCE_LAYOUT"><section class="P4_SURVEILLANCE_SIDE"><div class="P4_QUAD_STATS">${stat('Active reports',roles.length,'fa-clipboard-list','Archived reports excluded')}${stat('Confirmed outbreaks',incidentCount,'fa-triangle-exclamation','Active CVO declarations')}${stat('Barangays reporting',sortedGroups.length,'fa-map-location-dot','Locations with reports')}${stat('Active alerts',alerts.filter(a=>a.isActive).length,'fa-bullhorn','Published warnings')}</div>`+
    `<div class="P4_SIDE_CARD CV420_REPORT_CARD"><div class="P4_SECTION_HEADING"><h3 id="cv420ReportTitle">Active reports by barangay</h3><span>${backlog.limited?'Displaying first 2,000 accessible reports · ':'Click to expand coordinates · '}Older records available in Archive</span></div>`+
    (admin?`<nav class="CV420_REPORT_TABS" aria-label="Incident report views"><button type="button" class="CV420_TAB" data-report-tab="active" aria-pressed="true"><i class="fa-solid fa-clipboard-list"></i> Active Reports <b>${roles.length}</b></button><button type="button" class="CV420_TAB" data-report-tab="archived" aria-pressed="false"><i class="fa-solid fa-box-archive"></i> Archived Reports <b>${archivedRoles.length}</b></button></nav>`:'')+
    `<div class="P4_SIDE_FILTERS P4_SIDE_FILTERS_3"><label>Category <select id="p4DiseaseType"><option value="">All categories</option>${[...new Set([...roles,...archivedRoles].map(r=>r.diseaseType).filter(Boolean))].map(t=>`<option>${E(t)}</option>`).join('')}</select></label><label>Barangay <select id="p4Status"><option value="">All barangays</option>${[...new Map([...sortedGroups,...archivedGroups].map(g=>[g.key,g])).values()].sort((a,b)=>a.name.localeCompare(b.name)).map(g=>`<option value="${E(g.key)}">${E(g.name)}</option>`).join('')}</select></label><label>Reporter <select id="p4ReporterType">${reporterOptions.map(r=>`<option value="${E(r)}">${E(r?roleLabel(r):'All reporters')}</option>`).join('')}</select></label></div><div id="p4ReportRows" class="P4_REPORT_FEED"></div></div>`+
    (admin?`<div class="P4_SIDE_CARD CV420_OUTBREAKS"><div class="P4_SECTION_HEADING"><h3><i class="fa-solid fa-triangle-exclamation"></i> Declared Outbreaks</h3><span>${outbreaks.length} total</span></div><div class="CV420_OUTBREAK_LIST">${outbreaks.length?outbreaks.map(a=>`<div class="CV420_OUTBREAK_ROW"><span class="CV420_OUTBREAK_DOT ${a.isActive?'CV420_DOT_ACTIVE':''}"></span><div class="CV420_OUTBREAK_META"><strong>${E(a.barangay)} — ${E(a.diseaseType)}</strong><small>${a.isActive?'Active declaration':'Inactive declaration'} · ${E(D(a.issuedAt))}</small></div><button type="button" class="CV420_ACTION CV420_DANGER" data-delete-outbreak="${E(a.$id)}" title="Delete this outbreak declaration and linked owner alert"><i class="fa-solid fa-trash-can"></i> Delete</button></div>`).join(''):'<p class="P4_FEED_EMPTY">No outbreaks declared.</p>'}</div></div>`:'')+
    `<div class="P4_SIDE_CARD P4_BRIEF"><h3>Barangay report volume</h3><div class="P46_LEGEND"><span class="P46_LEVEL P46_GREEN"></span> 1–2: Green <span class="P46_LEVEL P46_YELLOW"></span> 3–10: Yellow <span class="P46_LEVEL P46_RED"></span> 11+: Red</div><p>Colors represent the number of submitted reports, not confirmed diagnoses. Only the CVO may declare an outbreak after assessment.</p></div></section>`+
    `<section class="P4_MAP_CARD CV49_MAP_CARD"><div class="P4_MAP_HEAD"><div><h3>Iligan City · Barangay incidents</h3><p>Click a boundary to inspect reports. Click elsewhere to report a location.</p></div><span class="P4_LIVE_TAG"><span></span> ${roles.length} active reports</span></div>`+
    `<div class="P4_MAP_OPTIONS"><label><input type="checkbox" ${survState.showMarkers!==false?'checked':''} id="p46ShowMarkers"> Incident markers</label><label><input type="checkbox" ${survState.showBorders!==false?'checked':''} id="p46ShowBorders"> Barangay outlines</label><label class="P46_GEO_IMPORT">Import verified GeoJSON <input id="p46ImportGeo" type="file" accept=".geojson,.json,application/geo+json,application/json" hidden></label></div>`+
    `<div id="p4Map" class="P4_MAP"></div><div class="P4_MAP_FOOT"><span id="p46BoundaryStatus">Loading barangay boundaries…</span><span>Map: OpenStreetMap</span></div></section></div>`);
  const feed=container.querySelector('#p4ReportRows');const categoryFilter=container.querySelector('#p4DiseaseType'),statusFilter=container.querySelector('#p4Status'),reporterFilter=container.querySelector('#p4ReporterType');
  if(survState.category&&[...categoryFilter.options].some(o=>o.value===survState.category))categoryFilter.value=survState.category;
  if(survState.barangay&&[...statusFilter.options].some(o=>o.value===survState.barangay))statusFilter.value=survState.barangay;
  if(survState.reporter&&[...reporterFilter.options].some(o=>o.value===survState.reporter))reporterFilter.value=survState.reporter;
  function filteredReports(){const source=reportTab==='archived'?archivedRoles:roles;return source.filter(r=>(!categoryFilter.value||r.diseaseType===categoryFilter.value)&&(!statusFilter.value||normalizedName(r.barangay)===statusFilter.value)&&(!reporterFilter.value||r.reporterRole===reporterFilter.value)&&(!filter||[r.diseaseType,r.barangay,r.description,r.status].some(v=>String(v||'').toLowerCase().includes(filter))));}
  async function viewIncidentDetails(reportId){
    const report=await api.operate('getIncidentReportDetails',{reportId});
    const overlay=document.createElement('div');overlay.className='CV_MODAL CV422_REPORT_MODAL';
    const image=report.photoUrl?`<div class="CV422_REPORT_PHOTO"><img src="${E(report.photoUrl)}" alt="Submitted incident evidence" onerror="this.hidden=true;this.parentElement.innerHTML='Evidence photo is unavailable or expired.'"></div>`:'<div class="CV422_REPORT_NO_IMAGE"><i class="fa-regular fa-image"></i> No photo evidence was submitted.</div>';
    const lat=Number(report.latitude),lon=Number(report.longitude),hasCoords=Number.isFinite(lat)&&Number.isFinite(lon);
    overlay.innerHTML=`<div class="CV_MODAL_CARD CV422_REPORT_DIALOG" role="dialog" aria-modal="true" aria-label="Incident report details"><div class="CV422_REPORT_HEADER"><div><span class="CV422_REPORT_OVERLINE">CITYVETHUB • INCIDENT RECORD</span><h3>${E(report.diseaseType)}</h3><p><i class="fa-solid fa-location-dot"></i> ${E(report.barangay)} · ${E(dateTime(report.reportedAt))}</p></div><button type="button" class="CV_SOFT CV_BUTTON" data-close aria-label="Close report">✕</button></div><div class="CV422_REPORT_PROFILE"><span class="CV422_REPORT_PROFILE_ICON"><i class="fa-solid fa-user-shield"></i></span><div><strong>${E(report.reporterName||'Reporter')}</strong><small>${E(roleLabel(report.reporterRole||'unknown'))} · ${E(report.status||'pending')}</small></div></div><div class="CV422_REPORT_DESCRIPTION"><h4>Incident observations</h4><p>${E(report.description||'No additional details provided.')}</p></div>${image}<div class="CV422_REPORT_FACTS"><div><span>Barangay</span><strong>${E(report.barangay)}</strong></div><div><span>Submitted</span><strong>${E(dateTime(report.reportedAt))}</strong></div><div><span>Latitude</span><strong>${E(report.latitude)}</strong></div><div><span>Longitude</span><strong>${E(report.longitude)}</strong></div></div><div class="CV422_REPORT_FOOT">${hasCoords?`<a class="CV_BUTTON CV_SOFT" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-map-location-dot"></i> View location</a>`:''}${admin?`<button type="button" class="CV_BUTTON CV_SOFT" data-report-archive><i class="fa-solid fa-box-archive"></i> ${report.status==='archived'?'Restore':'Archive'}</button><button type="button" class="CV_BUTTON CV422_DANGER" data-report-delete><i class="fa-solid fa-trash"></i> Delete</button>`:''}</div><div class="CV422_MODAL_ERROR" role="alert" hidden></div></div>`;
    const close=()=>overlay.remove();overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))close();});
    overlay.addEventListener('click',async e=>{const archive=e.target.closest('[data-report-archive]'),del=e.target.closest('[data-report-delete]');if(!archive&&!del)return;
      const operation=del?'deleteIncidentReport':report.status==='archived'?'restoreArchivedIncident':'archiveIncidentReport';
      if(!confirm(del?'Permanently delete this report? This cannot be undone.':'Update this report status?'))return;
      const action=archive||del;action.disabled=true;try{await api.operate(operation,{reportId:report.$id});close();await refresh(true);notice(del?'Report permanently deleted.':'Report status updated.');}catch(err){const target=overlay.querySelector('.CV422_MODAL_ERROR');target.hidden=false;target.textContent=api.readableError(err);action.disabled=false;}
    });document.body.append(overlay);
  }
  function renderGroups(){
    const found=filteredReports(),sourceGroups=reportTab==='archived'?archivedGroups:sortedGroups;
    const byGroup=sourceGroups.map(g=>({...g,reports:found.filter(r=>normalizedName(r.barangay)===g.key)})).filter(g=>g.reports.length);
    const groupRows=byGroup.map(g=>`<section class="P46_BRNG_GROUP"><button type="button" class="P46_BRNG_HEAD" data-barangay="${E(g.key)}"><span class="P46_LEVEL P46_${hasOutbreak(g.name)&&reportTab==='active'?'RED':severity(g.reports.length).toUpperCase()}"></span><strong>${E(g.name)}</strong>${hasOutbreak(g.name)&&reportTab==='active'?'<span class="CV420_OUTBREAK_LABEL">OUTBREAK</span>':''}<span>${g.reports.length} reports</span><i class="fa-solid fa-chevron-down"></i></button><div class="P46_BRNG_DETAILS" ${selected===g.key?'':'hidden'}>${g.reports.map(r=>`<article class="P46_INCIDENT_ROW CV422_REPORT_ENTRY" tabindex="0" role="button" aria-label="Open incident details: ${E(r.diseaseType)} in ${E(r.barangay)}" data-view-report="${E(r.$id)}"><div class="CV422_REPORT_SUMMARY"><span class="CV422_REPORT_ICON"><i class="fa-solid fa-file-medical"></i></span><div class="CV422_REPORT_SUMMARY_TEXT"><b>${E(r.diseaseType)}</b><small>${E(D(r.reportedAt))} · ${E(roleLabel(r.reporterRole))} · ${E(r.status)}</small></div><span class="CV422_VIEW_MORE"><i class="fa-solid fa-expand"></i> View details</span></div></article>`).join('')}${admin&&reportTab==='active'&&!hasOutbreak(g.name)?`<button class="CV_BUTTON P46_DECLARE" type="button" data-declare="${E(g.key)}">Declare outbreak</button>`:''}</div></section>`).join('');
    feed.innerHTML=groupRows||(reportTab==='archived'?'<p class="P4_FEED_EMPTY">No archived reports match these filters.</p>':'<p class="P4_FEED_EMPTY">No active reports match these filters.</p>');
    const title=container.querySelector('#cv420ReportTitle');if(title)title.textContent=reportTab==='archived'?'Archived Reports by Barangay':'Active reports by barangay';
    container.querySelectorAll('[data-report-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reportTab===reportTab)));
  }
  function selectBarangay(key){selected=selected===key?null:key;survState.selected=selected;renderGroups();if(!selected||!map)return;
   if(geoLayer){let found=false;geoLayer.eachLayer(layer=>{const name=featureName(layer.feature),k=normalizedName(name),isOutbreak=hasOutbreak(name),count=groups.get(k)?.reports.length||0;layer.setStyle({weight:k===selected?4:(isOutbreak?3.5:2),color:isOutbreak?'#dc2626':k===selected?'#1d4ed8':borderColor(count),fillColor:isOutbreak?'#ef4444':borderColor(count),fillOpacity:(isOutbreak?0.32:(k===selected?0.24:0.12))});if(k===selected){map.fitBounds(layer.getBounds(),{maxZoom:14});found=true;}});if(found)return;}
   const g=(reportTab==='archived'?archiveMap:groups).get(selected),r=g?.reports.find(x=>Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude)));if(r)map.setView([Number(r.latitude),Number(r.longitude)],14);
  }
  const fileInput=container.querySelector('#p46ImportGeo'),boundaryStatus=container.querySelector('#p46BoundaryStatus');
  function featureName(feature){const p=feature?.properties||{};return p.name||p.barangay||p.Barangay||p.ADM4_EN||p.NAME_4||p.BRGY_NAME||p.Brgy_Name||p.Barangay_Name||'';}
  function applyGeoJSON(fc,source){
    if(!map||!window.L||fc?.type!=='FeatureCollection'||!Array.isArray(fc.features))throw Error('Not a valid GeoJSON FeatureCollection.');
    const keep=fc.features.filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type)&&featureName(f));if(!keep.length)throw Error('GeoJSON must contain named polygon boundaries.');
    survState.cachedGeo={type:'FeatureCollection',features:keep};survState.cachedGeoSource=source;
    if(geoLayer)map.removeLayer(geoLayer);
    geoLayer=window.L.geoJSON({type:'FeatureCollection',features:keep},{renderer:window.L.svg(),style:f=>{
      const name=featureName(f),k=normalizedName(name),count=groups.get(k)?.reports.length||0,isDeclared=hasOutbreak(name);
      return {color:isDeclared?'#dc2626':k===selected?'#1d4ed8':borderColor(count),fillColor:isDeclared?'#ef4444':borderColor(count),weight:k===selected?4:(isDeclared?4:2),fillOpacity:isDeclared?0.32:(k===selected?0.24:0.12),className:isDeclared?'CV420_OUTBREAK_BOUNDARY':''};
    },onEachFeature:(feature,layer)=>{
      const name=featureName(feature),k=normalizedName(name),qty=groups.get(k)?.reports.length||0,outbreak=hasOutbreak(name);
      layer.bindTooltip(`${E(name)} · ${qty} active reports${outbreak?' · DECLARED OUTBREAK':''}`,{sticky:true});
      layer.on('click',ev=>{window.L.DomEvent.stopPropagation(ev);selectBarangay(k);});
    }});
    if(survState.showBorders!==false)geoLayer.addTo(map);
    boundaryStatus.textContent=`${keep.length} barangay boundaries loaded (${source}). Active declared outbreaks pulse red.`;
    // Position pulse beacons at verified polygon centroids, not guessed boundaries.
    if(pulseMarkers){pulseMarkers.clearLayers();for(const a of declared){let matched=false;geoLayer.eachLayer(layer=>{if(!matched&&normalizedName(featureName(layer.feature))===normalizedName(a.barangay)){
      const center=layer.getBounds().getCenter();window.L.circleMarker(center,{radius:10,weight:2,color:'#dc2626',fillColor:'#ef4444',fillOpacity:.38,className:'CV420_OUTBREAK_BEACON'}).bindTooltip(`Declared outbreak: ${E(a.barangay)} — ${E(a.diseaseType)}`).addTo(pulseMarkers);matched=true;
    }});}}
  }
  fileInput.addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>9000000)throw Error('GeoJSON file is too large (maximum 9 MB).');applyGeoJSON(JSON.parse(await file.text()),'uploaded GeoJSON');}catch(err){boundaryStatus.textContent='Boundary import failed: '+err.message;}});
  container.querySelectorAll('[data-report-tab]').forEach(b=>b.addEventListener('click',()=>{reportTab=b.dataset.reportTab;survState.reportTab=reportTab;selected=null;survState.selected=null;renderGroups();}));
  [categoryFilter,statusFilter,reporterFilter].forEach(n=>n.addEventListener('change',()=>{survState.category=categoryFilter.value;survState.barangay=statusFilter.value;survState.reporter=reporterFilter.value;renderGroups();}));
  renderGroups();
  if(survState.feedScroll)feed.scrollTop=survState.feedScroll;
  container.querySelector('.CV420_OUTBREAK_LIST')?.addEventListener('click',async event=>{
    const b=event.target.closest('[data-delete-outbreak]');if(!b||!admin)return;
    const a=outbreaks.find(x=>x.$id===b.dataset.deleteOutbreak);if(!a)return;
    if(!confirm(`Permanently delete the outbreak declaration for ${a.barangay} (${a.diseaseType})? This also removes the corresponding Pet Owner alert and the red map animation. This cannot be undone.`))return;
    b.disabled=true;try{await api.operate('deleteOutbreak',{alertId:a.$id});await refresh(true);notice('Outbreak declaration deleted.');}catch(err){notice(api.readableError(err),true);b.disabled=false;}
  });
  feed.addEventListener('click',async e=>{
    const action=e.target.closest('[data-archive-report], [data-delete-report], [data-restore-report]');
    if(action&&admin){
      const operation=action.hasAttribute('data-archive-report')?'archiveIncidentReport':action.hasAttribute('data-delete-report')?'deleteIncidentReport':'restoreArchivedIncident';
      const reportId=action.dataset.archiveReport||action.dataset.deleteReport||action.dataset.restoreReport;
      const warning=operation==='deleteIncidentReport'?'Permanently DELETE this incident report? It will not appear in Archived Reports and cannot be recovered.':operation==='archiveIncidentReport'?'Archive this incident report? It will leave the active map and case counts, but remain under Archived Reports.':'Restore this report to Active Reports?';
      if(!confirm(warning))return;
      action.disabled=true;
      try{await api.operate(operation,{reportId});await refresh(true);notice(operation==='archiveIncidentReport'?'Report archived.':operation==='deleteIncidentReport'?'Report permanently deleted.':'Report restored.');}catch(err){notice(api.readableError(err),true);action.disabled=false;}
      return;
    }
    const card=e.target.closest('[data-view-report]');if(card){viewIncidentDetails(card.dataset.viewReport).catch(err=>notice(api.readableError(err),true));return;}
    const declare=e.target.closest('[data-declare]');if(declare&&admin){const g=groups.get(declare.dataset.declare);if(!g)return;
      popupForm('Declare outbreak — '+g.name,`<div class="P4_FORM_WIDE"><p>${E(g.reports.length)} incident report(s) received. No individual report confirmation is required, but CVO must independently assess the evidence before declaring an outbreak.</p></div><label>Incident category<select required name="diseaseType">${[...new Set(g.reports.map(r=>r.diseaseType))].map(t=>`<option value="${E(t)}">${E(t)}</option>`).join('')}</select></label><label class="P4_FORM_WIDE">Official assessment / instructions<textarea required name="message" maxlength="1500" rows="4" placeholder="Explain assessed findings and official field instructions"></textarea></label><label class="P4_CHECK"><input name="notifyOwners" type="checkbox"> Also notify Pet Owners <small>(optional; Field Officers are alerted automatically)</small></label><p class="CV_HINT P4_FORM_WIDE">Field Officers always receive the declaration in their Alerts page. Only check the box to publish a Pet Owner advisory as well.</p>`,async f=>{
        const notifyOwners=!!f.elements.notifyOwners.checked;
        if(!confirm(notifyOwners?'Declare official outbreak and notify Field Officers AND Pet Owners?':'Declare official outbreak and alert Field Officers only?'))throw Error('Declaration cancelled.');
        await api.operate('declareOutbreak',{barangay:g.name,diseaseType:f.elements.diseaseType.value,message:f.elements.message.value,notifyOwners});
      });return;}
    const b=e.target.closest('[data-barangay]');if(b)selectBarangay(b.dataset.barangay);
  });
  feed.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-view-report]')){e.preventDefault();viewIncidentDetails(e.target.dataset.viewReport).catch(err=>notice(api.readableError(err),true));}});
  const createCategory=container.querySelector('[data-f4="createCategory"]');
  createCategory?.addEventListener('click',()=>popupForm('Create incident category',`<label>Category name<input required name="name" maxlength="60" placeholder="e.g. Rabies"></label><label class="P4_FORM_WIDE">Description<input name="description" maxlength="240" placeholder="Case definition or reporting guidance"></label>`,async f=>{await api.operate('createIncidentCategory',Object.fromEntries(new FormData(f)));}));
  container.querySelector('[data-f4="reportDisease"]')?.addEventListener('click',()=>openIncidentForm());
  if(!window.L){container.querySelector('#p4Map').textContent='Leaflet could not be loaded.';return;}
  map=window.L.map('p4Map',{scrollWheelZoom:false,zoomControl:true,preferCanvas:false}).setView(survState.mapCenter||[8.228,124.245],survState.mapZoom||12);
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  markers=window.L.layerGroup();if(survState.showMarkers!==false)markers.addTo(map);
  pulseMarkers=window.L.layerGroup().addTo(map);
  for(const a of declared){
    const known=roles.find(r=>normalizedName(r.barangay)===normalizedName(a.barangay)&&Number.isFinite(Number(r.latitude))&&Number.isFinite(Number(r.longitude)));
    if(known)window.L.circleMarker([Number(known.latitude),Number(known.longitude)],{radius:10,weight:2,color:'#dc2626',fillColor:'#ef4444',fillOpacity:.45,className:'CV420_OUTBREAK_BEACON'}).bindTooltip(`Declared outbreak: ${E(a.barangay)} — ${E(a.diseaseType)}`).addTo(pulseMarkers);
  }
  for(const r of roles){const lat=Number(r.latitude),lng=Number(r.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<4||lat>22||lng<116||lng>127)continue;
    window.L.circleMarker([lat,lng],{radius:5,color:'#1e40af',fillColor:borderColor(groups.get(normalizedName(r.barangay))?.reports.length||0),fillOpacity:.8}).bindPopup(`<strong>${E(r.diseaseType)}</strong><p>${E(r.barangay)} · ${E(r.status)}</p>`).addTo(markers);
  }
  const outlines=container.querySelector('#p46ShowBorders');
  outlines.addEventListener('change',e=>{survState.showBorders=e.target.checked;if(geoLayer)e.target.checked?geoLayer.addTo(map):map.removeLayer(geoLayer);});
  container.querySelector('#p46ShowMarkers').addEventListener('change',e=>{survState.showMarkers=e.target.checked;e.target.checked?markers.addTo(map):map.removeLayer(markers);});
  // First try cached GeoJSON, then local dataset, then remote ArcGIS fallback.
  (async()=>{
    if(survState.cachedGeo){try{applyGeoJSON(survState.cachedGeo,survState.cachedGeoSource||'cached boundaries');return;}catch{}}
    try{const r=await fetch('./assets/iligan-barangays.geojson');if(r.ok){applyGeoJSON(await r.json(),'local dataset');return;}}catch{}
    try{
      const env=encodeURIComponent(JSON.stringify({xmin:124.10,ymin:8.05,xmax:124.38,ymax:8.35,spatialReference:{wkid:4326}}));
      const url=`https://services7.arcgis.com/poQdgvLD6DHnbpsT/arcgis/rest/services/Philippine_Administrative_Boundaries/FeatureServer/3/query?where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&returnGeometry=true&f=geojson&resultRecordCount=250`;
      const ctrl=new AbortController(),kill=setTimeout(()=>ctrl.abort(),9000);
      try{const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw Error('ArcGIS HTTP '+r.status);const json=await r.json();
        const relevant=(json.features||[]).filter(f=>/iligan/i.test(JSON.stringify(f.properties||{}))||groups.has(normalizedName(featureName(f))));
        if(relevant.length)applyGeoJSON({type:'FeatureCollection',features:relevant},'remote boundaries');else throw Error('No matching city polygons returned');
      }finally{clearTimeout(kill);}
    }catch{boundaryStatus.textContent='Exact outlines are unavailable. Import a verified Iligan barangay GeoJSON; incident markers still work.';}
  })();
  map.on('click',evt=>{
    const dialog=openIncidentForm({latitude:evt.latlng.lat.toFixed(6),longitude:evt.latlng.lng.toFixed(6)});if(!dialog)return;
    const getBarangayInput=()=>dialog.querySelector('[name="barangay"]');
    // Prefer polygon intersection; otherwise reverse-geocode as a best-effort hint.
    let matched='';if(geoLayer)geoLayer.eachLayer(layer=>{if(!matched&&layer.getBounds?.().contains(evt.latlng)&&layer.feature){matched=featureName(layer.feature);}});
    if(matched){const input=getBarangayInput();if(input)input.value=window.CityVetBarangays?.match(matched)||matched;return;}
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${evt.latlng.lat}&lon=${evt.latlng.lng}&zoom=14`,{signal:AbortSignal.timeout(5000)}).then(r=>r.json()).then(d=>{if(dialog.isConnected){const input=getBarangayInput();const raw=d.address?.suburb||d.address?.village||d.address?.neighbourhood||'';const matched=window.CityVetBarangays?.match(raw)||'';if(input&&!input.value&&matched)input.value=matched;}}).catch(()=>{});
  });
  setTimeout(()=>map?.invalidateSize(),130);
 }
 const colors=['#3978ee','#75b3ff','#f6b44f','#f2746b','#33bca5','#8067d8','#9aabbe'];
 function chart(id,type,labels,values,label,other={}){const node=container.querySelector('#'+id);if(!node)return;
  if(!window.Chart){node.parentElement.textContent='Charts require Chart.js to load.';return;}
  const horizontal=type==='bar'&&other.horizontal,ring=['doughnut','pie'].includes(type);
  const data={labels,datasets:[{label,data:values,backgroundColor:ring?colors:colors[0],borderColor:ring?'#ffffff':colors[0],borderWidth:ring?3:0,borderRadius:ring?0:7,maxBarThickness:32,fill:true}]};
  charts.push(new window.Chart(node,{type,data,options:{responsive:true,maintainAspectRatio:false,indexAxis:horizontal?'y':'x',animation:{duration:500},cutout:type==='doughnut'?'69%':undefined,plugins:{legend:{display:ring,position:'bottom',labels:{boxWidth:9,padding:14,usePointStyle:true}},tooltip:{enabled:true}},scales:ring?undefined:{x:{grid:{display:false},ticks:{font:{size:10},maxRotation:0}},y:{beginAtZero:true,ticks:{precision:0,font:{size:10}},grid:{color:'rgba(135,155,188,.13)'}}}}}));
 }
 function monthSeries(records){const today=new Date(),months=[];for(let i=5;i>=0;i--){const d=new Date(today.getFullYear(),today.getMonth()-i,1);months.push({year:d.getFullYear(),month:d.getMonth(),label:d.toLocaleDateString('en-PH',{month:'short'})});}return {labels:months.map(m=>m.label),values:months.map(m=>records.filter(r=>{const t=new Date(r.$createdAt||r.submittedAt);return t.getFullYear()===m.year&&t.getMonth()===m.month;}).length)};}
 async function reports(){if(!admin)throw Error('Only administrators can see aggregate reports');
  const names=['petRequests','pets','petProfiles','medical','diseaseReports','diseaseIncidents','diseaseAlerts','adoptionListings','adoptionApplications','ownership'];
  const entries=await Promise.all(names.map(async k=>[k,await fetchTable(k)]));const d=Object.fromEntries(entries);d.diseaseReports=d.diseaseReports.filter(r=>r.status!=='archived');
  const vaccinePets=new Set(d.medical.filter(r=>r.recordType==='Vaccination').map(r=>r.petId)),covered=d.pets.filter(p=>vaccinePets.has(p.$id)).length;
  const coverage=d.pets.length?Math.round(covered/d.pets.length*100):0;
  const requestsByMonth=monthSeries(d.petRequests);
  const typeCount=['Dog','Cat'].map(species=>d.pets.filter(p=>p.species===species).length);
  const diseaseMap=new Map();d.diseaseIncidents.forEach(r=>diseaseMap.set(r.barangay||'Unknown',(diseaseMap.get(r.barangay||'Unknown')||0)+1));
  const barangays=[...diseaseMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  const diseases=['Rabies','Canine Parvovirus','Ringworm'].map(type=>d.diseaseIncidents.filter(r=>r.diseaseType===type).length);
  const adopted=['pending','approved','rejected'].map(s=>d.adoptionApplications.filter(a=>a.status===s).length);
  const activities=[...d.petRequests.map(r=>({date:r.$createdAt,icon:'fa-paw',label:'Pet registration submitted',details:r.petName||'Pet'})),...d.diseaseReports.map(r=>({date:r.$createdAt,icon:'fa-virus',label:'Disease report received',details:r.diseaseType||'Disease'})),...d.adoptionApplications.map(r=>({date:r.$createdAt,icon:'fa-heart',label:'Adoption application submitted',details:r.applicantName||'Applicant'}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  html(head('CVO INTELLIGENCE','Administrative Reports','Registration, health, disease and adoption analytics from accessible Appwrite records.',btn('export','Export summary CSV','fa-file-arrow-down'))+
  `<div class="P4_REPORT_KPIS">${stat('Verified pets',d.pets.length,'fa-paw','Official registry')}${stat('Pending requests',d.petRequests.filter(r=>r.reviewStatus==='pending').length,'fa-hourglass-half','Awaiting review')}${stat('Vaccination entries',d.medical.filter(r=>r.recordType==='Vaccination').length,'fa-syringe','Sampled records')}${stat('Active alerts',d.diseaseAlerts.filter(r=>r.isActive).length,'fa-triangle-exclamation','Public health')}${stat('Adoption requests',d.adoptionApplications.length,'fa-heart','All sampled statuses')}${stat('Confirmed outbreaks',d.diseaseAlerts.filter(a=>a.isActive&&(a.isOutbreak||String(a.title||'').startsWith('Declared outbreak'))).length,'fa-virus','CVO declarations')}</div>`+
  `<div class="P4_CHART_GRID"><article class="P4_CHART_CARD P4_CHART_WIDE"><div class="P4_CHART_TITLE"><div><h3>Pet registration trend</h3><p>Last six months of submitted requests</p></div><span class="P4_CHART_TAG">Monthly</span></div><div class="P4_CHART_CANVAS"><canvas id="p4RegChart"></canvas></div></article>`+
  `<article class="P4_CHART_CARD"><div class="P4_CHART_TITLE"><div><h3>Species breakdown</h3><p>Verified pets</p></div></div><div class="P4_CHART_CANVAS"><canvas id="p4SpeciesChart"></canvas></div></article>`+
  `<article class="P4_CHART_CARD"><div class="P4_CHART_TITLE"><div><h3>Incidents by barangay</h3><p>Confirmed case concentrations</p></div></div><div class="P4_CHART_CANVAS"><canvas id="p4BarangayChart"></canvas></div></article>`+
  `<article class="P4_CHART_CARD"><div class="P4_CHART_TITLE"><div><h3>Vaccination coverage</h3><p>Verified pets with an accessible vaccination record</p></div><span class="P4_CHART_BIG">${coverage}%</span></div><div class="P4_PROGRESS"><div style="width:${coverage}%"></div></div><div class="P4_CHART_CANVAS P4_CHART_SMALL"><canvas id="p4VaxChart"></canvas></div></article>`+
  `<article class="P4_CHART_CARD"><div class="P4_CHART_TITLE"><div><h3>Disease distribution</h3><p>Confirmed incident types</p></div></div><div class="P4_CHART_CANVAS"><canvas id="p4DiseaseChart"></canvas></div></article>`+
  `<article class="P4_CHART_CARD"><div class="P4_CHART_TITLE"><div><h3>Adoption pipeline</h3><p>Application processing status</p></div></div><div class="P4_CHART_CANVAS"><canvas id="p4AdoptionChart"></canvas></div></article>`+
  `<article class="P4_CHART_CARD"><div class="P4_CHART_TITLE"><div><h3>Recent activity</h3><p>Latest shared operational events</p></div></div><div class="P4_ACTIVITY_FEED">${activities.length?activities.map(a=>`<div class="P4_ACTIVITY"><i class="fa-solid ${a.icon}"></i><span><strong>${E(a.label)}</strong><small>${E(a.details)}</small></span><time>${E(D(a.date))}</time></div>`).join(''):'<p>No recent activity in the sampled data.</p>'}</div></article></div>`+
  `<div class="P4_ANALYTICS_NOTE"><i class="fa-solid fa-circle-info"></i> Each source loads up to the first 100 accessible rows. These are sample-based charts, not authoritative municipality-wide totals. Vaccination coverage means “at least one accessible vaccine record,” not up-to-date immunization or clinical protection.</div>`);
  chart('p4RegChart','bar',requestsByMonth.labels,requestsByMonth.values,'Requests');
  chart('p4SpeciesChart','doughnut',['Dogs','Cats'],typeCount,'Species');
  chart('p4BarangayChart','bar',barangays.length?barangays.map(x=>x[0]):['No incidents'],barangays.length?barangays.map(x=>x[1]):[0],'Cases',{horizontal:true});
  chart('p4VaxChart','doughnut',['With record','No sampled record'],[covered,Math.max(0,d.pets.length-covered)],'Pets');
  chart('p4DiseaseChart','doughnut',['Rabies','Parvovirus','Ringworm'],diseases,'Cases');
  chart('p4AdoptionChart','bar',['Pending','Approved','Rejected'],adopted,'Applications');
  container.querySelector('[data-f4=export]').addEventListener('click',()=>csvDownload('cityvethub-analytics-'+new Date().toISOString().slice(0,10)+'.csv',[['Metric','Sampled count'],...names.map(k=>[k,d[k].length]),['Vaccinated verified pets (sample)',covered],['Vaccination coverage percentage (sample)',coverage]]));
 }
 return {open,refresh,search,close(){key='';cleanup();}};
}
window.CityVetPhase4=Object.freeze({mount});
})();
