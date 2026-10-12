const SHEET_ID="1SL3XZqx5KBbCqUyPcN62YuGSnctC7SHGdHI43aFFs24";
const SHEET_GID="1943463274";
const endpoint=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}&range=A2:H`;

let cards=[];
let mobilePage=0;
let mobilePageCount=0;
let touchStartX=0;
let touchStartY=0;
let visibleCards=[];
let currentModalIndex=-1;
let wishlistOnly=false;
let ownedFilter=null; // null, 'owned', or 'unowned'
let selectionMode=null; // null, 'wishlist', or 'owned'
const $=id=>document.getElementById(id);
const WISHLIST_KEY="aikatsuEncoreWishlist";
const OWNED_KEY="aikatsuEncoreOwned";
function readWishlist(){
  try{return new Set(JSON.parse(localStorage.getItem(WISHLIST_KEY)||"[]").map(String));}
  catch(e){return new Set();}
}
function readOwnedCounts(){
  try{
    const raw=JSON.parse(localStorage.getItem(OWNED_KEY)||"[]");
    if(Array.isArray(raw))return new Map(raw.map(id=>[String(id),1]));
    return new Map(Object.entries(raw||{}).map(([id,count])=>[String(id),Math.max(0,Number(count)||0)]).filter(([,count])=>count>0));
  }catch(e){return new Map();}
}
let wishlist=readWishlist();
let ownedCounts=readOwnedCounts();
function saveWishlist(){
  try{localStorage.setItem(WISHLIST_KEY,JSON.stringify([...wishlist]));}catch(e){}
}
function saveOwnedCounts(){
  try{localStorage.setItem(OWNED_KEY,JSON.stringify(Object.fromEntries(ownedCounts)));}catch(e){}
}
function cardKey(card){return String(card.id??"").trim();}
function ownedCount(card){return ownedCounts.get(cardKey(card))||0;}
function isOwned(card){return ownedCount(card)>0;}
function isWishlisted(card){return wishlist.has(cardKey(card));}
function seasonForId(id){
  const value=String(id??"").trim().toUpperCase();
  if(value.startsWith("EP"))return "프로모션";
  const match=value.match(/^E([0-9]+)/);
  return match?Number(match[1])+"탄":"기타";
}

function esc(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function normalize(v){
  return String(v??"").normalize("NFKC").replace(/\s+/g,"").trim().toLowerCase();
}

function isAccessory(card){
  return normalize(card.type)==="악세서리" || normalize(card.category)==="악세서리";
}

function hasImageUrl(value){
  return typeof value==="string" && value.trim()!=="";
}

async function loadData(){
  try{
    const res=await fetch(endpoint);
    if(!res.ok) throw new Error("Google Sheets 응답 오류: "+res.status);
    const text=await res.text();
    const json=JSON.parse(text.substring(text.indexOf("{"),text.lastIndexOf("}")+1));
    cards=(json.table.rows||[]).map(r=>{
      const c=r.c||[];
      const v=i=>c[i]?.v??"";
      return {id:v(0),category:v(1),type:v(2),grade:v(3),nameJa:v(4),nameKo:v(5),front:v(6),back:v(7)};
    // ID가 있어도 앞면과 뒷면 이미지가 모두 있는 카드만 사이트에 표시합니다.
    }).filter(x=>hasImageUrl(x.front) && hasImageUrl(x.back));
    buildFilters();
    updateCollectionCount();
    render();
    $("loading").hidden=true;
  }catch(e){
    $("loading").hidden=true;
    $("error").hidden=false;
    $("error").textContent="데이터를 불러오지 못했습니다. Google Sheets 공유 설정과 이미지 URL을 확인해주세요. ("+e.message+")";
  }
}

function fillSelect(id,values,order=[]){
  const el=$(id), first=el.options[0];
  el.innerHTML="";
  el.appendChild(first);
  const rank=value=>{
    const normalized=normalize(value);
    // '액세서리'와 기존 시트의 표기 '악세서리'를 같은 마지막 순서로 취급합니다.
    const key=normalized==="악세서리"?"액세서리":normalized;
    return order.findIndex(item=>normalize(item)===key);
  };
  [...new Set(values.filter(Boolean).map(String))].sort((a,b)=>{
    const ra=rank(a),rb=rank(b);
    if(ra!==-1||rb!==-1){
      if(ra===-1)return 1;
      if(rb===-1)return -1;
      if(ra!==rb)return ra-rb;
    }
    return a.localeCompare(b,"ko");
  }).forEach(v=>{
    const o=document.createElement("option");
    o.value=v;o.textContent=v;el.appendChild(o);
  });
}
function buildFilters(){
  fillSelect("category",cards.map(x=>x.category),["풀코디","상의","하의","원피스","슈즈","액세서리"]);
  buildCoordinateOptions();
  // 시트의 실제 표기인 '큐트'와 '큐티'를 같은 항목으로 인식해 지정 순서로 정렬합니다.
  const typeOrder=["큐트","큐티","쿨","섹시","팝"];
  const typeValues=[...new Set(cards.map(x=>String(x.type??"")).filter(v=>v.trim()))];
  const canonicalType=value=>{
    const key=normalize(value);
    if(key==="큐트"||key==="큐티")return "큐트";
    return key;
  };
  const typeRank=value=>typeOrder.findIndex(item=>canonicalType(item)===canonicalType(value));
  const typeSelect=$("type"), typeFirst=typeSelect.options[0];
  typeSelect.innerHTML="";
  typeSelect.appendChild(typeFirst);
  typeValues.sort((a,b)=>{
    const ra=typeRank(a), rb=typeRank(b);
    if(ra===-1 && rb===-1)return a.localeCompare(b,"ko");
    if(ra===-1)return 1;
    if(rb===-1)return -1;
    return ra-rb;
  }).forEach(v=>{
    const option=document.createElement("option");
    option.value=v;
    option.textContent=v;
    typeSelect.appendChild(option);
  });
  fillSelect("grade",cards.map(x=>x.grade),["ER","PR","R","N"]);
  const seasonValues=[...new Set(cards.map(x=>seasonForId(x.id)))];
  const seasonOrder=(a,b)=>{
    if(a==="프로모션")return b==="프로모션"?0:1;
    if(b==="프로모션")return -1;
    if(a==="기타")return 1;
    if(b==="기타")return -1;
    return Number.parseInt(a,10)-Number.parseInt(b,10);
  };
  const seasonSelect=$("season");
  const seasonFirst=seasonSelect.options[0];
  seasonSelect.innerHTML="";
  seasonSelect.appendChild(seasonFirst);
  seasonValues.sort(seasonOrder).forEach(value=>{
    const option=document.createElement("option");
    option.value=value;option.textContent=value;seasonSelect.appendChild(option);
  });
}


const COORDINATE_KEY="aikatsuEncoreSavedCoordinates";
const coordinateSlots=[
  {select:"coordinateTop",picker:"coordinateTopPicker",options:"coordinateTopOptions",preview:"coordinateTopPreview",category:"상의",placeholder:"상의 카드를 선택해 주세요"},
  {select:"coordinateBottom",picker:"coordinateBottomPicker",options:"coordinateBottomOptions",preview:"coordinateBottomPreview",category:"하의",placeholder:"하의 카드를 선택해 주세요"},
  {select:"coordinateShoes",picker:"coordinateShoesPicker",options:"coordinateShoesOptions",preview:"coordinateShoesPreview",category:"슈즈",placeholder:"슈즈 카드를 선택해 주세요"},
  {select:"coordinateAccessory",picker:"coordinateAccessoryPicker",options:"coordinateAccessoryOptions",preview:"coordinateAccessoryPreview",category:"액세서리",placeholder:"액세서리 카드를 선택해 주세요"}
];
let savedCoordinates=readSavedCoordinates();
function readSavedCoordinates(){
  try{const data=JSON.parse(localStorage.getItem(COORDINATE_KEY)||"[]");return Array.isArray(data)?data:[];}
  catch(e){return [];}
}
function persistSavedCoordinates(){
  try{localStorage.setItem(COORDINATE_KEY,JSON.stringify(savedCoordinates));}catch(e){}
}
function coordinateCategoryMatches(card,category){
  const actual=normalize(card.category);
  if(category==="상의")return actual==="상의"||actual==="원피스";
  if(category==="액세서리")return actual==="액세서리"||actual==="악세서리";
  return actual===normalize(category);
}
function isOnePiece(card){
  return !!card&&normalize(card.category)==="원피스";
}
function buildCoordinateOptions(){
  coordinateSlots.forEach(slot=>{
    const list=$(slot.options);
    list.innerHTML="";
    const none=document.createElement("button");
    none.type="button";
    none.className="coordinate-option coordinate-option-none";
    none.innerHTML='<span class="coordinate-option-name">선택 없음</span>';
    none.addEventListener("click",()=>{
      const previousTop=getCoordinateCard(coordinateSlots[0]);
      slot.selected="";
      if(slot.category==="상의"&&isOnePiece(previousTop))coordinateSlots[1].selected="";
      if(slot.category==="하의"&&isOnePiece(previousTop))coordinateSlots[0].selected="";
      coordinateSlots.forEach(other=>{
        const card=getCoordinateCard(other);
        updateCoordinatePicker(other,card);
        renderCoordinatePreview(other);
        $(other.options).hidden=true;
        $(other.picker).setAttribute("aria-expanded","false");
      });
    });
    list.appendChild(none);
    cards.filter(card=>coordinateCategoryMatches(card,slot.category))
      .sort((a,b)=>String(a.id).localeCompare(String(b.id),"ko",{numeric:true}))
      .forEach(card=>{
        const option=document.createElement("button");
        option.type="button";
        option.className="coordinate-option";
        option.innerHTML=`<img class="${isAccessory(card)?"coordinate-accessory-thumb":""}" src="${esc(card.front)}" alt="" loading="lazy">
          <span class="coordinate-option-name">${esc(card.nameKo||card.nameJa||"이름 없음")}</span>`;
        option.addEventListener("click",()=>{
          if(slot.category==="상의"&&isOnePiece(card))coordinateSlots[1].selected="";
          if(slot.category==="하의"&&isOnePiece(getCoordinateCard(coordinateSlots[0])))coordinateSlots[0].selected="";
          slot.selected=cardKey(card);
          coordinateSlots.forEach(other=>{
            updateCoordinatePicker(other,getCoordinateCard(other));
            renderCoordinatePreview(other);
            $(other.options).hidden=true;
            $(other.picker).setAttribute("aria-expanded","false");
          });
        });
        list.appendChild(option);
      });
    $(slot.picker).addEventListener("click",()=>{
      const open=$(slot.picker).getAttribute("aria-expanded")==="true";
      coordinateSlots.forEach(other=>{
        $(other.options).hidden=true;
        $(other.picker).setAttribute("aria-expanded","false");
      });
      list.hidden=open;
      $(slot.picker).setAttribute("aria-expanded",String(!open));
    });
  });
  coordinateSlots.forEach(slot=>{
    slot.selected="";
    updateCoordinatePicker(slot,null);
    renderCoordinatePreview(slot);
  });
  renderSavedCoordinates();
}
function getCoordinateCard(slot){
  return cards.find(item=>cardKey(item)===String(slot.selected||""))||null;
}
function updateCoordinatePicker(slot,card){
  const picker=$(slot.picker);
  const topCard=getCoordinateCard(coordinateSlots[0]);
  if(slot.category==="하의"&&isOnePiece(topCard)){
    picker.innerHTML='<span class="coordinate-picker-current coordinate-picker-unavailable">선택 불가</span><span>⌄</span>';
    picker.setAttribute("aria-label","원피스 선택 중: 하의를 선택하면 원피스가 해제됩니다");
    return;
  }
  picker.removeAttribute("aria-label");
  if(card){
    picker.innerHTML=`<span class="coordinate-picker-current"><img class="${isAccessory(card)?"coordinate-accessory-thumb":""}" src="${esc(card.front)}" alt="">${esc(card.nameKo||card.nameJa||"이름 없음")}</span><span>⌄</span>`;
  }else picker.innerHTML=`<span class="coordinate-picker-current">선택 없음</span><span>⌄</span>`;
}
function renderCoordinatePreview(slot){
  const preview=$(slot.preview),card=getCoordinateCard(slot);
  if(!card){
    const unavailable=slot.category==="하의"&&isOnePiece(getCoordinateCard(coordinateSlots[0]));
    preview.className="coordinate-preview empty"+(unavailable?" unavailable":" no-selection");
    preview.innerHTML=unavailable
      ? `<div class="coordinate-placeholder-image" aria-hidden="true">X</div><div class="coordinate-card-name">선택 불가</div>`
      : `<div class="coordinate-placeholder-image" aria-hidden="true"></div><div class="coordinate-card-name">${esc(slot.category+" 선택 없음")}</div>`;
    return;
  }
  preview.className="coordinate-preview";
  const accessory=isAccessory(card);
  preview.innerHTML=`${accessory
    ? `<div class="coordinate-image-frame coordinate-accessory-frame"><img class="coordinate-card-image coordinate-accessory-image" src="${esc(card.front)}" alt="${esc(card.nameKo||card.nameJa||slot.category)}"></div>`
    : `<img class="coordinate-card-image" src="${esc(card.front)}" alt="${esc(card.nameKo||card.nameJa||slot.category)}">`}
    <div class="coordinate-card-name">${esc(card.nameKo||card.nameJa||"이름 없음")}</div>`;
}
function currentCoordinateIds(){
  return coordinateSlots.map(slot=>String(slot.selected||""));
}
function applyCoordinateIds(ids){
  coordinateSlots.forEach((slot,index)=>{slot.selected=String(ids?.[index]||"");});
  if(isOnePiece(getCoordinateCard(coordinateSlots[0])))coordinateSlots[1].selected="";
  coordinateSlots.forEach(slot=>{
    updateCoordinatePicker(slot,getCoordinateCard(slot));
    renderCoordinatePreview(slot);
  });
}
function renderSavedCoordinates(){
  const list=$("savedCoordinateList");
  list.innerHTML="";
  if(!savedCoordinates.length){
    list.innerHTML='<p class="saved-coordinate-empty">아직 저장한 코디가 없어요.</p>';
    return;
  }
  savedCoordinates.forEach((outfit,index)=>{
    const article=document.createElement("article");
    article.className="saved-coordinate";
    const title=document.createElement("button");
    title.type="button";
    title.className="saved-coordinate-title";
    const ownedSlots=outfit.ids.filter(id=>{const card=cards.find(item=>cardKey(item)===String(id));return card&&isOwned(card);}).length;
    const chosenSlots=outfit.ids.filter(Boolean).length;
    title.innerHTML=`<span class="saved-coordinate-name">${esc(outfit.name||("코디 "+(index+1)))}</span><span class="saved-coordinate-meta"> (${ownedSlots}/${chosenSlots} 보유) <span class="saved-coordinate-edit-hint">눌러서 코디 이름 변경 가능</span></span>`;
    title.addEventListener("click",()=>{
      const next=prompt("코디 이름을 변경해 주세요.",outfit.name||("코디 "+(index+1)));
      if(next===null)return;
      const trimmed=next.trim();
      outfit.name=trimmed||("코디 "+(index+1));
      persistSavedCoordinates();
      renderSavedCoordinates();
    });
    const cardsRow=document.createElement("div");
    cardsRow.className="saved-coordinate-cards";
    outfit.ids.forEach((id,i)=>{
      const card=cards.find(item=>cardKey(item)===String(id));
      const item=document.createElement("div");
      item.className="saved-coordinate-card";
      if(card){
        item.innerHTML=`${isAccessory(card)
          ? `<div class="saved-coordinate-image-frame coordinate-accessory-frame"><img src="${esc(card.front)}" alt="${esc(card.nameKo||card.nameJa||"카드")}" class="coordinate-accessory-image ${isOwned(card)?"":"unowned-image"}"></div>`
          : `<img src="${esc(card.front)}" alt="${esc(card.nameKo||card.nameJa||"카드")}" class="${isOwned(card)?"":"unowned-image"}">`}<span>${esc(card.nameKo||card.nameJa||"이름 없음")}</span>`;
      }else item.innerHTML='<div class="saved-coordinate-image-frame saved-coordinate-empty-image" aria-label="선택 없음"></div><span>선택 없음</span>';
      cardsRow.appendChild(item);
    });
    const actions=document.createElement("div");
    actions.className="saved-coordinate-actions";
    const load=document.createElement("button");
    load.type="button";load.textContent="불러오기";
    load.addEventListener("click",()=>applyCoordinateIds(outfit.ids));
    const del=document.createElement("button");
    del.type="button";del.className="delete-coordinate";del.textContent="삭제";
    del.addEventListener("click",()=>{
      savedCoordinates.splice(index,1);persistSavedCoordinates();renderSavedCoordinates();
    });
    actions.append(load,del);
    article.append(title,cardsRow,actions);
    list.appendChild(article);
  });
}
function setView(view){
  const isCoordinate=view==="coordinate";
  const isPrevious=view==="previous";
  try{localStorage.setItem("aikatsuEncoreCurrentView",view);}catch(e){}
  $("controls").hidden=isCoordinate||isPrevious;
  $("mainContent").hidden=isCoordinate||isPrevious;
  $("coordinateView").hidden=!isCoordinate;
  $("previousSeriesView").hidden=!isPrevious;
  $("pageActionBar").hidden=isCoordinate||isPrevious;
  $("cardListTab").classList.toggle("active",!isCoordinate&&!isPrevious);
  $("cardListTab").setAttribute("aria-selected",String(!isCoordinate&&!isPrevious));
  $("previousSeriesTab").classList.toggle("active",isPrevious);
  $("previousSeriesTab").setAttribute("aria-selected",String(isPrevious));
  $("coordinateTab").classList.toggle("active",isCoordinate);
  $("coordinateTab").setAttribute("aria-selected",String(isCoordinate));
  if(isCoordinate)renderSavedCoordinates();
  if(isPrevious)loadPreviousCards();
}

const PREVIOUS_DB_NAME="aikatsuEncorePreviousCards";
const PREVIOUS_DB_STORE="cards";
let previousCategory="상의";
let previousType="큐트";
let previousCards=[];
let editingPreviousCardId=null;
let previousImageUrls=[];
function openPreviousCardsDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(PREVIOUS_DB_NAME,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(PREVIOUS_DB_STORE))request.result.createObjectStore(PREVIOUS_DB_STORE,{keyPath:"id"});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("저장소를 열 수 없어요."));
  });
}
async function loadPreviousCards(){
  try{
    const db=await openPreviousCardsDB();
    const cardsPromise=new Promise((resolve,reject)=>{
      const tx=db.transaction(PREVIOUS_DB_STORE,"readonly");
      const request=tx.objectStore(PREVIOUS_DB_STORE).getAll();
      request.onsuccess=()=>resolve(request.result||[]);
      request.onerror=()=>reject(request.error);
    });
    previousCards=await cardsPromise;
    db.close();
    previousCards.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    renderPreviousCards();
  }catch(error){
    $("previousSeriesGrid").innerHTML='<p class="previous-series-empty">이 브라우저에서는 카드 저장 기능을 사용할 수 없어요.</p>';
  }
}
async function savePreviousCard(card){
  const db=await openPreviousCardsDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(PREVIOUS_DB_STORE,"readwrite");
    tx.objectStore(PREVIOUS_DB_STORE).put(card);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||new Error("저장에 실패했어요."));
  });
  db.close();
}
async function deletePreviousCard(id){
  const db=await openPreviousCardsDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(PREVIOUS_DB_STORE,"readwrite");
    tx.objectStore(PREVIOUS_DB_STORE).delete(id);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||new Error("삭제에 실패했어요."));
  });
  db.close();
}
let previousPreviewObjectUrl=null;
function setPreviousImagePreview(source){
  const preview=$("previousImagePreview");
  if(previousPreviewObjectUrl){
    URL.revokeObjectURL(previousPreviewObjectUrl);
    previousPreviewObjectUrl=null;
  }
  if(source instanceof Blob){
    previousPreviewObjectUrl=URL.createObjectURL(source);
    preview.src=previousPreviewObjectUrl;
    preview.hidden=false;
  }else if(typeof source==="string"&&source.trim()){
    preview.src=source;
    preview.hidden=false;
  }else{
    preview.removeAttribute("src");
    preview.hidden=true;
  }
}
function renderPreviousCards(){
  previousImageUrls.forEach(url=>URL.revokeObjectURL(url));
  previousImageUrls=[];
  $("previousCardCount").textContent=previousCards.length+"장";
  const grid=$("previousSeriesGrid");
  if(!previousCards.length){
    grid.innerHTML='<p class="previous-series-empty">아직 등록한 카드가 없어요.</p>';
    return;
  }
  grid.innerHTML="";
  const categoryOrder=["상의","하의","원피스","슈즈","액세서리","악세서리"];
  const orderedCards=[...previousCards].sort((a,b)=>{
    const numberA=String(a.number||"").trim();
    const numberB=String(b.number||"").trim();
    if(numberA&&numberB){
      const byNumber=numberA.localeCompare(numberB,"ko",{numeric:true,sensitivity:"base"});
      if(byNumber!==0)return byNumber;
    }else if(numberA||numberB){
      return numberA?-1:1;
    }
    const categoryName=value=>value==="악세서리"?"액세서리":value;
    const ra=categoryOrder.indexOf(categoryName(a.category));
    const rb=categoryOrder.indexOf(categoryName(b.category));
    const rankA=ra<0?categoryOrder.length:ra;
    const rankB=rb<0?categoryOrder.length:rb;
    return rankA-rankB || (b.createdAt||0)-(a.createdAt||0);
  });
  orderedCards.forEach(card=>{
    const article=document.createElement("article");
    article.className="previous-series-card";
    const image=document.createElement("img");
    image.className="previous-series-card-image";
    if(["액세서리","악세서리"].includes(card.category))image.classList.add("previous-accessory-card-image");
    image.alt=card.name;
    // 외부 사이트의 핫링크 차단을 피하도록 Referer를 보내지 않습니다.
    image.referrerPolicy="no-referrer";
    if(card.image instanceof Blob){
      const url=URL.createObjectURL(card.image);
      previousImageUrls.push(url);
      image.src=url;
    }else{
      image.src=card.imageUrl||"";
    }
    image.onerror=()=>{image.alt="이미지를 불러올 수 없어요";image.removeAttribute("src");};
    const info=document.createElement("div");
    info.className="previous-series-card-info";
    const number=document.createElement("div");
    number.className="previous-series-card-number";
    number.textContent=card.number?("번호 "+card.number):"번호 미등록";
    const name=document.createElement("div");
    name.className="previous-series-card-name";
    name.textContent=card.name;
    const category=document.createElement("span");
    category.className="previous-series-card-category";
    category.textContent=card.category;
    const type=document.createElement("span");
    type.className="previous-series-card-type";
    type.textContent=card.type||"타입 미등록";
    const actions=document.createElement("div");
    actions.className="previous-series-actions";
    const edit=document.createElement("button");
    edit.type="button";
    edit.className="previous-series-edit";
    edit.textContent="수정";
    edit.setAttribute("aria-label",card.name+" 수정");
    edit.addEventListener("click",()=>startEditingPreviousCard(card.id));
    const remove=document.createElement("button");
    remove.type="button";
    remove.className="previous-series-delete";
    remove.textContent="×";
    remove.setAttribute("aria-label",card.name+" 삭제");
    remove.addEventListener("click",async()=>{
      if(!confirm("「"+card.name+"」 카드를 삭제할까요?"))return;
      try{
        await deletePreviousCard(card.id);
        previousCards=previousCards.filter(item=>item.id!==card.id);
        if(editingPreviousCardId===card.id)resetPreviousCardForm();
        renderPreviousCards();
      }catch(error){alert("카드를 삭제하지 못했어요.");}
    });
    info.append(number,name,category,type);
    actions.append(edit,remove);
    const imageFrame=document.createElement("div");
    imageFrame.className="previous-series-card-image-frame";
    imageFrame.appendChild(image);
    article.append(imageFrame,info,actions);
    grid.appendChild(article);
  });
}
function filtered(){
  const q=$( "search").value.trim().toLowerCase();
  const cat=$("category").value,type=$("type").value,grade=$("grade").value,season=$("season").value;
  return cards.filter(x=>
    (!q||[x.id,x.category,x.type,x.grade,x.nameJa,x.nameKo].some(v=>String(v).toLowerCase().includes(q)))&&
    (!cat||x.category===cat)&&(!type||x.type===type)&&(!grade||x.grade===grade)&&
    (!season||seasonForId(x.id)===season)&&(!wishlistOnly||isWishlisted(x))&&
    (!ownedFilter||(ownedFilter==="owned"?isOwned(x):!isOwned(x)))
  );
}

function updateCollectionCount(){
  const totalCopies=cards.reduce((sum,card)=>sum+ownedCount(card),0);
  const kinds=cards.filter(isOwned).length;
  $("collectionCount").textContent=`보유 ${totalCopies}장 · ${kinds}종 / 전체 ${cards.length}종`;
}
function render(){
  const grid=$("grid");
  grid.innerHTML="";
  mobilePage=0;
  // 기존 카드 목록의 순서는 유지하고, 탄/프로모션 또는 타입이 바뀔 때만 새 행을 시작합니다.
  const list=filtered();
  visibleCards=list;
  let previousListType=null;
  let previousListSeason=null;
  const canonicalType=value=>{
    const key=normalize(value);
    return key==="큐트"||key==="큐티"?"큐트":key;
  };

  list.forEach((card,index)=>{
    if(index%4===0){
      const page=document.createElement("div");
      page.className="card-page";
      grid.appendChild(page);
    }
    const page=grid.lastElementChild;
    const el=document.createElement("article");
    el.className="card"+(isOwned(card)?" owned-card":" unowned-card");
    const listType=canonicalType(card.type);
    const listSeason=seasonForId(card.id);
    if(index===0||listSeason!==previousListSeason||listType!==previousListType)el.classList.add("card-type-row-start");
    previousListType=listType;
    previousListSeason=listSeason;
    const accessory=isAccessory(card);
    const heart=isWishlisted(card);
    el.innerHTML=`<div class="card-image${accessory?" accessory-card":""}">
      <img src="${esc(card.front)}" alt="${esc(card.nameKo)}" loading="lazy">
      <button class="card-heart${heart?" active":""}" type="button" aria-label="${heart?"위시리스트 해제":"위시리스트 체크"}" aria-pressed="${heart}" title="위시리스트 체크">${heart?"♥":"♡"}</button>
      <span class="card-season">${esc(seasonForId(card.id))}</span>
      ${ownedCount(card)>0?`<span class="owned-quantity">X${ownedCount(card)}</span>`:""}
    </div><div class="card-name">${esc(card.nameKo||card.nameJa||"이름 없음")}</div><div class="card-id">ID : ${esc(card.id)}</div>
`;
    const quickWishlist=()=>toggleWishlist(card);
    el.querySelector(".card-heart").addEventListener("click",event=>{
      event.stopPropagation();
      quickWishlist();
    });
    el.addEventListener("click",event=>{
      if(event.target.closest(".card-heart"))return;
      if(selectionMode && event.target.closest(".card-image, .card-name")){
        event.stopPropagation();
        if(selectionMode==="wishlist"){
          toggleWishlist(card);
        }else if(selectionMode==="owned"){
          const imageArea=event.target.closest(".card-image");
          if(imageArea){
            const rect=imageArea.getBoundingClientRect();
            const isUpperHalf=event.clientY < rect.top + rect.height / 2;
            changeOwnedCount(card,isUpperHalf?1:-1);
          }else{
            addOwnedCopy(card);
          }
        }
        return;
      }
      openModal(card);
    });
    page.appendChild(el);
  });

  mobilePageCount=Math.ceil(list.length/4);
  updateMobilePager();
  $("wishlistOnly").classList.toggle("active",wishlistOnly);
  $("wishlistOnly").setAttribute("aria-pressed",String(wishlistOnly));
  $("wishlistOnly").textContent=wishlistOnly?"♥ 위시리스트 보기 중":"♡ 위시리스트만 보기";
  $("ownedOnly").classList.toggle("active",ownedFilter==="owned");
  $("ownedOnly").setAttribute("aria-pressed",String(ownedFilter==="owned"));
  $("unownedOnly").classList.toggle("active",ownedFilter==="unowned");
  $("unownedOnly").setAttribute("aria-pressed",String(ownedFilter==="unowned"));
  updateSelectionModeUI();
}
function setSelectionMode(mode){
  selectionMode=selectionMode===mode?null:mode;
  updateSelectionModeUI();
}
function updateSelectionModeUI(){
  const wishlistButton=$("pageWishlistMode");
  const ownedButton=$("pageOwnedMode");
  if(!wishlistButton||!ownedButton)return;
  wishlistButton.classList.toggle("active",selectionMode==="wishlist");
  ownedButton.classList.toggle("active",selectionMode==="owned");
  wishlistButton.setAttribute("aria-pressed",String(selectionMode==="wishlist"));
  ownedButton.setAttribute("aria-pressed",String(selectionMode==="owned"));
  wishlistButton.textContent=selectionMode==="wishlist"?"♥ 위시리스트 체크 중":"♡ 위시리스트 체크";
  ownedButton.textContent=selectionMode==="owned"?"＋ 보유 체크 중":"＋ 보유 체크";
  $("pageActionHint").textContent=selectionMode==="wishlist"
    ?"카드 이미지 또는 이름을 눌러 위시리스트를 등록/해제하세요."
    :selectionMode==="owned"
      ?"카드 이미지 위쪽을 누르면 +1장, 아래쪽을 누르면 −1장 (0장 아래로는 내려가지 않아요). 카드 이름은 +1장입니다."
      :"원하는 작업 버튼을 선택한 뒤 카드 이미지 또는 이름을 눌러주세요.";
}
function toggleWishlist(card){
  const key=cardKey(card);
  if(wishlist.has(key))wishlist.delete(key);else wishlist.add(key);
  saveWishlist();
  updateCollectionCount();
  const wasModalOpen=!$("modal").hidden;
  render();
  if(wasModalOpen){
    const index=visibleCards.findIndex(item=>cardKey(item)===key);
    if(index<0){closeModal();return;}
    currentModalIndex=index;
    populateModal(visibleCards[index]);
  }
}
function changeOwnedCount(card,delta){
  const key=cardKey(card);
  const next=Math.max(0,ownedCount(card)+delta);
  if(next===0)ownedCounts.delete(key);else ownedCounts.set(key,next);
  saveOwnedCounts();
  updateCollectionCount();
  const wasModalOpen=!$("modal").hidden;
  render();
  if(wasModalOpen){
    const index=visibleCards.findIndex(item=>cardKey(item)===key);
    if(index>=0){currentModalIndex=index;populateModal(visibleCards[index]);}
  }
}
function addOwnedCopy(card){changeOwnedCount(card,1);}
function setOwnedCount(card,count){
  const key=cardKey(card);
  const next=Math.max(0,Number(count)||0);
  if(next===0)ownedCounts.delete(key);else ownedCounts.set(key,next);
  saveOwnedCounts();
  updateCollectionCount();
  render();
  const index=visibleCards.findIndex(item=>cardKey(item)===key);
  if(index>=0){currentModalIndex=index;populateModal(visibleCards[index]);}
}

function updateMobilePager(){
  const grid=$("grid");
  grid.classList.remove("book-mode");
  const pager=document.querySelector(".book-pager");
  if(pager)pager.hidden=true;
}

function goPage(delta){
  // 카드 목록은 모든 화면에서 한 번에 4열로 표시합니다.
}

function openModal(card){
  visibleCards=filtered();
  currentModalIndex=visibleCards.findIndex(item=>cardKey(item)===cardKey(card));
  if(currentModalIndex<0){visibleCards=[card];currentModalIndex=0;}
  populateModal(card);
  $("modal").hidden=false;
  document.body.style.overflow="hidden";
}
function populateModal(card){
  $("detailFront").src=card.front||"";
  $("detailBack").src=card.back||"";
  $("detailFront").classList.remove("accessory-detail");
  $("detailBack").classList.remove("accessory-detail");
  $("detailKo").textContent=card.nameKo||"";
  $("detailJa").textContent=card.nameJa||"";
  $("detailWishlistHeart").textContent=isWishlisted(card)?"♥":"♡";
  $("detailWishlistHeart").classList.toggle("active",isWishlisted(card));
  $("detailWishlistHeart").setAttribute("aria-pressed",String(isWishlisted(card)));
  $("ownedCountValue").textContent=String(ownedCount(card));
  $("ownedMinus").disabled=ownedCount(card)<=0;
  $("detailId").textContent=card.id||"";
  $("detailGrade").textContent=card.grade||"";
  $("detailType").textContent=card.type||"";
  $("detailCategory").textContent=card.category||"";
  $("detailSeason").textContent=seasonForId(card.id);
  $("prevCard").disabled=currentModalIndex<=0;
  $("nextCard").disabled=currentModalIndex>=visibleCards.length-1;
}
function moveModalCard(delta){
  if($("modal").hidden)return;
  const next=currentModalIndex+delta;
  if(next<0||next>=visibleCards.length)return;
  currentModalIndex=next;
  populateModal(visibleCards[currentModalIndex]);
}

function closeModal(){
  $("modal").hidden=true;
  document.body.style.overflow="";
}

$("modalClose").addEventListener("click",closeModal);
document.querySelector(".modal-backdrop").addEventListener("click",closeModal);
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!$("modal").hidden)closeModal();
  if(!$("modal").hidden&&e.key==="ArrowLeft")moveModalCard(-1);
  if(!$("modal").hidden&&e.key==="ArrowRight")moveModalCard(1);
});
$("pagePrev").addEventListener("click",()=>goPage(-1));
$("pageNext").addEventListener("click",()=>goPage(1));
$("prevCard").addEventListener("click",()=>moveModalCard(-1));
$("nextCard").addEventListener("click",()=>moveModalCard(1));
$("detailWishlistHeart").addEventListener("click",()=>{
  if(currentModalIndex>=0&&visibleCards[currentModalIndex])toggleWishlist(visibleCards[currentModalIndex]);
});
$("ownedMinus").addEventListener("click",()=>{
  if(currentModalIndex>=0&&visibleCards[currentModalIndex])changeOwnedCount(visibleCards[currentModalIndex],-1);
});
$("ownedPlus").addEventListener("click",()=>{
  if(currentModalIndex>=0&&visibleCards[currentModalIndex])changeOwnedCount(visibleCards[currentModalIndex],1);
});
$("wishlistOnly").addEventListener("click",()=>{
  wishlistOnly=!wishlistOnly;
  render();
});
$("ownedOnly").addEventListener("click",()=>{
  ownedFilter=ownedFilter==="owned"?null:"owned";
  render();
});
$("unownedOnly").addEventListener("click",()=>{
  ownedFilter=ownedFilter==="unowned"?null:"unowned";
  render();
});
$("cardListTab").addEventListener("click",()=>setView("list"));
$("coordinateTab").addEventListener("click",()=>setView("coordinate"));
$("previousSeriesTab").addEventListener("click",()=>setView("previous"));
$("previousCategoryButtons").addEventListener("click",event=>{
  const button=event.target.closest("[data-category]");
  if(!button)return;
  previousCategory=button.dataset.category;
  $("previousCategoryButtons").querySelectorAll("[data-category]").forEach(item=>{
    const active=item===button;
    item.classList.toggle("active",active);
    item.setAttribute("aria-pressed",String(active));
  });
});
$("previousTypeButtons").addEventListener("click",event=>{
  const button=event.target.closest("[data-type]");
  if(!button)return;
  previousType=button.dataset.type;
  $("previousTypeButtons").querySelectorAll("[data-type]").forEach(item=>{
    const active=item===button;
    item.classList.toggle("active",active);
    item.setAttribute("aria-pressed",String(active));
  });
});
$("previousCardImage").addEventListener("change",()=>{
  const file=$("previousCardImage").files[0];
  $("previousImageLabel").textContent=file?file.name:"카드 이미지 추가";
  if(file){
    $("previousCardImageUrl").value="";
    setPreviousImagePreview(file);
  }else{
    setPreviousImagePreview("");
  }
});
$("previousCardImageUrl").addEventListener("input",()=>{
  if($("previousCardImageUrl").value.trim()){
    $("previousCardImage").value="";
    $("previousImageLabel").textContent="카드 이미지 추가";
    setPreviousImagePreview($("previousCardImageUrl").value.trim());
  }else if(!editingPreviousCardId){
    setPreviousImagePreview("");
  }
});
function resetPreviousCardForm(){
  editingPreviousCardId=null;
  $("previousCardForm").reset();
  $("previousImageLabel").textContent="카드 이미지 추가";
  setPreviousImagePreview("");
  $("previousCardSubmit").textContent="카드 추가";
  $("previousCardCancelEdit").hidden=true;
  previousCategory="상의";
  previousType="큐트";
  $("previousTypeButtons").querySelectorAll("[data-type]").forEach(button=>{
    const active=button.dataset.type===previousType;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  $("previousCategoryButtons").querySelectorAll("[data-category]").forEach(button=>{
    const active=button.dataset.category===previousCategory;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
}
function startEditingPreviousCard(id){
  const card=previousCards.find(item=>item.id===id);
  if(!card)return;
  editingPreviousCardId=card.id;
  $("previousCardNumber").value=card.number||"";
  $("previousCardName").value=card.name||"";
  $("previousCardImageUrl").value=card.imageUrl||"";
  previousType=card.type||"큐트";
  $("previousTypeButtons").querySelectorAll("[data-type]").forEach(button=>{
    const active=button.dataset.type===previousType;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  $("previousCardImage").value="";
  $("previousImageLabel").textContent=card.imageUrl?"기존 이미지 주소 사용 중":"이미지 변경 시 파일을 선택해 주세요";
  setPreviousImagePreview(card.image instanceof Blob?card.image:(card.imageUrl||""));
  previousCategory=card.category||"상의";
  $("previousCategoryButtons").querySelectorAll("[data-category]").forEach(button=>{
    const active=button.dataset.category===previousCategory;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  $("previousCardSubmit").textContent="수정 저장";
  $("previousCardCancelEdit").hidden=false;
  $("previousCardForm").scrollIntoView({behavior:"smooth",block:"start"});
}
$("previousCardCancelEdit").addEventListener("click",resetPreviousCardForm);
$("previousCardForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const file=$("previousCardImage").files[0];
  const imageUrl=$("previousCardImageUrl").value.trim();
  const number=$("previousCardNumber").value.trim();
  const name=$("previousCardName").value.trim();
  const existing=editingPreviousCardId?previousCards.find(item=>item.id===editingPreviousCardId):null;
  if((!file&&!imageUrl&&!existing)||!name){alert("이미지 파일 또는 이미지 주소와 카드 이름을 입력해 주세요.");return;}
  if(file&&!file.type.startsWith("image/")){alert("이미지 파일을 선택해 주세요.");return;}
  if(imageUrl){
    try{
      const parsed=new URL(imageUrl);
      if(!["http:","https:"].includes(parsed.protocol))throw new Error("invalid protocol");
    }catch(error){alert("http:// 또는 https://로 시작하는 올바른 이미지 주소를 입력해 주세요.");return;}
  }
  const submit=$("previousCardSubmit");
  submit.disabled=true;
  try{
    const card={
      ...(existing||{}),
      id:existing?existing.id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(36).slice(2)),
      number,name,category:previousCategory,type:previousType,
      createdAt:existing?.createdAt||Date.now(),
      updatedAt:Date.now()
    };
    if(file){card.image=file;delete card.imageUrl;}
    else if(imageUrl){card.imageUrl=imageUrl;delete card.image;}
    await savePreviousCard(card);
    if(existing)previousCards=previousCards.map(item=>item.id===card.id?card:item);
    else previousCards.unshift(card);
    resetPreviousCardForm();
    renderPreviousCards();
  }catch(error){alert("카드를 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.");}
  finally{submit.disabled=false;}
});
$("saveCoordinate").addEventListener("click",()=>{
  const ids=currentCoordinateIds();
  if(!ids.some(Boolean)){alert("저장할 카드를 먼저 선택해 주세요.");return;}
  const usedNumbers=savedCoordinates.map(item=>String(item.name||"").match(/^코디\s+(\d+)$/)).filter(Boolean).map(match=>Number(match[1]));
  const nextNumber=usedNumbers.length?Math.max(...usedNumbers)+1:1;
  savedCoordinates.unshift({name:"코디 "+nextNumber,ids,createdAt:Date.now()});
  persistSavedCoordinates();renderSavedCoordinates();
});

$("pageWishlistMode").addEventListener("click",()=>setSelectionMode("wishlist"));
$("pageOwnedMode").addEventListener("click",()=>setSelectionMode("owned"));

const grid=$("grid");
grid.addEventListener("touchstart",e=>{
  if(!window.matchMedia("(max-width:600px)").matches)return;
  touchStartX=e.changedTouches[0].clientX;
  touchStartY=e.changedTouches[0].clientY;
},{passive:true});
grid.addEventListener("touchend",e=>{
  if(!window.matchMedia("(max-width:600px)").matches)return;
  const dx=e.changedTouches[0].clientX-touchStartX;
  const dy=e.changedTouches[0].clientY-touchStartY;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))goPage(dx<0?1:-1);
},{passive:true});

["search","category","type","grade","season"].forEach(id=>$(id).addEventListener("input",render));
window.addEventListener("resize",updateMobilePager);
try{const savedView=localStorage.getItem("aikatsuEncoreCurrentView");setView(savedView==="coordinate"||savedView==="previous"?savedView:"list");}catch(e){setView("list");}
loadData();