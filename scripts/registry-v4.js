/* CityVetHub 4.6: private pet inventory, immediate QR, owner-approved public passport and uploaded evidence. */
(function(){
'use strict';
const H=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}):'—';
const statuses={draft:'Draft / Unverified',pending:'Pending review',verified:'CVO Verified',rejected:'Rejected',approved:'Approved'};
const status=v=>`<span class="P4_STATUS P4_STATUS_${H(v||'draft')}">${H(statuses[v]||v||'Draft')}</span>`;
const EXP_RE=/\s*\[Exp:\s*(\d{4}-\d{2}-\d{2})\]\s*$/i;
const splitExpiry=(text,expiryCol)=>{const raw=String(text||'');const m=raw.match(EXP_RE);return{text:m?raw.replace(EXP_RE,'').trim():raw,expiryDate:expiryCol||(m?m[1]:'')};};
const ANCESTRY2_KEY='cv_pet_ancestry2_v1';
const readLocalAncestry2=()=>{try{return JSON.parse(localStorage.getItem(ANCESTRY2_KEY)||'{}')||{};}catch{return{};}};
const saveLocalAncestry2=(petId,id,name)=>{if(!petId)return;try{const map=readLocalAncestry2();if(id)map[petId]={id,name:name||''};else delete map[petId];localStorage.setItem(ANCESTRY2_KEY,JSON.stringify(map));}catch{}};
const parent2IdOf=pet=>pet?.ancestryParent2Id||(pet?.$id?readLocalAncestry2()[pet.$id]?.id:'')||'';
const parent2NameOf=pet=>pet?.ancestryParent2Name||(pet?.$id?readLocalAncestry2()[pet.$id]?.name:'')||'';
function mount({api,current}){
 const box=document.getElementById('registryPanel'),owner=current.role==='owner',admin=current.role==='admin';
 const cfg=api.config,Q=window.Appwrite.Query,A=window.Appwrite;
 let pets=[],requests=[],approved=[],evidence=[],clinician=[],staffInventory=[],staffOwners=[],existingListings=[],staffDirectory=[],scanAlerts=[],staffPassports=[],userProfile=null,term='';
 const action=(label,cmd,id='',icon='fa-arrow-right',primary=false)=>`<button type="button" class="${primary?'PRIMARY_ACTION':'CV_SOFT CV_BUTTON'}" data-p46="${cmd}" data-id="${H(id)}"><i class="fa-solid ${icon}"></i> ${H(label)}</button>`;
 const safeImage=id=>{if(!id)return'';try{return String(api.storage.getFileView({bucketId:cfg.buckets.media,fileId:id}));}catch{return'';}};
 const img=id=>{const src=safeImage(id);return src?`<img class="P4_PET_IMAGE" loading="lazy" alt="Pet photo" src="${H(src)}" onerror="this.hidden=true;this.parentElement.classList.add('P46_IMAGE_ERROR')">`:'<div class="P4_PHOTO_FALLBACK"><i class="fa-solid fa-paw"></i></div>';};
 const isAlreadyListed=petId=>existingListings.some(l=>l.petProfileId===petId&&l.status!=='adopted');
 const listedBadge=()=>'<span class="CV412_ALREADY_LISTED"><i class="fa-solid fa-check-circle"></i> Listed for adoption</span>';
 const list=async key=>{const r=await api.tablesDB.listRows({databaseId:cfg.databaseId,tableId:cfg.tables[key],queries:[Q.orderDesc('$createdAt'),Q.limit(100)]});return r.rows||[];};
 const dateTime=v=>{try{return v?new Date(v).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'—';}catch{return '—';}};
 const parseMissing=p=>{const raw=String(p?.lostFoundMessage||'');return {isMissing:p?.vitalStatus==='Missing'||/^\[MISSING\]\s*/i.test(raw),cleanNote:raw.replace(/^\[MISSING\]\s*/i,'').trim()};};
 const extractFinderPhone=title=>{const m=String(title||'').match(/\(([+0-9][0-9\s-]{5,18}[0-9])\)\s*$/);const ph=m?.[1]?m[1].replace(/[^+0-9]/g,''):'';return ph.length>=7?ph:'';};
 const scansForPet=petId=>scanAlerts.filter(n=>String(n.pushStatus||'').toLowerCase()==='missing_scan'&&String(n.listingId||'')===String(petId));
 const passportUrlFor=petId=>{try{const b=String(cfg.publicSiteUrl||'').trim();const u=new URL('passport.html',b?new URL(b.endsWith('/')?b:b+'/'):new URL('./',document.baseURI));u.searchParams.set('pet',petId);return u.href;}catch{return '';}};
 const copyClip=async(text,label='Copied to clipboard.')=>{try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();document.execCommand('copy');t.remove();}notice(label);}catch{notice('Could not copy automatically. Select and copy manually.',true);}};
 const formatMissingDraft=pet=>{
  const {cleanNote}=parseMissing(pet);const url=passportUrlFor(pet.$id);
  const ph=pet.emergencyContact||userProfile?.phone||'';
  const body=[
   `🚨 MISSING PET ALERT: ${pet.petName}`,
   `• Type / Breed: ${pet.species} · ${pet.breed}${pet.color?` (${pet.color})`:''}`,
   `• Sex / Age: ${pet.sex||'Unknown'}${typeof pet.ageYears==='number'?` · ${pet.ageYears} yr(s)`:''}`,
   `• Barangay: Brgy. ${pet.barangay||'Iligan City'}, Iligan City`,
   pet.officialRegistryId?`• CVO Registry ID: ${pet.officialRegistryId}`:'',
   cleanNote?`• Last-Seen / Owner Note: ${cleanNote}`:'',
   pet.shareContact!==false&&ph?`• Emergency Contact: ${ph}`:'• Contact: Open passport QR or call Iligan CVO (063) 221-6752',
   url?`• Public QR Passport: ${url}`:''
  ].filter(Boolean).join('\n').slice(0,5000);
  return {title:`[MISSING PET] ${pet.petName} (${pet.species} - ${pet.breed}) — Brgy. ${pet.barangay||'Iligan City'}`.slice(0,140),body,imageFileId:pet.photoFileId||'',preferredChannelMatch:'missing',missingPetId:pet.$id};
 };
 const findMissingChannel=channels=>{
  const ok=(channels||[]).filter(c=>c.canRead||c.privacy==='public');
  return ok.find(c=>c.postPolicy==='missing_pet')||ok.find(c=>/\b(missing|lost)\b/i.test(c.name||''))||ok.find(c=>/\bfound\b/i.test(c.name||''))||ok.find(c=>c.canPost&&c.privacy==='public')||ok[0]||null;
 };
 const show=(title,sub,toolbar,body)=>{box.innerHTML=`<div class="REGISTRY_TOP"><div><span class="REGISTRY_KICKER"><i class="fa-solid fa-paw"></i> PET MANAGEMENT</span><h2>${H(title)}</h2><p>${H(sub)}</p></div><div class="REGISTRY_ACTIONS">${toolbar}</div></div><div id="p46Notice" class="P4_NOTICE" role="status" hidden></div>${body}`;window.CityVetUI?.upgrade(box);};
 function notice(text,err=false){const node=box.querySelector('#p46Notice');if(node){if(err&&text){node.hidden=false;node.className='P4_NOTICE P4_NOTICE_ERROR';node.textContent=text;}else{node.hidden=true;node.textContent='';}}if(text){if(window.CityVetUI?.toast)window.CityVetUI.toast(text,err?'error':'success');else if(node){node.hidden=false;node.className='P4_NOTICE '+(err?'P4_NOTICE_ERROR':'P4_NOTICE_SUCCESS');node.textContent=text;}}}
 function modal(title,fields,onSave,label='Save changes',successMessage='Saved successfully.'){
  const overlay=document.createElement('div');overlay.className='CV_MODAL P46_MODAL';overlay.innerHTML=`<div class="CV_MODAL_CARD P46_DIALOG" role="dialog" aria-modal="true" aria-label="${H(title)}"><div class="CV_MODAL_HEAD"><h3>${H(title)}</h3><button type="button" data-close aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button></div><form class="P4_PET_FORM">${fields}<div class="P4_FORM_ERRORS" role="alert" hidden></div><div class="P4_FORM_FOOT"><button type="button" class="CV_SOFT CV_BUTTON" data-close>Cancel</button><button type="submit" class="PRIMARY_ACTION">${H(label)}</button></div></form></div>`;
  const close=()=>overlay.remove();overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))close();});
  overlay.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;button.textContent='Saving…';try{await onSave(event.currentTarget);close();await reload(true);notice(successMessage);}catch(error){const err=event.currentTarget.querySelector('.P4_FORM_ERRORS');err.hidden=false;err.textContent='Unable to publish/save: '+api.readableError(error);err.setAttribute('aria-live','assertive');err.scrollIntoView({behavior:'smooth',block:'nearest'});console.error('CityVetHub form failed:',error);}finally{button.disabled=false;button.textContent=label;}});
  document.body.append(overlay);window.CityVetUI?.upgrade(overlay);return overlay;
 }
 const fld=(label,name,val='',type='text',attrs='')=>`<label>${H(label)}<input name="${name}" type="${type}" value="${H(val)}" ${attrs}></label>`;
 const txt=(label,name,val='',max=1500)=>`<label class="P4_FORM_WIDE">${H(label)}<textarea name="${name}" maxlength="${max}" rows="3">${H(val)}</textarea></label>`;
 const select=(label,name,options,chosen)=>`<label>${H(label)}<select name="${name}">${options.map(s=>`<option value="${H(s)}" ${chosen===s?'selected':''}>${H(s)}</option>`).join('')}</select></label>`;
 const checkbox=(label,name,checked=false)=>`<label class="P4_CHECK"><input type="checkbox" name="${name}" ${checked?'checked':''}> ${H(label)}</label>`;
 const parentsFor=(pet,species)=>pets.filter(p=>p.$id!==pet?.$id&&p.species===species);
 const parentSelect=(label,name,chosenId,chosenName,pet,species)=>`<label>${H(label)} <select name="${name}"><option value="">Unknown / Not listed</option>${parentsFor(pet,species).map(p=>`<option value="${H(p.$id)}" ${chosenId===p.$id?'selected':''}>${H(p.petName)} · ${H(p.breed||p.species)}</option>`).join('')}${chosenId&&!parentsFor(pet,species).some(p=>p.$id===chosenId)?`<option value="${H(chosenId)}" selected>${H(chosenName||'Previous parent')} (historical link)</option>`:''}</select></label>`;
 const ancestrySelector=(pet,species)=>parentSelect('Parent pet 1 (optional)','ancestryParentId',pet?.ancestryParentId||'',pet?.ancestryParentName||'',pet,species)+parentSelect('Parent pet 2 (optional)','ancestryParent2Id',parent2IdOf(pet),parent2NameOf(pet),pet,species);
 async function upload(image){
  if(!image)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(image.type)||image.size>5000000)throw Error('Choose JPG, PNG or WEBP up to 5 MB.');
  const permissions=[A.Permission.read(A.Role.user(current.user.$id)),A.Permission.update(A.Role.user(current.user.$id)),A.Permission.delete(A.Role.user(current.user.$id))];
  const f=await api.storage.createFile({bucketId:cfg.buckets.media,fileId:A.ID.unique(),file:image,permissions});return f.$id;
 }
 function petForm(pet){
  const dialog=modal(pet?`Edit ${pet.petName}`:'Add a pet',fld('Pet name','petName',pet?.petName,'text','required maxlength="100"')+  
  select('Animal type','species',['Dog','Cat'],pet?.species||'Dog')+`<label>Breed <select name="breed" required><option value="">Loading available breeds…</option></select></label>`+select('Coat color','color',window.CityVetBreedCatalog?.colors||['Black','White','Brown','Gray','Other / Unknown'],pet?.color||'Other / Unknown')+  
  select('Sex','sex',['Male','Female'],pet?.sex||'Male')+fld('Age in years','ageYears',pet?.ageYears??0,'number','min="0" max="40" required')+  
  `<label>Barangay<select name="barangay" required>${window.CityVetBarangays?.options(pet?.barangay||'')||`<option value="${H(pet?.barangay||'')}">${H(pet?.barangay||'Select barangay')}</option>`}</select></label>`+fld('Home address (private)','homeAddress',pet?.homeAddress,'text','maxlength="200"')+  
  fld('Emergency contact (private)','emergencyContact',pet?.emergencyContact,'tel','maxlength="60"')+  
  select('Vital status','vitalStatus',['Alive', 'Deceased', 'Missing'],pet?.vitalStatus||'Alive')+
  ancestrySelector(pet,pet?.species||'Dog')+
  txt('Pet description','profileDescription',pet?.profileDescription||'',1500)+txt('If found, please…','lostFoundMessage',pet?.lostFoundMessage||'',500)+  
  `<label class="P4_FORM_WIDE">Pet photo (JPG/PNG/WEBP, 5 MB)<input name="picture" type="file" accept="image/jpeg,image/png,image/webp"></label>`+  
  checkbox('Show my name publicly on QR profile','shareOwnerName',pet?.shareOwnerName)+checkbox('Share emergency contact publicly','shareContact',pet?.shareContact)+  
  checkbox('Share exact home address publicly (not recommended)','sharePublicAddress',pet?.sharePublicAddress)+checkbox('Show pet photo publicly','sharePublicPhoto',pet?.sharePublicPhoto)+  
  `<p class="CV_HINT P4_FORM_WIDE">${pet?.verificationStatus==='verified'?'Changes update your pet profile, CVO verified registry entry, and QR passport while keeping its official CVO ID unchanged.':'The QR code is created when the pet is saved. A QR profile is NOT a CVO verification. Only details you choose to share are public.'}</p>`,async form=>{  
  const d=Object.fromEntries(new FormData(form));
  if(d.ancestryParentId&&d.ancestryParent2Id&&d.ancestryParentId===d.ancestryParent2Id)throw Error('Select two different parent pets.');
  const file=form.querySelector('[name=picture]').files[0];const photoFileId=file?await upload(file):(pet?.photoFileId||'');  
  const payload={petName:String(d.petName||'').trim(),species:d.species,breed:String(d.breed||'').trim(),color:String(d.color||'').trim(),sex:d.sex,ageYears:Number(d.ageYears),barangay:String(d.barangay||'').trim(),homeAddress:String(d.homeAddress||'').trim(),emergencyContact:String(d.emergencyContact||'').trim(),
  vitalStatus:d.vitalStatus,ancestryParentId:d.ancestryParentId||'',ancestryParent2Id:d.ancestryParent2Id||'',
  profileDescription:String(d.profileDescription||'').trim(),lostFoundMessage:String(d.lostFoundMessage||'').trim(),photoFileId,  
  shareOwnerName:form.elements.shareOwnerName.checked,shareContact:form.elements.shareContact.checked,sharePublicAddress:form.elements.sharePublicAddress.checked,sharePublicPhoto:form.elements.sharePublicPhoto.checked};  
  const res=await api.operate(pet?'updateInventoryPet':'createInventoryPet',{...(pet?{petProfileId:pet.$id}:{}),...payload});  
  saveLocalAncestry2(pet?.$id||res?.$id,d.ancestryParent2Id||'',pets.find(p=>p.$id===d.ancestryParent2Id)?.petName||'');
  },pet?'Save pet':'Create pet + QR','Saved successfully.');
  const type=dialog.querySelector('[name=species]'),parent1=dialog.querySelector('[name=ancestryParentId]'),parent2=dialog.querySelector('[name=ancestryParent2Id]');
  window.CityVetBreedCatalog?.attach(api,type,dialog.querySelector('[name=breed]'),pet?.breed||'');
  type?.addEventListener('change',()=>{
    const opts=`<option value="">Unknown / Not listed</option>`+parentsFor(pet,type.value).map(p=>`<option value="${H(p.$id)}">${H(p.petName)} · ${H(p.breed||p.species)}</option>`).join('');
    [parent1,parent2].forEach(sel=>{
      if(!sel)return;
      const original=sel.value;
      sel.innerHTML=opts;
      if([...sel.options].some(o=>o.value===original))sel.value=original;
    });
  });
 }
 function detailsForm(pet){
  modal(`Update ${pet.petName}'s public details`,fld('Profile title','profileTitle',pet.profileTitle,'text','maxlength="100"')+
    txt('Description','profileDescription',pet.profileDescription||'')+txt('Lost & found message','lostFoundMessage',pet.lostFoundMessage||'',500)+
    select('Vital status','vitalStatus',['Alive', 'Deceased', 'Missing'],pet?.vitalStatus||'Alive')+
    ancestrySelector(pet,pet.species)+select('Coat color','color',window.CityVetBreedCatalog?.colors||['Black','White','Brown','Gray','Other / Unknown'],pet?.color||'Other / Unknown')+
    fld('Emergency contact','emergencyContact',pet.emergencyContact||'','tel','maxlength="60"')+
    fld('Home address (private by default)','homeAddress',pet.homeAddress||'','text','maxlength="200"')+
    checkbox('Show owner name on public QR','shareOwnerName',pet.shareOwnerName)+checkbox('Share emergency contact on public QR','shareContact',pet.shareContact)+
    checkbox('Share exact home address on public QR (not recommended)','sharePublicAddress',pet.sharePublicAddress)+checkbox('Show pet photo on public QR','sharePublicPhoto',pet.sharePublicPhoto),
    async f=>{const d=Object.fromEntries(new FormData(f));if(d.ancestryParentId&&d.ancestryParent2Id&&d.ancestryParentId===d.ancestryParent2Id)throw Error('Select two different parent pets.');await api.operate('updatePetDetails',{petProfileId:pet.$id,profileTitle:d.profileTitle,profileDescription:d.profileDescription,lostFoundMessage:d.lostFoundMessage,color:d.color,emergencyContact:d.emergencyContact,homeAddress:d.homeAddress,vitalStatus:d.vitalStatus,ancestryParentId:d.ancestryParentId||'',ancestryParent2Id:d.ancestryParent2Id||'',shareOwnerName:f.elements.shareOwnerName.checked,shareContact:f.elements.shareContact.checked,sharePublicAddress:f.elements.sharePublicAddress.checked,sharePublicPhoto:f.elements.sharePublicPhoto.checked});saveLocalAncestry2(pet.$id,d.ancestryParent2Id||'',pets.find(p=>p.$id===d.ancestryParent2Id)?.petName||'');},'Save changes','Saved successfully.');
 }
 function healthForm(pet){
  modal(`Add a health document for ${pet.petName}`,fld('Title / vaccination / treatment','title','','text','required maxlength="120"')+
   fld('Date of record','recordDate',new Date().toISOString().slice(0,10),'date','required')+
   fld('Expiry of vaccination / treatment (optional)','expiryDate','','date','')+
   `<label class="P4_FORM_WIDE">Photo of medical / vaccination record (required)<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label>`+
   checkbox('Share this document publicly on the QR pet profile','sharePublic',false)+
   `<p class="CV_HINT P4_FORM_WIDE">Owner-uploaded documents are labeled owner supplied, not clinically verified. Do not upload personal identifiers or private medical details if sharing publicly.</p>`,async f=>{
    const data=new FormData(f),file=f.querySelector('[name=file]').files[0];const fileId=await upload(file);
    const rawTitle=String(data.get('title')||'').trim(),expDate=String(data.get('expiryDate')||'').trim();
    const titleWithExp=expDate?`${rawTitle.slice(0,140)} [Exp: ${expDate}]`:rawTitle;
    await api.operate('addPetHealthUpload',{petProfileId:pet.$id,fileId,title:titleWithExp,recordDate:String(data.get('recordDate')||''),expiryDate:expDate,sharePublic:f.elements.sharePublic.checked});
   },'Add document','Saved successfully.');
 }
 async function openQRCode(pet){
  // The pet's identity is its stable inventory row ID. The QR URL is only
  // shareable externally once the website has a reachable host (or LAN URL).
  const base=String(cfg.publicSiteUrl||'').trim();
  let url;
  try{url=new URL('passport.html',base?new URL(base.endsWith('/')?base:base+'/'):new URL('./',document.baseURI));}
  catch{return alert('Invalid publicSiteUrl in scripts/config.js. Provide an http(s) URL ending in /.');}
  url.searchParams.set('pet',pet.$id);
  const overlay=modal(`QR profile · ${pet.petName}`,`<div class="P46_QR_VIEW P4_FORM_WIDE"><div class="P46_QR_PANEL" id="p46Qr"></div><p>${H(pet.petName)} · ${H(statuses[pet.verificationStatus]||'Unverified')} — scan to open only owner-approved information.</p><a href="${H(url.href)}" target="_blank" rel="noopener">Open profile in browser</a><button type="button" class="CV_BUTTON PRIMARY_ACTION" id="p46DownloadQr"><i class="fa-solid fa-download"></i> Download QR PNG</button></div>`,async()=>{});
  overlay.querySelector('.P4_FORM_FOOT')?.remove();const target=overlay.querySelector('#p46Qr');
  api.tablesDB.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.passports,rowId:pet.$id}).catch(err=>{
    if(Number(err?.code)===404)api.operate('ensurePetPassport',{petProfileId:pet.$id}).catch(()=>{});
  });
  if(!window.QRCode){target.textContent='QR generator could not load. Connect to the internet and reload this page.';return;}
  new window.QRCode(target,{text:url.href,width:240,height:240,correctLevel:window.QRCode.CorrectLevel.H});
  overlay.querySelector('#p46DownloadQr').addEventListener('click',()=>{
   const canvas=target.querySelector('canvas'),image=target.querySelector('img');
   const href=canvas?.toDataURL('image/png')||image?.src;
   if(!href)return alert('The QR image has not loaded.');
   const a=document.createElement('a');a.href=href;a.download='CityVetHub-'+pet.petName.replace(/[^a-zA-Z0-9_-]/g,'-')+'-QR.png';a.click();
  });
 }

 const missingAction=pet=>parseMissing(pet).isMissing
   ?action('Mark as found','markFound',pet.$id,'fa-circle-check')
   :(pet?.vitalStatus!=='Deceased'?action('Declare missing','declareMissing',pet.$id,'fa-triangle-exclamation'):'');
 function toggleMissingForm(pet){
   const {isMissing,cleanNote}=parseMissing(pet);
   if(isMissing){
     return window.CityVetUI?.confirm({title:`Mark ${pet.petName} as found?`,description:'This clears the missing pet alert on the digital QR passport.',confirmLabel:'Mark as found',onConfirm:async()=>{await api.operate('setPetMissingStatus',{petProfileId:pet.$id,missing:false});await reload(true);notice(`${pet.petName} is no longer marked as missing.`);}});
   }
   const isVerifiedOwner=userProfile?.accountVerificationStatus==='verified';
   const prePhone=String(pet.emergencyContact||userProfile?.phone||'').trim();
   let postOutcome='';
   modal(`Declare ${pet.petName} missing`,
     `<p class="CV_HINT P4_FORM_WIDE">Anyone scanning ${H(pet.petName)}'s digital QR passport will see a prominent missing pet alert at the top and can share their callback details with you.</p>`+
     txt('Lost & found message (last seen, landmarks, collar, reward)','lostFoundMessage',cleanNote,480)+
     fld('Emergency contact phone','emergencyContact',prePhone,'tel','maxlength="60" placeholder="e.g. 09171234567"')+
     `<div style="display:flex;flex-direction:column;gap:8px" class="P4_FORM_WIDE">`+
       checkbox('Share emergency contact publicly on QR passport','shareContact',true)+
       (isVerifiedOwner?checkbox('Also post missing alert in Community (#Missing / public channel)','autoPostCommunity',true):'<p class="CV_HINT">Verify your ID under My Profile to enable 1-click Community alerts, or copy a flyer after saving.</p>')+
     `</div>`,
     async f=>{
       const d=Object.fromEntries(new FormData(f));
       const cleanedPhone=String(d.emergencyContact||'').trim();
       const nextShareContact=Boolean(f.elements.shareContact?.checked);
       if(cleanedPhone!==String(pet.emergencyContact||'').trim()||nextShareContact!==Boolean(pet.shareContact)){
         try{
           await api.operate('updatePetDetails',{
             petProfileId:pet.$id,
             profileTitle:pet.profileTitle||'',profileDescription:pet.profileDescription||'',
             color:pet.color||'Other / Unknown',homeAddress:pet.homeAddress||'',
             vitalStatus:pet.vitalStatus||'Alive',
             ancestryParentId:pet.ancestryParentId||'',ancestryParent2Id:parent2IdOf(pet),
             shareOwnerName:pet.shareOwnerName??true,sharePublicAddress:pet.sharePublicAddress??false,sharePublicPhoto:pet.sharePublicPhoto??true,
             emergencyContact:cleanedPhone,shareContact:nextShareContact
           });
         }catch{}
       }
       await api.operate('setPetMissingStatus',{petProfileId:pet.$id,missing:true,lostFoundMessage:d.lostFoundMessage});
       if(isVerifiedOwner&&f.elements.autoPostCommunity?.checked){
         try{
           const ov=await api.operate('communityOverview');
           const ch=findMissingChannel(ov?.channels||[]);
           if(ch){
             const draft=formatMissingDraft({...pet,emergencyContact:cleanedPhone,shareContact:nextShareContact,lostFoundMessage:d.lostFoundMessage,vitalStatus:'Missing'});
             const base={channelId:ch.id,title:draft.title,body:draft.body,missingPetId:pet.$id,authorRole:'owner',accountType:'owner',isOfficial:false};
             try{await api.operate('communityCreatePost',{...base,imageFileIds:pet.photoFileId?[pet.photoFileId]:[]});}
             catch{await api.operate('communityCreatePost',{...base,imageFileIds:[]});}
             postOutcome=` + posted in #${ch.name}`;
           }
         }catch{postOutcome=' (Community auto-post failed; post manually from pet details)';}
       }
       notice(`${pet.petName} has been declared missing${postOutcome}.`);
     },'Declare missing','');
 }
 function enableMissingContact(pet){
   const phone=String(pet.emergencyContact||userProfile?.phone||'').trim();
   if(!phone){detailsForm(pet);notice('Enter an emergency contact phone number and save details.',true);return;}
   window.CityVetUI?.confirm({
     title:`Show ${phone} on ${pet.petName}'s QR passport?`,
     description:'Finders scanning the missing collar QR will immediately see your contact number.',
     confirmLabel:'Enable public contact',
     onConfirm:async()=>{
       await api.operate('updatePetDetails',{
         petProfileId:pet.$id,profileTitle:pet.profileTitle||'',profileDescription:pet.profileDescription||'',
         color:pet.color||'Other / Unknown',homeAddress:pet.homeAddress||'',vitalStatus:pet.vitalStatus||'Missing',
         ancestryParentId:pet.ancestryParentId||'',ancestryParent2Id:parent2IdOf(pet),
         shareOwnerName:pet.shareOwnerName??true,sharePublicAddress:pet.sharePublicAddress??false,sharePublicPhoto:pet.sharePublicPhoto??true,
         emergencyContact:phone,shareContact:true
       });
       await reload(true);notice(`Public contact (${phone}) enabled on ${pet.petName}'s QR passport.`);
     }
   });
 }
 function openStaffInspectModal(record,passDoc){
   const rawMsg=String(passDoc?.lostFoundMessage||record.lostFoundMessage||'');
   const isMissing=passDoc?.vitalStatus==='Missing'||record.vitalStatus==='Missing'||/^\[MISSING\]/i.test(rawMsg);
   const cleanNote=rawMsg.replace(/^\[MISSING\]\s*/i,'').trim();
   const pid=passDoc?.$id||record.petProfileId||record.$id;
   const qrUrl=passportUrlFor(pid);
   const publicPhone=passDoc?.contact||record.contact||'';
   const officerName=userProfile?.fullName||current.user?.name||current.user?.email||'Field Officer';
   const officerPhone=String(userProfile?.phone||'').replace(/[^+0-9]/g,'');
   const m=modal(`Inspect · ${record.petName||'Registered Pet'}`,
     `<div class="P46_PET_SUMMARY P4_FORM_WIDE"><div class="P46_PET_DETAIL_IMAGE">${img(passDoc?.photoFileId||record.photoFileId)}</div><div><h3>${H(record.petName)}</h3>${status(record.verificationStatus||record.reviewStatus||'draft')}${isMissing?' <span class="P4_STATUS P4_STATUS_rejected P46_MISSING_PILL"><span class="CV420_OUTBREAK_DOT CV420_DOT_ACTIVE"></span> ACTIVE MISSING</span>':''}<p>${H(record.species||'Pet')} · ${H(record.breed||'Mixed')} · Brgy. ${H(record.barangay||'Unspecified')}</p><p>Owner: <b>${H(passDoc?.ownerName||record.ownerName||'Pet Owner')}</b></p>${publicPhone?`<p>Owner Contact: <b>${H(publicPhone)}</b></p>`:''}</div></div>`+
     (isMissing?`<div class="P46_MISSING_BANNER P4_FORM_WIDE"><span class="CV420_OUTBREAK_DOT CV420_DOT_ACTIVE"></span><div><strong>DECLARED MISSING PET</strong><p>${H(cleanNote||'This pet is marked missing. Alert the owner or post a sighting update.')}</p></div></div>`:'')+
     (isMissing?`<div class="P46_SCAN_STATUS P4_FORM_WIDE" id="staffMissingNotifyStatus" hidden></div>`:'')+
     `<div class="P46_DETAIL_ACTIONS P4_FORM_WIDE">`+
       (qrUrl?`<a class="CV_SOFT CV_BUTTON" href="${H(qrUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-qrcode"></i> Open Public QR</a>`:'')+
       (publicPhone?`<button type="button" class="CV_SOFT CV_BUTTON" id="staffCopyPhoneBtn"><i class="fa-solid fa-copy"></i> Copy Owner Phone (${H(publicPhone)})</button>`:'')+
       (isMissing?`<button type="button" class="CV_BUTTON PRIMARY_ACTION" id="staffNotifyLocatedBtn"><i class="fa-solid fa-bell"></i> Notify Owner I Located This Pet</button><button type="button" class="CV_SOFT CV_BUTTON" id="staffPostSightingBtn"><i class="fa-solid fa-camera"></i> Post Sighting Photo</button>`:'')+
     `</div>`,
     async()=>{});
   m.querySelector('.P4_FORM_FOOT')?.remove();
   if(publicPhone)m.querySelector('#staffCopyPhoneBtn')?.addEventListener('click',()=>copyClip(publicPhone,'Owner phone copied.'));
   m.querySelector('#staffNotifyLocatedBtn')?.addEventListener('click',async btnWrap=>{
     const btn=btnWrap.currentTarget;btn.disabled=true;btn.textContent='Notifying owner…';
     const statusBox=m.querySelector('#staffMissingNotifyStatus');
     try{
       const res=await api.operate('reportMissingPetScan',{petProfileId:pid,shareIdentity:true,shareContact:officerPhone.length>=7,scannerName:`${officerName} (CVO Field Officer)`,...(officerPhone.length>=7?{scannerContact:officerPhone}:{})});
       statusBox.hidden=false;
       statusBox.textContent=res?.notified?(res.scannerContact?`Owner alerted with your officer callback (${res.scannerContact}).`:'Owner alerted that CVO Field Staff located this pet.'):res?.reason==='deduplicated'?'Owner was already notified within the last 5 mins.':res?.reason==='self_scan'?'This is your own pet.':'Alert processed.';
     }catch(err){statusBox.hidden=false;statusBox.textContent=api.readableError(err);}
     finally{btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-bell"></i> Notify Owner I Located This Pet';}
   });
   m.querySelector('#staffPostSightingBtn')?.addEventListener('click',()=>{
     m.remove();
     window.CityVetOpenCommunityDraft?.({
       draftKey:String(Date.now()),
       title:`[SIGHTING] ${record.petName||'Pet'} (${record.species||'Pet'}) spotted near ${record.barangay||'Iligan City'}`.slice(0,140),
       body:[
         `MISSING PET SIGHTING REPORT — ${record.petName||'Companion Pet'}`,
         `• Spotted At / Landmark: (Describe exact street or barangay landmark here)`,
         `• Condition / Notes: (Describe behavior, direction headed, or collar)`,
         '',
         'Passport Reference:',
         `• Pet: ${record.petName||'Pet'} (${record.species||'Pet'} · ${record.breed||'Mixed'})`,
         `• Registered Barangay: Brgy. ${record.barangay||'Iligan City'}, Iligan City`,
         record.officialRegistryId?`• Official ID: ${record.officialRegistryId}`:null,
         publicPhone?`• Owner Contact: ${publicPhone}`:null,
         qrUrl?`• QR Passport: ${qrUrl}`:null
       ].filter(v=>v!==null).join('\n').slice(0,5000),
       sightingPetId:pid,
       preferredChannelMatch:'missing'
     });
   });
 }
 function detailsBody(pet){
  const ownEvidence=evidence.filter(x=>x.petProfileId===pet.$id);
  const official=approved.find(x=>x.petProfileId===pet.$id);
  const clinical=clinician.filter(x=>x.petId===pet.$id||(official?.$id&&x.petId===official.$id));
  const {isMissing,cleanNote}=parseMissing(pet);
  const petScans=scansForPet(pet.$id);
  const rows=ownEvidence.map(x=>{const parsed=splitExpiry(x.title,x.expiryDate);return `<div class="P46_HEALTH_ROW"><div><strong>${H(parsed.text)}</strong><small>${H(date(x.recordDate))}${parsed.expiryDate?` · Expires ${H(date(parsed.expiryDate))}`:''} · ${x.sharePublic?'Public (owner-supplied)':'Private'}</small></div><a href="${H(safeImage(x.fileId))}" target="_blank" rel="noopener">View image</a>${action('Remove','removeHealth',x.$id,'fa-trash')}</div>`;}).join('');
  const p1Name=pets.find(p=>p.$id===pet.ancestryParentId)?.petName||pet.ancestryParentName||'Unknown / Not listed';
  const p2Id=parent2IdOf(pet),p2Name=pets.find(p=>p.$id===p2Id)?.petName||parent2NameOf(pet)||'Unknown / Not listed';
  const contactMissing=isMissing&&(!pet.shareContact||!String(pet.emergencyContact||'').trim());
  const scansSection=(isMissing||petScans.length)?`<div class="P46_MEDICAL_SECTION P46_SCAN_CARD P4_FORM_WIDE"><div class="P4_SECTION_HEADING"><h3><span class="${isMissing?'CV420_OUTBREAK_DOT CV420_DOT_ACTIVE':''}"></span> Recent Collar QR Scans (${petScans.length})</h3></div>${petScans.length?petScans.slice(0,6).map(n=>{const ph=extractFinderPhone(n.title);return `<div class="P46_SCAN_ROW"><div><strong>${H(n.title||'Collar QR scanned')}</strong><small>${H(dateTime(n.createdAt||n.$createdAt))}${n.isRead?' · Read':' · New alert'}</small></div><div class="P46_SCAN_BTNS">${ph?`<button type="button" class="CV_SOFT CV_BUTTON" data-p46="copyPhone" data-phone="${H(ph)}" data-id="${H(pet.$id)}"><i class="fa-solid fa-copy"></i> Copy ${H(ph)}</button>`:''}${!n.isRead?`<button type="button" class="CV_SOFT CV_BUTTON" data-p46="markScanRead" data-notif-id="${H(n.$id)}" data-id="${H(pet.$id)}"><i class="fa-solid fa-check"></i> Mark read</button>`:''}</div></div>`;}).join(''):'<p class="CV_HINT">No collar QR scans reported yet. When a signed-in finder scans the QR passport and shares their details, their alert and callback phone appear here.</p>'}</div>`:'';
  return (isMissing?`<div class="P46_MISSING_BANNER P4_FORM_WIDE"><span class="CV420_OUTBREAK_DOT CV420_DOT_ACTIVE"></span><div><strong>DECLARED MISSING PET</strong><p>${H(cleanNote||'This pet is marked missing on its public QR passport.')}</p></div></div>`:'')+
  (contactMissing?`<div class="P46_WARN_BAR P4_FORM_WIDE"><span><i class="fa-solid fa-triangle-exclamation"></i> Your emergency phone is hidden or empty on this missing pet's public QR passport.</span>${action('Enable public contact','enableContact',pet.$id,'fa-phone-volume')}</div>`:'')+
  (isMissing?`<div class="P46_DETAIL_ACTIONS P4_FORM_WIDE">${action('Post Alert to Community','postCommunity',pet.$id,'fa-bullhorn',true)}${action('Copy Missing Flyer','copyFlyer',pet.$id,'fa-copy')}</div>`:'')+
  `<div class="P46_PET_SUMMARY P4_FORM_WIDE"><div class="P46_PET_DETAIL_IMAGE">${img(pet.photoFileId)}</div><div><h3>${H(pet.petName)}</h3>${status(pet.verificationStatus)}${isMissing?' <span class="P4_STATUS P4_STATUS_rejected P46_MISSING_PILL"><span class="CV420_OUTBREAK_DOT CV420_DOT_ACTIVE"></span> Active Missing</span>':''}<p>${H(pet.species)} • ${H(pet.breed)} • ${H(pet.sex)} • ${H(pet.ageYears)} year(s)</p><p><i class="fa-solid fa-location-dot"></i> ${H(pet.barangay)}</p><p>${H(pet.profileDescription||'No description yet.')}</p></div></div>`+
  `<div class="P46_DETAIL_FIELDS P4_FORM_WIDE"><div><span>Status</span><strong>${H(pet.vitalStatus||'Alive')}</strong></div><div><span>Ancestry 1</span><strong>${H(p1Name)}</strong></div><div><span>Ancestry 2</span><strong>${H(p2Name)}</strong></div><div><span>Verification status</span><strong>${H(statuses[pet.verificationStatus]||'Draft')}</strong></div><div><span>Official CVO registry ID</span><strong>${H(pet.officialRegistryId||'Not assigned')}</strong></div><div><span>Home address · Private</span><strong>${H(pet.homeAddress||'Not provided')}</strong></div><div><span>Emergency contact ${pet.shareContact?'· Public on QR':'· Private'}</span><strong>${H(pet.emergencyContact||'Not provided')}</strong></div><div class="P46_WIDE"><span>Lost & found</span><strong>${H(cleanNote||'If found, please contact CityVetHub.')}</strong></div></div>`+
  `<div class="P46_DETAIL_ACTIONS P4_FORM_WIDE">${action('QR Code','qr',pet.$id,'fa-qrcode',true)}${missingAction(pet)}${isAlreadyListed(pet.$id)?listedBadge():action('List for adoption','listAdoption',pet.$id,'fa-heart')}${action('Edit identity','edit',pet.$id,'fa-paw')}${['draft','rejected'].includes(pet.verificationStatus)?action('Send for verification','verify',pet.$id,'fa-paper-plane')+action('Delete pet','deletePet',pet.$id,'fa-trash'):''}</div>`+
  scansSection+
  `<div class="P46_MEDICAL_SECTION P4_FORM_WIDE"><div class="P4_SECTION_HEADING"><h3>Health and vaccination documents</h3>${action('Add Medical Record','addHealth',pet.$id,'fa-plus',true)}</div><p>Owner-uploaded images are not official veterinary certification. Each shared document is visible to anyone with the QR link.</p>${rows||'<p class="CV_HINT">No personal health documents yet.</p>'}</div>`+
  (clinical.length?`<div class="P46_MEDICAL_SECTION P4_FORM_WIDE"><h3>Veterinary records</h3>${clinical.map(c=>{const exp=splitExpiry(c.description,c.expiryDate).expiryDate;return `<p><b>${H(c.recordType)}:</b> ${H(c.medicineType)} · ${H(date(c.dateAdministered))}${exp?` · Expires ${H(date(exp))}`:''}</p>`;}).join('')}</div>`:'');
 }
 function details(pet){
  const layer=modal(`${pet.petName} · Pet profile`,detailsBody(pet),async()=>{});
  layer.querySelector('.P4_FORM_FOOT')?.remove();layer.classList.add('P46_DETAILS_MODAL');
  layer.dataset.petId=pet.$id;
 }
 function syncOpenDetailsModal(){
  const openModal=document.querySelector('.P46_DETAILS_MODAL');
  if(!openModal?.dataset.petId)return;
  const updatedPet=pets.find(p=>p.$id===openModal.dataset.petId);
  if(!updatedPet){openModal.remove();return;}
  const titleEl=openModal.querySelector('.CV_MODAL_HEAD h3');
  if(titleEl)titleEl.textContent=`${updatedPet.petName} · Pet profile`;
  const formEl=openModal.querySelector('.P4_PET_FORM');
  if(formEl)formEl.innerHTML=detailsBody(updatedPet);
 }
 function renderOwnerCard(p){
  const {isMissing,cleanNote}=parseMissing(p);
  const pScans=scansForPet(p.$id);
  const latestPh=pScans.map(n=>extractFinderPhone(n.title)).find(Boolean);
  const missingStrip=isMissing?`<div class="P46_CARD_MISSING_INFO">${cleanNote?`<p class="P46_CARD_NOTE">${H(cleanNote)}</p>`:''}<div class="P46_CARD_SCAN_META"><span><i class="fa-solid fa-magnifying-glass"></i> ${pScans.length?`${pScans.length} collar QR scan${pScans.length===1?'':'s'}${latestPh?` · Callback: <b>${H(latestPh)}</b>`:''}`:'No collar scans yet'}</span>${latestPh?`<button type="button" class="CV_SOFT CV_BUTTON P46_MINI_COPY" data-p46="copyPhone" data-phone="${H(latestPh)}" data-id="${H(p.$id)}"><i class="fa-solid fa-copy"></i> Copy</button>`:''}</div></div>`:'';
  return `<article class="P4_PET_CARD P46_CLICK_CARD ${isMissing?'P46_PET_MISSING':''}" role="button" tabindex="0" data-p46="open" data-id="${H(p.$id)}" data-species="${H(p.species||'')}" data-status="${H(statuses[p.verificationStatus]||p.verificationStatus||'Draft')}" data-barangay="${H(p.barangay||'Unspecified')}" aria-label="Open ${H(p.petName)}'s profile"><div class="P4_PET_MEDIA">${img(p.photoFileId)}<div class="P4_FLOAT_BADGE">${status(p.verificationStatus)}${isMissing?' <span class="P4_STATUS P4_STATUS_rejected P46_MISSING_PILL"><span class="CV420_OUTBREAK_DOT CV420_DOT_ACTIVE"></span> Active Missing</span>':''}</div></div><div class="P4_PET_COPY"><h3>${H(p.petName)}</h3><p>${H(p.profileTitle||p.species+' · '+p.breed)}</p>${missingStrip}<div class="P4_PET_FACTS"><span class="P4_PET_FACT">${H(p.species)}</span><span class="P4_PET_FACT">${H(p.breed)}</span><span class="P4_PET_FACT">${H(p.ageYears)} yr</span></div><p class="P4_PET_BARANGAY"><i class="fa-solid fa-location-dot"></i> ${H(p.barangay)}</p><div class="P4_PET_ACTIONS">${action('View profile','open',p.$id,'fa-eye',true)}${action('QR code','qr',p.$id,'fa-qrcode')}${missingAction(p)}${isAlreadyListed(p.$id)?listedBadge():action('List for adoption','listAdoption',p.$id,'fa-heart')}${['draft','rejected'].includes(p.verificationStatus)?action('Send request','verify',p.$id,'fa-paper-plane'):''}</div></div></article>`;
 }
 function ownerPage(){
  const visible=pets.filter(p=>[p.petName,p.breed,p.species,p.barangay].some(v=>String(v||'').toLowerCase().includes(term)));
  const missingPets=visible.filter(p=>parseMissing(p).isMissing);
  const normalPets=visible.filter(p=>!parseMissing(p).isMissing);
  const missingBlock=missingPets.length?`<section class="P46_MISSING_SECTION"><div class="P46_MISSING_SECTION_HEAD"><div class="P46_MISSING_SECTION_TITLE"><span class="CV420_OUTBREAK_DOT CV420_DOT_ACTIVE"></span><h3>Missing Pets — Active Alerts (${missingPets.length})</h3></div><span>Pinned at top with live collar QR scan alerts</span></div><div class="P4_PET_GRID">${missingPets.map(renderOwnerCard).join('')}</div></section>`:'';
  const normalBlock=normalPets.length?`${missingPets.length?`<h3 class="P46_SECTION_DIVIDER">Other Registered Pets (${normalPets.length})</h3>`:''}<div class="P4_PET_GRID">${normalPets.map(renderOwnerCard).join('')}</div>`:'';
  show('My Pets','Every pet has an immediate QR profile. CVO verification is an optional separate request.',action('Add a pet','add','','fa-plus',true)+action('Refresh','reload','','fa-rotate'),
    `<div class="P4_SUMMARY_GRID">${[['My pets',pets.length],['Active missing',pets.filter(p=>parseMissing(p).isMissing).length],['Awaiting verification',pets.filter(p=>p.verificationStatus==='pending').length],['Verified',pets.filter(p=>p.verificationStatus==='verified').length]].map(([n,v])=>`<div class="P4_SUMMARY"><span>${H(n)}</span><strong>${v}</strong></div>`).join('')}</div>`+
    (visible.length?(missingBlock+normalBlock):'<div class="P4_PET_GRID"><div class="P4_EMPTY_PETS"><h3>No pets yet</h3><p>Add a pet to generate its personal QR link immediately.</p></div></div>')+
    '<p class="CV_HINT">QR profiles are public only through their link. Sharing medical images, contact numbers, owner name, and exact address is optional.</p>');
 }
 function staffPage(){
  const byId=new Map(approved.map(p=>[p.requestId||p.$id,p]));
  const missingPassMap=new Map();
  for(const p of staffPassports){if(parseMissing(p).isMissing){missingPassMap.set(p.$id,p);if(p.petId)missingPassMap.set(p.petId,p);}}
  const baseSource=admin?[...requests,...approved.filter(p=>!requests.some(r=>r.$id===(p.requestId||p.$id))).map(p=>({...p,reviewStatus:'approved'}))]:approved.map(p=>({...p,reviewStatus:'approved'}));
  const seenMissingIds=new Set();
  const source=baseSource.map(r=>{
    const pet=byId.get(r.$id)||approved.find(p=>p.petProfileId===r.petProfileId);
    const mp=missingPassMap.get(r.petProfileId)||missingPassMap.get(pet?.petProfileId)||missingPassMap.get(pet?.$id)||missingPassMap.get(r.$id);
    if(mp){seenMissingIds.add(mp.$id);return {...r,_missingPassport:mp};}
    return r;
  });
  for(const mp of staffPassports){
    if(parseMissing(mp).isMissing&&!seenMissingIds.has(mp.$id)){
      seenMissingIds.add(mp.$id);
      source.push({$id:mp.$id,petProfileId:mp.$id,petName:mp.petName,species:mp.species,breed:mp.breed,ownerName:mp.ownerName||'Private owner',barangay:mp.barangay,officialRegistryId:mp.officialRegistryId||'',photoFileId:mp.photoFileId||'',$createdAt:mp.$createdAt,reviewStatus:mp.verificationStatus||'draft',vitalStatus:'Missing',_missingPassport:mp});
    }
  }
  source.sort((a,b)=>Number(Boolean(b._missingPassport))-Number(Boolean(a._missingPassport)));
  const visible=source.filter(p=>[p.petName,p.ownerName,p.barangay,p.officialRegistryId].some(s=>String(s||'').toLowerCase().includes(term)));
  const staffById=new Map(staffDirectory.map(p=>[p.$id,p]));
  const photoOf=request=>{
    const pet=byId.get(request.$id)||approved.find(p=>p.petProfileId===request.petProfileId);
    const fileId=staffInventory.find(p=>p.$id===request.petProfileId)?.photoFileId||request.photoFileId||pet?.photoFileId||staffById.get(pet?.$id)?.photoFileId||'';
    const src=staffById.get(pet?.$id)?.imageUrl||safeImage(fileId);
    const petId=pet?.$id||'';
    const petProfileId=request.petProfileId||pet?.petProfileId||pet?.$id||'';
    if(src)return `<img class="P4_PET_IMAGE" loading="lazy" alt="${H(request.petName)} photo" src="${H(src)}" data-pet-id="${H(petId)}" data-pet-profile-id="${H(petProfileId)}" onerror="window.CityVet?.recoverStaffPetPhoto?window.CityVet.recoverStaffPetPhoto(this):(this.hidden=true,this.parentElement.classList.add('P46_IMAGE_ERROR'))">`;
    return '<div class="P4_PHOTO_FALLBACK"><i class="fa-solid fa-paw"></i></div>';
  };
  const activeMissingCount=source.filter(x=>Boolean(x._missingPassport)).length;
  show(admin?'Pet Verification':'Verified Pet Registry',admin?'Review requests and monitor declared missing pets.':'Registered pets, official statuses, and active missing alerts.',(admin?action('Add pet','adminAddPet','','fa-plus',true):'')+action('Refresh','reload','','fa-rotate'),
    `<div class="P4_SUMMARY_GRID"><div class="P4_SUMMARY"><span>${admin?'Total requests':'Verified registry pets'}</span><strong>${admin?requests.length:approved.length}</strong></div><div class="P4_SUMMARY"><span>Active missing</span><strong>${activeMissingCount}</strong></div><div class="P4_SUMMARY"><span>Verified</span><strong>${approved.length}</strong></div><div class="P4_SUMMARY"><span>${admin?'Pending requests':'Draft missing alerts'}</span><strong>${admin?requests.filter(r=>r.reviewStatus==='pending').length:source.filter(x=>x._missingPassport&&!byId.has(x.$id)).length}</strong></div></div>`+
    `<div class="CV_TABLE_WRAP"><table class="CV_TABLE CV49_VERIFICATION_TABLE"><thead><tr><th>Pet</th><th>Owner</th><th>Barangay</th><th>Official ID</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>${visible.map(r=>{const isMiss=Boolean(r._missingPassport);const verPet=byId.get(r.$id);const pid=r.petProfileId||verPet?.petProfileId||verPet?.$id||r.$id;return `<tr class="${isMiss?'CV49_MISSING_ROW':''}"><td><span class="CV49_CELL_FLEX"><span class="CV49_THUMB">${photoOf(r)}</span><strong>${H(r.petName)}</strong></span></td><td><span class="CV49_CELL_FLEX"><span class="CV49_USER_AVATAR">${img(staffOwners.find(p=>p.userId===r.ownerId)?.profileImageId)}</span><strong>${H(r.ownerName)}</strong></span></td><td>${H(r.barangay)}</td><td>${H(verPet?.officialRegistryId||r.officialRegistryId||'Not assigned')}</td><td>${H(date(r.$createdAt))}</td><td>${status(verPet?'verified':r.reviewStatus)}${isMiss?' <span class="P4_STATUS P4_STATUS_rejected P46_MISSING_PILL"><span class="CV420_OUTBREAK_DOT CV420_DOT_ACTIVE"></span> Missing</span>':''}</td><td>${admin&&r.reviewStatus==='pending'?action('Review','review',r.$id,'fa-check'):''}${isMiss?action('Inspect','staffInspect',pid,'fa-bell',true):''}${action('QR profile','staffQr',pid,'fa-qrcode')}${admin&&verPet&&!verPet.officialRegistryId?action('Assign official ID','assignId',verPet.$id,'fa-id-card'):''}</td></tr>`;}).join('')||'<tr><td colspan="7">No records found</td></tr>'}</tbody></table></div>`);
  window._cv46StaffRows=source;window._cv46StaffById=byId;
 }
 function assignLegacyId(petId){
  const p=approved.find(p=>p.$id===petId);if(!p)return notice('Verified pet not found.',true);
  modal(`Assign official ID · ${p.petName}`,fld('Unique official CVO registry ID','officialRegistryId','','text','required pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,29}" maxlength="30" placeholder="e.g. CVH-2026-0002"'),async form=>{
    await api.operate('assignOfficialPetId',{petId:p.$id,officialRegistryId:form.elements.officialRegistryId.value});
  });
 }
 function adminAddPetForm(){
  const ownerOpts=[...staffOwners].sort((a,b)=>String(a.fullName||a.email||'').localeCompare(String(b.fullName||b.email||'')))
    .map(u=>`<option value="${H(u.userId||u.$id)}">${H(u.fullName||u.email||'Pet Owner')}${u.barangay?' · '+H(u.barangay):''}</option>`).join('');
  const layer=modal('Add pet to system',
    `<label class="P4_FORM_WIDE">Assign to owner<select name="ownerId"><option value="">CVO / Admin-managed (current admin)</option>${ownerOpts}</select></label>`+
    fld('Pet name','petName','','text','required maxlength="100"')+
    select('Animal type','species',['Dog','Cat'],'Dog')+
    `<label>Breed <select name="breed" required><option value="">Loading available breeds…</option></select></label>`+
    select('Coat color','color',window.CityVetBreedCatalog?.colors||['Black','White','Brown','Gray','Other / Unknown'],'Other / Unknown')+
    select('Sex','sex',['Male','Female'],'Male')+
    fld('Age in years','ageYears',0,'number','min="0" max="40" required')+
    `<label>Barangay<select name="barangay" required>${window.CityVetBarangays?.options('')||'<option value="">Select barangay</option>'}</select></label>`+
    select('Vital status','vitalStatus',['Alive','Missing','Deceased'],'Alive')+
    checkbox('Verify immediately & assign Official CVO Registry ID','verifyImmediately',true)+
    fld('Unique official CVO registry ID','officialRegistryId','','text','required pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,29}" maxlength="30" placeholder="e.g. CVH-2026-0001"')+
    txt('Pet description','profileDescription','',1500)+
    txt('Lost & found message','lostFoundMessage','',500)+
    `<label class="P4_FORM_WIDE">Pet photo (JPG/PNG/WEBP, 5 MB)<input name="picture" type="file" accept="image/jpeg,image/png,image/webp"></label>`+
    checkbox('Show owner name on public QR','shareOwnerName',false)+
    checkbox('Show pet photo on public QR','sharePublicPhoto',true),
    async form=>{
      const d=Object.fromEntries(new FormData(form));
      const file=form.querySelector('[name=picture]').files[0];
      const photoFileId=file?await upload(file):'';
      await api.operate('adminCreatePet',{
        ownerId:String(d.ownerId||'').trim(),
        petName:String(d.petName||'').trim(),
        species:d.species,
        breed:String(d.breed||'').trim(),
        color:String(d.color||'').trim(),
        sex:d.sex,
        ageYears:Number(d.ageYears),
        barangay:String(d.barangay||'').trim(),
        vitalStatus:d.vitalStatus||'Alive',
        verifyImmediately:form.elements.verifyImmediately.checked,
        officialRegistryId:String(d.officialRegistryId||'').trim(),
        profileDescription:String(d.profileDescription||'').trim(),
        lostFoundMessage:String(d.lostFoundMessage||'').trim(),
        photoFileId,
        shareOwnerName:form.elements.shareOwnerName.checked,
        sharePublicPhoto:form.elements.sharePublicPhoto.checked
      });
    },'Add pet','Pet added to system.');
  const type=layer.querySelector('[name=species]'),breedSel=layer.querySelector('[name=breed]');
  window.CityVetBreedCatalog?.attach(api,type,breedSel,'');
  const verifyChk=layer.querySelector('[name=verifyImmediately]'),idField=layer.querySelector('[name=officialRegistryId]');
  verifyChk?.addEventListener('change',()=>{idField.disabled=!verifyChk.checked;idField.required=verifyChk.checked;if(!verifyChk.checked)idField.value='';});
 }
 function listForAdoption(pet){
  if(isAlreadyListed(pet.$id)){notice('This pet already has an adoption listing. Manage it under Adoptions.',true);return;}
  modal(`List ${pet.petName} for adoption`,fld('Listing title','title',pet.profileTitle||`${pet.petName} needs a new home`,'text','required maxlength="150"')+
    txt('Description / pet story','description',pet.profileDescription||`${pet.petName} is looking for a caring adopter.`,1500)+
    txt('Adoption requirements','requirements','',1000)+select('Housing requirement','housingRequirement',['any','apartment','house','yard'],'any')+
    `<label class="P4_CHECK"><input type="checkbox" name="publishPetPhoto" checked> Show this pet's picture on the public adoption listing</label><label class="P4_CHECK"><input type="checkbox" name="showOwnerName"> Also show my full name publicly</label><label class="P4_CHECK"><input type="checkbox" name="publishOwnerPhoto"> Show my profile picture beside this adoption listing (optional)</label>`+
    `<p class="CV_HINT P4_FORM_WIDE">Adoption listings can include pet photos only with your consent. Your own profile picture appears only if you enabled it in My Profile. You approve or decline applicants yourself; you confirm the final ownership transfer.</p>`,
    async f=>{
      const d=Object.fromEntries(new FormData(f));
      if(f.elements.publishPetPhoto.checked&&!pet.photoFileId)throw Error('This pet has no photo yet. Upload one in My Pets or uncheck "Show this pet’s picture".');
      let shareOwnerPhoto=f.elements.publishOwnerPhoto.checked;
      if(shareOwnerPhoto){
        const ownerProfile=await api.tablesDB.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.userProfiles,rowId:current.user.$id}).catch(e=>e.code===404?null:Promise.reject(e));
        if(!ownerProfile?.profileImageId){
          shareOwnerPhoto=false;
          f.elements.publishOwnerPhoto.checked=false;
          // Public adoption must still work when an optional account photo was never uploaded.
          const helper=f.querySelector('.CV_HINT');
          if(helper)helper.textContent='Your account has no uploaded profile photo, so the listing will publish without that optional avatar. Add one later through My Profile.';
        }
      }
      await api.operate('listOwnPetForAdoption',{petProfileId:pet.$id,...d,publishPetPhoto:f.elements.publishPetPhoto.checked,showOwnerName:f.elements.showOwnerName.checked,publishOwnerPhoto:shareOwnerPhoto});
    },'Publish listing','Listed successfully.');
 }
 function review(id){const r=requests.find(x=>x.$id===id);if(!r)return;
  const layer=modal('Review pet verification',`<div class="P4_FORM_WIDE"><h3>${H(r.petName)}</h3><p>Owner: ${H(r.ownerName)}</p><p>${H(r.species)} · ${H(r.breed)} · ${H(r.barangay)}</p></div>`+
    select('Decision','decision',['approved','rejected'],'approved')+
    fld('Unique official CVO registry ID','officialRegistryId','','text','required pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,29}" maxlength="30" placeholder="e.g. CVH-2026-0001"')+
    `<p class="CV_HINT P4_FORM_WIDE">Each approved pet must receive a unique official registry ID. The original QR code stays the same.</p>`,
    async f=>{const choice=f.elements.decision.value;await api.operate('reviewPet',{requestId:r.$id,status:choice,officialRegistryId:choice==='approved'?f.elements.officialRegistryId.value:''});});
  const selectDecision=layer.querySelector('[name=decision]'),idField=layer.querySelector('[name=officialRegistryId]');
  selectDecision.addEventListener('change',()=>{idField.disabled=selectDecision.value==='rejected';idField.required=!idField.disabled;});
 }
 async function reload(silent=false){
  const scroller=document.querySelector('.DASHBOARD_CONTENT')||document.documentElement;
  const scrollTop=scroller.scrollTop;
  if(!silent&&!box.children.length){
   box.innerHTML=window.CityVetUI?.skeleton('Loading Pet Registry…',4)||'<div class="CV_LOADING">Loading…</div>';
  }
  try{if(owner){
   const [a,b,c,d,e,f,scans,prof]=await Promise.all([list('petProfiles'),list('petRequests'),list('pets'),list('petHealthUploads'),list('medical').catch(()=>[]),list('adoptionListings'),list('petMatchNotifications').catch(()=>[]),api.tablesDB.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.userProfiles,rowId:current.user.$id}).catch(()=>null)]);
   pets=a.filter(p=>p.ownerId===current.user.$id);requests=b.filter(r=>r.ownerId===current.user.$id);approved=c.filter(p=>p.ownerId===current.user.$id);evidence=d.filter(x=>x.ownerId===current.user.$id);clinician=e;existingListings=f.filter(l=>l.postedById===current.user.$id);scanAlerts=scans.filter(n=>n.ownerId===current.user.$id);userProfile=prof;ownerPage();
   syncOpenDetailsModal();
  }else{const [a,b,c,d,staff,passRows,prof]=await Promise.all([list('petRequests').catch(()=>[]),list('pets'),admin?list('petProfiles').catch(()=>[]):Promise.resolve([]),admin?list('userProfiles').catch(()=>[]):Promise.resolve([]),api.operate('getStaffPetDirectory').catch(()=>({pets:[]})),api.tablesDB.listRows({databaseId:cfg.databaseId,tableId:cfg.tables.passports,queries:[Q.limit(100)]}).then(r=>r.rows||[]).catch(()=>[]),api.tablesDB.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.userProfiles,rowId:current.user.$id}).catch(()=>null)]);requests=a;approved=b;staffInventory=c;staffOwners=d;staffDirectory=staff.pets||[];staffPassports=passRows;userProfile=prof;staffPage();}
  scroller.scrollTop=scrollTop;
  }
  catch(error){if(!silent||!box.children.length)show('Pet Registry','Could not load records.','','<div class="CV_ERROR">'+H(api.readableError(error))+'</div>');}
 }
 box.addEventListener('click',async event=>{
  const button=event.target.closest('[data-p46]');if(!button)return;event.preventDefault();event.stopPropagation();const cmd=button.dataset.p46,id=button.dataset.id;
  const pet=pets.find(p=>p.$id===id);
  try{
   if(cmd==='reload')return reload(true);if(cmd==='add'&&owner)return petForm();
   if(cmd==='copyPhone'&&button.dataset.phone)return copyClip(button.dataset.phone,`Finder phone ${button.dataset.phone} copied.`);
   if(cmd==='open'&&owner&&pet)return details(pet);
   if(cmd==='qr'&&owner&&pet)return openQRCode(pet);
   if((cmd==='declareMissing'||cmd==='markFound')&&owner&&pet)return toggleMissingForm(pet);
   if(cmd==='listAdoption'&&owner&&pet)return listForAdoption(pet);
   if(cmd==='edit'&&owner&&pet)return petForm(pet);
   if(cmd==='details'&&owner&&pet)return detailsForm(pet);
   if(cmd==='addHealth'&&owner&&pet)return healthForm(pet);
   if(cmd==='removeHealth'&&owner){return window.CityVetUI?.confirm({title:'Delete uploaded record?',description:'Remove this personal health document from your pet profile?',confirmLabel:'Delete document',danger:true,onConfirm:async()=>{await api.operate('deletePetHealthUpload',{recordId:id});await reload(true);notice('Health document removed.');}});}
   if(cmd==='verify'&&owner&&pet){return window.CityVetUI?.confirm({title:`Submit ${pet.petName} for CVO verification?`,description:'Your personal QR passport already works. Submitting requests official CVO verification.',confirmLabel:'Submit request',onConfirm:async()=>{await api.operate('requestPetVerification',{petProfileId:pet.$id});await reload(true);notice('Verification request sent to CVO.');}});}
   if(cmd==='review'&&admin)return review(id);
   if(cmd==='assignId'&&admin)return assignLegacyId(id);
   if(cmd==='adminAddPet'&&admin)return adminAddPetForm();
   if(cmd==='staffInspect'){const hit=(window._cv46StaffRows||[]).find(r=>(r.petProfileId||r.$id)===id||window._cv46StaffById?.get(r.$id)?.petProfileId===id||window._cv46StaffById?.get(r.$id)?.$id===id)||staffPassports.find(p=>p.$id===id);if(hit)return openStaffInspectModal(hit,hit._missingPassport||staffPassports.find(p=>p.$id===id));}
   if(cmd==='staffQr'){const url=new URL('./passport.html',document.baseURI);url.searchParams.set('pet',id);window.open(url.href,'_blank','noopener');}
  }catch(error){notice(api.readableError(error),true);button.disabled=false;}
 });
 // Detail modal lives under <body>, outside #registryPanel; delegate its actions explicitly.
 document.addEventListener('click',async event=>{
  const button=event.target.closest('.P46_DETAILS_MODAL [data-p46]');if(!button)return;
  event.preventDefault();event.stopPropagation();
  const cmd=button.dataset.p46,id=button.dataset.id,pet=pets.find(p=>p.$id===id);
  try{
   if(cmd==='copyPhone'&&button.dataset.phone)return copyClip(button.dataset.phone,`Finder phone ${button.dataset.phone} copied.`);
   if(cmd==='markScanRead'&&button.dataset.notifId){await api.operate('markAdoptionMatchRead',{notificationId:button.dataset.notifId});await reload(true);return;}
   if(cmd==='removeHealth'&&owner){return window.CityVetUI?.confirm({title:'Remove medical document?',description:'Remove this uploaded document from your pet profile?',confirmLabel:'Remove document',danger:true,onConfirm:async()=>{await api.operate('deletePetHealthUpload',{recordId:id});await reload(true);notice('Document removed.');}});}
   if(!pet||!owner)return;
   if(cmd==='enableContact')return enableMissingContact(pet);
   if(cmd==='postCommunity'){if(userProfile?.accountVerificationStatus!=='verified')return notice('Verify your account ID under My Profile to post in Community, or use Copy Missing Flyer instead.',true);document.querySelectorAll('.P46_DETAILS_MODAL').forEach(m=>m.remove());return window.CityVetOpenCommunityDraft?.(formatMissingDraft(pet));}
   if(cmd==='copyFlyer'){const draft=formatMissingDraft(pet);return copyClip(`${draft.title}\n\n${draft.body}`,'Missing flyer copied! Ready to paste into group chats.');}
   if(cmd==='qr')return openQRCode(pet);
   if(cmd==='declareMissing'||cmd==='markFound')return toggleMissingForm(pet);
   if(cmd==='listAdoption')return listForAdoption(pet);
   if(cmd==='details')return detailsForm(pet);
   if(cmd==='edit')return petForm(pet);
   if(cmd==='addHealth')return healthForm(pet);
   if(cmd==='verify'){return window.CityVetUI?.confirm({title:`Send ${pet.petName} for verification?`,description:'Submit this pet profile to CVO for official registry verification?',confirmLabel:'Send request',onConfirm:async()=>{await api.operate('requestPetVerification',{petProfileId:pet.$id});await reload(true);notice('Verification request submitted.');}});}
   if(cmd==='deletePet'){return window.CityVetUI?.confirm({title:`Permanently delete ${pet.petName}?`,description:'This permanently deletes this draft/rejected pet profile from your inventory.',confirmLabel:'Delete pet',danger:true,onConfirm:async()=>{document.querySelectorAll('.P46_DETAILS_MODAL').forEach(m=>m.remove());await api.operate('deleteInventoryPet',{petProfileId:pet.$id});await reload(true);notice('Pet removed from inventory.');}});}
  }catch(err){notice(api.readableError(err),true);}
 });
 box.addEventListener('keydown',e=>{const card=e.target.closest('.P46_CLICK_CARD');if(card&&(e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();card.click();}});
 reload();return {reload,filter(v){term=String(v||'').toLowerCase();if(owner)ownerPage();else staffPage();},async focusPet(idOrName){await reload(true);const q=String(idOrName||'').toLowerCase();const hit=pets.find(p=>p.$id===idOrName)||pets.find(p=>p.latestRequestId===idOrName)||pets.find(p=>String(p.petName||'').toLowerCase()===q);if(owner&&hit)details(hit);}};
}
window.CityVetRegistry=Object.freeze({mount});
})();
