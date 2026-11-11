/** CityVetHub Community — all authorization is server-side.
 * Tables are Function-only; no direct client row permissions are granted.
 * New standalone module to avoid affecting the existing pet/medical/transfer operations.
 */
import {createHash} from 'node:crypto';

const TABLES={channels:'community_channels',members:'community_memberships',posts:'community_posts',comments:'community_comments',votes:'community_votes',announcements:'community_announcements'};
const DB=process.env.CITYVET_DATABASE_ID||'cityvethub', MEDIA='cityvethub-media', ADMIN='read("team:cityvethub-admins")';
const bad=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const requireValue=(v,max,label='Value')=>{const s=String(v??'').trim();if(!s||s.length>max)bad(400,`${label} must contain 1–${max} characters.`);return s;};
const optional=(v,max)=>String(v??'').trim().slice(0,max);
const yes=(condition,message,status=403)=>{if(!condition)bad(status,message);};
const choice=(value,allowed)=>{yes(allowed.includes(value),'Invalid option.',400);return value;};
const hashId=(prefix,values)=>prefix+createHash('sha256').update(values.join('|')).digest('hex').slice(0,32);
const id=(value)=>encodeURIComponent(String(value));
const tpath=(table,rowId)=>`/tablesdb/${id(DB)}/tables/${id(table)}/rows${rowId?'/'+id(rowId):''}`;
const listPath=(table,filters=[],limit=100)=>tpath(table)+'?limit='+limit+filters.map(({attribute,value})=>'&queries%5B%5D='+encodeURIComponent(JSON.stringify({method:'equal',attribute,values:[value]}))).join('');
const jsonArray=(s)=>{try{const x=JSON.parse(s||'[]');return Array.isArray(x)?x:[];}catch{return[];}};
const shortRow=r=>({id:r.$id,...r});

export async function runCommunity({action,data,user,admin,officer,owner,api}){
 const get=(table,rowId)=>api('GET',tpath(table,rowId));
 const create=(table,rowId,fields)=>api('POST',tpath(table),{rowId:rowId||'unique()',data:fields,permissions:[ADMIN]});
 const update=(table,rowId,fields)=>api('PATCH',tpath(table,rowId),{data:fields});
 const remove=(table,rowId)=>api('DELETE',tpath(table,rowId));
 const readList=(table,filters=[],limit=100)=>api('GET',listPath(table,filters,limit)).then(r=>r.rows||[]);
 const getOrNull=async(table,rowId)=>{try{return await get(table,rowId);}catch(e){if(e.status===404)return null;throw e;}};
 const membershipId=(channelId,userId)=>hashId('m_',[channelId,userId]);
 const voteId=(type,target,userId)=>hashId('v_',[type,target,userId]);
 const isVerified=async()=>{if(admin||officer)return true;if(!owner)return false;const p=await getOrNull('user_profiles',user.$id);return p?.accountVerificationStatus==='verified';};
 const requireVerified=async()=>{yes(owner||officer||admin,'Sign in to participate in discussions.');if(owner)yes(await isVerified(),'CVO account verification is required before posting, creating channels, commenting, or voting.');};
 const member=async(ch,u=user.$id)=>getOrNull(TABLES.members,membershipId(ch.$id,u));
 const owned=ch=>ch.createdById===user.$id;
 const canAccess=async(ch)=>ch.privacy==='public'||admin||owned(ch)||(await member(ch))?.status==='approved';
 const assertVisible=async(ch)=>{yes(!ch.isArchived,'This channel is archived.',409);yes(await canAccess(ch),'Private channel: approval from its creator is required.',403);};
 const ensureUser=()=>yes(owner||officer||admin,'Sign in to continue.');
 let staffRoleCache=null;
 const getStaffRoles=async()=>{
   if(staffRoleCache)return staffRoleCache;
   const map=new Map();
   try{
     const [adm,off]=await Promise.all([
       api('GET','/teams/cityvethub-admins/memberships?limit=100').catch(()=>({memberships:[]})),
       api('GET','/teams/cityvethub-field-officers/memberships?limit=100').catch(()=>({memberships:[]}))
     ]);
     for(const m of off.memberships||[])if(m.confirm!==false&&m.userId)map.set(m.userId,'officer');
     for(const m of adm.memberships||[])if(m.confirm!==false&&m.userId)map.set(m.userId,'admin');
   }catch{}
   staffRoleCache=map;return map;
 };
 const limits={maxImages:4,maxImageBytes:5*1024*1024};
 const validPostFiles=async(ids)=>{
   yes(Array.isArray(ids)&&ids.length<=limits.maxImages,'Up to four image attachments are allowed.',400);
   const unique=[...new Set(ids.map(v=>String(v)))];yes(unique.length===ids.length,'Duplicate image attachments are not allowed.',400);
   for(const fileId of unique){yes(/^[a-zA-Z0-9._-]{1,36}$/.test(fileId),'Invalid image file ID.',400);
     const file=await api('GET',`/storage/buckets/${id(MEDIA)}/files/${id(fileId)}`);
     yes((file.$permissions||[]).includes(`update("user:${user.$id}")`),'Upload only images belonging to your own account.');
     yes(['image/jpeg','image/png','image/webp'].includes(file.mimeType),'Only JPG, PNG and WEBP images are accepted.',400);
     yes((file.sizeOriginal||0)<=limits.maxImageBytes,'Each image must be 5 MB or smaller.',400);
   }
   return unique;
 };
 const cleanPost=(p,roles=new Map())=>({id:p.$id,channelId:p.channelId,authorId:p.authorId,authorName:p.isDeleted?'Removed discussion':p.authorName,authorRole:p.isDeleted?'':(roles.get(p.authorId)||'owner'),title:p.isDeleted?'[Discussion removed]':p.title,body:p.isDeleted?'[This discussion was removed]':p.body,
   imageFileIds:p.isDeleted?[]:jsonArray(p.imageFileIds),isDeleted:!!p.isDeleted,createdAt:p.$createdAt});
 const cleanComment=(c,roles=new Map())=>({id:c.$id,postId:c.postId,parentCommentId:c.parentCommentId||'',authorId:c.authorId,authorName:c.isDeleted?'Removed comment':c.authorName,authorRole:c.isDeleted?'':(roles.get(c.authorId)||'owner'),body:c.isDeleted?'[Comment removed]':c.body,isDeleted:!!c.isDeleted,createdAt:c.$createdAt});
 const voteSummaries=async(chId)=>{
   const votes=await readList(TABLES.votes,[{attribute:'channelId',value:chId}],100);
   const byTarget=new Map();for(const v of votes){const k=v.targetType+':'+v.targetId;const x=byTarget.get(k)||{score:0,upvotes:0,downvotes:0,myVote:0};
     x.score+=v.value;x.upvotes+=(v.value===1?1:0);x.downvotes+=(v.value===-1?1:0);if(v.userId===user.$id)x.myVote=v.value;byTarget.set(k,x);}
   return byTarget;
 };
 const listings=async()=>{
   // One indexed membership query, not one remote request per channel.
   const [channels,memberships]=await Promise.all([
     readList(TABLES.channels,[],100),readList(TABLES.members,[{attribute:'userId',value:user.$id}],100)
   ]);
   const membershipByChannel=new Map(memberships.map(m=>[m.channelId,m]));
   const result=[];
   for(const ch of channels){if(ch.isArchived)continue;const m=membershipByChannel.get(ch.$id);result.push({id:ch.$id,name:ch.name,description:ch.description,privacy:ch.privacy,createdByName:ch.createdByName,
     isCreator:owned(ch),membership:m?.status||'none',canRead:ch.privacy==='public'||admin||owned(ch)||m?.status==='approved',createdAt:ch.$createdAt});}
   return result.sort((a,b)=>a.name.localeCompare(b.name));
 };
 const official=async()=>{
   ensureUser();
   const notices=await readList(TABLES.announcements,[],100);
   const selected=notices.filter(n=>admin||owner&&['owners','both'].includes(n.audience)||officer&&['officers','both'].includes(n.audience));
   const alertRows=owner?await readList('outbreak_owner_notifications',[],100):await readList('disease_alerts',[],100);
   const a=alertRows.filter(x=>x.isActive).map(x=>({id:x.$id,title:x.title,body:x.message,category:x.isOutbreak?'outbreak':'advisory',audience:owner?'owners':'officers',priority:x.severity||'medium',date:x.issuedAt||x.$createdAt,barangay:x.barangay||'',isActive:true}));
   const n=selected.map(x=>({id:x.$id,title:x.title,body:x.body,category:'announcement',audience:x.audience,priority:'info',date:x.publishedAt||x.$createdAt,barangay:'',isActive:x.isActive}));
   return [...a,...n].filter(x=>admin||x.isActive).sort((x,y)=>String(y.date).localeCompare(String(x.date)));
 };
 const postsFor=async(ch)=>{
   await assertVisible(ch);
   const [posts,votes,comments,roles]=await Promise.all([
     readList(TABLES.posts,[{attribute:'channelId',value:ch.$id}],100),
     voteSummaries(ch.$id),
     readList(TABLES.comments,[{attribute:'channelId',value:ch.$id}],100),
     getStaffRoles()
   ]);
   const counts=new Map();for(const c of comments){counts.set(c.postId,(counts.get(c.postId)||0)+1);}
   return posts.sort((a,b)=>String(b.$createdAt).localeCompare(String(a.$createdAt))).map(p=>({...cleanPost(p,roles),...(votes.get('post:'+p.$id)||{score:0,upvotes:0,downvotes:0,myVote:0}),commentCount:counts.get(p.$id)||0}));
 };

 switch(action){
   case 'communityAvatarTokens':{
     // Public-facing author avatars are delivered as SHORT-LIVED LINKS, not by
     // exposing all profiles or making the media bucket publicly readable.
     // Every requested author must belong to a discussion, comment, or join
     // request that this user is entitled to see; the caller cannot enumerate
     // arbitrary user IDs or retrieve any profile's private fields.
     ensureUser();
     const refs=(key,max)=>{
       const values=data[key]||[];
       yes(Array.isArray(values)&&values.length<=max,`Too many ${key} requested.`,400);
       const unique=[...new Set(values.map(String))];
       yes(unique.every(x=>/^[a-zA-Z0-9._-]{1,36}$/.test(x)),`Invalid ${key} reference.`,400);
       return unique;
     };
     const postRefs=refs('postIds',40),commentRefs=refs('commentIds',40),membershipRefs=refs('membershipIds',30);
     yes(postRefs.length+commentRefs.length+membershipRefs.length<=70,'Too many avatar references.',400);
     const authors=new Set();
     if(data.includeSelf===true)authors.add(user.$id);
     const channelAccessCache=new Map();
     const visible=async(channelId)=>{
       if(!channelAccessCache.has(channelId))channelAccessCache.set(channelId,(async()=>{
         const ch=await getOrNull(TABLES.channels,channelId);
         return !!ch&&!ch.isArchived&&await canAccess(ch);
       })());
       return channelAccessCache.get(channelId);
     };
     // Ignore stale/deleted identifiers individually, without failing all avatars.
     await Promise.all(postRefs.map(async postId=>{
       const p=await getOrNull(TABLES.posts,postId);
       if(p&&!p.isDeleted&&await visible(p.channelId))authors.add(p.authorId);
     }));
     await Promise.all(commentRefs.map(async commentId=>{
       const c=await getOrNull(TABLES.comments,commentId);
       if(!c||c.isDeleted||!await visible(c.channelId))return;
       const p=await getOrNull(TABLES.posts,c.postId);
       if(p&&!p.isDeleted&&p.channelId===c.channelId)authors.add(c.authorId);
     }));
     await Promise.all(membershipRefs.map(async memberId=>{
       const m=await getOrNull(TABLES.members,memberId);
       if(!m)return;
       const ch=await getOrNull(TABLES.channels,m.channelId);
       if(ch&&!ch.isArchived&&(admin||owned(ch)))authors.add(m.userId);
     }));
     yes(authors.size<=70,'Avatar request too large.',400);
     const expire=new Date(Date.now()+5*60*1000).toISOString();
     const endpoint=process.env.APPWRITE_ENDPOINT||'https://sgp.cloud.appwrite.io/v1';
     const project=process.env.APPWRITE_PROJECT_ID||'6aeff5c9002718442fdf';
     const avatars={},warnings=new Set();
     // One inaccessible author's photo must not hide every other avatar.
     // Report only generic diagnostics; never expose private file IDs or fields.
     await Promise.all([...authors].map(async userId=>{
       try{
         const profile=await getOrNull('user_profiles',userId);
         const fileId=profile?.profileImageId;
         if(!fileId||!/^[a-zA-Z0-9._-]{1,36}$/.test(fileId))return;
         const file=await api('GET',`/storage/buckets/${id(MEDIA)}/files/${id(fileId)}`);
         if(!['image/jpeg','image/png','image/webp'].includes(file.mimeType))return;
         const base=`${endpoint}/storage/buckets/${id(MEDIA)}/files/${id(fileId)}/view?project=${encodeURIComponent(project)}`;
         // Already-public owner-approved photos work without creating tokens.
         if((file.$permissions||[]).includes('read("any")')){
           avatars[userId]=base;return;
         }
         const token=await api('POST',`/tokens/buckets/${id(MEDIA)}/files/${id(fileId)}`,{expire});
         if(!token?.secret){warnings.add('File token response was missing its secret');return;}
         avatars[userId]=`${base}&token=${encodeURIComponent(token.secret)}`;
       }catch(error){
         if(error.status!==404){
           warnings.add(error.status===401||error.status===403?'Avatar Function lacks file/token permissions':'Some stored avatar photos were unavailable');
         }
       }
     }));
     return {avatars,expiresAt:expire,warnings:[...warnings]};
   }
   case 'communityOverview': return {channels:await listings(),verified:await isVerified(),role:admin?'admin':officer?'officer':'owner',notices:await official()};
   case 'communityOfficialNotices':return {notices:await official()};
   case 'communityCreateChannel':{
     await requireVerified();const name=requireValue(data.name,80,'Channel name'),description=optional(data.description,300);
     const privacy=choice(data.privacy||'public',['public','private']);
     const existing=await readList(TABLES.channels,[],100);yes(existing.filter(x=>x.createdById===user.$id&&!x.isArchived).length<10,'You may own up to 10 channels.',409);
     yes(!existing.some(x=>x.name.toLowerCase()===name.toLowerCase()&&!x.isArchived),'A channel with this name already exists.',409);
     const ch=await create(TABLES.channels,'unique()',{name,description,privacy,createdById:user.$id,createdByName:user.name||'Member',isArchived:false});
     await create(TABLES.members,membershipId(ch.$id,user.$id),{channelId:ch.$id,userId:user.$id,userName:user.name||'Member',status:'approved',requestedAt:new Date().toISOString(),reviewedAt:new Date().toISOString()});
     return {id:ch.$id,name:ch.name};
   }
   case 'communitySetPrivacy':{
     await requireVerified();const ch=await get(TABLES.channels,requireValue(data.channelId,36));yes(owned(ch),'Only the channel creator can change its visibility.');
     const privacy=choice(data.privacy,['public','private']);await update(TABLES.channels,ch.$id,{privacy});return {privacy};
   }
   case 'communityRequestJoin':{
     yes(owner||officer,'Only Pet Owners or Field Officers can request community membership.');const ch=await get(TABLES.channels,requireValue(data.channelId,36));
     yes(ch.privacy==='private'&&!ch.isArchived,'Membership requests are only needed for active private channels.',409);
     yes(!owned(ch),'You already own this channel.',409);
     const m=await member(ch);yes(!m||m.status==='rejected','Your request is already pending or approved.',409);
     const payload={channelId:ch.$id,userId:user.$id,userName:user.name||'Member',status:'pending',requestedAt:new Date().toISOString()};
     if(m)await update(TABLES.members,m.$id,{...payload,reviewedAt:null});else await create(TABLES.members,membershipId(ch.$id,user.$id),payload);
     return {status:'pending'};
   }
   case 'communityJoinRequests':{
     yes(owner||officer||admin,'Only channel owners or moderators may review requests.');const ch=await get(TABLES.channels,requireValue(data.channelId,36));yes(admin||owned(ch),'Only the creator can review join requests.');
     const members=await readList(TABLES.members,[{attribute:'channelId',value:ch.$id}],100);
     return {requests:members.filter(x=>x.status==='pending').map(x=>({id:x.$id,userName:x.userName,userId:x.userId,requestedAt:x.requestedAt}))};
   }
   case 'communityReviewJoin':{
     yes(owner||officer||admin,'Only channel owners or moderators may review requests.');const ch=await get(TABLES.channels,requireValue(data.channelId,36));yes(admin||owned(ch),'Only the creator can review join requests.');
     const m=await get(TABLES.members,requireValue(data.membershipId,36));yes(m.channelId===ch.$id&&m.status==='pending','Membership request not pending.',409);
     const status=choice(data.status,['approved','rejected']);await update(TABLES.members,m.$id,{status,reviewedAt:new Date().toISOString()});return {status};
   }
   case 'communityChannel':{
     const ch=await get(TABLES.channels,requireValue(data.channelId,36));yes(!ch.isArchived,'Channel is archived.',409);
     const m=await member(ch);const canRead=ch.privacy==='public'||admin||owned(ch)||m?.status==='approved';
     return {channel:{id:ch.$id,name:ch.name,description:ch.description,privacy:ch.privacy,isCreator:owned(ch),membership:m?.status||'none',canRead},
       posts:canRead?await postsFor(ch):[],verified:await isVerified()};
   }
   case 'communityCreatePost':{
     await requireVerified();const ch=await get(TABLES.channels,requireValue(data.channelId,36));await assertVisible(ch);
     const title=requireValue(data.title,140,'Discussion title'),body=requireValue(data.body,5000,'Discussion');const ids=await validPostFiles(data.imageFileIds||[]);
     const rows=await readList(TABLES.posts,[{attribute:'channelId',value:ch.$id}],100);yes(rows.filter(p=>p.authorId===user.$id&&!p.isDeleted).length<100,'Posting limit reached for this channel.',429);
     const baseName=user.name||'Member';
     const authorName=admin?`${baseName.slice(0,115)} [Admin]`:officer?`${baseName.slice(0,108)} [Field Officer]`:baseName;
     const p=await create(TABLES.posts,'unique()',{channelId:ch.$id,authorId:user.$id,authorName,title,body,imageFileIds:JSON.stringify(ids),isDeleted:false});return {id:p.$id};
   }
   case 'communityDeletePost':{
     const p=await get(TABLES.posts,requireValue(data.postId,36));yes(p.authorId===user.$id||admin,'Only the author or CVO may remove this discussion.');await update(TABLES.posts,p.$id,{isDeleted:true,imageFileIds:'[]',body:'[Removed]'});return {deleted:true};
   }
   case 'communityComments':{
     const p=await get(TABLES.posts,requireValue(data.postId,36));const ch=await get(TABLES.channels,p.channelId);await assertVisible(ch);
     const [comments,votes,roles]=await Promise.all([readList(TABLES.comments,[{attribute:'postId',value:p.$id}],100),voteSummaries(ch.$id),getStaffRoles()]);
     return {post:cleanPost(p,roles),comments:comments.sort((a,b)=>String(a.$createdAt).localeCompare(String(b.$createdAt))).map(c=>({...cleanComment(c,roles),...(votes.get('comment:'+c.$id)||{score:0,upvotes:0,downvotes:0,myVote:0})}))};
   }
   case 'communityCreateComment':{
     await requireVerified();const p=await get(TABLES.posts,requireValue(data.postId,36));yes(!p.isDeleted,'This discussion is closed.',409);
     const ch=await get(TABLES.channels,p.channelId);await assertVisible(ch);
     const parentId=optional(data.parentCommentId,36);if(parentId){const parent=await get(TABLES.comments,parentId);yes(parent.postId===p.$id&&!parent.isDeleted,'Invalid reply target.',400);}
     const baseName=user.name||'Member';
     const authorName=admin?`${baseName.slice(0,115)} [Admin]`:officer?`${baseName.slice(0,108)} [Field Officer]`:baseName;
     const body=requireValue(data.body,2000,'Comment');const c=await create(TABLES.comments,'unique()',{channelId:ch.$id,postId:p.$id,parentCommentId:parentId,authorId:user.$id,authorName,body,isDeleted:false});return {id:c.$id};
   }
   case 'communityDeleteComment':{
     const c=await get(TABLES.comments,requireValue(data.commentId,36));yes(c.authorId===user.$id||admin,'Only the author or CVO may remove this comment.');await update(TABLES.comments,c.$id,{isDeleted:true,body:'[Removed]'});return {deleted:true};
   }
   case 'communityVote':{
     await requireVerified();const type=choice(data.targetType,['post','comment']);const value=Number(data.value);yes(value===1||value===-1,'Vote must be +1 or -1.',400);
     const target=await get(type==='post'?TABLES.posts:TABLES.comments,requireValue(data.targetId,36));const ch=await get(TABLES.channels,target.channelId);await assertVisible(ch);
     yes(!target.isDeleted,'Cannot vote on removed content.',409);
     const rowId=voteId(type,target.$id,user.$id);const existing=await getOrNull(TABLES.votes,rowId);let result=0;
     if(existing?.value===value){await remove(TABLES.votes,rowId);}else if(existing){await update(TABLES.votes,rowId,{value});result=value;}
     else{await create(TABLES.votes,rowId,{channelId:ch.$id,targetType:type,targetId:target.$id,userId:user.$id,value});result=value;}
     return {myVote:result};
   }
   case 'communityImageToken':{
     const p=await get(TABLES.posts,requireValue(data.postId,36));yes(!p.isDeleted,'Image no longer available.',404);
     const ch=await get(TABLES.channels,p.channelId);await assertVisible(ch);
     const fileId=requireValue(data.fileId,36);yes(jsonArray(p.imageFileIds).includes(fileId),'Image does not belong to this discussion.',403);
     const expire=new Date(Date.now()+5*60*1000).toISOString();const token=await api('POST',`/tokens/buckets/${id(MEDIA)}/files/${id(fileId)}`,{expire});
     return {url:`${process.env.APPWRITE_ENDPOINT||'https://sgp.cloud.appwrite.io/v1'}/storage/buckets/${id(MEDIA)}/files/${id(fileId)}/view?project=${encodeURIComponent(process.env.APPWRITE_PROJECT_ID||'6aeff5c9002718442fdf')}&token=${encodeURIComponent(token.secret)}`,expiresAt:expire};
   }
   case 'communitySearch':{
     const term=requireValue(data.query,80,'Search term').toLowerCase();yes(term.length>=2,'Enter at least two characters.',400);
     const [channels,p,roles]=await Promise.all([listings(),readList(TABLES.posts,[],100),getStaffRoles()]);
     const allowed=new Map(channels.filter(c=>c.canRead).map(c=>[c.id,c]));
     const posts=p.filter(x=>!x.isDeleted&&allowed.has(x.channelId)&&[x.title,x.body].some(t=>String(t||'').toLowerCase().includes(term))).slice(0,30).map(x=>({...cleanPost(x,roles),channelName:allowed.get(x.channelId).name}));
     return {channels:channels.filter(x=>(x.name+' '+x.description).toLowerCase().includes(term)),posts};
   }
   case 'communityPublishAnnouncement':{
     yes(admin,'Only CVO Administrators may publish official announcements.');const title=requireValue(data.title,140,'Announcement title'),body=requireValue(data.body,2000,'Announcement');
     const audience=choice(data.audience,['owners','officers','both']);const n=await create(TABLES.announcements,'unique()',{title,body,audience,isActive:true,issuedById:user.$id,publishedAt:new Date().toISOString()});return {id:n.$id,audience};
   }
   case 'communityDeactivateAnnouncement':{
     yes(admin,'Only CVO Administrators may deactivate announcements.');const n=await get(TABLES.announcements,requireValue(data.announcementId,36));await update(TABLES.announcements,n.$id,{isActive:false});return {isActive:false};
   }
   default:bad(400,'Unsupported Community action.');
 }
}
