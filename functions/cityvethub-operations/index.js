/** CityVetHub privileged operations — deploy as ONE Appwrite Node function.
 * Every request verifies an Appwrite session JWT and determines staff membership
 * server-side. No administrator API key is shipped to the website or Android app.
 * Appwrite Functions scopes: users.read, users.write, teams.read, teams.write,
 * databases.read, tables.read, rows.read, rows.write.
 */
import {createHash} from 'node:crypto';
import {runCommunity} from './community.js';
import {matchPet,validatePreferences,getBreedCatalog} from './matching.js';
const ENDPOINT=process.env.APPWRITE_ENDPOINT||'https://sgp.cloud.appwrite.io/v1';
const PROJECT=process.env.APPWRITE_PROJECT_ID||'6aeff5c9002718442fdf';
const DB=process.env.CITYVET_DATABASE_ID||'cityvethub';
const ADMINS='cityvethub-admins', OFFICERS='cityvethub-field-officers';
const BUILD_VERSION='4.22.0';
const T={profiles:'user_profiles',inventory:'pet_profiles',passports:'pet_passports',req:'pet_requests',pets:'pets',medical:'medical_records',reports:'disease_reports',incidents:'disease_incidents',alerts:'disease_alerts',ownerAlerts:'outbreak_owner_notifications',listings:'adoption_listings',applications:'adoption_applications',history:'ownership_history',categories:'incident_categories',healthUploads:'pet_health_uploads',publicHealth:'pet_passport_medical',registryIds:'pet_registry_ids',idCategories:'id_categories',ownerVerifications:'owner_verification_requests',matchPreferences:'pet_match_preferences',matchNotifications:'pet_match_notifications'};
const roleUser=id=>`read("user:${id}")`;
const writeUser=id=>`update("user:${id}")`;
const deleteUser=id=>`delete("user:${id}")`;
const rolePublic='read("any")';
const MEDIA='cityvethub-media';
const roleAdmin=`read("team:${ADMINS}")`,roleOfficer=`read("team:${OFFICERS}")`;
const requireText=(v,max=255)=>{const s=String(v??'').trim();if(!s||s.length>max)throw Object.assign(new Error(`Required text must be 1-${max} characters`),{status:400});return s;};
const optText=(v,max=1000)=>String(v??'').trim().slice(0,max);
const cleanName=v=>String(v??'').replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,128)||'cityvethub-upload';
const accept=(v,values)=>{if(!values.includes(v))throw Object.assign(new Error('Invalid option: '+String(v)),{status:400});return v;};
const verify=(x,cond,message='Forbidden')=>{if(!cond)throw Object.assign(new Error(message),{status:x||403});};
const CITY_BARANGAYS=Object.freeze(["Abuno", "Acmac-Mariano Badelles Sr.", "Bagong Silang", "Bonbonon", "Bunawan", "Buru-un", "Dalipuga", "Del Carmen", "Digkilaan", "Ditucalan", "Dulag", "Hinaplanon", "Hindang", "Kabacsanan", "Kalilangan", "Kiwalan", "Lanipao", "Luinab", "Mahayahay", "Mainit", "Mandulog", "Maria Cristina", "Palao", "Panoroganan", "Poblacion", "Puga-an", "Rogongon", "San Miguel", "San Roque", "Santa Elena", "Santa Filomena", "Santiago", "Santo Rosario", "Saray", "Suarez", "Tambacan", "Tibanga", "Tipanoy", "Tomas L. Cabili", "Tubod", "Ubaldo Laya", "Upper Hinaplanon", "Upper Tominobo", "Villa Verde"]);
function cityBarangay(value,allowEmpty=false){
 const raw=String(value??'').trim();if(allowEmpty&&!raw)return '';
 const normalize=t=>String(t).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
 const aliases={acmac:'Acmac-Mariano Badelles Sr.',tominoboupper:'Upper Tominobo',saraytibanga:'Saray',palao:'Palao'};
 const canonical=CITY_BARANGAYS.find(s=>normalize(s)===normalize(raw))||aliases[normalize(raw)];
 verify(400,Boolean(canonical),'Choose a valid barangay in Iligan City.');return canonical;
}
const idPart=id=>encodeURIComponent(String(id));
const officialId=v=>{const s=String(v??'').trim().toUpperCase();verify(400,/^[A-Z0-9][A-Z0-9_-]{3,29}$/.test(s),'Official pet ID must be 4–30 characters: A–Z, 0–9, underscore or hyphen.');return s;};
const path=(table,id)=>`/tablesdb/${idPart(DB)}/tables/${idPart(table)}/rows${id?'/'+idPart(id):''}`;
function errorStatus(e){return e?.status||500;}
export default async ({req,res,log,error})=>{
  const headers=req.headers||{};
  const jwt=headers['x-appwrite-user-jwt'];
  const key=headers['x-appwrite-key'];
  async function api(method,payloadPath,body,useJWT=false){
    const r=await fetch(ENDPOINT+payloadPath,{method,headers:{'Content-Type':'application/json','X-Appwrite-Project':PROJECT,'X-Appwrite-Response-Format':'2.7.0',...(useJWT?{'X-Appwrite-JWT':jwt}:{'X-Appwrite-Key':key})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const raw=await r.text();let data;try{data=raw?JSON.parse(raw):{};}catch{data={message:raw.slice(0,200)}};
    if(!r.ok){throw Object.assign(new Error(data.message||`Appwrite ${r.status}`),{status:r.status});}
    return data;
  }
  const row=(table,id)=>api('GET',path(table,id));
  const stripUnknownAttr=(data,err)=>{
    const m=String(err?.message||'').match(/Unknown attribute:\s*"?([a-zA-Z0-9_]+)"?/i);
    if(!m||!data||!(m[1] in data))return null;
    const next={...data};delete next[m[1]];return next;
  };
  const create=async(table,id,data,permissions)=>{
    let cur={...data};
    for(let i=0;i<5;i++){
      try{return await api('POST',path(table),{rowId:id||'unique()',data:cur,permissions});}
      catch(e){const next=stripUnknownAttr(cur,e);if(!next)throw e;cur=next;}
    }
  };
  const update=async(table,id,data,permissions)=>{
    let cur={...data};
    for(let i=0;i<5;i++){
      try{return await api('PATCH',path(table,id),{data:cur,...(permissions?{permissions}:{})});}
      catch(e){const next=stripUnknownAttr(cur,e);if(!next)throw e;cur=next;}
    }
  };
  const remove=(table,id)=>api('DELETE',path(table,id));
  async function assertUploadedPhoto(fileId, authenticatedUser, grantAdmin=true, grantOfficer=false){
    if(!fileId)return;
    const filePath=`/storage/buckets/${MEDIA}/files/${idPart(fileId)}`;
    const file=await api('GET',filePath);
    const permissions=file.$permissions||[];
    // Always use the authenticated user from the current request. The previous
    // helper referenced a `user` const scoped inside `try`, which is inaccessible here.
    verify(403,permissions.includes(writeUser(authenticatedUser.$id)),
      'The selected image was not uploaded by your account');
    verify(400,/^image\/(jpeg|png|webp)$/.test(file.mimeType||''),'Only PNG, JPG or WEBP images are accepted');
    // Appwrite refuses owner-side uploads granting a Team the owner is not in.
    // Only the trusted Function (with files.write) can grant administrator read.
    if(grantAdmin&&!permissions.includes(roleAdmin)||grantOfficer&&!permissions.includes(roleOfficer)){
      await api('PUT',filePath,{name:cleanName(file.name),permissions:[...new Set([...permissions,...(grantAdmin?[roleAdmin]:[]),...(grantOfficer?[roleOfficer]:[])])]});
    }
  }
  // Approved photo sharing is opt-in. A private upload is not made public by creating an unverified QR passport.
  async function setFilePublic(fileId,enabled){
    if(!fileId)return;
    const url=`/storage/buckets/${MEDIA}/files/${idPart(fileId)}`;
    const file=await api('GET',url);
    let permissions=(file.$permissions||[]).filter(p=>p!==rolePublic);
    if(enabled)permissions.push(rolePublic);
    await api('PUT',url,{name:cleanName(file.name),permissions});
  }
  async function publicHealthSync(profileId){
    // Public health records are separate from private uploads, and visible only by explicit consent.
    const items=await api('GET',path(T.healthUploads)+'?queries%5B%5D='+encodeURIComponent(JSON.stringify({method:'equal',attribute:'petProfileId',values:[profileId]}))).catch(()=>({rows:[]}));
    return items.rows||[];
  }
  async function syncPassport(pet,ownerName){
    const passportId=pet.$id;
    const payload={petId:pet.latestRequestId||pet.$id,petName:pet.petName,species:pet.species,breed:pet.breed,sex:pet.sex,ageYears:pet.ageYears,barangay:pet.barangay,
      ownerName:pet.shareOwnerName?String(ownerName||''):'',displayAddress:pet.sharePublicAddress?(pet.homeAddress||''):'',contact:pet.shareContact?(pet.emergencyContact||''):'',
      lostFoundMessage:pet.lostFoundMessage||'',photoFileId:pet.sharePublicPhoto?(pet.photoFileId||''):'',vaccinationStatus:pet.vaccinationStatus||'Not recorded',
      verificationStatus:pet.verificationStatus||'draft',officialRegistryId:pet.officialRegistryId||'',profileTitle:pet.profileTitle||'',profileDescription:pet.profileDescription||''};
    let exists;try{exists=await row(T.passports,passportId);}catch(e){if(e.status!==404)throw e;}
    if(exists)return await update(T.passports,passportId,payload);
    return await create(T.passports,passportId,payload,[rolePublic]);
  }
  async function validateSingleParent(parentId,existingId,existingName,ownerId,petId,species){
    if(!parentId)return {id:'',name:''};
    verify(400,parentId!==petId,'A pet cannot be its own parent.');
    const unchanged=existingId===parentId;
    const parent=await row(T.inventory,parentId).catch(e=>e.status===404?null:Promise.reject(e));
    if(!parent){verify(400,unchanged,'Selected parent pet no longer exists.');return {id:parentId,name:existingName||''};}
    verify(403,parent.ownerId===ownerId||unchanged,'Select a parent pet in your current inventory.');
    verify(400,parent.species===species,'The selected parent must be the same animal type.');
    const visited=new Set(petId?[petId]:[]);let next=parent;
    for(let hop=0;hop<30&&next;hop++){
      verify(400,!visited.has(next.$id),'Ancestry cannot contain a parent-child cycle.');
      visited.add(next.$id);
      next=next.ancestryParentId?await row(T.inventory,next.ancestryParentId).catch(e=>e.status===404?null:Promise.reject(e)):null;
    }
    return {id:parent.$id,name:parent.petName};
  }
  async function lineageFields(d,ownerId,petId,species,existingPet=null){
    const result={vitalStatus:accept(d.vitalStatus||'Alive',['Alive','Deceased','Missing'])};
    const parent1Id=optText(d.ancestryParentId,36);
    const parent2Id=optText(d.ancestryParent2Id,36);
    if(parent1Id&&parent2Id)verify(400,parent1Id!==parent2Id,'Select two different parent pets.');
    const p1=await validateSingleParent(parent1Id,existingPet?.ancestryParentId,existingPet?.ancestryParentName,ownerId,petId,species);
    const p2=await validateSingleParent(parent2Id,existingPet?.ancestryParent2Id,existingPet?.ancestryParent2Name,ownerId,petId,species);
    result.ancestryParentId=p1.id;result.ancestryParentName=p1.name;
    result.ancestryParent2Id=p2.id;result.ancestryParent2Name=p2.name;
    return result;
  }
  const petSafeDetails=(d)=>({color:optText(d.color,50),profileTitle:optText(d.profileTitle,100),profileDescription:optText(d.profileDescription,1500),
    lostFoundMessage:optText(d.lostFoundMessage,500),emergencyContact:optText(d.emergencyContact,60),homeAddress:optText(d.homeAddress,200),
    shareOwnerName:!!d.shareOwnerName,sharePublicAddress:!!d.sharePublicAddress,shareContact:!!d.shareContact,sharePublicPhoto:!!d.sharePublicPhoto});
  async function removePublicHealthForPet(profileId){
    if(!profileId)return;
    const items=await api('GET',path(T.publicHealth)+'?queries%5B%5D='+encodeURIComponent(JSON.stringify({method:'equal',attribute:'petProfileId',values:[profileId]})));
    for(const item of items.rows||[]){
      await remove(T.publicHealth,item.$id);
      try{await setFilePublic(item.fileId,false);}catch(e){log?.('Public document permission cleanup failed: '+e.message);}
    }
  }
  async function reassignPetFile(fileId,oldOwnerId,newOwnerId){
    if(!fileId)return;
    const url=`/storage/buckets/${MEDIA}/files/${idPart(fileId)}`;
    const file=await api('GET',url);
    const permissions=(file.$permissions||[]).filter(p=>p!==rolePublic&&!p.includes(`user:${oldOwnerId}`));
    for(const permission of [roleUser(newOwnerId),writeUser(newOwnerId),deleteUser(newOwnerId),roleAdmin]){
      if(!permissions.includes(permission))permissions.push(permission);
    }
    await api('PUT',url,{name:cleanName(file.name),permissions});
  }
  async function updateOwnershipInventory(pet,newOwner){
    // The immutable pet/medical IDs remain the same. Transfer private ownership of
    // every related row; revoke old-owner access and public sharing preferences.
    const petProfileId=pet.petProfileId||pet.$id;
    const old=await row(T.inventory,petProfileId);
    const previousOwnerId=old.ownerId;
    const query=(table,field,value)=>api('GET',path(table)+'?limit=100&queries%5B%5D='+encodeURIComponent(JSON.stringify({method:'equal',attribute:field,values:[value]})));
    const uploads=(await query(T.healthUploads,'petProfileId',petProfileId)).rows||[];
    for(const record of uploads){
      await reassignPetFile(record.fileId,previousOwnerId,newOwner.$id);
      await update(T.healthUploads,record.$id,{ownerId:newOwner.$id,sharePublic:false},[roleAdmin,roleUser(newOwner.$id)]);
      try{await remove(T.publicHealth,record.$id);}catch(e){if(e.status!==404)throw e;}
    }
    // Official records stay with the pet: adjust row read permissions, not pet IDs.
    const possibleIds=[pet.$id,petProfileId].filter(Boolean);
    for(const petId of new Set(possibleIds)){
      const medical=(await query(T.medical,'petId',petId)).rows||[];
      for(const med of medical){await update(T.medical,med.$id,{dateAdministered:med.dateAdministered},[roleAdmin,roleOfficer,roleUser(newOwner.$id)]);}
    }
    await reassignPetFile(old.photoFileId,previousOwnerId,newOwner.$id);
    const verified=old.verificationStatus==='verified';
    if(!verified&&old.latestRequestId){
      try{const request=await row(T.req,old.latestRequestId);if(request.reviewStatus==='pending')await update(T.req,request.$id,{reviewStatus:'withdrawn'});}
      catch(e){if(e.status!==404)throw e;}
    }
    const changed=await update(T.inventory,old.$id,{
      ownerId:newOwner.$id,verificationStatus:verified?'verified':'draft',latestRequestId:verified?(old.latestRequestId||''):'',
      shareOwnerName:false,sharePublicPhoto:false,
      shareContact:false,sharePublicAddress:false,emergencyContact:'',homeAddress:'',
      lostFoundMessage:'If found, please contact the current owner through CityVetHub.'
    },[roleUser(newOwner.$id),roleAdmin]);
    await syncPassport(changed,'');
    return changed;
  }
  let stage='authenticate',activeAction='unknown';
  try{
    verify(503,Boolean(key),'Function API scopes are not configured');
    verify(401,Boolean(jwt),'Sign in to CityVetHub to continue');
    const user=await api('GET','/account',undefined,true);
    const teams=await api('GET','/teams?limit=100',undefined,true);
    const ids=new Set((teams.teams||[]).map(t=>t.$id));
    const admin=ids.has(ADMINS),officer=ids.has(OFFICERS),owner=!admin&&!officer&&user.prefs?.requestedRole!=='officer';
    let data;try{data=req.bodyJson||JSON.parse(req.bodyText||'{}');}catch{throw Object.assign(new Error('Invalid JSON body'),{status:400});}
    const action=data.action;activeAction=String(action||'unknown').slice(0,45);stage='action:'+activeAction;
    let result;
    async function allTableRows(table,maxPages=25){
      const rows=[];let after='';
      for(let n=0;n<maxPages;n++){
        const queries=[JSON.stringify({method:'limit',values:[100]})];
        if(after)queries.push(JSON.stringify({method:'cursorAfter',values:[after]}));
        const query=queries.map(q=>'queries%5B%5D='+encodeURIComponent(q)).join('&');
        const page=await api('GET',path(table)+'?'+query);
        const batch=page.rows||[];rows.push(...batch);
        if(batch.length<100)break;
        const next=batch.at(-1)?.$id;if(!next||next===after)break;after=next;
      }
      return rows;
    }
    async function adoptionMatchAlerts(listing){
      // Never fail a valid adoption publication because notification delivery is unavailable.
      try{
        const prefs=await allTableRows(T.matchPreferences);
        for(const pref of prefs){
          if(!pref.ownerId||pref.ownerId===listing.postedById||!matchPet(pref,listing))continue;
          const id='match_'+createHash('sha256').update(pref.ownerId+':'+listing.$id).digest('hex').slice(0,29);
          let created=false;
          try{
            await create(T.matchNotifications,id,{ownerId:pref.ownerId,listingId:listing.$id,petName:optText(listing.petName||listing.title,100),title:optText(listing.title,150),createdAt:new Date().toISOString(),isRead:false,pushStatus:pref.pushEnabled?'pending':'not_requested'},[roleAdmin,roleUser(pref.ownerId)]);
            created=true;
          }catch(err){if(err.status!==409)throw err;}
          if(created&&pref.pushEnabled&&process.env.CITYVET_ENABLE_PUSH==='true'){
            try{
              await api('POST','/messaging/messages/push',{messageId:'unique()',title:'A pet matches your adoption preferences',body:`${listing.title} is available for adoption in ${listing.barangay||'Iligan City'}.`,users:[pref.ownerId],data:{type:'adoption_match',listingId:listing.$id}});
              await update(T.matchNotifications,id,{pushStatus:'sent'});
            }catch(err){log?.('Pet match push pending for '+pref.ownerId+': '+String(err.message||err).slice(0,150));await update(T.matchNotifications,id,{pushStatus:'failed'}).catch(()=>{});}
          }
        }
      }catch(err){log?.('Adoption matching notification problem: '+String(err.message||err).slice(0,170));}
    }
    if(!admin&&!officer&&!owner&&!['ping','blockPendingOfficer'].includes(action))verify(403,false,'Field Officer access pending CVO approval.');
    if(typeof action==='string'&&action.startsWith('community')){
      result=await runCommunity({action,data,user,admin,officer,owner,api});
      return res.json({ok:true,data:result});
    }
    switch(action){
      case 'ping':{result={build:BUILD_VERSION,role:admin?'admin':officer?'officer':owner?'owner':'pending_officer'};break;}
      case 'blockPendingOfficer':{
        verify(403,!admin&&!officer&&user.prefs?.requestedRole==='officer','This operation is only for unapproved Field Officer registrations.');
        const active=await api('GET','/users/'+idPart(user.$id));
        verify(409,active.prefs?.requestedRole==='officer','Officer registration state could not be verified.');
        // Block at Appwrite Auth level, not merely in the browser. The CVO
        // approval workflow will re-enable this user after Team authorization.
        result=await api('PATCH','/users/'+idPart(user.$id)+'/status',{status:false});break;
      }
      case 'getBreedCatalog':{
        const species=accept(data.species,['Dog','Cat']);
        result=await getBreedCatalog(species,{dog:process.env.DOG_API_KEY,cat:process.env.CAT_API_KEY});break;
      }
      case 'getAdoptionPreferences':{
        verify(403,owner,'Only Pet Owners have matching preferences.');
        result=await row(T.matchPreferences,user.$id).catch(e=>e.status===404?null:Promise.reject(e));break;
      }
      case 'saveAdoptionPreferences':{
        verify(403,owner,'Only Pet Owners have matching preferences.');
        const values=validatePreferences(data);
        const record={ownerId:user.$id,...values};
        const exists=await row(T.matchPreferences,user.$id).catch(e=>e.status===404?null:Promise.reject(e));
        result=exists?await update(T.matchPreferences,user.$id,record):await create(T.matchPreferences,user.$id,record,[roleAdmin,roleUser(user.$id)]);
        break;
      }
      case 'markAdoptionMatchRead':{
        verify(403,owner,'Only Pet Owners may mark their adoption notifications read.');
        const id=requireText(data.notificationId,36),note=await row(T.matchNotifications,id);
        verify(403,note.ownerId===user.$id,'This notification belongs to another account.');
        result=await update(T.matchNotifications,id,{isRead:true});break;
      }
      case 'deleteIdCategory':{
        verify(403,admin,'Only administrators can delete government ID categories.');
        const category=await row(T.idCategories,requireText(data.categoryId,36));
        const verifications=await allTableRows(T.ownerVerifications);
        verify(409,!verifications.some(v=>v.idCategoryId===category.$id),'This ID category is already used in verification history. Disable it instead of deleting it.');
        await remove(T.idCategories,category.$id);result={deleted:true,id:category.$id};break;
      }
      case 'createIdCategory':{
        verify(403,admin,'Administrator access required');
        const name=requireText(data.name,90),description=optText(data.description,240);
        const categoryType=accept(data.categoryType||'Secondary',['Primary','Secondary']),categoryCode=optText(data.categoryCode,40);
        const categories=await api('GET',path(T.idCategories)+'?limit=100');
        verify(409,!(categories.rows||[]).some(c=>c.name.toLowerCase()===name.toLowerCase()),'Government ID category already exists.');
        result=await create(T.idCategories,'unique()',{name,description,categoryType,categoryCode,isActive:true,createdById:user.$id},[roleAdmin,'read("users")']);break;
      }
      case 'toggleIdCategory':{
        verify(403,admin);
        const category=await row(T.idCategories,requireText(data.categoryId,36));
        result=await update(T.idCategories,category.$id,{isActive:!category.isActive});break;
      }
      case 'requestAccountVerification':{
        verify(403,owner,'Only Pet Owners can request account verification.');
        const category=await row(T.idCategories,requireText(data.idCategoryId,36));
        verify(400,category.isActive,'Select an active Government ID category created by CVO.');
        const pet=await row(T.inventory,requireText(data.petProfileId,36));
        verify(403,pet.ownerId===user.$id,'Your verification must refer to a pet you currently own.');
        const fileId=requireText(data.documentFileId,36);
        stage='owner-verification:document-authorization';
        await assertUploadedPhoto(fileId,user,true); // Private owner + CVO only, never public.
        let profile=await row(T.profiles,user.$id).catch(e=>e.status===404?null:Promise.reject(e));
        verify(409,profile?.accountVerificationStatus!=='verified','Your account is already CVO verified.');
        verify(409,profile?.accountVerificationStatus!=='pending','An account verification request is already pending.');
        const existing=await api('GET',path(T.ownerVerifications)+'?limit=100');
        verify(409,!(existing.rows||[]).some(r=>r.ownerId===user.$id&&r.status==='pending'),'Your account already has a pending verification request.');
        stage='owner-verification:save-request';
        const reqRecord=await create(T.ownerVerifications,'unique()',{
          ownerId:user.$id,petProfileId:pet.$id,idCategoryId:category.$id,idCategoryName:category.name,
          documentFileId:fileId,status:'pending',reviewNote:'',submittedAt:new Date().toISOString(),reviewedById:''
        },[roleAdmin,roleUser(user.$id)]);
        stage='owner-verification:profile-status';
        if(profile)await update(T.profiles,user.$id,{accountVerificationStatus:'pending'});
        else await create(T.profiles,user.$id,{userId:user.$id,fullName:user.name||user.email,phone:'',address:'',barangay:'',profileImageId:'',accountVerificationStatus:'pending'},[roleAdmin,roleUser(user.$id)]);
        result={requestId:reqRecord.$id,status:'pending'};break;
      }
      case 'openVerificationDocument':{
        verify(403,admin,'Only an Administrator may open a private ID document.');
        const verification=await row(T.ownerVerifications,requireText(data.requestId,36));
        const fileId=requireText(verification.documentFileId,36);
        stage='verification-document:verify-exists';
        try{await api('GET',`/storage/buckets/${idPart(MEDIA)}/files/${idPart(fileId)}`);}
        catch(e){
          if(e.status===404)verify(404,false,'The uploaded government ID is missing from Appwrite Storage. Ask the Pet Owner to replace the ID image in My Profile, then retry.');
          throw e;
        }
        // Short-lived token avoids unreliable third-party browser cookies.
        // It is created only AFTER server-side administrator authorization and
        // validation of the referenced verification request.
        const expire=new Date(Date.now()+5*60*1000).toISOString();
        stage='verification-document:create-token';
        const token=await api('POST',`/tokens/buckets/${idPart(MEDIA)}/files/${idPart(fileId)}`,{expire});
        result={url:`${ENDPOINT}/storage/buckets/${idPart(MEDIA)}/files/${idPart(fileId)}/view?project=${encodeURIComponent(PROJECT)}&token=${encodeURIComponent(token.secret)}`,expiresAt:expire};
        break;
      }
      case 'replaceVerificationDocument':{
        verify(403,owner,'Only the Pet Owner who submitted the request may replace its ID image.');
        const verification=await row(T.ownerVerifications,requireText(data.requestId,36));
        verify(403,verification.ownerId===user.$id,'This verification request is not yours.');
        verify(409,verification.status==='pending','Only pending verification requests allow ID replacement.');
        const fileId=requireText(data.documentFileId,36);
        verify(409,fileId!==verification.documentFileId,'Select a new ID image before replacing.');
        stage='verification-document:replacement-authorization';
        await assertUploadedPhoto(fileId,user,true);
        result=await update(T.ownerVerifications,verification.$id,{documentFileId:fileId});
        break;
      }
      case 'reviewAccountVerification':{
        verify(403,admin,'Only CVO Administrators can review Pet Owner identity documents.');
        const request=await row(T.ownerVerifications,requireText(data.requestId,36));
        verify(409,request.status==='pending','This account verification request has already been reviewed.');
        const status=accept(data.status,['approved','rejected']);
        if(status==='approved'){
          // A missing ID image must never be silently accepted as verified.
          try{await api('GET',`/storage/buckets/${idPart(MEDIA)}/files/${idPart(request.documentFileId)}`);}
          catch(e){if(e.status===404)verify(409,false,'Government ID image is missing. Ask the owner to replace it before approving.');throw e;}
        }
        const pet=await row(T.inventory,request.petProfileId).catch(e=>e.status===404?null:Promise.reject(e));
        verify(409,pet?.ownerId===request.ownerId,'The verification pet is no longer owned by this applicant.');
        const existing=await row(T.profiles,request.ownerId);
        stage='review-account:save-request';
        await update(T.ownerVerifications,request.$id,{status,reviewNote:optText(data.reviewNote,500),reviewedById:user.$id});
        stage='review-account:save-badge';
        result=await update(T.profiles,existing.$id,{accountVerificationStatus:status==='approved'?'verified':'rejected'});break;
      }
      case 'saveProfile':{
        const fullName=requireText(cleanName(data.fullName),128),phone=optText(data.phone,40),address=optText(data.address,200),barangay=cityBarangay(data.barangay,true);
        // Do not revalidate or rename the picture when updating text fields.
        // Each file operation can run separately, eliminating extra network calls on every save.
        const profileData={userId:user.$id,fullName,phone,address,barangay,position:optText(data.position,100),employeeId:optText(data.employeeId,60),assignedArea:optText(data.assignedArea,100)};
        stage='saveProfile:find-row';
        let existing=null;try{existing=await row(T.profiles,user.$id);}catch(e){if(e.status!==404)throw e;}
        stage=existing?'saveProfile:update-row':'saveProfile:create-row';
        result=existing?await update(T.profiles,user.$id,profileData):await create(T.profiles,user.$id,{...profileData,profileImageId:''},[roleUser(user.$id),roleAdmin]);
        break;
      }
      case 'setProfilePhotoSharing':{
        const share=!!data.shareAvatarOnListings;
        const ownProfile=await row(T.profiles,user.$id);
        if(ownProfile.profileImageId){await setFilePublic(ownProfile.profileImageId,share);}
        result=await update(T.profiles,user.$id,{shareAvatarOnListings:share});
        const mine=await api('GET',path(T.listings)+'?limit=100');
        for(const listing of mine.rows||[]){if(listing.postedById===user.$id&&listing.isActive)await update(T.listings,listing.$id,{ownerAvatarFileId:share?(ownProfile.profileImageId||''):''});}
        break;
      }
      case 'saveProfileImage':{
        const profileImageId=requireText(data.profileImageId,36);
        stage='saveProfileImage:validate-file';
        await assertUploadedPhoto(profileImageId,user,false);
        stage='saveProfileImage:update-row';
        const existing=await row(T.profiles,user.$id);
        if(existing.shareAvatarOnListings){
          if(existing.profileImageId&&existing.profileImageId!==profileImageId)await setFilePublic(existing.profileImageId,false);
          await setFilePublic(profileImageId,true);
        }
        result=await update(T.profiles,existing.$id,{profileImageId});
        break;
      }
      case 'createInventoryPet':{
        verify(403,owner,'Only Pet Owners can manage their personal pet inventory');
        const petName=requireText(data.petName,100),species=accept(data.species,['Dog','Cat']),breed=requireText(data.breed,100),sex=accept(data.sex,['Male','Female']),barangay=cityBarangay(data.barangay);
        const ageYears=Number(data.ageYears);verify(400,Number.isInteger(ageYears)&&ageYears>=0&&ageYears<=40,'Invalid age');
        const photoFileId=optText(data.photoFileId,36);await assertUploadedPhoto(photoFileId,user);
        const ancestry=await lineageFields(data,user.$id,'',species);
        const petData={ownerId:user.$id,petName,species,breed,sex,ageYears,barangay,photoFileId,verificationStatus:'draft',...petSafeDetails(data),...ancestry};
        stage='createInventoryPet:save';const saved=await create(T.inventory,'unique()',petData,[roleUser(user.$id),roleAdmin]);
        stage='createInventoryPet:create-public-qr';
        if(saved.sharePublicPhoto&&saved.photoFileId)await setFilePublic(saved.photoFileId,true);
        await syncPassport(saved,user.name||user.email);
        result=saved;break;
      }
      case 'updateInventoryPet':{
        verify(403,owner);
        const pet=await row(T.inventory,requireText(data.petProfileId,36));verify(403,pet.ownerId===user.$id,'Not your pet');
        verify(409,['draft','rejected'].includes(pet.verificationStatus),'Identity fields of pending/verified pets cannot be changed; use Update details for public information.');
        const petName=requireText(data.petName,100),species=accept(data.species,['Dog','Cat']),breed=requireText(data.breed,100),sex=accept(data.sex,['Male','Female']),barangay=cityBarangay(data.barangay);
        const ageYears=Number(data.ageYears);verify(400,Number.isInteger(ageYears)&&ageYears>=0&&ageYears<=40,'Invalid age');
        const photoFileId=optText(data.photoFileId,36);if(photoFileId!==pet.photoFileId)await assertUploadedPhoto(photoFileId,user);
        if(pet.photoFileId&&pet.photoFileId!==photoFileId&&pet.sharePublicPhoto)await setFilePublic(pet.photoFileId,false);
        const ancestry=await lineageFields(data,user.$id,pet.$id,species,pet);
        const fields={petName,species,breed,sex,ageYears,barangay,photoFileId,...petSafeDetails(data),...ancestry};
        const saved=await update(T.inventory,pet.$id,fields);
        if(saved.photoFileId)await setFilePublic(saved.photoFileId,!!saved.sharePublicPhoto);
        await syncPassport(saved,user.name||user.email);
        result=saved;break;
      }
      case 'updatePetDetails':{
        verify(403,owner);
        const pet=await row(T.inventory,requireText(data.petProfileId,36));verify(403,pet.ownerId===user.$id,'Not your pet');
        const details=petSafeDetails({...pet,...data});
        const ancestry=await lineageFields({vitalStatus:data.vitalStatus??pet.vitalStatus??'Alive',ancestryParentId:data.ancestryParentId??pet.ancestryParentId??'',ancestryParent2Id:data.ancestryParent2Id??pet.ancestryParent2Id??''},user.$id,pet.$id,pet.species,pet);
        result=await update(T.inventory,pet.$id,{...details,...ancestry});
        if(pet.photoFileId&&pet.sharePublicPhoto!==details.sharePublicPhoto)await setFilePublic(pet.photoFileId,details.sharePublicPhoto);
        await syncPassport(result,user.name||user.email);break;
      }
      case 'ensurePetPassport':{
        verify(403,owner||admin);const pet=await row(T.inventory,requireText(data.petProfileId,36));
        verify(403,admin||pet.ownerId===user.$id,'Not your pet');
        stage='ensurePetPassport:check-existing';
        let passport=null;try{passport=await row(T.passports,pet.$id);}catch(e){if(e.status!==404)throw e;}
        if(!passport){stage='ensurePetPassport:create-missing';await syncPassport(pet,admin?null:user.name||user.email);}
        result={passportId:pet.$id,existing:Boolean(passport)};break;
      }
      case 'deleteInventoryPet':{
        verify(403,owner);const pet=await row(T.inventory,requireText(data.petProfileId,36));
        verify(403,pet.ownerId===user.$id);verify(409,['draft','rejected'].includes(pet.verificationStatus),'Verified or pending pets cannot be deleted');
        await removePublicHealthForPet(pet.$id);
        try{await remove(T.passports,pet.$id);}catch(e){if(e.status!==404)throw e;}
        if(pet.photoFileId&&pet.sharePublicPhoto)await setFilePublic(pet.photoFileId,false);
        await remove(T.inventory,pet.$id);result={deleted:true};break;
      }
      case 'requestPetVerification':{
        verify(403,owner);const pet=await row(T.inventory,requireText(data.petProfileId,36));verify(403,pet.ownerId===user.$id);
        verify(409,['draft','rejected'].includes(pet.verificationStatus),'This pet already has an active or approved verification');
        // The request contains the legacy required columns for backwards-compatible mobile synchronization.
        const profile=await row(T.profiles,user.$id).catch(e=>{if(e.status===404)return null;throw e;});
        const request=await create(T.req,'unique()',{petProfileId:pet.$id,ownerId:user.$id,ownerName:profile?.fullName||user.name||user.email,petName:pet.petName,species:pet.species,breed:pet.breed,sex:pet.sex,ageYears:pet.ageYears,barangay:pet.barangay,reviewStatus:'pending'},[roleUser(user.$id),roleAdmin]);
        result=await update(T.inventory,pet.$id,{verificationStatus:'pending',latestRequestId:request.$id});await syncPassport(result,user.name||user.email);break;
      }
      case 'updatePassportContact':{
        verify(403,owner);const pet=await row(T.inventory,requireText(data.petProfileId,36));verify(403,pet.ownerId===user.$id);
        const next={...petSafeDetails({...pet,...data})};
        result=await update(T.inventory,pet.$id,next);
        if(pet.photoFileId&&pet.sharePublicPhoto!==next.sharePublicPhoto)await setFilePublic(pet.photoFileId,next.sharePublicPhoto);
        await syncPassport(result,user.name||user.email);break;
      }
      case 'submitPet':{
        // Compatibility for older Android clients. New website uses createInventoryPet + requestPetVerification.
        verify(403,owner,'Only Pet Owners can register personal pets');
        const petName=requireText(data.petName,100),species=accept(data.species,['Dog','Cat']),breed=requireText(data.breed,100),sex=accept(data.sex,['Male','Female']),barangay=cityBarangay(data.barangay);
        const ageYears=Number(data.ageYears);verify(400,Number.isInteger(ageYears)&&ageYears>=0&&ageYears<=40,'Invalid age');
        result=await create(T.req,'unique()',{ownerId:user.$id,ownerName:user.name||user.email,petName,species,breed,sex,ageYears,barangay,reviewStatus:'pending'},[roleUser(user.$id),roleAdmin]);break;
      }
      case 'reviewPet':{
        verify(403,admin);
        const status=accept(data.status,['approved','rejected']);
        const source=await row(T.req,requireText(data.requestId,36));
        verify(409,source.reviewStatus==='pending'||source.reviewStatus===status,'This request has already been reviewed.');
        let petProfile=null;
        if(source.petProfileId){petProfile=await row(T.inventory,source.petProfileId);verify(409,petProfile.ownerId===source.ownerId,'Pet ownership mismatch');}
        let registryId='';
        if(status==='approved'){
          registryId=officialId(data.officialRegistryId);
          if(source.reviewStatus==='approved'){const saved=await row(T.pets,source.$id);verify(409,saved.officialRegistryId===registryId,'This pet was already approved with a different registry ID.');}
          // Row IDs are unique, providing atomic reservation even if two admins approve at once.
          stage='reviewPet:claim-unique-registry-id';
          try{const claim=await create(T.registryIds,registryId,{requestId:source.$id,assignedById:user.$id},[roleAdmin]);}
          catch(e){
            if(e.status!==409)throw e;
            const claimed=await row(T.registryIds,registryId);
            verify(409,claimed.requestId===source.$id,'This official ID has already been assigned to another pet.');
          }
          stage='reviewPet:official-pet-record';
          const petData={ownerId:source.ownerId,ownerName:source.ownerName,petName:source.petName,species:source.species,breed:source.breed,sex:source.sex,ageYears:source.ageYears,barangay:source.barangay,requestId:source.$id,officialRegistryId:registryId,
            petProfileId:source.petProfileId||'',homeAddress:petProfile?.homeAddress||'',photoFileId:petProfile?.photoFileId||'',lostFoundMessage:petProfile?.lostFoundMessage||'',emergencyContact:petProfile?.emergencyContact||'',sharePublicAddress:!!petProfile?.sharePublicAddress,shareContact:!!petProfile?.shareContact,vaccinationStatus:'No vaccination on record'};
          try{await create(T.pets,source.$id,petData,[roleUser(source.ownerId),roleAdmin,roleOfficer]);}
          catch(e){
            if(e.status!==409)throw e;
            const recorded=await row(T.pets,source.$id);
            verify(409,recorded.officialRegistryId===registryId,'This pet already has a different official registry ID.');
          }
          if(!petProfile){
            const passport={petId:source.$id,petName:source.petName,species:source.species,breed:source.breed,sex:source.sex,ageYears:source.ageYears,barangay:source.barangay,ownerName:'',displayAddress:'',contact:'',lostFoundMessage:'If found, please contact CityVetHub.',photoFileId:'',vaccinationStatus:'Not recorded',verificationStatus:'verified',officialRegistryId:registryId,profileTitle:'',profileDescription:''};
            try{await create(T.passports,source.$id,passport,[rolePublic]);}
            catch(e){if(e.status!==409)throw e;await update(T.passports,source.$id,{officialRegistryId:registryId});}
          }
        }
        if(petProfile){
          const changed=await update(T.inventory,petProfile.$id,{verificationStatus:status==='approved'?'verified':'rejected',latestRequestId:source.$id,officialRegistryId:status==='approved'?registryId:(petProfile.officialRegistryId||''),vaccinationStatus:status==='approved'?'Not recorded':(petProfile.vaccinationStatus||'Not recorded')});
          stage='reviewPet:update-public-passport';await syncPassport(changed,source.ownerName);
          if(source.$id!==petProfile.$id)try{await remove(T.passports,source.$id);}catch(e){if(e.status!==404)log?.('Legacy passport cleanup: '+e.message);}
        }
        stage='reviewPet:finalize-request';result=await update(T.req,source.$id,{reviewStatus:status});break;
      }
      case 'assignOfficialPetId':{
        verify(403,admin);
        const pet=await row(T.pets,requireText(data.petId,36));
        verify(409,!pet.officialRegistryId,'This verified pet already has an official registry ID.');
        const registryId=officialId(data.officialRegistryId);
        stage='assignOfficialPetId:claim';
        try{await create(T.registryIds,registryId,{requestId:pet.requestId||pet.$id,assignedById:user.$id},[roleAdmin]);}
        catch(e){if(e.status!==409)throw e;const existing=await row(T.registryIds,registryId);verify(409,existing.requestId===(pet.requestId||pet.$id),'This ID is already assigned to a different pet.');}
        stage='assignOfficialPetId:update-pet';
        result=await update(T.pets,pet.$id,{officialRegistryId:registryId});
        if(pet.petProfileId){const inventory=await row(T.inventory,pet.petProfileId);const changed=await update(T.inventory,inventory.$id,{officialRegistryId:registryId});await syncPassport(changed,pet.ownerName||'');}
        else try{await update(T.passports,pet.$id,{officialRegistryId:registryId});}catch(e){if(e.status!==404)throw e;}
        break;
      }
      case 'addMedical':{
        verify(403,admin||officer);const pet=await row(T.pets,requireText(data.petId,36));
        const recordType=accept(data.recordType,['Vaccination','Treatment']);
        const when=new Date(data.dateAdministered);verify(400,!Number.isNaN(when.getTime())&&when.getTime()<=Date.now()+86400000,'Invalid treatment date');
        const expRaw=String(data.expiryDate||'').trim();
        let expiryDate=null;
        if(expRaw){const exp=new Date(expRaw);verify(400,!Number.isNaN(exp.getTime()),'Invalid expiry date');expiryDate=exp.toISOString();}
        result=await create(T.medical,'unique()',{petId:pet.$id,veterinarianId:user.$id,recorderNameSnapshot:optText(user.name||user.email,128),recordType,medicineType:requireText(data.medicineType,100),description:optText(data.description,1000),dateAdministered:when.toISOString(),...(expiryDate?{expiryDate}:{})},[roleAdmin,roleOfficer,roleUser(pet.ownerId)]);
        if(recordType==='Vaccination'){const data={vaccinationStatus:'Vaccination recorded'};await update(T.pets,pet.$id,data);try{await update(T.passports,pet.petProfileId||pet.$id,data);}catch(e){if(e.status!==404)log?.('Passport status sync failed: '+e.message);}}break;
      }
      case 'addPetHealthUpload':{
        verify(403,owner);const pet=await row(T.inventory,requireText(data.petProfileId,36));verify(403,pet.ownerId===user.$id);
        const date=new Date(data.recordDate);verify(400,!Number.isNaN(date.getTime())&&date<=new Date(Date.now()+86400000),'Invalid record date');
        const expRaw=String(data.expiryDate||'').trim();
        let expiryDate=null;
        if(expRaw){const exp=new Date(expRaw);verify(400,!Number.isNaN(exp.getTime()),'Invalid expiry date');expiryDate=exp.toISOString();}
        const fileId=requireText(data.fileId,36);await assertUploadedPhoto(fileId,user);
        const shared=!!data.sharePublic;const title=requireText(data.title,160);
        const saved=await create(T.healthUploads,'unique()',{petProfileId:pet.$id,ownerId:user.$id,title,recordDate:date.toISOString(),...(expiryDate?{expiryDate}:{}),fileId,sharePublic:shared},[roleUser(user.$id),roleAdmin]);
        if(shared){await setFilePublic(fileId,true);await create(T.publicHealth,saved.$id,{petProfileId:pet.$id,title,recordDate:date.toISOString(),...(expiryDate?{expiryDate}:{}),fileId,sourceLabel:'Owner supplied — not clinician verified'},[rolePublic]);}
        result=saved;break;
      }
      case 'deletePetHealthUpload':{
        verify(403,owner);const record=await row(T.healthUploads,requireText(data.recordId,36));verify(403,record.ownerId===user.$id,'Not your record');
        try{await remove(T.publicHealth,record.$id);}catch(e){if(e.status!==404)throw e;}
        if(record.sharePublic)await setFilePublic(record.fileId,false);
        await remove(T.healthUploads,record.$id);result={deleted:true};break;
      }
      case 'createIncidentCategory':{
        verify(403,admin);const name=requireText(data.name,60),description=optText(data.description,240);
        const existing=await api('GET',path(T.categories)+'?limit=100');
        verify(409,!(existing.rows||[]).some(r=>r.name.toLowerCase()===name.toLowerCase()),'Category already exists');
        result=await create(T.categories,'unique()',{name,description,isActive:true,createdById:user.$id},[roleAdmin,'read("users")']);break;
      }
      case 'toggleIncidentCategory':{
        verify(403,admin);const cat=await row(T.categories,requireText(data.categoryId,36));result=await update(T.categories,cat.$id,{isActive:!cat.isActive});break;
      }
      case 'submitDisease':{
        // Citizen incident reporting requires CVO-approved ID and ownership verification.
        // Staff can report using their separately verified Team membership.
        if(owner){
          const verifiedProfile=await row(T.profiles,user.$id).catch(e=>e.status===404?null:Promise.reject(e));
          verify(403,verifiedProfile?.accountVerificationStatus==='verified','Only CVO-verified Pet Owner accounts can submit incident reports. Go to My Profile to request verification.');
        }
        const diseaseType=requireText(data.diseaseType,60);const allCats=await api('GET',path(T.categories)+'?limit=100');verify(400,(allCats.rows||[]).some(c=>c.name===diseaseType&&c.isActive),'Choose an active incident category created by CVO');
        const latitude=Number(data.latitude),longitude=Number(data.longitude);
        verify(400,Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=4&&latitude<=22&&longitude>=116&&longitude<=127,'Provide valid Philippine coordinates');
        const photoFileId=optText(data.photoFileId,36);if(photoFileId){stage='incident:authorize-photo';await assertUploadedPhoto(photoFileId,user,true,true);}
        result=await create(T.reports,'unique()',{photoFileId,reportedById:user.$id,reporterRole:admin?'admin':officer?'officer':'owner',diseaseType,barangay:cityBarangay(data.barangay),latitude,longitude,description:optText(data.description,1000),status:'pending',reportedAt:new Date().toISOString()},[roleUser(user.$id),roleAdmin,roleOfficer]);break;
      }
      case 'getIncidentReportDetails':{
        verify(403,admin||officer,'Only CVO staff may inspect other users’ incident reports.');
        const report=await row(T.reports,requireText(data.reportId,36));
        let reporterName='Reporter not available';
        if(report.reportedById){
          try{const author=await api('GET','/users/'+idPart(report.reportedById));reporterName=String(author.name||author.email||'Reporter').slice(0,128);}
          catch(err){if(err.status!==404)throw err;}
        }
        let photoUrl='';
        if(report.photoFileId){
          try{
            await api('GET',`/storage/buckets/${idPart(MEDIA)}/files/${idPart(report.photoFileId)}`);
            const expire=new Date(Date.now()+5*60*1000).toISOString();
            const token=await api('POST',`/tokens/buckets/${idPart(MEDIA)}/files/${idPart(report.photoFileId)}`,{expire});
            photoUrl=`${ENDPOINT}/storage/buckets/${idPart(MEDIA)}/files/${idPart(report.photoFileId)}/view?project=${encodeURIComponent(PROJECT)}&token=${encodeURIComponent(token.secret)}`;
          }catch(err){if(err.status!==404)throw err;log?.('Incident report image unavailable: '+report.$id);}
        }
        result={...report,reporterName,photoUrl};break;
      }
      case 'archiveIncidentReport':{
        verify(403,admin,'Only CVO Administrators can archive incident reports.');
        const report=await row(T.reports,requireText(data.reportId,36));
        verify(409,report.status!=='archived','The incident report is already archived.');
        result=await update(T.reports,report.$id,{status:'archived'});
        break;
      }
      case 'restoreArchivedIncident':{
        verify(403,admin,'Only CVO Administrators can restore archived reports.');
        const report=await row(T.reports,requireText(data.reportId,36));
        verify(409,report.status==='archived','Only archived reports can be restored.');
        result=await update(T.reports,report.$id,{status:'pending'});
        break;
      }
      case 'deleteIncidentReport':{
        verify(403,admin,'Only CVO Administrators can permanently delete reports.');
        const report=await row(T.reports,requireText(data.reportId,36));
        await remove(T.reports,report.$id);
        result={deleted:true,reportId:report.$id};
        break;
      }
      case 'deleteOutbreak':{
        verify(403,admin,'Only CVO Administrators can delete an outbreak declaration.');
        const alert=await row(T.alerts,requireText(data.alertId,36));
        verify(400,alert.isOutbreak===true||String(alert.title||'').startsWith('Declared outbreak'),
          'This is not an outbreak declaration. Other advisories cannot be deleted from this control.');
        // Remove its owner-directed copy first. Repeated requests are safe if it was already absent.
        try{await remove(T.ownerAlerts,alert.$id);}catch(e){if(e.status!==404)throw e;}
        await remove(T.alerts,alert.$id);
        result={deleted:true,alertId:alert.$id};
        break;
      }
      case 'reviewDisease':{
        throw Object.assign(new Error('Individual incident confirmations have been retired. Review the barangay and declare an outbreak instead.'),{status:410});
      }
      case 'declareOutbreak':{
        verify(403,admin,'Only administrators can declare outbreaks');
        const barangay=cityBarangay(data.barangay),diseaseType=requireText(data.diseaseType,60),message=requireText(data.message,1500);
        const all=await api('GET',path(T.reports)+'?limit=100');
        verify(409,(all.rows||[]).some(r=>r.status!=='archived'&&r.barangay?.toLowerCase().trim()===barangay.toLowerCase().trim()&&r.diseaseType===diseaseType),
          'At least one submitted incident in this barangay/category is required.');
        const alerts=await api('GET',path(T.alerts)+'?limit=100');
        verify(409,!(alerts.rows||[]).some(a=>a.isActive && a.barangay?.toLowerCase().trim()===barangay.toLowerCase().trim()&&a.diseaseType===diseaseType&&(a.isOutbreak||String(a.title||'').startsWith('Declared outbreak'))),
          'An active outbreak declaration already exists for this barangay and category.');
        // An administrator's documented decision; report volume alone does NOT diagnose outbreaks.
        const notifyOwners=!!data.notifyOwners;
        const issuedAt=new Date().toISOString();
        result=await create(T.alerts,'unique()',{title:'Declared outbreak — '+barangay,message,diseaseType,barangay,severity:'high',issuedById:user.$id,issuedAt,isActive:true,isOutbreak:true,notifyOwners},[roleAdmin,roleOfficer]);
        if(notifyOwners)await create(T.ownerAlerts,result.$id,{sourceAlertId:result.$id,title:result.title,message,diseaseType,barangay,severity:'high',issuedById:user.$id,issuedAt,isActive:true,isOutbreak:true},['read("users")']);
        break;
      }
      case 'publishAlert':{
        verify(403,admin);
        const notifyOwners=!!data.notifyOwners;
        const issuedAt=new Date().toISOString(),title=requireText(data.title,120),message=requireText(data.message,1500),diseaseType=requireText(data.diseaseType,60),barangay=cityBarangay(data.barangay),severity=accept(data.severity,['low','medium','high']);
        result=await create(T.alerts,'unique()',{title,message,diseaseType,barangay,severity,issuedById:user.$id,issuedAt,isActive:true,isOutbreak:false,notifyOwners},[roleAdmin,roleOfficer]);
        if(notifyOwners)await create(T.ownerAlerts,result.$id,{sourceAlertId:result.$id,title,message,diseaseType,barangay,severity,issuedById:user.$id,issuedAt,isActive:true,isOutbreak:false},['read("users")']);
        break;
      }
      case 'notifyPetOwners':{
        verify(403,admin);
        const alert=await row(T.alerts,requireText(data.alertId,36));
        try{result=await row(T.ownerAlerts,alert.$id);}catch(e){if(e.status!==404)throw e;
          result=await create(T.ownerAlerts,alert.$id,{sourceAlertId:alert.$id,title:alert.title,message:alert.message,diseaseType:alert.diseaseType,barangay:alert.barangay,severity:alert.severity,issuedById:alert.issuedById,issuedAt:alert.issuedAt,isActive:!!alert.isActive,isOutbreak:!!alert.isOutbreak},['read("users")']);
        }
        await update(T.alerts,alert.$id,{notifyOwners:true});break;
      }
      case 'deactivateAlert':{
        verify(403,admin);const alertId=requireText(data.alertId,36);
        result=await update(T.alerts,alertId,{isActive:false});
        try{await update(T.ownerAlerts,alertId,{isActive:false});}catch(e){if(e.status!==404)throw e;}
        break;
      }
      case 'createListing':{
        verify(403,admin,'Only administrators may publish official CVO pet listings.');
        const pet=await row(T.pets,requireText(data.petId,36));
        const source=pet.petProfileId?await row(T.inventory,pet.petProfileId).catch(()=>null):null;
        const profile=await row(T.profiles,user.$id).catch(()=>null);
        result=await create(T.listings,pet.$id,{petId:pet.$id,petProfileId:pet.petProfileId||'',verificationStatus:'verified',photoFileId:source?.sharePublicPhoto?(source?.photoFileId||''):'',ownerAvatarFileId:profile?.shareAvatarOnListings?(profile?.profileImageId||''):'',ownerDisplayName:'CVO Official Listing',title:requireText(data.title,150),description:requireText(data.description,1500),requirements:optText(data.requirements,1000),species:pet.species,breed:pet.breed,color:optText(source?.color,50),sex:optText(pet.sex,20),ageYears:Number(pet.ageYears)||0,barangay:pet.barangay,activityLevel:'medium',housingRequirement:accept(data.housingRequirement,['any','apartment','house','yard']),status:'available',postedById:user.$id,isActive:true},[roleAdmin,roleOfficer,'read("users")']);await adoptionMatchAlerts(result);break;
      }
      case 'listOwnPetForAdoption':{
        verify(403,owner,'Only Pet Owners may list their own pets.');
        const pet=await row(T.inventory,requireText(data.petProfileId,36));
        verify(403,pet.ownerId===user.$id,'You can only list your own pets.');
        const all=await api('GET',path(T.listings)+'?limit=100');
        verify(409,!(all.rows||[]).some(l=>l.petProfileId===pet.$id&&l.status!=='adopted'),'This pet is already listed for adoption. Manage or reopen its existing listing on the Adoptions page.');
        // Verified pets keep the official pet ID. Unverified pets use their inventory ID.
        const official=(pet.verificationStatus==='verified'&&pet.latestRequestId)?await row(T.pets,pet.latestRequestId).catch(e=>{if(e.status===404)return null;throw e;}):null;
        const publishPetPhoto=!!data.publishPetPhoto;
        const profile=await row(T.profiles,user.$id).catch(e=>{if(e.status===404)return null;throw e;});
        const publishOwnerPhoto=!!data.publishOwnerPhoto;
        if(publishOwnerPhoto){
          stage='adoption:share-owner-photo';
          verify(400,Boolean(profile?.profileImageId),'Upload a profile picture first before sharing it on adoption listings.');
          await setFilePublic(profile.profileImageId,true);
          await update(T.profiles,user.$id,{shareAvatarOnListings:true});
        }
        if(publishPetPhoto){
          verify(400,Boolean(pet.photoFileId),'Upload a pet picture or uncheck public pet photo sharing before publishing.');
          stage='adoption:share-pet-photo';
          await setFilePublic(pet.photoFileId,true);
        }
        stage='adoption:create-listing';
        result=await create(T.listings,'unique()',{petId:official?.$id||pet.$id,petProfileId:pet.$id,verificationStatus:pet.verificationStatus||'draft',photoFileId:publishPetPhoto?(pet.photoFileId||''):'',ownerAvatarFileId:((publishOwnerPhoto||profile?.shareAvatarOnListings)?profile?.profileImageId:'')||'',ownerDisplayName:data.showOwnerName?(profile?.fullName||user.name||'Pet Owner'):'Pet Owner',
          title:requireText(data.title||pet.profileTitle||pet.petName,150),description:requireText(data.description||pet.profileDescription||`${pet.petName} needs a loving home.`,1500),requirements:optText(data.requirements,1000),
          species:pet.species,breed:pet.breed,color:optText(pet.color,50),sex:optText(pet.sex,20),ageYears:Number(pet.ageYears)||0,barangay:pet.barangay,activityLevel:'medium',housingRequirement:accept(data.housingRequirement||'any',['any','apartment','house','yard']),status:'available',postedById:user.$id,isActive:true},
          [roleAdmin,roleUser(user.$id),'read("users")']);await adoptionMatchAlerts(result);break;
      }
      case 'updateListingPhotos':{
        verify(403,owner);const listing=await row(T.listings,requireText(data.listingId,36));
        verify(403,listing.postedById===user.$id,'Only the listing owner can change photo consent.');
        verify(409,listing.status!=='adopted','An adopted listing cannot be edited.');
        const pet=await row(T.inventory,requireText(listing.petProfileId,36));verify(403,pet.ownerId===user.$id);
        const ownProfile=await row(T.profiles,user.$id).catch(e=>e.status===404?null:Promise.reject(e));
        const publishPetPhoto=!!data.publishPetPhoto,publishOwnerPhoto=!!data.publishOwnerPhoto;
        if(publishPetPhoto)verify(400,!!pet.photoFileId,'Upload a pet picture before publishing it.');
        if(publishOwnerPhoto)verify(400,!!ownProfile?.profileImageId,'Upload a profile picture before sharing it.');
        // Public reads are opt-in and must also be granted on the storage file itself.
        if(pet.photoFileId)await setFilePublic(pet.photoFileId,publishPetPhoto);
        if(ownProfile?.profileImageId){
          await setFilePublic(ownProfile.profileImageId,publishOwnerPhoto);
          await update(T.profiles,user.$id,{shareAvatarOnListings:publishOwnerPhoto});
        }
        result=await update(T.listings,listing.$id,{photoFileId:publishPetPhoto?pet.photoFileId:'',ownerAvatarFileId:publishOwnerPhoto?(ownProfile?.profileImageId||''):''});break;
      }
      case 'toggleListing':{
        verify(403,admin||owner);const listing=await row(T.listings,requireText(data.listingId,36));
        verify(403,admin||listing.postedById===user.$id,'Only the listing owner or CVO can change visibility.');
        verify(409,listing.status!=='adopted','Adopted listings cannot be reopened directly');
        result=await update(T.listings,listing.$id,{isActive:!listing.isActive});break;
      }
      case 'applyAdoption':{
        verify(403,owner,'Only Pet Owners can apply for adoption');const listing=await row(T.listings,requireText(data.listingId,36));
        verify(409,listing.isActive&&listing.status==='available','This pet is not available');
        verify(409,listing.postedById!==user.$id,'You cannot adopt your own pet.');
        const phone=requireText(data.contactNumber,40);verify(400,/^[+0-9 ()-]{7,40}$/.test(phone),'Enter a valid contact number.');
        const rowId='ap_'+createHash('sha256').update(listing.$id+':'+user.$id).digest('hex').slice(0,29);
        const listingPet=listing.petProfileId?await row(T.inventory,listing.petProfileId).catch(e=>e.status===404?null:Promise.reject(e)):null;
        const officialPet=listingPet?null:await row(T.pets,listing.petId).catch(e=>e.status===404?null:Promise.reject(e));
        result=await create(T.applications,rowId,{listingId:listing.$id,petId:listing.petId,petProfileIdSnapshot:listing.petProfileId||officialPet?.petProfileId||'',petNameSnapshot:(listingPet?.petName||officialPet?.petName||'').slice(0,100),listingTitleSnapshot:listing.title||'',applicantId:user.$id,applicantName:user.name||user.email,message:requireText(data.message,1000),contactNumber:phone,status:'pending',submittedAt:new Date().toISOString()},[roleAdmin,roleUser(user.$id)]);break;
      }
      case 'resolveAdoptionApplicationNames':{
        verify(403,owner||admin,'Only Pet Owners and Administrators can view their adoption history.');
        const applicationIds=data.applicationIds;
        verify(400,Array.isArray(applicationIds)&&applicationIds.length<=100,'Provide up to 100 application IDs.');
        verify(400,applicationIds.every(id=>typeof id==='string'&&id.length>0&&id.length<=36),'Invalid application ID.');
        const cached=new Map();
        async function getExisting(table,id){
          if(!id)return null;
          const key=table+':'+id;
          if(cached.has(key))return cached.get(key);
          let found=null;
          try{found=await row(table,id);}catch(e){if(e.status!==404)throw e;}
          cached.set(key,found);return found;
        }
        const labels=[];
        for(const applicationId of new Set(applicationIds)){
          const application=await getExisting(T.applications,applicationId);
          if(!application)continue;
          const listing=await getExisting(T.listings,application.listingId);
          if(!admin&&application.applicantId!==user.$id&&listing?.postedById!==user.$id)continue;
          let pet=await getExisting(T.inventory,application.petProfileIdSnapshot||listing?.petProfileId);
          if(!pet)pet=await getExisting(T.inventory,application.petId);
          let official=null;
          if(!pet){
            official=await getExisting(T.pets,application.petId);
            pet=official?.petProfileId?await getExisting(T.inventory,official.petProfileId):null;
          }
          const passport=(!pet&&!official)?await getExisting(T.passports,application.petId):null;
          const possibleRequest=(!pet&&!official&&!passport)?await getExisting(T.req,application.petId):null;
          const name=application.petNameSnapshot||pet?.petName||official?.petName||passport?.petName||possibleRequest?.petName||'';
          labels.push({applicationId,petName:String(name).slice(0,100),listingTitle:String(application.listingTitleSnapshot||listing?.title||'').slice(0,150),species:String(pet?.species||official?.species||listing?.species||'').slice(0,24),listingRemoved:!listing,unresolved:!name});
        }
        result={labels};break;
      }
      case 'resolveMedicalRecorders':{
        verify(403,admin||officer,'Only authorized veterinary staff may resolve record creators.');
        const ids=Array.isArray(data.recordIds)?[...new Set(data.recordIds)]:[];
        verify(400,ids.length<=100&&ids.every(id=>typeof id==='string'&&id.length>0&&id.length<=36),'Provide at most 100 valid medical record IDs.');
        const cachedUsers=new Map();const recorders=[];
        for(const recordId of ids){
          const record=await row(T.medical,recordId).catch(e=>e.status===404?null:Promise.reject(e));
          if(!record)continue;
          const authorId=record.veterinarianId;
          if(!cachedUsers.has(authorId))cachedUsers.set(authorId,await api('GET','/users/'+idPart(authorId)).catch(e=>e.status===404?null:Promise.reject(e)));
          const person=cachedUsers.get(authorId);
          recorders.push({recordId,recorderId:authorId,recorderName:record.recorderNameSnapshot||person?.name||'Former CVO staff member'});
        }
        result={recorders};break;
      }
      case 'getStaffPetDirectory':{
        verify(403,admin||officer,'CVO personnel only');
        const query=(table)=>api('GET',path(table)+'?limit=100');
        const verified=(await query(T.pets)).rows||[];
        // No home address, private contact, or owner ID documents are returned.
        const directory=[];
        for(const [index,pet] of verified.entries()){
          let imageUrl='';
          if(pet.photoFileId&&index<24){
            try{const file=await api('GET',`/storage/buckets/${MEDIA}/files/${idPart(pet.photoFileId)}`);
              const expire=new Date(Date.now()+4*60*1000).toISOString();
              const token=await api('POST',`/tokens/buckets/${idPart(MEDIA)}/files/${idPart(file.$id)}`,{expire});
              imageUrl=`${ENDPOINT}/storage/buckets/${idPart(MEDIA)}/files/${idPart(file.$id)}/view?project=${encodeURIComponent(PROJECT)}&token=${encodeURIComponent(token.secret)}`;
            }catch(e){log?.('Staff pet thumbnail unavailable '+pet.$id+': '+e.status);}
          }
          directory.push({$id:pet.$id,petProfileId:pet.petProfileId||'',petName:pet.petName,species:pet.species,breed:pet.breed,barangay:pet.barangay,ownerName:pet.ownerName||'',officialRegistryId:pet.officialRegistryId||'',imageUrl});
        }
        result={pets:directory,limitedTo:100};break;
      }
      case 'listOwnListingApplications':{
        verify(403,owner,'Only Pet Owners can access their listing applications.');
        const all=await api('GET',path(T.listings)+'?limit=100');
        const mine=new Set((all.rows||[]).filter(l=>l.postedById===user.$id).map(l=>l.$id));
        const apps=await api('GET',path(T.applications)+'?limit=100');
        result={applications:(apps.rows||[]).filter(a=>mine.has(a.listingId)).map(a=>({$id:a.$id,listingId:a.listingId,petId:a.petId,petNameSnapshot:a.petNameSnapshot||'',listingTitleSnapshot:a.listingTitleSnapshot||'',applicantId:a.applicantId,applicantName:a.applicantName,message:a.message,contactNumber:a.contactNumber,status:a.status,submittedAt:a.submittedAt,$createdAt:a.$createdAt,$updatedAt:a.$updatedAt}))};break;
      }
      case 'reviewOwnAdoption':{
        verify(403,owner,'Only the current Pet Owner can decide an adoption request.');
        const application=await row(T.applications,requireText(data.applicationId,36));
        const listing=await row(T.listings,application.listingId);
        verify(403,listing.postedById===user.$id,'This adoption request belongs to another owner.');
        verify(409,application.status==='pending','This request has already been reviewed.');
        verify(409,listing.isActive&&listing.status==='available','This pet is not available for applications.');
        const pet=await row(T.inventory,listing.petProfileId);
        verify(403,pet.ownerId===user.$id,'This pet is no longer yours.');
        const decision=accept(data.decision,['approve','decline']);
        if(decision==='approve'){
          const existing=await api('GET',path(T.applications)+'?limit=100');
          verify(409,!(existing.rows||[]).some(a=>a.$id!==application.$id&&a.listingId===listing.$id&&['owner_approved','approved','completed'].includes(a.status)),
            'You already approved another applicant for this pet.');
          // The adopter requested the pet; the current owner chooses the adopter.
          // CVO consent is NOT required. Reserve the listing immediately.
          await update(T.listings,listing.$id,{status:'reserved'});
          result=await update(T.applications,application.$id,{status:'approved'});
        }else{
          result=await update(T.applications,application.$id,{status:'rejected'});
        }
        break;
      }
      case 'decideAdoption':{
        verify(410,false,'CVO adoption approval has been removed. Pet Owners decide their own adoption requests.');
        break;
      }
      case 'confirmAdoptionTransfer':
      case 'completeAdoption':{
        verify(403,owner,'Only the current Pet Owner can confirm an adoption handover.');
        const application=await row(T.applications,requireText(data.applicationId,36));
        verify(409,['approved','owner_approved'].includes(application.status),'The current owner must approve this application before transfer.');
        const listing=await row(T.listings,application.listingId);
        verify(409,['reserved','available'].includes(listing.status)&&listing.isActive,'The listing is no longer active.');
        verify(403,listing.postedById===user.$id,'Only the current listing owner can confirm transfer.');
        const newOwner=await api('GET','/users/'+idPart(application.applicantId));
        let official=null;
        try{official=await row(T.pets,listing.petId);}catch(e){if(e.status!==404)throw e;}
        const currentPet=await row(T.inventory,listing.petProfileId);
        const oldOwnerId=currentPet.ownerId;
        verify(403,oldOwnerId===user.$id,'This pet no longer belongs to your account.');
        verify(409,oldOwnerId!==newOwner.$id,'Adopter is already the pet owner.');
        const petId=official?.$id||listing.petProfileId;
        verify(409,Boolean(petId),'No registered pet profile found for the adoption.');
        // One history row per application; retries cannot create duplicate events.
        const priorAccount=await api('GET','/users/'+idPart(oldOwnerId));
        try{await create(T.history,application.$id,{petId,petName:optText(currentPet.petName||official?.petName||'',100),previousOwnerId:oldOwnerId,newOwnerId:newOwner.$id,previousOwnerName:priorAccount.name||priorAccount.email,newOwnerName:newOwner.name||newOwner.email,transferType:'Adoption',transferDate:new Date().toISOString()},[roleAdmin,roleUser(newOwner.$id),roleUser(oldOwnerId)]);}catch(e){if(e.status!==409)throw e;}
        await updateOwnershipInventory({...currentPet,$id:petId,petProfileId:listing.petProfileId},newOwner);
        if(official){
          await update(T.pets,official.$id,{ownerId:newOwner.$id,ownerName:newOwner.name||newOwner.email},[roleAdmin,roleOfficer,roleUser(newOwner.$id)]);
        }
        // The old owner no longer has an active or inactive adoption listing.
        // Preserve application + ownership_history as the audit trail, but
        // permanently DELETE the finished listing only AFTER ownership and
        // related permissions have moved. Mark adopted first, so any cleanup
        // failure leaves it safely hidden and not reopenable.
        await update(T.applications,application.$id,{status:'completed'},[roleAdmin,roleUser(newOwner.$id),roleUser(oldOwnerId)]);
        // Do not leave losing applicants waiting for a pet already adopted.
        try{
          const otherApplications=await api('GET',path(T.applications)+'?limit=100&queries%5B%5D='+encodeURIComponent(JSON.stringify({method:'equal',attribute:'listingId',values:[listing.$id]})));
          for(const other of otherApplications.rows||[]){
            if(other.$id!==application.$id&&other.listingId===listing.$id&&['pending','owner_approved','approved'].includes(other.status)){
              await update(T.applications,other.$id,{status:'rejected'});
            }
          }
        }catch(otherError){log?.('Could not close losing adoption applications: HTTP '+(otherError.status||'network'));}
        await update(T.listings,listing.$id,{status:'adopted',isActive:false},[roleAdmin]);
        let listingDeleted=false;
        try{await remove(T.listings,listing.$id);listingDeleted=true;}
        catch(cleanupError){
          // Do not report a failed TRANSFER after ownership has already changed.
          // A stale adopted row can be removed by the safe cleanup utility.
          log?.('Adoption listing cleanup failed; transfer complete: HTTP '+(cleanupError.status||'network'));
        }
        result={transferred:true,petId,petProfileId:listing.petProfileId,applicationId:application.$id,listingDeleted};break;
      }
      case 'transferOwnership':{
        verify(403,admin);const pet=await row(T.pets,requireText(data.petId,36));
        const newOwner=await api('GET','/users/'+idPart(requireText(data.newOwnerId,36)));
        verify(409,newOwner.$id!==pet.ownerId,'New owner is already the current owner');
        const type=accept(data.transferType,['Reclaim','Surrender','Correction']);
        await create(T.history,'unique()',{petId:pet.$id,petName:optText(pet.petName||'',100),previousOwnerId:pet.ownerId,newOwnerId:newOwner.$id,previousOwnerName:pet.ownerName||pet.ownerId,newOwnerName:newOwner.name||newOwner.email,transferType:type,transferDate:new Date().toISOString()},[roleAdmin,roleUser(newOwner.$id),roleUser(pet.ownerId)]);
        result=await update(T.pets,pet.$id,{ownerId:newOwner.$id,ownerName:newOwner.name||newOwner.email,sharePublicAddress:false,shareContact:false,shareOwnerName:false,emergencyContact:'',homeAddress:'',lostFoundMessage:'If found, please contact the current owner through CityVetHub.'},[roleAdmin,roleOfficer,roleUser(newOwner.$id)]);
        await updateOwnershipInventory(pet,newOwner);break;
      }
      case 'resolveReporterRoles':{
        verify(403,admin||officer,'Staff access required');
        const ids=Array.isArray(data.userIds)?[...new Set(data.userIds)]:[];
        verify(400,ids.length<=75,'Too many reporter IDs');
        const roles={};
        for(const reporterId of ids){
          if(typeof reporterId!=='string'||!/^[a-zA-Z0-9_.-]{1,36}$/.test(reporterId))continue;
          try{
            // This is the CURRENT role, not guaranteed to be the role at report time.
            const members=await api('GET','/users/'+idPart(reporterId)+'/memberships?limit=100');
            const teamsFound=(members.memberships||[]).filter(m=>m.confirm!==false).map(m=>m.teamId);
            roles[reporterId]=teamsFound.includes(ADMINS)?'admin':teamsFound.includes(OFFICERS)?'officer':'owner';
          }catch(e){
            if(e.status!==404)log?.('Reporter role lookup skipped for one account: HTTP '+(e.status||'network'));
          }
        }
        result={roles,roleTime:'current'};break;
      }
      case 'listUsers':{
        verify(403,admin);const [users,officerMembers,adminMembers]=await Promise.all([api('GET','/users?limit=100'),api('GET','/teams/'+OFFICERS+'/memberships?limit=100'),api('GET','/teams/'+ADMINS+'/memberships?limit=100')]);
        const officers=new Set((officerMembers.memberships||[]).filter(m=>m.confirm!==false).map(m=>m.userId));
        const admins=new Set((adminMembers.memberships||[]).filter(m=>m.confirm!==false).map(m=>m.userId));
        const profileRows=await api('GET',path(T.profiles)+'?limit=100');
        const profileIndex=new Map((profileRows.rows||[]).map(p=>[p.userId,p]));
        result={users:(users.users||[]).map(u=>({$id:u.$id,name:u.name,email:u.email,profileImageId:profileIndex.get(u.$id)?.profileImageId||'',accountVerificationStatus:profileIndex.get(u.$id)?.accountVerificationStatus||'unverified',requestedRole:u.prefs?.requestedRole||'owner',officerApproved:officers.has(u.$id),isAdmin:admins.has(u.$id),effectiveRole:admins.has(u.$id)?'admin':officers.has(u.$id)?'officer':'owner',accountEnabled:u.status!==false,registration:u.$createdAt})),limitedTo:100};break;
      }
      case 'setUserRole':{
        verify(403,admin);
        const targetId=requireText(data.userId,36),targetRole=accept(data.role,['owner','officer','admin']);
        verify(403,targetId!==user.$id,'Administrators cannot change their own role.');
        const target=await api('GET','/users/'+idPart(targetId));
        const teamMembers=await Promise.all([ADMINS,OFFICERS].map(async teamId=>({teamId,members:(await api('GET','/teams/'+teamId+'/memberships?limit=100')).memberships||[]})));
        const adminTeam=teamMembers.find(t=>t.teamId===ADMINS);
        const oldAdmin=adminTeam.members.find(m=>m.userId===targetId&&m.confirm!==false);
        if(oldAdmin&&targetRole!=='admin')verify(409,adminTeam.members.filter(m=>m.confirm!==false).length>1,'Cannot remove the final Administrator.');
        // Add new membership BEFORE removing the previous one. If membership remains
        // pending, do not remove the old role and do not claim promotion succeeded.
        const destination=targetRole==='admin'?ADMINS:targetRole==='officer'?OFFICERS:null;
        if(destination){
          const dest=teamMembers.find(t=>t.teamId===destination);
          let member=dest.members.find(m=>m.userId===targetId);
          if(!member)member=await api('POST','/teams/'+destination+'/memberships',{userId:targetId,roles:['member']});
          verify(409,member.confirm!==false,'The new staff membership is awaiting acceptance. Original access has not been removed.');
        }
        // Keep the request flag consistent with the actual role for future logins.
        await api('PATCH','/users/'+idPart(targetId)+'/prefs',{prefs:{...(target.prefs||{}),requestedRole:targetRole==='officer'?'officer':'owner'}});
        for(const entry of teamMembers){if(entry.teamId===destination)continue;
          for(const member of entry.members.filter(m=>m.userId===targetId)){
            await api('DELETE','/teams/'+entry.teamId+'/memberships/'+idPart(member.$id));
          }
        }
        // A previously blocked Field Officer applicant can now sign in only
        // after the CVO has explicitly assigned the requested active role.
        await api('PATCH','/users/'+idPart(targetId)+'/status',{status:true});
        result={userId:targetId,role:targetRole,changed:true};break;
      }
      case 'deleteManagedUser':{
        verify(403,admin);const targetId=requireText(data.userId,36);
        verify(403,targetId!==user.$id,'Administrators cannot delete their own account.');
        const target=await api('GET','/users/'+idPart(targetId));
        verify(400,String(data.confirmEmail||'').trim().toLowerCase()===String(target.email).toLowerCase(),'Account email confirmation did not match.');
        // Prevent orphaning pet identities, medical history, reports and handovers.
        const blockers=[ [T.inventory,'ownerId'],[T.pets,'ownerId'],[T.req,'ownerId'],[T.healthUploads,'ownerId'],[T.listings,'postedById'],[T.applications,'applicantId'],[T.reports,'reportedById'],[T.categories,'createdById'],[T.alerts,'issuedById'],[T.medical,'veterinarianId'],[T.history,'previousOwnerId'],[T.history,'newOwnerId'] ];
        for(const [table,field] of blockers){
          const query=encodeURIComponent(JSON.stringify({method:'equal',attribute:field,values:[targetId]}));
          const matches=await api('GET',path(table)+'?limit=1&queries%5B%5D='+query);
          verify(409,!(matches.total||(matches.rows||[]).length),'Account has linked '+table+' records. Transfer or archive those records before deletion.');
        }
        const adminMemberships=(await api('GET','/teams/'+ADMINS+'/memberships?limit=100')).memberships||[];
        if(adminMemberships.some(m=>m.userId===targetId&&m.confirm!==false))verify(409,adminMemberships.filter(m=>m.confirm!==false).length>1,'Cannot delete the final Administrator.');
        stage='deleteManagedUser:delete-auth';
        // Appwrite deletes sessions when deleting an Auth user. Private profile is
        // cleaned after successful auth deletion; data-linked users were blocked above.
        await api('DELETE','/users/'+idPart(targetId));
        stage='deleteManagedUser:cleanup-profile';
        try{await remove(T.profiles,targetId);}catch(e){if(e.status!==404)log?.('Profile cleanup needed for '+targetId+': '+e.message);}
        result={userId:targetId,deleted:true};break;
      }
      case 'createUser':{
        verify(403,admin);
        const role=accept(data.role,['owner','officer','admin']);
        const payload={userId:'unique()',email:requireText(data.email,160),password:requireText(data.password,256),name:requireText(cleanName(data.name),128)};
        const created=await api('POST','/users',payload);
        await api('PATCH','/users/'+idPart(created.$id)+'/prefs',{prefs:{requestedRole:role==='officer'?'officer':'owner'}});
        if(role==='officer') await api('POST','/teams/'+OFFICERS+'/memberships',{userId:created.$id,roles:['member']});
        if(role==='admin') await api('POST','/teams/'+ADMINS+'/memberships',{userId:created.$id,roles:['member']});
        result={$id:created.$id,email:created.email,name:created.name,role};break;
      }
      case 'approveOfficer':{
        verify(403,admin);const target=await api('GET','/users/'+idPart(requireText(data.userId,36)));
        verify(400,target.prefs?.requestedRole==='officer','This user has not requested Field Officer access');
        const all=await api('GET','/teams/'+OFFICERS+'/memberships?limit=100');
        let membership=(all.memberships||[]).find(m=>m.userId===target.$id);
        if(membership?.confirm===false)verify(409,false,'An existing officer invitation is not yet accepted. Resolve that invitation before approving.');
        if(!membership)membership=await api('POST','/teams/'+OFFICERS+'/memberships',{userId:target.$id,roles:['member']});
        verify(409,membership.confirm!==false,'Invitation not yet accepted; do not activate staff access until membership is confirmed.');
        await api('PATCH','/users/'+idPart(target.$id)+'/status',{status:true});
        result={approved:true,userId:target.$id};break;
      }
      default:throw Object.assign(new Error('Unsupported operation'),{status:400});
    }
    return res.json({ok:true,data:result});
  }catch(e){error?.('CityVetHub '+BUILD_VERSION+' action='+activeAction+' stage='+stage+' status='+errorStatus(e)+' error='+String(e?.message||'unknown').slice(0,240));return res.json({ok:false,error:errorStatus(e)>=500?`Unable to complete ${activeAction} at ${stage}. Please check Function execution logs.`:e.message,stage},errorStatus(e));}
};
