(async function(){
'use strict';
const body=document.getElementById('passportBody');const id=new URLSearchParams(location.search).get('pet');
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=String(text??'—');return e;};
const fail=s=>body.replaceChildren(el('p',s,'PASSPORT_ERROR'));
if(!id||!/^[a-zA-Z0-9._-]{1,36}$/.test(id))return fail('Invalid QR profile link. Ask the pet owner to share a new link.');
try{
 const cfg=window.CITYVET_CONFIG,client=new Appwrite.Client().setEndpoint(cfg.endpoint).setProject(cfg.projectId),tables=new Appwrite.TablesDB(client),storage=new Appwrite.Storage(client),account=new Appwrite.Account(client),functions=new Appwrite.Functions(client);
 const CVO_HOTLINE='(063) 221-6752';
 const cardEl=document.querySelector('.PASSPORT_CARD');
 const DRAFT_KEY='cityvet_pending_community_draft_v1';
 let scanState={checkedAuth:false,signedIn:false,user:null,profile:null,isOwnPet:false,prompted:false,skipped:false,sent:false,sending:false,statusText:'',shareIdentity:true,shareContact:true,customPhone:''};

 async function copyText(text,btn,doneLabel='Copied!'){
  const val=String(text||'').trim();if(!val)return;
  try{
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(val);
   else{const t=document.createElement('textarea');t.value=val;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();document.execCommand('copy');t.remove();}
   if(btn){const prev=btn.textContent;btn.textContent=doneLabel;setTimeout(()=>{if(btn.isConnected)btn.textContent=prev;},1800);}
  }catch{}
 }

 async function initScanContext(pet){
  if(scanState.checkedAuth)return;
  scanState.checkedAuth=true;
  try{
   const me=await account.get();
   scanState.signedIn=true;scanState.user=me;
   try{
    const own=await tables.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.petProfiles,rowId:id});
    scanState.isOwnPet=String(own?.ownerId||'')===String(me.$id);
   }catch{}
   if(!scanState.isOwnPet){
    try{scanState.profile=await tables.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.userProfiles,rowId:me.$id});}catch{}
    scanState.customPhone=String(scanState.profile?.phone||'').trim();
    scanState.shareContact=Boolean(scanState.customPhone);
   }
   if(scanState.isOwnPet)scanState.statusText='This is your own missing pet';
   else scanState.prompted=true;
  }catch{
   scanState.signedIn=false;
  }
 }

 async function sendScanAlert(){
  if(scanState.sending||!scanState.signedIn)return;
  scanState.sending=true;renderPassport(true);
  try{
   const jwtRes=await account.createJWT();
   if(!jwtRes?.jwt)throw new Error('Could not verify your signed-in session.');
   const cleanPhone=String(scanState.customPhone||'').replace(/[^+0-9]/g,'');
   const shareId=Boolean(scanState.shareIdentity);
   const sharePhone=Boolean(shareId&&scanState.shareContact&&cleanPhone.length>=7);
   const payload={action:'reportMissingPetScan',petProfileId:id,shareIdentity:shareId,shareContact:sharePhone};
   const displayName=String(scanState.profile?.fullName||scanState.user?.name||'').trim();
   if(shareId&&displayName)payload.scannerName=displayName;
   if(sharePhone)payload.scannerContact=cleanPhone;
   const exec=await functions.createExecution({functionId:cfg.functions.operations,body:JSON.stringify(payload),async:false,headers:{'X-Appwrite-User-JWT':jwtRes.jwt}});
   let data={};try{data=JSON.parse(exec.responseBody||'{}')?.data||{};}catch{}
   scanState.prompted=false;scanState.skipped=false;scanState.sent=true;
   if(data.notified){
    scanState.statusText=data.anonymous?'Owner alerted anonymously (your identity hidden)':data.scannerContact?`Owner alerted with your name & callback (${data.scannerContact})`:'Owner alerted that you scanned this collar QR';
   }else if(data.reason==='deduplicated'){
    scanState.statusText='Owner was already notified within the last 5 mins';
   }else if(data.reason==='self_scan'){
    scanState.statusText='This is your own missing pet';
   }else if(data.reason==='not_missing'){
    scanState.statusText='Pet is no longer marked missing';
   }else{
    scanState.statusText='Scan alert processed';
   }
  }catch{
   scanState.statusText='Could not send scan alert right now — please retry or contact CVO.';
  }finally{
   scanState.sending=false;renderPassport(true);
  }
 }

 function openSightingInCommunity(pet){
  const lines=[
   `MISSING PET SIGHTING REPORT — ${pet.petName||'Companion Pet'}`,
   `• Spotted At / Landmark: (Describe exact street or barangay landmark here)`,
   `• Condition / Notes: (Describe behavior, direction headed, or collar)`,
   '',
   'Passport Reference:',
   `• Pet: ${pet.petName||'Companion Pet'} (${pet.species||'Pet'} · ${pet.breed||'Mixed'})`,
   `• Registered Barangay: Brgy. ${pet.barangay||'Iligan City'}, Iligan City`,
   pet.officialRegistryId?`• Official ID: ${pet.officialRegistryId}`:null,
   pet.contact?`• Owner Contact: ${pet.contact}`:null,
   `• QR Passport: ${window.location.href}`
  ].filter(v=>v!==null).join('\n').slice(0,5000);
  try{
   localStorage.setItem(DRAFT_KEY,JSON.stringify({
    draftKey:String(Date.now()),
    createdAt:Date.now(),
    title:`[SIGHTING] ${pet.petName||'Pet'} (${pet.species||'Pet'}) spotted near ${pet.barangay||'Iligan City'}`.slice(0,140),
    body:lines,
    preferredChannelMatch:'missing',
    sightingPetId:id
   }));
  }catch{}
  window.location.href='./index.html?module=community';
 }

 async function renderPassport(silent=false){
  try{
   const pet=await tables.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.passports,rowId:id});
   const verified=pet.verificationStatus==='verified';
   const rawNote=String(pet.lostFoundMessage||'');
   const isMissing=pet.vitalStatus==='Missing'||/^\[MISSING\]\s*/i.test(rawNote);
   const cleanNote=rawNote.replace(/^\[MISSING\]\s*/i,'').trim();
   cardEl?.classList.toggle('is-missing',isMissing);
   if(isMissing&&!scanState.checkedAuth){await initScanContext(pet);}
   const frag=document.createDocumentFragment();
   if(isMissing){
    const alertBox=el('div','','PASSPORT_MISSING_ALERT');alertBox.setAttribute('role','alert');
    const icon=el('i','','fa-solid fa-triangle-exclamation');
    const copy=el('div','');
    const head=el('div','','PASSPORT_MISSING_HEAD');
    const dot=el('span','','PASSPORT_MISSING_DOT');dot.setAttribute('aria-hidden','true');
    head.append(dot,el('strong','DECLARED MISSING PET'));
    copy.append(head,el('p',cleanNote||'This pet has been declared missing by its owner. Please contact the owner or the City Veterinary Office immediately.'));
    if(scanState.statusText){
     const pill=el('span',scanState.statusText,'PASSPORT_SCAN_STATUS');
     copy.append(pill);
    }
    alertBox.append(icon,copy);
    frag.append(alertBox);

    if(scanState.signedIn&&!scanState.isOwnPet&&scanState.prompted&&!scanState.sent){
     const box=el('section','','PASSPORT_CONSENT_CARD');
     const h2=el('h2','');const bell=el('i','','fa-solid fa-bell');h2.append(bell,document.createTextNode(' Notify the Owner About This QR Scan?'));
     box.append(h2,el('p','Choose what profile information to include with your scan alert:'));
     const idOpt=document.createElement('label');idOpt.className='PASSPORT_CONSENT_OPT';
     const idChk=document.createElement('input');idChk.type='checkbox';idChk.checked=scanState.shareIdentity;
     const dispName=scanState.profile?.fullName||scanState.user?.name||'CityVetHub Member';
     idOpt.append(idChk,document.createTextNode(`Share my name (${dispName})`));
     const phWrap=el('label','','PASSPORT_CONSENT_PHONE');
     const phOpt=document.createElement('label');phOpt.className='PASSPORT_CONSENT_OPT';
     const phChk=document.createElement('input');phChk.type='checkbox';phChk.checked=scanState.shareContact;phChk.disabled=!scanState.shareIdentity;
     phOpt.append(phChk,document.createTextNode('Share my callback phone number with the owner'));
     const phInput=document.createElement('input');phInput.type='tel';phInput.maxLength=24;phInput.placeholder='e.g. 09171234567 (optional)';phInput.value=scanState.customPhone;phInput.disabled=!scanState.shareIdentity||!scanState.shareContact;
     phWrap.append(document.createTextNode('Callback phone number (optional)'),phInput);
     const btns=el('div','','PASSPORT_CONSENT_BTNS');
     const sendBtn=el('button',scanState.sending?'Sending…':(scanState.shareIdentity?'Send Scan Alert':'Alert Anonymously'),'PASSPORT_BTN is-danger');sendBtn.type='button';sendBtn.disabled=scanState.sending;
     const skipBtn=el('button','Not Now','PASSPORT_BTN');skipBtn.type='button';skipBtn.disabled=scanState.sending;
     idChk.addEventListener('change',()=>{
      scanState.shareIdentity=idChk.checked;
      if(!scanState.shareIdentity)scanState.shareContact=false;
      phChk.checked=scanState.shareContact;phChk.disabled=!scanState.shareIdentity;
      phInput.disabled=!scanState.shareIdentity||!scanState.shareContact;
      sendBtn.textContent=scanState.shareIdentity?'Send Scan Alert':'Alert Anonymously';
     });
     phChk.addEventListener('change',()=>{
      scanState.shareContact=phChk.checked;
      phInput.disabled=!scanState.shareIdentity||!scanState.shareContact;
     });
     phInput.addEventListener('input',()=>{scanState.customPhone=phInput.value;});
     sendBtn.addEventListener('click',()=>sendScanAlert());
     skipBtn.addEventListener('click',()=>{scanState.prompted=false;scanState.skipped=true;renderPassport(true);});
     btns.append(sendBtn,skipBtn);
     box.append(idOpt,phOpt,phWrap,btns);
     frag.append(box);
    }

    const actions=el('div','','PASSPORT_QUICK_ACTIONS');
    if(scanState.signedIn&&!scanState.isOwnPet&&scanState.skipped&&!scanState.sent){
     const retryBtn=el('button','Notify Owner I Found This Pet','PASSPORT_BTN is-danger');retryBtn.type='button';
     retryBtn.addEventListener('click',()=>{scanState.skipped=false;scanState.prompted=true;renderPassport(true);});
     actions.append(retryBtn);
    }
    if(pet.contact){
     const copyPh=el('button',`Copy Owner Contact (${pet.contact})`,'PASSPORT_BTN is-primary');copyPh.type='button';
     copyPh.addEventListener('click',()=>copyText(pet.contact,copyPh,'Contact Copied!'));
     actions.append(copyPh);
    }
    if(scanState.signedIn){
     const postBtn=el('button','Post Sighting in Community','PASSPORT_BTN');postBtn.type='button';
     postBtn.addEventListener('click',()=>openSightingInCommunity(pet));
     actions.append(postBtn);
    }else if(!pet.contact){
     const loginLink=el('a','Sign in to Alert Owner or Post Sighting','PASSPORT_BTN is-primary');loginLink.href='./login.html';
     actions.append(loginLink);
    }
    if(actions.childNodes.length)frag.append(actions);

    if(!pet.contact){
     const cvoBox=el('div','','PASSPORT_CVO_BOX');
     const txtWrap=el('div','');
     txtWrap.append(el('strong','Owner contact is private — reach Iligan CVO directly: '),document.createTextNode(`${CVO_HOTLINE} · Mon–Fri, 8:00 AM – 5:00 PM · Tambo, Hinaplanon, Iligan City`));
     const copyCvo=el('button','Copy CVO Hotline','PASSPORT_BTN');copyCvo.type='button';
     copyCvo.addEventListener('click',()=>copyText('0632216752',copyCvo,'Hotline Copied!'));
     cvoBox.append(txtWrap,copyCvo);
     frag.append(cvoBox);
    }
   }
   const top=el('div','','PASSPORT_TOP');
   if(pet.photoFileId){const img=document.createElement('img');img.alt='Pet photo shared by owner';img.src=String(storage.getFileView({bucketId:cfg.buckets.media,fileId:pet.photoFileId}));img.onerror=()=>img.replaceWith(el('div','Photo not available','PASSPORT_PLACEHOLDER'));top.append(img);}
   else{const holder=el('div','','PASSPORT_PLACEHOLDER');holder.append(el('i','','fa-solid fa-paw'));top.append(holder);}
   const info=el('div','');info.append(el('span',verified?'CVO VERIFIED PET':'OWNER-SUPPLIED · NOT CVO VERIFIED','PASSPORT_FLAG'),el('h1',pet.petName),el('p',pet.profileTitle||`${pet.species} · ${pet.breed}`));top.append(info);frag.append(top);
   if(pet.profileDescription)frag.append(el('p',pet.profileDescription,'PASSPORT_DESCRIPTION'));
   const grid=el('div','','PASSPORT_FIELDS');
   const values=[['Pet name',pet.petName],['Animal type',pet.species],['Breed',pet.breed],['Sex',pet.sex],['Age',`${pet.ageYears} year(s)`],['Barangay',pet.barangay],['Verification',verified?'CVO verified':'Unverified pet profile'],...(pet.officialRegistryId?[['Official CVO registry ID',pet.officialRegistryId]]:[]),['Vaccination',pet.vaccinationStatus||'No clinician-verified status available']];
   if(pet.ownerName)values.push(['Owner (opted in)',pet.ownerName]);
   if(pet.displayAddress)values.push(['Owner-shared address',pet.displayAddress]);
   if(pet.contact)values.push(['Owner-shared contact',pet.contact]);
   for(const [label,value] of values){const row=el('div','');row.append(el('span',label),el('strong',value));grid.append(row);}frag.append(grid);
   if(!isMissing){
    const note=el('div','','PASSPORT_NOTE');note.append(el('strong','If found'),el('p',cleanNote||'Please contact CityVetHub or the local veterinary office.'));frag.append(note);
   }
   const medical=el('section','','P46_PUBLIC_MEDICAL');medical.append(el('h2','Owner-shared health documents'));
   const expl=el('p','These photos are supplied by the pet owner and are not automatically verified by a veterinarian.');medical.append(expl);
   try{
     const results=await tables.listRows({databaseId:cfg.databaseId,tableId:cfg.tables.passportMedical,queries:[Appwrite.Query.equal('petProfileId',id),Appwrite.Query.limit(100)]});
     const entries=results.rows||[];
     if(!entries.length)medical.append(el('p','No health images shared publicly.'));
     const fmtDate=v=>v?new Date(v).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}):'';
     for(const row of entries){const m=String(row.title||'').match(/\s*\[Exp:\s*(\d{4}-\d{2}-\d{2})\]\s*$/i);const cleanTitle=m?String(row.title).replace(/\s*\[Exp:\s*(\d{4}-\d{2}-\d{2})\]\s*$/i,'').trim():row.title;const exp=row.expiryDate||(m?m[1]:'');const card=el('article','','P46_PUBLIC_MEDICAL_ROW');card.append(el('strong',cleanTitle),el('small',fmtDate(row.recordDate)+(exp?` · Expires ${fmtDate(exp)}`:'')));
        const img=document.createElement('img');img.loading='lazy';img.alt='Owner-submitted health record';img.src=String(storage.getFileView({bucketId:cfg.buckets.media,fileId:row.fileId}));img.onerror=()=>{img.hidden=true;};card.append(img,el('small',row.sourceLabel||'Owner supplied; unverified'));medical.append(card);}
   }catch(err){medical.append(el('p','Shared documents could not be retrieved.'));}
   frag.append(medical);
   frag.append(el('p',`Pet profile ID: ${id}`,'PASSPORT_IDENTIFIER'));
   body.replaceChildren(frag);
  }catch(e){
   if(!silent)fail(e.code===404?'This QR profile does not exist or has been removed.':'The pet QR profile could not be loaded. Check your internet connection.');
  }
 }
 await renderPassport(false);
 const channels=[
   `tablesdb.${cfg.databaseId}.tables.${cfg.tables.passports}.rows`,
   `tablesdb.${cfg.databaseId}.tables.${cfg.tables.passportMedical}.rows`,
   `databases.${cfg.databaseId}.collections.${cfg.tables.passports}.documents`,
   `databases.${cfg.databaseId}.collections.${cfg.tables.passportMedical}.documents`
 ];
 let timer=null;const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>renderPassport(true),300);};
 try{
   if(window.Appwrite.Realtime){const live=new window.Appwrite.Realtime(client);Promise.resolve(live.subscribe(channels,schedule)).catch(()=>{});}
   else if(client.subscribe)client.subscribe(channels,schedule);
 }catch{}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 setInterval(()=>{if(!document.hidden)schedule();},15000);
}catch(e){fail(e.code===404?'This QR profile does not exist or has been removed.':'The pet QR profile could not be loaded. Check your internet connection.');}
})();
