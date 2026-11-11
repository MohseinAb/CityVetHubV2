/** CityVetHub pet matching and breed lookup, non-privileged pure helpers. */
export const FALLBACK_BREEDS=Object.freeze({
  Dog:['Aspin (Philippine native dog)','Beagle','Border Collie','Chihuahua','Dachshund','French Bulldog','German Shepherd','Golden Retriever','Labrador Retriever','Pomeranian','Poodle','Pug','Rottweiler','Shih Tzu','Siberian Husky','Mixed Breed','Other / Unknown'],
  Cat:['American Shorthair','British Shorthair','Bengal','Birman','Domestic Longhair','Domestic Shorthair','Maine Coon','Persian','Ragdoll','Russian Blue','Scottish Fold','Siamese','Sphynx','Mixed Breed','Other / Unknown']
});
export const COLORS=Object.freeze(['Black','White','Brown','Cream','Gray','Orange','Golden','Tan','Ginger','Calico','Tortoiseshell','Tabby','Brindle','Spotted','Mixed','Other / Unknown']);
const norm=x=>String(x??'').trim().toLocaleLowerCase('en').replace(/\s+/g,' ');
/** Non-selected preferences mean Any; every chosen dimension must match. */
export function matchPet(preference, listing){
 if(!preference?.isEnabled||!listing?.isActive||listing?.status!=='available')return false;
 if(preference.species&&preference.species!=='Any'&&norm(preference.species)!==norm(listing.species))return false;
 if(preference.breed&&norm(preference.breed)!==norm(listing.breed))return false;
 if(preference.color&&norm(preference.color)!==norm(listing.color))return false;
 if(preference.sex&&preference.sex!=='Any'&&norm(preference.sex)!==norm(listing.sex))return false;
 const age=Number(listing.ageYears);
 if(preference.minAgeYears!=null||preference.maxAgeYears!=null){
   if(!Number.isFinite(age))return false;
   if(preference.minAgeYears!=null&&age<Number(preference.minAgeYears))return false;
   if(preference.maxAgeYears!=null&&age>Number(preference.maxAgeYears))return false;
 }
 return true;
}
export function validatePreferences(d){
 const species=['Any','Dog','Cat'].includes(d.species)?d.species:'Any';
 const sex=['Any','Male','Female'].includes(d.sex)?d.sex:'Any';
 const min=Number(d.minAgeYears??0),max=Number(d.maxAgeYears??40);
 if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max>40||min>max)throw Object.assign(new Error('Age must be between 0 and 40, and minimum cannot exceed maximum.'),{status:400});
 const breed=String(d.breed||'').trim().slice(0,100),color=String(d.color||'').trim().slice(0,50);
 if(!species||species==='Any')return {species:'Any',breed:'',color,sex,minAgeYears:min,maxAgeYears:max,isEnabled:d.isEnabled!==false,pushEnabled:!!d.pushEnabled};
 return {species,breed,color,sex,minAgeYears:min,maxAgeYears:max,isEnabled:d.isEnabled!==false,pushEnabled:!!d.pushEnabled};
}
export async function getBreedCatalog(species,keys,fetcher=fetch){
 if(!['Dog','Cat'].includes(species))throw Object.assign(new Error('Choose Dog or Cat'),{status:400});
 const key=species==='Dog'?keys.dog:keys.cat;
 const base=[...FALLBACK_BREEDS[species]];
 // Prefer the dedicated breed data providers when an administrator configured API keys.
 if(key){
   try{
     const host=species==='Dog'?'https://api.thedogapi.com/v1/breeds':'https://api.thecatapi.com/v1/breeds?limit=1000';
     const response=await fetcher(host,{headers:{'x-api-key':key},signal:AbortSignal.timeout(6000)});
     if(!response.ok)throw Error('Premium breed catalog HTTP '+response.status);
     const items=await response.json();if(Array.isArray(items)&&items.length){
       return {species,breeds:[...new Set([...items.map(item=>String(item.name||'').trim()).filter(Boolean),...base])].sort((a,b)=>a.localeCompare(b)),source:'thepetapi'};
     }
   }catch{/* Try keyless alternative, then local fallback. */}
 }
 // Free public alternatives, no credentials exposed in JS, API called server-side.
 try{
   const host=species==='Dog'?'https://dog.ceo/api/breeds/list/all':'https://catfact.ninja/breeds?limit=1000';
   const response=await fetcher(host,{signal:AbortSignal.timeout(6500)});
   if(!response.ok)throw Error('Public breed API HTTP '+response.status);
   const payload=await response.json();let names=[];
   if(species==='Dog'&&payload.message&&typeof payload.message==='object'){
     const title=s=>String(s||'').split(/\s+/).map(w=>w.slice(0,1).toUpperCase()+w.slice(1)).join(' ');
     for(const [breed,subbreeds] of Object.entries(payload.message)){
       if(Array.isArray(subbreeds)&&subbreeds.length)for(const sub of subbreeds)names.push(title(sub)+' '+title(breed));
       else names.push(title(breed));
     }
   }else if(species==='Cat'&&Array.isArray(payload.data)){
     names=payload.data.map(item=>String(item.breed||'').trim()).filter(Boolean);
   }
   if(names.length)return {species,breeds:[...new Set([...names,...base])].sort((a,b)=>a.localeCompare(b)),source:'public_api'};
 }catch{/* Network unavailable; keep form usable with the cached local catalog. */}
 return {species,breeds:base,source:'curated_fallback',message:'Breed provider unavailable. Showing locally cached breed choices.'};
}
