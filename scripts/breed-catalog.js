/* CityVetHub breed catalogs: server-side proxy to TheDogAPI / TheCatAPI.
   Secrets remain in Appwrite Function variables, never in the browser. */
(function(){
'use strict';
const fallback={
 Dog:['Aspin (Philippine native dog)','Beagle','Border Collie','Chihuahua','Dachshund','French Bulldog','German Shepherd','Golden Retriever','Labrador Retriever','Pomeranian','Poodle','Pug','Rottweiler','Shih Tzu','Siberian Husky','Mixed Breed','Other / Unknown'],
 Cat:['American Shorthair','British Shorthair','Bengal','Birman','Domestic Longhair','Domestic Shorthair','Maine Coon','Persian','Ragdoll','Russian Blue','Scottish Fold','Siamese','Sphynx','Mixed Breed','Other / Unknown']
};
const colors=['Black','White','Brown','Cream','Gray','Orange','Golden','Tan','Ginger','Calico','Tortoiseshell','Tabby','Brindle','Spotted','Mixed','Other / Unknown'];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache={};
async function list(api,species){
 if(!['Dog','Cat'].includes(species))return [];
 if(cache[species])return cache[species];
 const base=[...fallback[species]];
 try{
   const data=await api.operate('getBreedCatalog',{species});
   const names=Array.isArray(data?.breeds)?data.breeds:base;
   cache[species]=[...new Set(names.map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 }catch(e){cache[species]=base;console.warn('Breed lookup unavailable. Curated offline options enabled:',e.message);}
 return cache[species];
}
async function populate(api,species,select,selected=''){
 if(!select)return;
 const request=String(species||'Dog');
 select.disabled=true;
 select.innerHTML='<option value="">Loading breeds…</option>';
 const names=await list(api,request);
 if(!select.isConnected)return;
 const options=[...names];if(selected&&!options.some(n=>n.toLowerCase()===selected.toLowerCase()))options.unshift(selected);
 select.innerHTML=`<option value="">Select ${escape(request.toLowerCase())} breed</option>`+options.map(n=>`<option value="${escape(n)}">${escape(n)}</option>`).join('');
 select.value=selected||'';select.disabled=false;
}
function attach(api,speciesSelect,breedSelect,existing=''){
 if(!breedSelect)return;
 let requestNo=0;
 const run=async(selected='')=>{const n=++requestNo;await populate(api,speciesSelect.value,breedSelect,selected);if(n!==requestNo)return;};
 speciesSelect?.addEventListener('change',()=>run());run(existing);
}
window.CityVetBreedCatalog=Object.freeze({list,populate,attach,colors,fallback});
})();
