// Deterministic 3D placement heuristic. Products are padded before placement
// so wrap/clearance consumes real carton and nesting space.
const permutations=d=>[[d.L,d.W,d.H],[d.L,d.H,d.W],[d.W,d.L,d.H],[d.W,d.H,d.L],[d.H,d.L,d.W],[d.H,d.W,d.L]];
const mergeLines=items=>[...items.reduce((map,line)=>map.set(line.sku,(map.get(line.sku)||0)+(Number(line.quantity)||0)),new Map())].map(([sku,quantity])=>({sku,quantity}));
const paddedDimensions=(product,fragileOrder=false)=>{const base=product.isFragile||fragileOrder?1.5:0.8,d=product.dimensions;return {L:d.L+2*base,W:d.W+2*base,H:d.H+2*base}};
const overlaps=(a,b)=>a.x<b.x+b.L&&a.x+a.L>b.x&&a.y<b.y+b.W&&a.y+a.W>b.y&&a.z<b.z+b.H&&a.z+a.H>b.z;

// First-fit extreme-point packing: tests all six rotations and rejects overlap.
// The result is a concrete placement plan, not just a volume comparison.
function pack3D(items,space){
 const placed=[],points=[{x:0,y:0,z:0}];
 for(const item of items){
   const d=item.packDimensions||item.product.dimensions,tries=[];
   for(const point of points)for(const [L,W,H] of permutations(d))tries.push({x:point.x,y:point.y,z:point.z,L,W,H});
   tries.sort((a,b)=>a.z-b.z||a.y-b.y||a.x-b.x||a.L*a.W*a.H-b.L*b.W*b.H);
   const choice=tries.find(candidate=>candidate.x+candidate.L<=space.L+1e-6&&candidate.y+candidate.W<=space.W+1e-6&&candidate.z+candidate.H<=space.H+1e-6&&placed.every(other=>!overlaps(candidate,other)));
   if(!choice)return null;
   const position={...choice,itemIndex:item.index,sku:item.product.sku};placed.push(position);
   for(const point of [{x:choice.x+choice.L,y:choice.y,z:choice.z},{x:choice.x,y:choice.y+choice.W,z:choice.z},{x:choice.x,y:choice.y,z:choice.z+choice.H},{x:choice.x+choice.L,y:choice.y+choice.W,z:choice.z},{x:choice.x+choice.L,y:choice.y,z:choice.z+choice.H},{x:choice.x,y:choice.y+choice.W,z:choice.z+choice.H},{x:choice.x+choice.L,y:choice.y+choice.W,z:choice.z+choice.H}])if(point.x<space.L&&point.y<space.W&&point.z<space.H&&!points.some(p=>p.x===point.x&&p.y===point.y&&p.z===point.z))points.push(point);
 }
 return placed;
}

function makeUnits(lines,fragileOrder){let index=0;return lines.flatMap(line=>Array.from({length:line.quantity},()=>{const unit={product:line.product,index:index++};unit.packDimensions=paddedDimensions(unit.product,fragileOrder);return unit}))}

// A hollow product may contain several items. Trial-pack the protected child
// dimensions together in the measured inner cavity; never absorb their weight.
function nestUnits(units){
 const nestedItems=[],hosts=units.filter(u=>u.product.isHollow&&u.product.allowNesting&&u.product.internalDimensions),nested=new Set();
 for(const host of hosts){
   const candidates=units.filter(u=>u!==host&&!nested.has(u.index)&&!u.product.isHollow),volume=u=>u.packDimensions.L*u.packDimensions.W*u.packDimensions.H;
   const orders=[ [...candidates].sort((a,b)=>volume(b)-volume(a)),[...candidates].sort((a,b)=>volume(a)-volume(b)),[...candidates].sort((a,b)=>Math.max(...Object.values(a.packDimensions))-Math.max(...Object.values(b.packDimensions))),[...candidates].sort((a,b)=>Math.max(...Object.values(b.packDimensions))-Math.max(...Object.values(a.packDimensions))) ];
   let accepted=[],placements=[],bestScore=-1;
   for(const order of orders){const trialItems=[],trialPlacements=[];for(const child of order){const result=pack3D([...trialItems,child],host.product.internalDimensions);if(result){trialItems.push(child);trialPlacements.splice(0,trialPlacements.length,...result)}}const score=trialItems.length*1e9+trialItems.reduce((sum,u)=>sum+volume(u),0);if(score>bestScore){accepted.splice(0,accepted.length,...trialItems);placements.splice(0,placements.length,...trialPlacements);bestScore=score}}
   for(const child of accepted)nested.add(child.index);
   if(accepted.length)nestedItems.push({containerSku:host.product.sku,containerIndex:host.index,items:accepted.map((u,i)=>({itemSku:u.product.sku,itemIndex:u.index,position:placements[i]}))});
 }
 const nestedIds=new Set(nestedItems.flatMap(group=>group.items.map(item=>item.itemIndex)));
 return {units:units.filter(u=>!nestedIds.has(u.index)),nestedItems};
}

function singleCylinderPlan(lines,units){
 if(lines.length!==1||lines[0].quantity<2||lines[0].product.shape!=='cylinder')return null;
 const product=lines[0].product,d=product.dimensions,diameter=Math.max(d.L,d.W)+2*(product.isFragile?1.5:0.8),height=d.H+2*(product.isFragile?1.5:0.8),n=lines[0].quantity;
 let best=null;
 for(let rows=1;rows<=n;rows++){
   const cols=Math.ceil(n/rows),length=cols*diameter+(rows>1?diameter/2:0),width=diameter+(rows-1)*diameter*Math.sqrt(3)/2,box={L:length,W:width,H:height};
   if(!best||box.L*box.W<best.dimensions.L*best.dimensions.W)best={dimensions:box,volume:box.L*box.W*box.H,mode:'single-cylinder',hexRows:rows,hexColumns:cols};
 }
 // Keep coordinates for the packing illustration (circles may stagger inside the carton).
 const placements=[];let k=0;for(let row=0;row<best.hexRows;row++){const inRow=Math.min(best.hexColumns,n-k),offset=row%2?diameter/2:0;for(let col=0;col<inRow;col++){placements.push({itemIndex:units[k].index,sku:product.sku,x:col*diameter+offset,y:row*diameter*Math.sqrt(3)/2,z:0,L:diameter,W:diameter,H:height,shape:'cylinder'});k++}}
 return {...best,placements};
}

function estimateBounds(lines,units,nestedItems,fragileOrder){
 const cylinder=singleCylinderPlan(lines,units);if(cylinder)return {...cylinder,nestedItems};
 const packing=nestUnits(units),top=packing.units,dimensions=top.map(u=>u.packDimensions),totalVolume=dimensions.reduce((sum,d)=>sum+d.L*d.W*d.H,0);
 // Necessary lower bound used to avoid futile carton-placement attempts.
 return {mode:lines.length>1?'mixed-sku':lines[0].quantity>1?'single-sku':'single-unit',units:top,nestedItems:packing.nestedItems,volume:totalVolume,placements:null,fragileOrder};
}

export function analyzeOrder(order,data,state){
 const productMap=new Map(data.products.map(p=>[p.sku,p])),lines=mergeLines(order.items||[]).map(line=>({product:productMap.get(line.sku),quantity:Math.max(0,Number(line.quantity)||0)})).filter(line=>line.product&&line.quantity>0);
 if(!lines.length)return {feasible:[],rejected:[],error:'Đơn hàng không có SKU hợp lệ.'};
 const fragile=lines.some(line=>line.product.isFragile),buffer=fragile?data.materials.clearance.fragilePercent:data.materials.clearance.standardPercent,allUnits=makeUnits(lines,fragile),estimate=estimateBounds(lines,allUnits,[],fragile),requiredWeight=lines.reduce((sum,line)=>sum+line.product.weight*line.quantity,0),stock=state.cartonStock||{};
 const evaluated=data.cartons.map(carton=>{
   const d=carton.dimensions,wrappedUnits=estimate.units||allUnits,fitByVolume=estimate.mode==='single-cylinder'?((estimate.dimensions.L<=d.L&&estimate.dimensions.W<=d.W)||(estimate.dimensions.L<=d.W&&estimate.dimensions.W<=d.L))&&estimate.dimensions.H<=d.H:wrappedUnits.reduce((sum,u)=>sum+u.packDimensions.L*u.packDimensions.W*u.packDimensions.H,0)<=d.L*d.W*d.H;
   let placements=null,nestedItems=estimate.nestedItems||[];
   if(fitByVolume&&estimate.mode==='single-cylinder')placements=estimate.placements;
   else if(fitByVolume){const packing=nestUnits(allUnits);nestedItems=packing.nestedItems;placements=pack3D(packing.units,d)}
   const fitsDimensions=Boolean(placements),fitsLoad=carton.maxLoad>=requiredWeight,inStock=(stock[carton.cartonId]??carton.stock)>0;
   const reasons=[];if(!inStock)reasons.push('Hết tồn kho');if(!fitsDimensions)reasons.push('Không xếp vừa sau khi tính lớp chống sốc');if(!fitsLoad)reasons.push('Vượt tải trọng');
   const area=(d.L*d.W+d.L*d.H+d.W*d.H)*2/10000,mat=data.materials.cushioning,materialCost=Math.ceil(area*mat.estimatedMetersPerM2*(fragile?mat.fragileLayers:mat.standardLayers))*mat.pricePerMeter,shippingCost=data.materials.carrier.baseFee;
   const cost={carton:carton.cost,material:materialCost,tape:data.materials.tape.pricePerOrder,shipping:shippingCost,total:carton.cost+materialCost+data.materials.tape.pricePerOrder+shippingCost};
   const placedVolume=placements?placements.reduce((sum,p)=>sum+p.L*p.W*p.H,0):wrappedUnits.reduce((sum,u)=>sum+u.packDimensions.L*u.packDimensions.W*u.packDimensions.H,0);
   return {carton,cost,feasible:inStock&&fitsDimensions&&fitsLoad,reasons,fragile,buffer,requiredVolume:placedVolume,productVolume:placedVolume,requiredWeight,baseDimensions:d,fillRatio:Math.min(100,placedVolume/(d.L*d.W*d.H)*100),packingMode:estimate.mode,packingPattern:estimate.mode==='single-cylinder'?'hexagonal':'3d-placement',placements,nestedItems};
 });
 const feasible=evaluated.filter(x=>x.feasible).sort((a,b)=>a.cost.total-b.cost.total);
 const best=feasible[0]||null;
 return {feasible,rejected:evaluated.filter(x=>!x.feasible),best,fragile,buffer,requiredVolume:best?.requiredVolume||estimate.volume||0,productVolume:best?.productVolume||estimate.volume||0,requiredWeight,baseDimensions:best?.carton.dimensions||estimate.dimensions||{},nestedItems:best?.nestedItems||estimate.nestedItems||[],lines,packingMode:estimate.mode,packingPattern:best?.packingPattern,placements:best?.placements};
}

export function planParcels(order,data,state){
 const one=analyzeOrder(order,data,state);if(one.best)return {packages:[{items:one.lines.map(x=>({sku:x.product.sku,quantity:x.quantity})),analysis:one}],shipping:one.best.cost.shipping,totalPackaging:one.best.cost.carton+one.best.cost.material+one.best.cost.tape,total:one.best.cost.total};
 const virtual={...state,cartonStock:{...(state.cartonStock||{})}},units=[];
 for(const line of order.items){const p=data.products.find(x=>x.sku===line.sku);if(!p)return {packages:[],error:`Không tìm thấy SKU ${line.sku}.`};for(let i=0;i<line.quantity;i++)units.push({sku:line.sku,volume:p.dimensions.L*p.dimensions.W*p.dimensions.H,weight:p.weight})}
 units.sort((a,b)=>b.volume-a.volume||b.weight-a.weight);const packages=[];
 for(const unit of units){let bestChoice=null;
   for(let i=0;i<packages.length;i++){const current=packages[i],cartonId=current.analysis.best.carton.cartonId;virtual.cartonStock[cartonId]=(virtual.cartonStock[cartonId]??data.cartons.find(c=>c.cartonId===cartonId).stock)+1;const trial=analyzeOrder({items:[...current.items,{sku:unit.sku,quantity:1}]},data,virtual);virtual.cartonStock[cartonId]--;if(trial.best&&(!bestChoice||trial.best.cost.total<bestChoice.analysis.best.cost.total))bestChoice={index:i,analysis:trial}}
   if(bestChoice){const current=packages[bestChoice.index],old=current.analysis.best.carton.cartonId,next=bestChoice.analysis.best.carton.cartonId;virtual.cartonStock[old]=(virtual.cartonStock[old]??0)+1;virtual.cartonStock[next]=(virtual.cartonStock[next]??data.cartons.find(c=>c.cartonId===next).stock)-1;current.items.push({sku:unit.sku,quantity:1});current.analysis=bestChoice.analysis}
   else{const items=[{sku:unit.sku,quantity:1}],analysis=analyzeOrder({items},data,virtual);if(!analysis.best)return {packages:[],error:`Không có carton đủ lớn cho ${unit.sku}; cần bổ sung cỡ thùng hoặc xác nhận chia đơn.`};const id=analysis.best.carton.cartonId;virtual.cartonStock[id]=(virtual.cartonStock[id]??data.cartons.find(c=>c.cartonId===id).stock)-1;packages.push({items,analysis})}
 }
 const base=data.materials.carrier.baseFee,extra=data.materials.carrier.additionalParcelFee,shipping=base+Math.max(0,packages.length-1)*extra,totalPackaging=packages.reduce((sum,p)=>sum+p.analysis.best.cost.carton+p.analysis.best.cost.material+p.analysis.best.cost.tape,0);
  return {packages:packages.map(pkg=>({...pkg,items:mergeLines(pkg.items)})),shipping,totalPackaging,total:totalPackaging+shipping};
}
