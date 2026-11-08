(async function(){
'use strict';
const body=document.getElementById('passportBody');const id=new URLSearchParams(location.search).get('pet');
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=String(text??'—');return e;};
const fail=s=>body.replaceChildren(el('p',s,'PASSPORT_ERROR'));
if(!id||!/^[a-zA-Z0-9._-]{1,36}$/.test(id))return fail('Invalid QR profile link. Ask the pet owner to share a new link.');
try{
 const cfg=window.CITYVET_CONFIG,client=new Appwrite.Client().setEndpoint(cfg.endpoint).setProject(cfg.projectId),tables=new Appwrite.TablesDB(client),storage=new Appwrite.Storage(client);
 const pet=await tables.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.passports,rowId:id});
 const verified=pet.verificationStatus==='verified';body.replaceChildren();
 const top=el('div','','PASSPORT_TOP');
 if(pet.photoFileId){const img=document.createElement('img');img.alt='Pet photo shared by owner';img.src=String(storage.getFileView({bucketId:cfg.buckets.media,fileId:pet.photoFileId}));img.onerror=()=>img.replaceWith(el('div','Photo not available','PASSPORT_PLACEHOLDER'));top.append(img);}
 else{const holder=el('div','','PASSPORT_PLACEHOLDER');holder.append(el('i','','fa-solid fa-paw'));top.append(holder);}
 const info=el('div','');info.append(el('span',verified?'CVO VERIFIED PET':'OWNER-SUPPLIED · NOT CVO VERIFIED','PASSPORT_FLAG'),el('h1',pet.petName),el('p',pet.profileTitle||`${pet.species} · ${pet.breed}`));top.append(info);body.append(top);
 if(pet.profileDescription)body.append(el('p',pet.profileDescription,'PASSPORT_DESCRIPTION'));
 const grid=el('div','','PASSPORT_FIELDS');
 const values=[['Pet name',pet.petName],['Animal type',pet.species],['Breed',pet.breed],['Sex',pet.sex],['Age',`${pet.ageYears} year(s)`],['Barangay',pet.barangay],['Verification',verified?'CVO verified':'Unverified pet profile'],...(pet.officialRegistryId?[['Official CVO registry ID',pet.officialRegistryId]]:[]),['Vaccination',pet.vaccinationStatus||'No clinician-verified status available']];
 if(pet.ownerName)values.push(['Owner (opted in)',pet.ownerName]);
 if(pet.displayAddress)values.push(['Owner-shared address',pet.displayAddress]);
 if(pet.contact)values.push(['Owner-shared contact',pet.contact]);
 for(const [label,value] of values){const row=el('div','');row.append(el('span',label),el('strong',value));grid.append(row);}body.append(grid);
 const note=el('div','','PASSPORT_NOTE');note.append(el('strong','If found'),el('p',pet.lostFoundMessage||'Please contact CityVetHub or the local veterinary office.'));body.append(note);
 const medical=el('section','','P46_PUBLIC_MEDICAL');medical.append(el('h2','Owner-shared health documents'));
 const expl=el('p','These photos are supplied by the pet owner and are not automatically verified by a veterinarian.');medical.append(expl);
 try{
   const results=await tables.listRows({databaseId:cfg.databaseId,tableId:cfg.tables.passportMedical,queries:[Appwrite.Query.equal('petProfileId',id),Appwrite.Query.limit(100)]});
   const entries=results.rows||[];
   if(!entries.length)medical.append(el('p','No health images shared publicly.'));
   for(const row of entries){const card=el('article','','P46_PUBLIC_MEDICAL_ROW');card.append(el('strong',row.title),el('small',new Date(row.recordDate).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'})));
      const img=document.createElement('img');img.loading='lazy';img.alt='Owner-submitted health record';img.src=String(storage.getFileView({bucketId:cfg.buckets.media,fileId:row.fileId}));img.onerror=()=>{img.hidden=true;};card.append(img,el('small',row.sourceLabel||'Owner supplied; unverified'));medical.append(card);}
 }catch(err){medical.append(el('p','Shared documents could not be retrieved.'));}
 body.append(medical);
 body.append(el('p',`Pet profile ID: ${id}`,'PASSPORT_IDENTIFIER'));
}catch(e){fail(e.code===404?'This QR profile does not exist or has been removed.':'The pet QR profile could not be loaded. Check public Appwrite table access and your internet connection.');}
})();
