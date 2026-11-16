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
 function notice(text,err=false){let n=container.querySelector('#phase4Notice');if(n){if(err&&text){n.hidden=false;n.className='P4_NOTICE P4_NOTICE_ERROR';n.textContent=text;}else{n.hidden=true;n.textContent='';}}if(text){if(window.CityVetUI?.toast)window.CityVetUI.toast(text,err?'error':'success');else if(n){n.hidden=false;n.className='P4_NOTICE '+(err?'P4_NOTICE_ERROR':'P4_NOTICE_SUCCESS');n.textContent=text;}}}
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
  window.CityVetUI?.upgrade(container);
  scroller.scrollTop=scrollTop;
 }
 function btn(name,label,icon='fa-plus',extra=''){return `<button class="CV_BUTTON ${extra||'PRIMARY_ACTION'}" type="button" data-f4="${name}"><i class="fa-solid ${icon}"></i> ${E(label)}</button>`;}
 function stat(label,value,icon,foot){return `<article class="P4_STAT"><div class="P4_STAT_TOP"><span>${E(label)}</span><i class="fa-solid ${icon}"></i></div><strong>${E(value)}</strong><small>${E(foot)}</small></article>`;}
 async function open(name){const same=key===name&&container.querySelector('.CV_WORKSPACE');key=name;filter='';await refresh(Boolean(same));}
 async function refresh(silent=false){
  if(!key)return;
  if(!silent){cleanup();container.innerHTML=window.CityVetUI?.skeleton('Loading workspace…',4)||'<div class="CV_LOADING"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading records…</div>';}
  try{
   if(key==='surveillance')await surveillance();else if(key==='reports')await reports();else if(key==='profile')await profilePage();
  }
  catch(e){if(!silent)html(head('DATA CONNECTION','Unable to load this module','Check your connection and access permissions.')+`<div class="CV_ERROR">${E(api.readableError(e))}</div>`);}
 }
 function search(value){filter=String(value||'').toLowerCase().trim();if(key)refresh(true);}
 function popupForm(title,fields,onSave,successMsg='Saved successfully.'){const d=document.createElement('div');d.className='CV_MODAL';d.innerHTML=`<div class="CV_MODAL_CARD P4_DIALOG"><div class="CV_MODAL_HEAD"><h3>${E(title)}</h3><button type="button" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><form class="P4_PET_FORM">${fields}<div class="P4_FORM_ERRORS" role="alert" hidden></div><div class="P4_FORM_FOOT"><button type="button" class="CV_SOFT CV_BUTTON" data-close>Cancel</button><button type="submit" class="PRIMARY_ACTION">Send Report</button></div></form></div>`;
  d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-close]'))d.remove();});d.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;b.textContent='Saving…';try{await onSave(e.currentTarget);d.remove();await refresh(true);notice(successMsg);}catch(x){const err=d.querySelector('.P4_FORM_ERRORS');err.hidden=false;err.textContent=api.readableError(x);}finally{b.disabled=false;b.textContent='Save changes';}});document.body.append(d);window.CityVetUI?.upgrade(d);return d;}
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
  const normalizedName=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(brgy|barangay)\b/g,'').replace(/[^a-z0-9]/g,'').trim();
  const geoFeatureName=f=>{const p=f?.properties||{};return p.name||p.barangay||p.Barangay||p.ADM4_EN||p.NAME_4||p.BRGY_NAME||p.Brgy_Name||p.Barangay_Name||'';};
  function pointInRing(lng,lat,ring){
    if(!Array.isArray(ring)||ring.length<3)return false;
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const xi=Number(ring[i][0]),yi=Number(ring[i][1]),xj=Number(ring[j][0]),yj=Number(ring[j][1]);
      if(((yi>lat)!==(yj>lat))&&(lng<((xj-xi)*(lat-yi))/((yj-yi)||1e-12)+xi))inside=!inside;
    }
    return inside;
  }
  function pointInPolyCoords(lng,lat,rings){
    if(!Array.isArray(rings)||!rings.length||!pointInRing(lng,lat,rings[0]))return false;
    for(let i=1;i<rings.length;i++)if(pointInRing(lng,lat,rings[i]))return false;
    return true;
  }
  function findBarangayInGeo(lat,lng,fc){
    const features=fc?.features;
    if(!Array.isArray(features)||!Number.isFinite(lat)||!Number.isFinite(lng))return '';
    for(const f of features){
      const g=f?.geometry;if(!g)continue;
      const hit=g.type==='Polygon'?pointInPolyCoords(lng,lat,g.coordinates):g.type==='MultiPolygon'&&Array.isArray(g.coordinates)&&g.coordinates.some(poly=>pointInPolyCoords(lng,lat,poly));
      if(hit){const raw=geoFeatureName(f);return window.CityVetBarangays?.match(raw)||raw;}
    }
    return '';
  }
  async function ensureBoundaryGeo(extraNames){
    if(survState.cachedGeo?.features?.length)return survState.cachedGeo;
    if(!survState.geoPromise){
      survState.geoPromise=(async()=>{
        try{
          const r=await fetch('./assets/iligan-barangays.geojson');
          if(r.ok){
            const j=await r.json();
            const keep=(j?.features||[]).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type)&&geoFeatureName(f));
            if(keep.length){survState.cachedGeo={type:'FeatureCollection',features:keep};survState.cachedGeoSource='local dataset';return survState.cachedGeo;}
          }
        }catch{}
        try{
          const env=encodeURIComponent(JSON.stringify({xmin:124.10,ymin:8.05,xmax:124.38,ymax:8.35,spatialReference:{wkid:4326}}));
          const url=`https://services7.arcgis.com/poQdgvLD6DHnbpsT/arcgis/rest/services/Philippine_Administrative_Boundaries/FeatureServer/3/query?where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&returnGeometry=true&f=geojson&resultRecordCount=250`;
          const ctrl=new AbortController(),kill=setTimeout(()=>ctrl.abort(),9000);
          try{
            const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw Error('ArcGIS HTTP '+r.status);
            const json=await r.json();
            const nameSet=extraNames instanceof Set?extraNames:new Set();
            const relevant=(json.features||[]).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type)&&geoFeatureName(f)&&(/iligan/i.test(JSON.stringify(f.properties||{}))||nameSet.has(normalizedName(geoFeatureName(f)))||Boolean(window.CityVetBarangays?.match(geoFeatureName(f)))));
            if(relevant.length){survState.cachedGeo={type:'FeatureCollection',features:relevant};survState.cachedGeoSource='remote boundaries';return survState.cachedGeo;}
          }finally{clearTimeout(kill);}
        }catch{}
        return null;
      })().finally(()=>{survState.geoPromise=null;});
    }
    return survState.geoPromise;
  }
  async function resolveBarangayFromCoords(lat,lng,extraNames){
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return '';
    const fc=await ensureBoundaryGeo(extraNames);
    const geoMatch=findBarangayInGeo(lat,lng,fc);
    if(geoMatch)return geoMatch;
    try{
      const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=14`,{signal:AbortSignal.timeout(5000)});
      if(!r.ok)return '';
      const x=await r.json();
      const suggested=x.address?.suburb||x.address?.village||x.address?.neighbourhood||x.address?.quarter||x.address?.city_district||'';
      return window.CityVetBarangays?.match(suggested)||'';
    }catch{return '';}
  }
  function setFormBarangay(dialog,value){
    const field=dialog?.querySelector('[name="barangay"]');
    if(!field||!value)return;
    if(field.tagName==='SELECT'){
      const hit=[...field.options].find(o=>o.value===value||normalizedName(o.value)===normalizedName(value));
      if(hit){field.value=hit.value;field.dispatchEvent(new Event('change',{bubbles:true}));}
    }else{
      field.value=value;
      field.dispatchEvent(new Event('input',{bubbles:true}));
      field.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
  function bindCoordinateBarangaySync(dialog,seed={},extraNames){
    if(!dialog)return;
    let manualOverride=Boolean(seed.barangay),syncing=false,seq=0,timer=null;
    const isBarangayTarget=t=>Boolean(t&&(t.name==='barangay'||t.closest?.('.CV_COMBOBOX')?.querySelector('[name="barangay"]')));
    dialog.addEventListener('input',e=>{if(!syncing&&isBarangayTarget(e.target))manualOverride=true;});
    dialog.addEventListener('change',e=>{if(!syncing&&isBarangayTarget(e.target))manualOverride=true;});
    async function runLookup(){
      if(!dialog.isConnected||manualOverride)return;
      const lat=Number(dialog.querySelector('[name="latitude"]')?.value);
      const lng=Number(dialog.querySelector('[name="longitude"]')?.value);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      const id=++seq;
      const matched=await resolveBarangayFromCoords(lat,lng,extraNames);
      await Promise.resolve();
      if(!dialog.isConnected||id!==seq||manualOverride||!matched)return;
      syncing=true;try{setFormBarangay(dialog,matched);}finally{syncing=false;}
    }
    const onCoordEdit=()=>{manualOverride=false;clearTimeout(timer);timer=setTimeout(runLookup,350);};
    dialog.querySelector('[name="latitude"]')?.addEventListener('input',onCoordEdit);
    dialog.querySelector('[name="longitude"]')?.addEventListener('input',onCoordEdit);
    if(!seed.barangay)runLookup();
  }
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
      bindCoordinateBarangaySync(d,seed);
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
  if(admin){
    const isOutbreakAlert=a=>a.isOutbreak||String(a.title||'').startsWith('Declared outbreak');
    const activeOutbreaks=alerts.filter(a=>a.isActive&&isOutbreakAlert(a));
    const inactiveOutbreaks=alerts.filter(a=>!a.isActive&&isOutbreakAlert(a));
    const autoArchiveIds=[];
    for(const a of inactiveOutbreaks){
      const tBrgy=normalizedName(a.barangay);
      const tDis=String(a.diseaseType||'').trim().toLowerCase();
      if(activeOutbreaks.some(act=>normalizedName(act.barangay)===tBrgy&&(!tDis||String(act.diseaseType||'').trim().toLowerCase()===tDis)))continue;
      const alertTs=Math.max(Date.parse(a.$updatedAt||'')||0,Date.parse(a.issuedAt||a.$createdAt||'')||0);
      if(!alertTs)continue;
      for(const r of reports){
        if(r.status==='archived'||r.status==='dismissed')continue;
        if(normalizedName(r.barangay)!==tBrgy)continue;
        if(tDis&&String(r.diseaseType||'').trim().toLowerCase()!==tDis)continue;
        const repTs=Math.max(Date.parse(r.reportedAt||'')||0,Date.parse(r.$updatedAt||r.$createdAt||'')||0);
        if(repTs<=alertTs+60000){
          r.status='archived';
          autoArchiveIds.push(r.$id);
        }
      }
    }
    if(autoArchiveIds.length){
      Promise.allSettled(autoArchiveIds.map(reportId=>api.operate('archiveIncidentReport',{reportId}))).catch(()=>{});
    }
  }
  const selectedCategories=categories.filter(c=>c.isActive).map(c=>c.name).sort();
  const reporterOptions=['','owner','officer','admin','unknown'];
  const statusLabel=s=>s==='confirmed'?'Confirmed':s==='dismissed'?'Dismissed':s==='archived'?'Archived':'Unverified';
  const allNonArchived=reports.filter(r=>r.status!=='archived').map(r=>({...r,reporterRole:r.reporterRole||'unknown',status:r.status||'pending'}));
  const roles=allNonArchived.filter(r=>r.status!=='dismissed');
  const dismissedRoles=allNonArchived.filter(r=>r.status==='dismissed');
  const archivedRoles=reports.filter(r=>r.status==='archived').map(r=>({...r,reporterRole:r.reporterRole||'unknown',status:'archived'}));
  if(staff){
    const unknownIds=[...new Set([...allNonArchived,...archivedRoles].filter(r=>r.reporterRole==='unknown'&&r.reportedById).map(r=>r.reportedById))].slice(0,40);
    if(unknownIds.length)try{const x=await api.operate('resolveReporterRoles',{userIds:unknownIds});for(const r of [...allNonArchived,...archivedRoles])if(r.reporterRole==='unknown'&&x?.roles?.[r.reportedById])r.reporterRole=x.roles[r.reportedById];}catch{}
  }
  const groups=new Map();
  for(const report of roles){const name=report.barangay||'Unknown barangay',k=normalizedName(name);if(!groups.has(k))groups.set(k,{name,reports:[],key:k});groups.get(k).reports.push(report);}
  const sortedGroups=[...groups.values()].sort((a,b)=>b.reports.length-a.reports.length||a.name.localeCompare(b.name));
  const allActiveMap=new Map();for(const r of allNonArchived){const name=r.barangay||'Unknown barangay',k=normalizedName(name);if(!allActiveMap.has(k))allActiveMap.set(k,{name,key:k,reports:[]});allActiveMap.get(k).reports.push(r);}
  const allActiveGroups=[...allActiveMap.values()].sort((a,b)=>b.reports.length-a.reports.length||a.name.localeCompare(b.name));
  const archiveMap=new Map();for(const r of archivedRoles){const name=r.barangay||'Unknown barangay',k=normalizedName(name);if(!archiveMap.has(k))archiveMap.set(k,{name,key:k,reports:[]});archiveMap.get(k).reports.push(r);}
  const archivedGroups=[...archiveMap.values()].sort((a,b)=>b.reports.length-a.reports.length||a.name.localeCompare(b.name));
  const confirmedTotal=roles.filter(r=>r.status==='confirmed').length;
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
  function openIncidentForm(seed={}){if(!selectedCategories.length){notice('An administrator must first create at least one incident category.',true);return null;}const d=popupForm('Report suspected incident',incidentForm(seed),async form=>{const d=Object.fromEntries(new FormData(form));d.photoFileId=await uploadIncidentEvidence(form);delete d.reportImage;await api.operate('submitDisease',d);});bindCoordinateBarangaySync(d,seed,new Set(groups.keys()));return d;}
  html(head('INCIDENT INTELLIGENCE','Incident Surveillance','Barangay-focused incident reporting, case verification, and geographic monitoring.',
    (admin?btn('createCategory','Create category','fa-plus','CV_SOFT'):'')+btn('reportDisease','Report incident','fa-plus'))+
    `<div class="P4_SURVEILLANCE_LAYOUT CV49_SURVEILLANCE_LAYOUT"><section class="P4_SURVEILLANCE_SIDE"><div class="P4_QUAD_STATS">${stat('Active reports',roles.length,'fa-clipboard-list',`${confirmedTotal} confirmed · ${dismissedRoles.length} dismissed`)}${stat('Confirmed outbreaks',incidentCount,'fa-triangle-exclamation','Active CVO declarations')}${stat('Barangays reporting',sortedGroups.length,'fa-map-location-dot','Locations on heatmap')}${stat('Active alerts',alerts.filter(a=>a.isActive).length,'fa-bullhorn','Published warnings')}</div>`+
    `<div class="P4_SIDE_CARD CV420_REPORT_CARD"><div class="P4_SECTION_HEADING"><h3 id="cv420ReportTitle">Active reports by barangay</h3><span>${backlog.limited?'Displaying first 2,000 accessible reports · ':'Click to expand coordinates · '}Dismissed cases are hidden from the heatmap</span></div>`+
    (admin?`<nav class="CV420_REPORT_TABS" aria-label="Incident report views"><button type="button" class="CV420_TAB" data-report-tab="active" aria-pressed="true"><i class="fa-solid fa-clipboard-list"></i> Active Reports <b>${roles.length}</b></button><button type="button" class="CV420_TAB" data-report-tab="archived" aria-pressed="false"><i class="fa-solid fa-box-archive"></i> Archived Reports <b>${archivedRoles.length}</b></button></nav>`:'')+
    `<div class="P4_SIDE_FILTERS P4_SIDE_FILTERS_4"><label>Category <select id="p4DiseaseType"><option value="">All categories</option>${[...new Set([...allNonArchived,...archivedRoles].map(r=>r.diseaseType).filter(Boolean))].map(t=>`<option>${E(t)}</option>`).join('')}</select></label><label>Barangay <select id="p4Status"><option value="">All barangays</option>${[...new Map([...allActiveGroups,...archivedGroups].map(g=>[g.key,g])).values()].sort((a,b)=>a.name.localeCompare(b.name)).map(g=>`<option value="${E(g.key)}">${E(g.name)}</option>`).join('')}</select></label><label>Reporter <select id="p4ReporterType">${reporterOptions.map(r=>`<option value="${E(r)}">${E(r?roleLabel(r):'All reporters')}</option>`).join('')}</select></label><label>Status <select id="p4VerifyStatus"><option value="">All active</option><option value="pending">Unverified</option><option value="confirmed">Confirmed</option><option value="dismissed">Dismissed</option></select></label></div><div id="p4ReportRows" class="P4_REPORT_FEED"></div></div>`+
    (admin?`<div class="P4_SIDE_CARD CV420_OUTBREAKS"><div class="P4_SECTION_HEADING"><h3><i class="fa-solid fa-triangle-exclamation"></i> Declared Outbreaks</h3><span>${outbreaks.length} total</span></div><div class="CV420_OUTBREAK_LIST">${outbreaks.length?outbreaks.map(a=>`<div class="CV420_OUTBREAK_ROW"><span class="CV420_OUTBREAK_DOT ${a.isActive?'CV420_DOT_ACTIVE':''}"></span><div class="CV420_OUTBREAK_META"><strong>${E(a.barangay)} — ${E(a.diseaseType)}</strong><small>${a.isActive?'Active declaration':'Inactive declaration'} · ${E(D(a.issuedAt))}</small></div>${a.isActive?`<button type="button" class="CV420_ACTION" data-resolve-outbreak="${E(a.$id)}" title="Resolve outbreak and archive related incident reports"><i class="fa-solid fa-check"></i> Resolve</button>`:''}<button type="button" class="CV420_ACTION CV420_DANGER" data-delete-outbreak="${E(a.$id)}" title="Delete this outbreak declaration and linked owner alert"><i class="fa-solid fa-trash-can"></i> Delete</button></div>`).join(''):'<p class="P4_FEED_EMPTY">No outbreaks declared.</p>'}</div></div>`:'')+
    `<div class="P4_SIDE_CARD P4_BRIEF"><h3>Barangay report volume</h3><div class="P46_LEGEND"><span class="P46_LEVEL P46_GREEN"></span> 1–2: Green <span class="P46_LEVEL P46_YELLOW"></span> 3–10: Yellow <span class="P46_LEVEL P46_RED"></span> 11+: Red</div><p>Colors reflect active (unverified and confirmed) reports; dismissed false alarms are excluded. Only the CVO may declare an outbreak after assessment.</p></div></section>`+
    `<section class="P4_MAP_CARD CV49_MAP_CARD"><div class="P4_MAP_HEAD"><div><h3>Iligan City · Barangay incidents</h3><p>Click a boundary to inspect reports. Click elsewhere to report a location.</p></div><span class="P4_LIVE_TAG"><span></span> ${roles.length} active · ${confirmedTotal} confirmed</span></div>`+
    `<div class="P4_MAP_OPTIONS"><label><input type="checkbox" ${survState.showMarkers!==false?'checked':''} id="p46ShowMarkers"> Incident markers</label><label><input type="checkbox" ${survState.showBorders!==false?'checked':''} id="p46ShowBorders"> Barangay outlines</label><label class="P46_GEO_IMPORT">Import verified GeoJSON <input id="p46ImportGeo" type="file" accept=".geojson,.json,application/geo+json,application/json" hidden></label></div>`+
    `<div id="p4Map" class="P4_MAP"></div><div class="P4_MAP_FOOT"><span id="p46BoundaryStatus">Loading barangay boundaries…</span><span>Map: OpenStreetMap</span></div></section></div>`);
  const feed=container.querySelector('#p4ReportRows');const categoryFilter=container.querySelector('#p4DiseaseType'),statusFilter=container.querySelector('#p4Status'),reporterFilter=container.querySelector('#p4ReporterType'),verifyFilter=container.querySelector('#p4VerifyStatus');
  if(survState.category&&[...categoryFilter.options].some(o=>o.value===survState.category))categoryFilter.value=survState.category;
  if(survState.barangay&&[...statusFilter.options].some(o=>o.value===survState.barangay))statusFilter.value=survState.barangay;
  if(survState.reporter&&[...reporterFilter.options].some(o=>o.value===survState.reporter))reporterFilter.value=survState.reporter;
  if(survState.verifyStatus&&[...verifyFilter.options].some(o=>o.value===survState.verifyStatus))verifyFilter.value=survState.verifyStatus;
  function filteredReports(){
    const source=reportTab==='archived'?archivedRoles:(verifyFilter.value==='dismissed'?dismissedRoles:verifyFilter.value?roles.filter(r=>r.status===verifyFilter.value):roles);
    return source.filter(r=>(!categoryFilter.value||r.diseaseType===categoryFilter.value)&&(!statusFilter.value||normalizedName(r.barangay)===statusFilter.value)&&(!reporterFilter.value||r.reporterRole===reporterFilter.value)&&(!filter||[r.diseaseType,r.barangay,r.description,r.status].some(v=>String(v||'').toLowerCase().includes(filter))));
  }
  async function viewIncidentDetails(reportId){
    const report=await api.operate('getIncidentReportDetails',{reportId});
    const overlay=document.createElement('div');overlay.className='CV_MODAL CV422_REPORT_MODAL';
    const image=report.photoUrl?`<div class="CV422_REPORT_PHOTO"><img src="${E(report.photoUrl)}" alt="Submitted incident evidence" onerror="this.hidden=true;this.parentElement.innerHTML='Evidence photo is unavailable or expired.'"></div>`:'<div class="CV422_REPORT_NO_IMAGE"><i class="fa-regular fa-image"></i> No photo evidence was submitted.</div>';
    const lat=Number(report.latitude),lon=Number(report.longitude),hasCoords=Number.isFinite(lat)&&Number.isFinite(lon);
    const st=report.status||'pending';
    const statusPill=`<span class="CV423_CASE_PILL CV423_CASE_${E(st)}">${E(statusLabel(st))}</span>`;
    const confirmMeta=(st==='confirmed'&&report.confirmedAt)?`<div class="CV423_CONFIRM_META"><i class="fa-solid fa-circle-check"></i> Confirmed by <strong>${E(report.confirmedByName||'CVO Staff')}</strong> on ${E(dateTime(report.confirmedAt))}</div>`:st==='dismissed'?`<div class="CV423_CONFIRM_META CV423_META_DISMISSED"><i class="fa-solid fa-ban"></i> Dismissed as unsubstantiated — excluded from the surveillance heatmap.</div>`:'';
    const reviewButtons=staff&&st!=='archived'?(
      (st!=='confirmed'?`<button type="button" class="PRIMARY_ACTION CV_BUTTON" data-report-confirm><i class="fa-solid fa-circle-check"></i> Confirm case</button>`:'')+
      (st!=='dismissed'?`<button type="button" class="CV_BUTTON CV422_DANGER" data-report-dismiss><i class="fa-solid fa-ban"></i> Dismiss</button>`:'')+
      ((st==='confirmed'||st==='dismissed')?`<button type="button" class="CV_BUTTON CV_SOFT" data-report-reopen><i class="fa-solid fa-rotate-left"></i> Reopen</button>`:'')
    ):'';
    overlay.innerHTML=`<div class="CV_MODAL_CARD CV422_REPORT_DIALOG" role="dialog" aria-modal="true" aria-label="Incident report details"><div class="CV422_REPORT_HEADER"><div><span class="CV422_REPORT_OVERLINE">CITYVETHUB • INCIDENT RECORD</span><h3>${E(report.diseaseType)}</h3><p><i class="fa-solid fa-location-dot"></i> ${E(report.barangay)} · ${E(dateTime(report.reportedAt))}</p></div><button type="button" class="CV_SOFT CV_BUTTON" data-close aria-label="Close report">✕</button></div><div class="CV422_REPORT_PROFILE"><span class="CV422_REPORT_PROFILE_ICON"><i class="fa-solid fa-user-shield"></i></span><div><strong>${E(report.reporterName||'Reporter')}</strong><small>${E(roleLabel(report.reporterRole||'unknown'))} · ${statusPill}</small></div></div>${confirmMeta}<div class="CV422_REPORT_DESCRIPTION"><h4>Incident observations</h4><p>${E(report.description||'No additional details provided.')}</p></div>${image}<div class="CV422_REPORT_FACTS"><div><span>Barangay</span><strong>${E(report.barangay)}</strong></div><div><span>Submitted</span><strong>${E(dateTime(report.reportedAt))}</strong></div><div><span>Latitude</span><strong>${E(report.latitude)}</strong></div><div><span>Longitude</span><strong>${E(report.longitude)}</strong></div></div><div class="CV422_REPORT_FOOT">${hasCoords?`<a class="CV_BUTTON CV_SOFT" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-map-location-dot"></i> View location</a>`:''}${reviewButtons}${admin?`<button type="button" class="CV_BUTTON CV_SOFT" data-report-archive><i class="fa-solid fa-box-archive"></i> ${st==='archived'?'Restore':'Archive'}</button><button type="button" class="CV_BUTTON CV422_DANGER" data-report-delete><i class="fa-solid fa-trash"></i> Delete</button>`:''}</div><div class="CV422_MODAL_ERROR" role="alert" hidden></div></div>`;
    const close=()=>overlay.remove();overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))close();});
    overlay.addEventListener('click',async e=>{
      const confirmBtn=e.target.closest('[data-report-confirm]'),dismissBtn=e.target.closest('[data-report-dismiss]'),reopenBtn=e.target.closest('[data-report-reopen]');
      if(confirmBtn||dismissBtn||reopenBtn){
        const op=confirmBtn?'confirmIncidentReport':dismissBtn?'dismissIncidentReport':'reopenIncidentReport';
        const promptMsg=confirmBtn?'Confirm this incident as a verified disease case? It will be added to Confirmed Disease Incidents.':dismissBtn?'Dismiss this report as a false alarm / not real? It will be removed from the active surveillance heatmap.':'Reopen this report as Unverified (pending review)?';
        if(!confirm(promptMsg))return;
        const btnEl=confirmBtn||dismissBtn||reopenBtn;btnEl.disabled=true;
        try{await api.operate(op,{reportId:report.$id});close();await refresh(true);notice(confirmBtn?'Incident confirmed and logged.':dismissBtn?'Report dismissed and removed from heatmap.':'Report reopened as unverified.');}
        catch(err){const target=overlay.querySelector('.CV422_MODAL_ERROR');target.hidden=false;target.textContent=api.readableError(err);btnEl.disabled=false;}
        return;
      }
      const archive=e.target.closest('[data-report-archive]'),del=e.target.closest('[data-report-delete]');if(!archive&&!del)return;
      const operation=del?'deleteIncidentReport':report.status==='archived'?'restoreArchivedIncident':'archiveIncidentReport';
      if(!confirm(del?'Permanently delete this report? This cannot be undone.':'Update this report status?'))return;
      const action=archive||del;action.disabled=true;try{await api.operate(operation,{reportId:report.$id});close();await refresh(true);notice(del?'Report permanently deleted.':'Report status updated.');}catch(err){const target=overlay.querySelector('.CV422_MODAL_ERROR');target.hidden=false;target.textContent=api.readableError(err);action.disabled=false;}
    });document.body.append(overlay);
  }
  function renderGroups(){
    const found=filteredReports(),sourceGroups=reportTab==='archived'?archivedGroups:(verifyFilter.value==='dismissed'?allActiveGroups:sortedGroups);
    const byGroup=sourceGroups.map(g=>({...g,reports:found.filter(r=>normalizedName(r.barangay)===g.key)})).filter(g=>g.reports.length);
    const groupRows=byGroup.map(g=>{
      const confCount=g.reports.filter(r=>r.status==='confirmed').length;
      const countLabel=confCount?`${g.reports.length} reports · ${confCount} confirmed`:`${g.reports.length} reports`;
      return `<section class="P46_BRNG_GROUP"><button type="button" class="P46_BRNG_HEAD" data-barangay="${E(g.key)}"><span class="P46_LEVEL P46_${hasOutbreak(g.name)&&reportTab==='active'&&verifyFilter.value!=='dismissed'?'RED':severity(g.reports.length).toUpperCase()}"></span><strong>${E(g.name)}</strong>${hasOutbreak(g.name)&&reportTab==='active'&&verifyFilter.value!=='dismissed'?'<span class="CV420_OUTBREAK_LABEL">OUTBREAK</span>':''}<span>${countLabel}</span><i class="fa-solid fa-chevron-down"></i></button><div class="P46_BRNG_DETAILS" ${selected===g.key?'':'hidden'}>${g.reports.map(r=>`<article class="P46_INCIDENT_ROW CV422_REPORT_ENTRY" tabindex="0" role="button" aria-label="Open incident details: ${E(r.diseaseType)} in ${E(r.barangay)}" data-view-report="${E(r.$id)}"><div class="CV422_REPORT_SUMMARY"><span class="CV422_REPORT_ICON"><i class="fa-solid fa-file-medical"></i></span><div class="CV422_REPORT_SUMMARY_TEXT"><b>${E(r.diseaseType)}</b><small>${E(D(r.reportedAt))} · ${E(roleLabel(r.reporterRole))} · <span class="CV423_CASE_PILL CV423_CASE_${E(r.status)}">${E(statusLabel(r.status))}</span></small></div><span class="CV422_VIEW_MORE"><i class="fa-solid fa-expand"></i> View details</span></div></article>`).join('')}${admin&&reportTab==='active'&&verifyFilter.value!=='dismissed'&&!hasOutbreak(g.name)?`<button class="CV_BUTTON P46_DECLARE" type="button" data-declare="${E(g.key)}">Declare outbreak</button>`:''}</div></section>`;
    }).join('');
    feed.innerHTML=groupRows||(reportTab==='archived'?'<p class="P4_FEED_EMPTY">No archived reports match these filters.</p>':verifyFilter.value==='dismissed'?'<p class="P4_FEED_EMPTY">No dismissed reports match these filters.</p>':'<p class="P4_FEED_EMPTY">No active reports match these filters.</p>');
    window.CityVetUI?.enhancePagination(feed.parentElement||container);
    const title=container.querySelector('#cv420ReportTitle');if(title)title.textContent=reportTab==='archived'?'Archived Reports by Barangay':verifyFilter.value==='dismissed'?'Dismissed Reports (Hidden from Heatmap)':'Active reports by barangay';
    container.querySelectorAll('[data-report-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reportTab===reportTab)));
  }
  function selectBarangay(key){selected=selected===key?null:key;survState.selected=selected;renderGroups();if(!selected||!map)return;
   if(geoLayer){let found=false;geoLayer.eachLayer(layer=>{const name=featureName(layer.feature),k=normalizedName(name),isOutbreak=hasOutbreak(name),count=groups.get(k)?.reports.length||0;layer.setStyle({weight:k===selected?4:(isOutbreak?3.5:2),color:isOutbreak?'#dc2626':k===selected?'#1d4ed8':borderColor(count),fillColor:isOutbreak?'#ef4444':borderColor(count),fillOpacity:(isOutbreak?0.32:(k===selected?0.24:0.12))});if(k===selected){map.fitBounds(layer.getBounds(),{maxZoom:14});found=true;}});if(found)return;}
   const g=(reportTab==='archived'?archiveMap:groups).get(selected),r=g?.reports.find(x=>Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude)));if(r)map.setView([Number(r.latitude),Number(r.longitude)],14);
  }
  const fileInput=container.querySelector('#p46ImportGeo'),boundaryStatus=container.querySelector('#p46BoundaryStatus');
  const featureName=geoFeatureName;
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
  [categoryFilter,statusFilter,reporterFilter,verifyFilter].forEach(n=>n.addEventListener('change',()=>{survState.category=categoryFilter.value;survState.barangay=statusFilter.value;survState.reporter=reporterFilter.value;survState.verifyStatus=verifyFilter.value;renderGroups();}));
  renderGroups();
  if(survState.feedScroll)feed.scrollTop=survState.feedScroll;
  container.querySelector('.CV420_OUTBREAK_LIST')?.addEventListener('click',async event=>{
    if(!admin)return;
    const resolveBtn=event.target.closest('[data-resolve-outbreak]');
    if(resolveBtn){
      const a=outbreaks.find(x=>x.$id===resolveBtn.dataset.resolveOutbreak);if(!a)return;
      if(!confirm(`Resolve and deactivate the outbreak declaration for ${a.barangay} (${a.diseaseType})? All active incident reports for this barangay and category will be moved to Archived Reports.`))return;
      resolveBtn.disabled=true;
      try{
        await api.operate('deactivateAlert',{alertId:a.$id});
        const tBrgy=normalizedName(a.barangay),tDis=String(a.diseaseType||'').trim().toLowerCase();
        const toArch=roles.filter(r=>normalizedName(r.barangay)===tBrgy&&(!tDis||String(r.diseaseType||'').trim().toLowerCase()===tDis));
        if(toArch.length)await Promise.allSettled(toArch.map(r=>api.operate('archiveIncidentReport',{reportId:r.$id})));
        await refresh(true);
        notice('Outbreak resolved and related incident reports archived.');
      }catch(err){notice(api.readableError(err),true);resolveBtn.disabled=false;}
      return;
    }
    const b=event.target.closest('[data-delete-outbreak]');if(!b)return;
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
    const isConf=r.status==='confirmed';
    window.L.circleMarker([lat,lng],{radius:isConf?6:5,weight:isConf?2.5:1.5,color:isConf?'#047857':'#1e40af',fillColor:isConf?'#10b981':borderColor(groups.get(normalizedName(r.barangay))?.reports.length||0),fillOpacity:isConf?.9:.8}).bindPopup(`<strong>${E(r.diseaseType)}</strong><p>${E(r.barangay)} · ${E(statusLabel(r.status))}</p>`).addTo(markers);
  }
  const outlines=container.querySelector('#p46ShowBorders');
  outlines.addEventListener('change',e=>{survState.showBorders=e.target.checked;if(geoLayer)e.target.checked?geoLayer.addTo(map):map.removeLayer(geoLayer);});
  container.querySelector('#p46ShowMarkers').addEventListener('change',e=>{survState.showMarkers=e.target.checked;e.target.checked?markers.addTo(map):map.removeLayer(markers);});
  // Load shared GeoJSON boundaries (cached, local dataset, or ArcGIS fallback).
  (async()=>{
    const fc=await ensureBoundaryGeo(new Set(groups.keys()));
    if(fc){try{applyGeoJSON(fc,survState.cachedGeoSource||'remote boundaries');return;}catch{}}
    boundaryStatus.textContent='Exact outlines are unavailable. Import a verified Iligan barangay GeoJSON; incident markers still work.';
  })();
  map.on('click',evt=>{
    openIncidentForm({latitude:evt.latlng.lat.toFixed(6),longitude:evt.latlng.lng.toFixed(6)});
  });
  setTimeout(()=>map?.invalidateSize(),130);
 }
 function buildPdfFromCanvases(canvases){
  if(!Array.isArray(canvases)||!canvases.length)throw Error('No report pages available for PDF export.');
  const W_PT=595.28,H_PT=841.89,enc=new TextEncoder();
  const strBytes=s=>enc.encode(s);
  const dataUrlToJpgBytes=canvas=>{
    const uri=canvas.toDataURL('image/jpeg',0.94);
    const idx=uri.indexOf(',');
    if(idx===-1||!uri.startsWith('data:image/jpeg'))throw Error('Failed to encode report page as JPEG.');
    const raw=atob(uri.slice(idx+1)),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return bytes;
  };
  const pagesData=canvases.map((c,i)=>({
    w:c.width,h:c.height,jpg:dataUrlToJpgBytes(c),
    pageId:3+i*3,contentId:4+i*3,imgId:5+i*3,name:`/Im${i}`
  }));
  const chunks=[],offsets=[];
  let byteLen=0;
  const pushBytes=b=>{chunks.push(b);byteLen+=b.length;};
  const pushStr=s=>pushBytes(strBytes(s));
  pushStr('%PDF-1.4\n');
  pushBytes(new Uint8Array([0x25,0xE2,0xE3,0xCF,0xD3,0x0A]));
  const addObj=(id,body)=>{
    offsets[id]=byteLen;
    pushStr(`${id} 0 obj\n`);
    if(typeof body==='string')pushStr(body);else body();
    pushStr('\nendobj\n');
  };
  addObj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  addObj(2,`<< /Type /Pages /Kids [${pagesData.map(p=>`${p.pageId} 0 R`).join(' ')}] /Count ${pagesData.length} >>`);
  for(const p of pagesData){
    addObj(p.pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W_PT.toFixed(2)} ${H_PT.toFixed(2)}] /Resources << /XObject << ${p.name} ${p.imgId} 0 R >> >> /Contents ${p.contentId} 0 R >>`);
    const streamCmd=`q\n${W_PT.toFixed(2)} 0 0 ${H_PT.toFixed(2)} 0 0 cm\n${p.name} Do\nQ\n`;
    addObj(p.contentId,`<< /Length ${streamCmd.length} >>\nstream\n${streamCmd}endstream`);
    addObj(p.imgId,()=>{
      pushStr(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`);
      pushBytes(p.jpg);
      pushStr('\nendstream');
    });
  }
  const totalObjs=2+pagesData.length*3;
  const xrefPos=byteLen;
  let xref=`xref\n0 ${totalObjs+1}\n0000000000 65535 f \n`;
  for(let id=1;id<=totalObjs;id++){
    xref+=String(offsets[id]||0).padStart(10,'0')+' 00000 n \n';
  }
  xref+=`trailer\n<< /Size ${totalObjs+1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  pushStr(xref);
  return new Blob(chunks,{type:'application/pdf'});
 }
 function renderAdminReportCanvases(rpt){
  const PW=595.28,PH=841.89,PX_W=1654,PX_H=2339,M=26,CW=PW-M*2;
  const FONT="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  const makePage=()=>{
    const c=document.createElement('canvas');c.width=PX_W;c.height=PX_H;
    const ctx=c.getContext('2d');ctx.scale(PX_W/PW,PX_H/PH);
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,PW,PH);
    return {canvas:c,ctx};
  };
  const rr=(ctx,x,y,w,h,r=8)=>{
    const rad=Math.min(r,w/2,h/2);ctx.beginPath();
    ctx.moveTo(x+rad,y);ctx.lineTo(x+w-rad,y);ctx.quadraticCurveTo(x+w,y,x+w,y+rad);
    ctx.lineTo(x+w,y+h-rad);ctx.quadraticCurveTo(x+w,y+h,x+w-rad,y+h);
    ctx.lineTo(x+rad,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-rad);
    ctx.lineTo(x,y+rad);ctx.quadraticCurveTo(x,y,x+rad,y);ctx.closePath();
  };
  const card=(ctx,x,y,w,h,fill='#ffffff',stroke='#dce4f0',r=9)=>{
    ctx.save();rr(ctx,x,y,w,h,r);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=0.85;ctx.stroke();}
    ctx.restore();
  };
  const fit=(ctx,s,maxW)=>{
    const str=String(s??'');if(!maxW||ctx.measureText(str).width<=maxW)return str;
    let lo=0,hi=str.length;
    while(lo<hi){const mid=(lo+hi+1)>>1;if(ctx.measureText(str.slice(0,mid)+'…').width<=maxW)lo=mid;else hi=mid-1;}
    return str.slice(0,lo)+'…';
  };
  const txt=(ctx,s,x,y,{size=9,weight=500,color='#0f172a',align='left',baseline='top',maxW=0}={})=>{
    ctx.save();ctx.font=`${weight} ${size}px ${FONT}`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline=baseline;
    ctx.fillText(maxW?fit(ctx,s,maxW):String(s??''),x,y);ctx.restore();
  };
  const pill=(ctx,x,y,label,bg='#eaf2ff',fg='#1d4ed8',border='',size=7.2)=>{
    ctx.save();ctx.font=`700 ${size}px ${FONT}`;
    const padX=7,h=size+7,w=ctx.measureText(label).width+padX*2;
    card(ctx,x,y,w,h,bg,border||bg,99);
    ctx.fillStyle=fg;ctx.textBaseline='middle';ctx.fillText(label,x+padX,y+h/2+0.3);
    ctx.restore();return w;
  };
  const footer=(ctx,pageNum,totalPages)=>{
    ctx.save();ctx.strokeStyle='#e2e8f0';ctx.lineWidth=0.75;ctx.beginPath();ctx.moveTo(M,PH-34);ctx.lineTo(PW-M,PH-34);ctx.stroke();ctx.restore();
    txt(ctx,'CityVetHub • Iligan City Veterinary Office • Administrative & Surveillance Summary',M,PH-26,{size:7.4,weight:600,color:'#64748b'});
    txt(ctx,`Page ${pageNum} of ${totalPages}`,PW-M,PH-26,{size:7.4,weight:700,color:'#334155',align:'right'});
  };
  const hBars=(ctx,x,y,w,rowH,items,maxVal,defaultColor='#3478f6')=>{
    const peak=Math.max(1,maxVal,...items.map(it=>it.value));
    items.forEach((it,idx)=>{
      const ry=y+idx*rowH,labelW=Math.min(110,w*0.42),barX=x+labelW+8,valW=30,barW=Math.max(30,w-labelW-valW-16);
      txt(ctx,it.label,x,ry+5,{size:8,weight:600,color:'#334155',maxW:labelW});
      card(ctx,barX,ry+4.5,barW,9,'#edf2fa','',4.5);
      const fillW=it.value>0?Math.max(6,(it.value/peak)*barW):0;
      if(fillW>0)card(ctx,barX,ry+4.5,fillW,9,it.color||defaultColor,'',4.5);
      txt(ctx,String(it.value),barX+barW+6,ry+4.5,{size:8,weight:700,color:'#0f172a'});
    });
  };
  const p1=makePage(),c1=p1.ctx;
  const grad=c1.createLinearGradient(M,22,PW-M,96);grad.addColorStop(0,'#1b45a8');grad.addColorStop(0.6,'#3478f6');grad.addColorStop(1,'#5a97ff');
  rr(c1,M,22,CW,72,11);c1.fillStyle=grad;c1.fill();
  pill(c1,M+16,32,'CITYVETHUB • ILIGAN CITY VETERINARY OFFICE','rgba(255,255,255,0.18)','#ffffff','',6.8);
  txt(c1,'Administrative & Surveillance Summary Report',M+16,50,{size:15.2,weight:800,color:'#ffffff'});
  txt(c1,'Executive summary of pet registration, clinical care, disease surveillance, and adoption workflows',M+16,71,{size:7.9,weight:500,color:'#e0ecff',maxW:345});
  txt(c1,'GENERATED',PW-M-16,35,{size:6.8,weight:700,color:'#bfdbfe',align:'right'});
  txt(c1,rpt.generatedAt,PW-M-16,46,{size:8.6,weight:700,color:'#ffffff',align:'right',maxW:160});
  txt(c1,'PREPARED BY',PW-M-16,62,{size:6.8,weight:700,color:'#bfdbfe',align:'right'});
  txt(c1,rpt.adminName||'CVO Administrator',PW-M-16,73,{size:8.2,weight:600,color:'#eff6ff',align:'right',maxW:160});

  const kpis=[
    {label:'Verified Pets',val:rpt.pets.length,sub:`${rpt.petProfiles.length} citizen inventory profiles`,bg:'#eff6ff',fg:'#2563eb',tag:'REG'},
    {label:'Verification Queue',val:`${rpt.pendingReqs} pending`,sub:`${rpt.approvedReqs} approved · ${rpt.rejectedReqs} rejected`,bg:'#fff7ed',fg:'#c2410c',tag:'REQ'},
    {label:'Vaccination Coverage',val:`${rpt.coverage}%`,sub:`${rpt.covered} of ${rpt.pets.length} pets · ${rpt.vaxCount} vax logs`,bg:'#ecfdf5',fg:'#047857',tag:'VAX'},
    {label:'Active Incident Reports',val:rpt.activeReports.length,sub:`${rpt.confirmedReports} conf · ${rpt.unverifiedReports} unv · ${rpt.dismissedReports} dism`,bg:'#eef2ff',fg:'#4338ca',tag:'SURV'},
    {label:'Confirmed Outbreaks',val:rpt.outbreakCount,sub:`${rpt.activeAlertsCount} active advisories issued`,bg:'#fef2f2',fg:'#b91c1c',tag:'OUTB'},
    {label:'Adoption Requests',val:rpt.adoptionApplications.length,sub:`${rpt.activeListings} active listings · ${rpt.ownership.length} transfers`,bg:'#f0fdfa',fg:'#0f766e',tag:'ADPT'}
  ];
  const kGap=9,kW=(CW-kGap*2)/3,kH=55;
  kpis.forEach((k,i)=>{
    const col=i%3,row=Math.floor(i/3),kx=M+col*(kW+kGap),ky=104+row*(kH+8);
    card(c1,kx,ky,kW,kH,'#ffffff','#dce4f0',9);
    txt(c1,k.label,kx+11,ky+10,{size:7.9,weight:700,color:'#64748b',maxW:kW-58});
    pill(c1,kx+kW-42,ky+8,k.tag,k.bg,k.fg,'',6.4);
    txt(c1,String(k.val),kx+11,ky+23,{size:15.5,weight:800,color:'#0f172a',maxW:kW-22});
    txt(c1,k.sub,kx+11,ky+41.5,{size:6.9,weight:500,color:'#64748b',maxW:kW-20});
  });

  const r1y=230,r1h=198,cGap=11,wLeft=306,wRight=CW-wLeft-cGap;
  card(c1,M,r1y,wLeft,r1h,'#ffffff','#dce4f0',10);
  txt(c1,'Pet Registration Trend (Last 6 Months)',M+14,r1y+12,{size:10.5,weight:750,color:'#0f172a'});
  txt(c1,'Monthly citizen verification requests submitted',M+14,r1y+26,{size:7.5,weight:500,color:'#64748b'});
  pill(c1,M+wLeft-76,r1y+12,`Total: ${rpt.petRequests.length}`,'#eff6ff','#1d4ed8','#bfdbfe',7.1);
  {
    const gx=M+32,gy=r1y+56,gw=wLeft-48,gh=114,vals=rpt.requestsByMonth.values,lbs=rpt.requestsByMonth.labels;
    const peak=Math.max(4,...vals),steps=4;
    for(let s=0;s<=steps;s++){
      const sy=gy+gh-(s/steps)*gh,v=Math.round((s/steps)*peak);
      c1.save();c1.strokeStyle=s===0?'#cbd5e1':'#eef2f7';c1.lineWidth=0.75;c1.beginPath();c1.moveTo(gx,sy);c1.lineTo(gx+gw,sy);c1.stroke();c1.restore();
      txt(c1,String(v),gx-6,sy,{size:6.8,weight:600,color:'#94a3b8',align:'right',baseline:'middle'});
    }
    const maxVal=Math.max(...vals,1),slotW=gw/Math.max(1,lbs.length),bW=Math.min(26,slotW*0.56);
    vals.forEach((v,i)=>{
      const bx=gx+i*slotW+(slotW-bW)/2,bh=v>0?Math.max(4,(v/peak)*gh):0,by=gy+gh-bh;
      if(bh>0)card(c1,bx,by,bW,bh,v===maxVal&&v>0?'#1d4ed8':'#3478f6','',4);
      txt(c1,String(v),bx+bW/2,Math.max(gy-10,by-10),{size:7.6,weight:700,color:'#1e293b',align:'center'});
      txt(c1,lbs[i],bx+bW/2,gy+gh+7,{size:7.5,weight:600,color:'#475569',align:'center'});
    });
  }

  const rx=M+wLeft+cGap;
  card(c1,rx,r1y,wRight,r1h,'#ffffff','#dce4f0',10);
  txt(c1,'Species & Profile Breakdown',rx+14,r1y+12,{size:10.5,weight:750,color:'#0f172a'});
  txt(c1,'Verified registry & inventory status',rx+14,r1y+26,{size:7.5,weight:500,color:'#64748b'});
  {
    const dogs=rpt.typeCount[0],cats=rpt.typeCount[1],tot=dogs+cats;
    const cx=rx+56,cy=r1y+86,rOut=35,rIn=21;
    if(!tot){
      c1.save();c1.strokeStyle='#e2e8f0';c1.lineWidth=14;c1.beginPath();c1.arc(cx,cy,(rOut+rIn)/2,0,Math.PI*2);c1.stroke();c1.restore();
    }else{
      const slices=[{v:dogs,col:'#3478f6'},{v:cats,col:'#14b8a6'}];
      let ang=-Math.PI/2;
      for(const sl of slices){
        if(!sl.v)continue;
        const sweep=(sl.v/tot)*Math.PI*2;
        c1.save();c1.fillStyle=sl.col;c1.beginPath();c1.moveTo(cx,cy);c1.arc(cx,cy,rOut,ang,ang+sweep);c1.closePath();c1.fill();c1.restore();
        ang+=sweep;
      }
      c1.save();c1.fillStyle='#ffffff';c1.beginPath();c1.arc(cx,cy,rIn,0,Math.PI*2);c1.fill();c1.restore();
    }
    txt(c1,String(tot),cx,cy-1,{size:12,weight:800,color:'#0f172a',align:'center',baseline:'middle'});
    txt(c1,'Verified',cx,cy+10,{size:6.2,weight:600,color:'#64748b',align:'center',baseline:'middle'});
    const lx=rx+106,dogPct=tot?Math.round(dogs/tot*100):0,catPct=tot?100-dogPct:0;
    card(c1,lx,r1y+63,8,8,'#3478f6','',2);
    txt(c1,`Dogs: ${dogs} (${dogPct}%)`,lx+13,r1y+62.5,{size:8,weight:700,color:'#1e293b'});
    card(c1,lx,r1y+81,8,8,'#14b8a6','',2);
    txt(c1,`Cats: ${cats} (${catPct}%)`,lx+13,r1y+80.5,{size:8,weight:700,color:'#1e293b'});
    txt(c1,'Unlisted/Other:',lx,r1y+99,{size:7.1,weight:500,color:'#64748b'});
    txt(c1,`${Math.max(0,rpt.pets.length-tot)}`,lx+62,r1y+99,{size:7.1,weight:700,color:'#334155'});
    const py=r1y+136;
    txt(c1,'Citizen Inventory Profile Statuses',rx+14,py,{size:8,weight:700,color:'#334155'});
    const pBarW=wRight-28,pStats=[
      {l:'Verified',v:rpt.profVerified,c:'#10b981'},
      {l:'Pending',v:rpt.profPending,c:'#f59e0b'},
      {l:'Draft',v:rpt.profDraft,c:'#64748b'},
      {l:'Rejected',v:rpt.profRejected,c:'#ef4444'}
    ];
    const pTot=pStats.reduce((a,b)=>a+b.v,0);
    card(c1,rx+14,py+15,pBarW,9,'#edf2fa','',4.5);
    let sx=rx+14;
    if(pTot>0){
      pStats.forEach(ps=>{
        if(!ps.v)return;
        const sw=(ps.v/pTot)*pBarW;
        card(c1,sx,py+15,Math.max(3,sw),9,ps.c,'',2);sx+=sw;
      });
    }
    pStats.forEach((ps,idx)=>{
      const row=Math.floor(idx/2),col=idx%2,ix=rx+14+col*98,iy=py+30+row*14;
      card(c1,ix,iy+2,6,6,ps.c,'',2);
      txt(c1,`${ps.l}: ${ps.v}`,ix+10,iy,{size:7.2,weight:600,color:'#475569'});
    });
  }

  const r2y=439,r2h=214,wHalf=(CW-cGap)/2;
  card(c1,M,r2y,wHalf,r2h,'#ffffff','#dce4f0',10);
  txt(c1,'Vaccination Coverage & Clinical Care',M+14,r2y+12,{size:10.5,weight:750,color:'#0f172a'});
  txt(c1,'Verified pets with at least one vaccination entry',M+14,r2y+26,{size:7.5,weight:500,color:'#64748b'});
  txt(c1,`${rpt.coverage}%`,M+wHalf-14,r2y+12,{size:16,weight:800,color:'#2563eb',align:'right'});
  {
    const pbX=M+14,pbY=r2y+45,pbW=wHalf-28;
    card(c1,pbX,pbY,pbW,12,'#e2e8f0','',6);
    if(rpt.coverage>0)card(c1,pbX,pbY,Math.max(8,pbW*(rpt.coverage/100)),12,'#3478f6','',6);
    txt(c1,`Covered pets: ${rpt.covered}`,pbX,pbY+17,{size:7.5,weight:700,color:'#1e293b'});
    txt(c1,`No sampled vax: ${Math.max(0,rpt.pets.length-rpt.covered)}`,pbX+pbW,pbY+17,{size:7.5,weight:600,color:'#64748b',align:'right'});
    c1.save();c1.strokeStyle='#eef2f7';c1.lineWidth=0.8;c1.beginPath();c1.moveTo(pbX,r2y+82);c1.lineTo(pbX+pbW,r2y+82);c1.stroke();c1.restore();
    txt(c1,'Clinical Activity Breakdown',pbX,r2y+91,{size:8.4,weight:700,color:'#334155'});
    hBars(c1,pbX,r2y+108,pbW,22,[
      {label:'Vaccinations',value:rpt.vaxCount,color:'#3478f6'},
      {label:'Clinical Treatments',value:rpt.treatCount,color:'#7c3aed'},
      {label:'Verified Pets Sample',value:rpt.pets.length,color:'#10b981'},
      {label:'Total Medical Logs',value:rpt.medical.length,color:'#475569'}
    ],1);
  }

  const r2rx=M+wHalf+cGap;
  card(c1,r2rx,r2y,wHalf,r2h,'#ffffff','#dce4f0',10);
  txt(c1,'Disease Distribution & Case Triage',r2rx+14,r2y+12,{size:10.5,weight:750,color:'#0f172a'});
  txt(c1,'Confirmed cases & report verification triage',r2rx+14,r2y+26,{size:7.5,weight:500,color:'#64748b'});
  pill(c1,r2rx+wHalf-76,r2y+12,`${rpt.diseaseIncidents.length} confirmed`,'#ecfdf5','#067647','#abefc6',7);
  {
    const dRows=rpt.diseaseList.slice(0,4);
    hBars(c1,r2rx+14,r2y+48,wHalf-28,21,dRows.map((it,idx)=>({label:it[0],value:it[1],color:colors[idx%colors.length]})),1);
    const ty=r2y+152,tw=(wHalf-36)/2;
    txt(c1,'Incident Report Verification Status (All Sampled)',r2rx+14,ty-10,{size:7.6,weight:700,color:'#475569'});
    [
      {l:`Confirmed: ${rpt.confirmedReports}`,bg:'#ecfdf5',fg:'#067647',bd:'#abefc6'},
      {l:`Unverified: ${rpt.unverifiedReports}`,bg:'#fff8eb',fg:'#9a5b00',bd:'#fde6b8'},
      {l:`Dismissed: ${rpt.dismissedReports} (excluded)`,bg:'#f1f5f9',fg:'#475569',bd:'#cbd5e1'},
      {l:`Archived: ${rpt.archivedReports}`,bg:'#f8fafc',fg:'#64748b',bd:'#e2e8f0'}
    ].forEach((b,idx)=>{
      const col=idx%2,row=Math.floor(idx/2),bx=r2rx+14+col*(tw+8),by=ty+row*22+3;
      card(c1,bx,by,tw,18,b.bg,b.bd,6);
      txt(c1,b.l,bx+7,by+5,{size:7.1,weight:700,color:b.fg,maxW:tw-12});
    });
  }

  const r3y=664,r3h=124;
  card(c1,M,r3y,CW,r3h,'#ffffff','#dce4f0',10);
  txt(c1,'Adoption Pipeline & Ownership Custody Overview',M+14,r3y+12,{size:10.5,weight:750,color:'#0f172a'});
  txt(c1,'Rehoming listings, applicant pipeline distribution, and verified custody transfers',M+14,r3y+26,{size:7.5,weight:500,color:'#64748b'});
  {
    const barX=M+14,barY=r3y+45,barW=CW-28;
    const [apPend,apApp,apRej]=rpt.adopted,apTot=apPend+apApp+apRej;
    card(c1,barX,barY,barW,11,'#edf2fa','',5.5);
    let sx=barX;
    if(apTot>0){
      [[apPend,'#f59e0b'],[apApp,'#10b981'],[apRej,'#ef4444']].forEach(([v,col])=>{
        if(!v)return;const sw=(v/apTot)*barW;card(c1,sx,barY,Math.max(4,sw),11,col,'',3);sx+=sw;
      });
    }
    const boxes=[
      {l:'Active Listings',v:rpt.activeListings,sub:`of ${rpt.adoptionListings.length} total`,c:'#2563eb'},
      {l:'Pending Apps',v:apPend,sub:'awaiting review',c:'#d97706'},
      {l:'Approved Apps',v:apApp,sub:'accepted matches',c:'#059669'},
      {l:'Rejected Apps',v:apRej,sub:'declined requests',c:'#dc2626'},
      {l:'Custody Transfers',v:rpt.ownership.length,sub:'audit trail logs',c:'#4f46e5'}
    ];
    const bw=(CW-28-32)/5;
    boxes.forEach((b,idx)=>{
      const bx=M+14+idx*(bw+8),by=r3y+65;
      card(c1,bx,by,bw,46,'#f8fafc','#e2e8f0',7);
      txt(c1,b.l,bx+9,by+8,{size:7.2,weight:700,color:'#64748b',maxW:bw-14});
      txt(c1,String(b.v),bx+9,by+20,{size:14,weight:800,color:b.c});
      txt(c1,b.sub,bx+9,by+36,{size:6.5,weight:500,color:'#64748b',maxW:bw-14});
    });
  }
  footer(c1,1,2);

  const p2=makePage(),c2=p2.ctx;
  card(c2,M,22,CW,38,'#f1f6ff','#c8dcff',9);
  txt(c2,'CITYVETHUB EXECUTIVE REPORT • SPATIAL SURVEILLANCE & DETAILED BREAKDOWN',M+14,32,{size:8.8,weight:800,color:'#1e40af'});
  txt(c2,`Generated ${rpt.generatedAt}`,PW-M-14,33,{size:7.8,weight:600,color:'#3b82f6',align:'right'});

  const s1y=70,s1h=205,bLeftW=272,bRightW=CW-bLeftW-11;
  card(c2,M,s1y,bLeftW,s1h,'#ffffff','#dce4f0',10);
  txt(c2,'Barangay Surveillance Concentration',M+14,s1y+12,{size:10.5,weight:750,color:'#0f172a'});
  txt(c2,rpt.barangaysFromIncidents?'Top barangays with confirmed disease cases':'Active non-dismissed incident reports by barangay',M+14,s1y+26,{size:7.4,weight:500,color:'#64748b'});
  {
    const list=rpt.barangayBars.length?rpt.barangayBars:[['No incidents recorded',0]];
    const items=list.slice(0,6).map(([name,cnt])=>{
      const isOutbreak=rpt.outbreakBarangays.has(String(name||'').toLowerCase());
      const col=isOutbreak||cnt>=11?'#dc2626':cnt>=3?'#f59e0b':cnt>=1?'#10b981':'#94a3b8';
      return {label:isOutbreak?`${name} (OUTBREAK)`:name,value:cnt,color:col};
    });
    hBars(c2,M+14,s1y+47,bLeftW-28,23,items,1);
    txt(c2,'CVO Thresholds: Green (1–2), Yellow (3–10), Red (11+ or Outbreak)',M+14,s1y+188,{size:6.8,weight:600,color:'#64748b'});
  }

  const srx=M+bLeftW+11;
  card(c2,srx,s1y,bRightW,s1h,'#ffffff','#dce4f0',10);
  txt(c2,'Outbreak Declarations & Active Alerts',srx+14,s1y+12,{size:10.5,weight:750,color:'#0f172a'});
  txt(c2,'Published public-health advisories in the sample',srx+14,s1y+26,{size:7.4,weight:500,color:'#64748b'});
  {
    const activeAlerts=rpt.diseaseAlerts.filter(a=>a.isActive).slice(0,4);
    if(!activeAlerts.length){
      card(c2,srx+14,s1y+50,bRightW-28,64,'#ecfdf5','#abefc6',8);
      txt(c2,'No active outbreaks or warnings in current sample',srx+26,s1y+70,{size:8.5,weight:700,color:'#067647'});
      txt(c2,`Total historical declarations sampled: ${rpt.diseaseAlerts.length}`,srx+26,s1y+86,{size:7.4,weight:500,color:'#047857'});
    }else{
      activeAlerts.forEach((a,idx)=>{
        const ay=s1y+46+idx*37,isOut=Boolean(a.isOutbreak||String(a.title||'').startsWith('Declared outbreak'));
        card(c2,srx+14,ay,bRightW-28,32,isOut?'#fef2f2':'#f8fafc',isOut?'#fecaca':'#e2e8f0',7);
        txt(c2,`${a.barangay||'Citywide'} — ${a.diseaseType||a.title||'Health Alert'}`,srx+22,ay+6,{size:7.7,weight:700,color:isOut?'#991b1b':'#0f172a',maxW:bRightW-96});
        pill(c2,srx+bRightW-68,ay+5,isOut?'OUTBREAK':'ALERT',isOut?'#fee2e2':'#eaf2ff',isOut?'#b91c1c':'#1d4ed8','',6);
        txt(c2,`Issued ${D(a.issuedAt||a.$createdAt)} · ${a.notifyOwners?'Owners & Officers':'Officers only'}`,srx+22,ay+19,{size:6.7,weight:500,color:'#64748b',maxW:bRightW-46});
      });
    }
  }

  const t1y=285,t1h=246;
  card(c2,M,t1y,CW,t1h,'#ffffff','#dce4f0',10);
  txt(c2,'System Module Data Summary (First 100 Accessible Rows per Collection)',M+14,t1y+11,{size:10.3,weight:750,color:'#0f172a'});
  {
    const thY=t1y+31,rowH=19.2;
    card(c2,M+12,thY,CW-24,20,'#eef4ff','#dbe7fb',5);
    txt(c2,'Module / Collection',M+20,thY+6,{size:7.6,weight:800,color:'#1e3a8a'});
    txt(c2,'Domain',M+198,thY+6,{size:7.6,weight:800,color:'#1e3a8a'});
    txt(c2,'Sampled',M+336,thY+6,{size:7.6,weight:800,color:'#1e3a8a',align:'right'});
    txt(c2,'Operational Breakdown',M+352,thY+6,{size:7.6,weight:800,color:'#1e3a8a'});
    rpt.moduleRows.forEach((mr,idx)=>{
      const ry=thY+21+idx*rowH;
      if(idx%2===1)card(c2,M+12,ry,CW-24,rowH,'#f8fafc','',3);
      txt(c2,mr[0],M+20,ry+5,{size:7.4,weight:700,color:'#0f172a',maxW:172});
      txt(c2,mr[1],M+198,ry+5,{size:7.3,weight:500,color:'#475569',maxW:96});
      txt(c2,String(mr[2]),M+336,ry+5,{size:7.6,weight:800,color:'#1d4ed8',align:'right'});
      txt(c2,mr[3],M+352,ry+5,{size:7.2,weight:500,color:'#334155',maxW:170});
    });
  }

  const t2y=541,t2h=205;
  card(c2,M,t2y,CW,t2h,'#ffffff','#dce4f0',10);
  txt(c2,'Recent Operational Activity',M+14,t2y+11,{size:10.3,weight:750,color:'#0f172a'});
  txt(c2,'Latest timestamped events across registration, surveillance, adoptions, and custody',M+14,t2y+24,{size:7.3,weight:500,color:'#64748b'});
  {
    const thY=t2y+38,rowH=18.2;
    card(c2,M+12,thY,CW-24,19,'#eef4ff','#dbe7fb',5);
    txt(c2,'Event',M+20,thY+5.5,{size:7.5,weight:800,color:'#1e3a8a'});
    txt(c2,'Details',M+210,thY+5.5,{size:7.5,weight:800,color:'#1e3a8a'});
    txt(c2,'Date',PW-M-20,thY+5.5,{size:7.5,weight:800,color:'#1e3a8a',align:'right'});
    if(!rpt.activities.length){
      txt(c2,'No recent operational activity in the sampled records.',M+20,thY+32,{size:8,weight:500,color:'#64748b'});
    }else{
      rpt.activities.slice(0,8).forEach((a,idx)=>{
        const ry=thY+20+idx*rowH;
        if(idx%2===1)card(c2,M+12,ry,CW-24,rowH,'#f8fafc','',3);
        txt(c2,a.label,M+20,ry+5,{size:7.4,weight:700,color:'#0f172a',maxW:184});
        txt(c2,a.details,M+210,ry+5,{size:7.3,weight:500,color:'#475569',maxW:228});
        txt(c2,D(a.date),PW-M-20,ry+5,{size:7.3,weight:600,color:'#334155',align:'right'});
      });
    }
  }

  card(c2,M,756,CW,37,'#f8fafc','#dce4f0',8);
  txt(c2,'Methodology & Scope Note: Counts reflect up to the first 100 accessible Appwrite documents per collection ordered newest-first.',M+12,764,{size:7.1,weight:700,color:'#334155',maxW:CW-24});
  txt(c2,'Vaccination coverage measures verified pets with at least one Vaccination entry (not clinical currency). Dismissed reports are excluded from active surveillance counts.',M+12,776,{size:6.9,weight:500,color:'#64748b',maxW:CW-24});
  footer(c2,2,2);

  return [p1.canvas,p2.canvas];
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
  const entries=await Promise.all(names.map(async k=>[k,await fetchTable(k)]));const d=Object.fromEntries(entries);
  const allDiseaseReports=d.diseaseReports||[];
  d.diseaseReports=allDiseaseReports.filter(r=>r.status!=='archived'&&r.status!=='dismissed');
  const vaccinePets=new Set(d.medical.filter(r=>r.recordType==='Vaccination').map(r=>r.petId)),covered=d.pets.filter(p=>vaccinePets.has(p.$id)).length;
  const coverage=d.pets.length?Math.round(covered/d.pets.length*100):0;
  const requestsByMonth=monthSeries(d.petRequests);
  const typeCount=['Dog','Cat'].map(species=>d.pets.filter(p=>p.species===species).length);
  const diseaseMap=new Map();d.diseaseIncidents.forEach(r=>diseaseMap.set(r.barangay||'Unknown',(diseaseMap.get(r.barangay||'Unknown')||0)+1));
  const barangays=[...diseaseMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  const reportBrgyMap=new Map();d.diseaseReports.forEach(r=>reportBrgyMap.set(r.barangay||'Unknown',(reportBrgyMap.get(r.barangay||'Unknown')||0)+1));
  const reportBrgyBars=[...reportBrgyMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  const diseases=['Rabies','Canine Parvovirus','Ringworm'].map(type=>d.diseaseIncidents.filter(r=>r.diseaseType===type).length);
  const diseaseCountMap=new Map([['Rabies',0],['Canine Parvovirus',0],['Ringworm',0]]);
  d.diseaseIncidents.forEach(r=>{const k=r.diseaseType||'Unspecified';diseaseCountMap.set(k,(diseaseCountMap.get(k)||0)+1);});
  const diseaseList=[...diseaseCountMap.entries()].sort((a,b)=>b[1]-a[1]);
  const adopted=['pending','approved','rejected'].map(s=>d.adoptionApplications.filter(a=>a.status===s).length);
  const activities=[...d.petRequests.map(r=>({date:r.$createdAt,icon:'fa-paw',label:'Pet registration submitted',details:r.petName||'Pet'})),...d.diseaseReports.map(r=>({date:r.$createdAt,icon:'fa-virus',label:'Disease report received',details:r.diseaseType||'Disease'})),...d.adoptionApplications.map(r=>({date:r.$createdAt,icon:'fa-heart',label:'Adoption application submitted',details:r.applicantName||'Applicant'})),...d.ownership.map(r=>({date:r.transferDate||r.$createdAt,icon:'fa-right-left',label:'Ownership transferred',details:r.petName||'Verified pet'}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  const outbreakAlerts=d.diseaseAlerts.filter(a=>a.isActive&&(a.isOutbreak||String(a.title||'').startsWith('Declared outbreak')));
  const pendingReqs=d.petRequests.filter(r=>r.reviewStatus==='pending').length;
  const approvedReqs=d.petRequests.filter(r=>r.reviewStatus==='approved').length;
  const rejectedReqs=d.petRequests.filter(r=>r.reviewStatus==='rejected').length;
  const vaxCount=d.medical.filter(r=>r.recordType==='Vaccination').length;
  const treatCount=d.medical.filter(r=>r.recordType==='Treatment').length;
  const confirmedReports=allDiseaseReports.filter(r=>r.status==='confirmed').length;
  const dismissedReports=allDiseaseReports.filter(r=>r.status==='dismissed').length;
  const archivedReports=allDiseaseReports.filter(r=>r.status==='archived').length;
  const unverifiedReports=allDiseaseReports.filter(r=>!['confirmed','dismissed','archived'].includes(r.status)).length;
  const activeListings=d.adoptionListings.filter(l=>l.isActive||l.status==='available').length;
  const profVerified=d.petProfiles.filter(p=>p.verificationStatus==='verified').length;
  const profPending=d.petProfiles.filter(p=>p.verificationStatus==='pending').length;
  const profDraft=d.petProfiles.filter(p=>p.verificationStatus==='draft'||!p.verificationStatus).length;
  const profRejected=d.petProfiles.filter(p=>p.verificationStatus==='rejected').length;
  const activeAlertsCount=d.diseaseAlerts.filter(a=>a.isActive).length;
  const reportSnapshot={
    ...d,generatedAt:new Date().toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}),
    adminName:current.user.name||current.user.email||'CVO Administrator',
    activeReports:d.diseaseReports,coverage,covered,requestsByMonth,typeCount,
    barangaysFromIncidents:barangays.length>0,barangayBars:barangays.length?barangays:reportBrgyBars,
    outbreakBarangays:new Set(outbreakAlerts.map(a=>String(a.barangay||'').toLowerCase())),
    diseaseList,adopted,activities,outbreakCount:outbreakAlerts.length,activeAlertsCount,
    pendingReqs,approvedReqs,rejectedReqs,vaxCount,treatCount,confirmedReports,unverifiedReports,
    dismissedReports,archivedReports,activeListings,profVerified,profPending,profDraft,profRejected,
    moduleRows:[
      ['Verified Pets (pets)','Registry',d.pets.length,`${typeCount[0]} dogs, ${typeCount[1]} cats · ${coverage}% vaccinated`],
      ['Citizen Profiles (pet_profiles)','Registry',d.petProfiles.length,`${profVerified} verified, ${profPending} pending, ${profDraft} draft`],
      ['Verification Requests (pet_requests)','Registry',d.petRequests.length,`${pendingReqs} pending, ${approvedReqs} approved, ${rejectedReqs} rejected`],
      ['Medical Records (medical_records)','Clinical',d.medical.length,`${vaxCount} vaccinations, ${treatCount} treatments`],
      ['Incident Reports (disease_reports)','Surveillance',allDiseaseReports.length,`${d.diseaseReports.length} active (${confirmedReports} conf, ${unverifiedReports} unv), ${dismissedReports} dism`],
      ['Confirmed Incidents (disease_incidents)','Surveillance',d.diseaseIncidents.length,`Tracked across ${diseaseMap.size} barangay(s)`],
      ['Health & Outbreak Alerts (disease_alerts)','Surveillance',d.diseaseAlerts.length,`${activeAlertsCount} active (${outbreakAlerts.length} declared outbreaks)`],
      ['Adoption Listings (adoption_listings)','Adoption',d.adoptionListings.length,`${activeListings} active public listings`],
      ['Adoption Applications (adoption_applications)','Adoption',d.adoptionApplications.length,`${adopted[0]} pending, ${adopted[1]} approved, ${adopted[2]} rejected`],
      ['Ownership History (ownership_history)','Traceability',d.ownership.length,`${d.ownership.length} custody audit record(s)`]
    ]
  };
  const headerButtons=btn('previewReport','Preview report','fa-eye','CV_SOFT')+btn('export','Export summary PDF','fa-file-pdf')+btn('exportCsv','Export CSV','fa-file-csv','CV_SOFT');
  html(head('CVO INTELLIGENCE','Administrative Reports','Registration, health, disease and adoption analytics from accessible Appwrite records.',headerButtons)+
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
  const exportCsvFile=()=>{
    const stamp=new Date().toISOString().slice(0,10);
    csvDownload(`cityvethub-analytics-${stamp}.csv`,[
      ['Module / Metric','Domain','Sampled Count','Breakdown'],
      ...reportSnapshot.moduleRows,
      ['Vaccinated verified pets (sample)','Clinical',covered,`${coverage}% of ${d.pets.length} verified pets`],
      ['Dismissed incident reports (excluded from active)','Surveillance',dismissedReports,'Excluded from heatmap & active totals'],
      ['Archived incident reports','Surveillance',archivedReports,'Moved to archive']
    ]);
    notice('Summary CSV exported.');
  };
  const downloadPdfFile=(existingCanvases)=>{
    try{
      const canvases=Array.isArray(existingCanvases)?existingCanvases:renderAdminReportCanvases(reportSnapshot);
      const blob=buildPdfFromCanvases(canvases);
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download=`cityvethub-executive-report-${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1200);
      notice('Executive summary PDF exported.');
    }catch(err){notice('Could not generate PDF: '+api.readableError(err),true);}
  };
  const openReportPreview=()=>{
    try{
      const canvases=renderAdminReportCanvases(reportSnapshot);
      const overlay=document.createElement('div');
      overlay.className='CV_MODAL CV426_PDF_MODAL';
      overlay.innerHTML=`<div class="CV_MODAL_CARD CV426_PDF_DIALOG" role="dialog" aria-modal="true" aria-label="Administrative Summary PDF Preview"><div class="CV_MODAL_HEAD"><div><h3><i class="fa-solid fa-file-pdf"></i> Executive Report Preview (2 Pages · A4)</h3><small>Visual summary ready for PDF export or printing</small></div><div class="CV426_PDF_ACTIONS"><button type="button" class="CV_BUTTON CV_SOFT" data-pdf-csv><i class="fa-solid fa-file-csv"></i> CSV</button><button type="button" class="CV_BUTTON CV_SOFT" data-pdf-print><i class="fa-solid fa-print"></i> Print / View PDF</button><button type="button" class="CV_BUTTON PRIMARY_ACTION" data-pdf-download><i class="fa-solid fa-download"></i> Download PDF</button><button type="button" class="CV_BUTTON CV_SOFT" data-close aria-label="Close preview"><i class="fa-solid fa-xmark"></i></button></div></div><div class="CV426_PDF_PAGES"></div></div>`;
      const host=overlay.querySelector('.CV426_PDF_PAGES');
      canvases.forEach((canvas,idx)=>{
        const wrap=document.createElement('figure');
        wrap.className='CV426_PDF_PAGE_WRAP';
        canvas.className='CV426_PDF_CANVAS';
        const cap=document.createElement('figcaption');
        cap.textContent=`Page ${idx+1} of ${canvases.length} — ${idx===0?'Executive Overview & Visual Charts':'Barangay Surveillance, Tables & Activity Log'}`;
        wrap.append(cap,canvas);
        host.append(wrap);
      });
      overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))overlay.remove();});
      overlay.querySelector('[data-pdf-download]').addEventListener('click',()=>downloadPdfFile(canvases));
      overlay.querySelector('[data-pdf-csv]').addEventListener('click',exportCsvFile);
      overlay.querySelector('[data-pdf-print]').addEventListener('click',()=>{
        try{
          const blob=buildPdfFromCanvases(canvases);
          const url=URL.createObjectURL(blob);
          const w=window.open(url,'_blank','noopener');
          if(!w){URL.revokeObjectURL(url);notice('Popup blocked — use Download PDF instead.',true);return;}
          setTimeout(()=>URL.revokeObjectURL(url),60000);
        }catch(err){notice('Could not open PDF viewer: '+api.readableError(err),true);}
      });
      document.body.append(overlay);
    }catch(err){notice('Could not render report preview: '+api.readableError(err),true);}
  };
  container.querySelector('[data-f4=export]')?.addEventListener('click',()=>downloadPdfFile());
  container.querySelector('[data-f4=previewReport]')?.addEventListener('click',openReportPreview);
  container.querySelector('[data-f4=exportCsv]')?.addEventListener('click',exportCsvFile);
 }
 return {open,refresh,search,close(){key='';cleanup();}};
}
window.CityVetPhase4=Object.freeze({mount});
})();
