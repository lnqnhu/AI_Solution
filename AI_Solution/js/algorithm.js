// Constraint Optimization: estimate a valid outer bounding box, then minimize cost.
const rotations=d=>[[d.L,d.W,d.H],[d.L,d.H,d.W],[d.W,d.L,d.H],[d.W,d.H,d.L],[d.H,d.L,d.W],[d.H,d.W,d.L]];
function fitsWithRotation(item,space){return rotations(item.dimensions).some(([L,W,H])=>L<=space.L&&W<=space.W&&H<=space.H)}

function makePackingUnits(lines){
 const units=lines.flatMap(({product,quantity})=>Array.from({length:quantity},()=>({product,nested:null})));
 const hosts=units.filter(u=>u.product.isHollow&&u.product.allowNesting&&u.product.internalDimensions);
 const children=units.filter(u=>!u.product.isHollow||!u.product.allowNesting),nestedItems=[];
 for(const host of hosts){const child=children.find(u=>!u.nested&&fitsWithRotation(u.product,host.product.internalDimensions));if(child){child.nested=host;nestedItems.push({containerSku:host.product.sku,itemSku:child.product.sku})}}
 return {units:units.filter(u=>!u.nested),nestedItems};
}

// A conservative mixed-SKU box: place products side by side along one axis.
// Test all orientations and use the smallest enclosing box; no interlocking is assumed.
function mixedBoundingBox(units){
 let best=null;
 for(let axis=0;axis<3;axis++)for(const orientation of rotations({L:1,W:2,H:3})){
   const dims=units.map(u=>{const d=u.product.dimensions;return orientation.map(i=>[d.L,d.W,d.H][i-1])});
   const box=[0,0,0];for(const d of dims){box[axis]+=d[axis];for(let k=0;k<3;k++)if(k!==axis)box[k]=Math.max(box[k],d[k])}
   const candidate={L:box[0],W:box[1],H:box[2]},volume=box[0]*box[1]*box[2];if(!best||volume<best.volume)best={dimensions:candidate,volume};
 }
 return best||{dimensions:{L:0,W:0,H:0},volume:0};
}

// Hexagonal rows for upright cylinders. Row centers are separated by sqrt(3)/2 diameters.
// Enumerating row counts and both carton orientations produces a compact bounding rectangle.
function hexCylinderBox(product,quantity){
 const d=product.dimensions,diameter=Math.max(d.L,d.W),height=d.H;
 let best=null;
 for(let rows=1;rows<=quantity;rows++){
   const full=Math.floor(quantity/rows),remainder=quantity%rows;
   const maxPerRow=full+(remainder?1:0),rowSpan=diameter+(rows-1)*diameter*Math.sqrt(3)/2;
   const columnSpan=maxPerRow*diameter;
   for(const [L,W] of [[columnSpan,rowSpan],[rowSpan,columnSpan]]){
     const candidate={L,W,H:height},volume=L*W*height;
     if(!best||volume<best.volume)best={dimensions:candidate,volume,rows,columns:maxPerRow,pattern:'hexagonal'};
   }
 }
 return best;
}

function singleSkuGridBox(product,quantity){
 let best=null;const d=product.dimensions;
 for(const [L,W,H] of rotations(d))for(let nx=1;nx<=quantity;nx++)for(let ny=1;ny<=Math.floor(quantity/nx);ny++){
   const nz=Math.ceil(quantity/(nx*ny)),candidate={L:L*nx,W:W*ny,H:H*nz},volume=candidate.L*candidate.W*candidate.H;
   if(!best||volume<best.volume)best={dimensions:candidate,volume,pattern:'grid'};
 }
 return best;
}

function estimatePacking(lines,units){
 const skuCount=lines.length,quantity=lines[0]?.quantity||0;
 if(skuCount===1&&quantity>1){const product=lines[0].product;if(product.shape==='cylinder')return {...hexCylinderBox(product,quantity),mode:'single-cylinder'};return {...singleSkuGridBox(product,quantity),mode:'single-sku'}}
 return {...mixedBoundingBox(units),mode:skuCount>1?'mixed-sku':'single-unit'};
}

export function analyzeOrder(order,data,state){
 const productMap=new Map(data.products.map(p=>[p.sku,p]));
 const lines=order.items.map(line=>({product:productMap.get(line.sku),quantity:line.quantity})).filter(line=>line.product&&line.quantity>0);
 if(!lines.length)return {feasible:[],rejected:[],error:'Đơn hàng không có SKU hợp lệ.'};
 const fragile=lines.some(line=>line.product.isFragile),buffer=fragile?data.materials.clearance.fragilePercent:data.materials.clearance.standardPercent;
 const packing=makePackingUnits(lines),nestedItems=packing.nestedItems,estimate=estimatePacking(lines,packing.units),baseDimensions=estimate.dimensions;
 const productVolume=estimate.volume,requiredVolume=productVolume*(1+buffer/100),requiredWeight=lines.reduce((sum,line)=>sum+line.product.weight*line.quantity,0);
 const stock=state.cartonStock||{};
 const evaluated=data.cartons.map(carton=>{
   const d=carton.dimensions,clearance=fragile?3:1;
   const fitsDimensions=d.L>=baseDimensions.L+clearance&&d.W>=baseDimensions.W+clearance&&d.H>=baseDimensions.H+clearance;
   const fitsVolume=d.L*d.W*d.H>=requiredVolume,fitsLoad=carton.maxLoad>=requiredWeight,inStock=(stock[carton.cartonId]??carton.stock)>0;
   const reasons=[];if(!inStock)reasons.push('Hết tồn kho');if(!fitsDimensions)reasons.push('Không đủ kích thước');if(!fitsVolume)reasons.push('Không đủ thể tích');if(!fitsLoad)reasons.push('Vượt tải trọng');
   const area=(d.L*d.W+d.L*d.H+d.W*d.H)*2/10000,mat=data.materials.cushioning;
   const materialCost=Math.ceil(area*mat.estimatedMetersPerM2*(fragile?mat.fragileLayers:mat.standardLayers))*mat.pricePerMeter;
   const shippingCost=data.materials.carrier.baseFee,cost={carton:carton.cost,material:materialCost,tape:data.materials.tape.pricePerOrder,shipping:shippingCost,total:carton.cost+materialCost+data.materials.tape.pricePerOrder+shippingCost};
   return {carton,cost,feasible:inStock&&fitsDimensions&&fitsVolume&&fitsLoad,reasons,fragile,buffer,requiredVolume,productVolume,requiredWeight,baseDimensions,fillRatio:Math.min(100,productVolume/(d.L*d.W*d.H)*100),packingMode:estimate.mode,packingPattern:estimate.pattern,hexRows:estimate.rows,hexColumns:estimate.columns};
 });
 const feasible=evaluated.filter(x=>x.feasible).sort((a,b)=>a.cost.total-b.cost.total);
 return {feasible,rejected:evaluated.filter(x=>!x.feasible),best:feasible[0]||null,fragile,buffer,requiredVolume,productVolume,requiredWeight,baseDimensions,nestedItems,lines,packingMode:estimate.mode,packingPattern:estimate.pattern,hexRows:estimate.rows,hexColumns:estimate.columns};
}

// Keep one customer order and split its contents into physical parcels, choosing the cheapest feasible carton for each.
export function planParcels(order,data,state){
 const units=[];const virtualState={...state,cartonStock:{...(state.cartonStock||{})}};
 for(const line of order.items){const p=data.products.find(x=>x.sku===line.sku);if(!p)return {packages:[],error:`Không tìm thấy SKU ${line.sku}.`};for(let n=0;n<line.quantity;n++)units.push({sku:line.sku,volume:p.dimensions.L*p.dimensions.W*p.dimensions.H,weight:p.weight})}
 units.sort((a,b)=>b.volume-a.volume||b.weight-a.weight);const packages=[];
 for(const unit of units){let choice=null;
   for(let i=0;i<packages.length;i++){const previousId=packages[i].analysis.best.carton.cartonId;virtualState.cartonStock[previousId]=(virtualState.cartonStock[previousId]??data.cartons.find(c=>c.cartonId===previousId).stock)+1;const trial=analyzeOrder({items:[...packages[i].items,{sku:unit.sku,quantity:1}]},data,virtualState);virtualState.cartonStock[previousId]--;if(trial.best&&(!choice||trial.best.cost.total<choice.analysis.best.cost.total))choice={index:i,analysis:trial}}
   if(choice){const current=packages[choice.index],previousId=current.analysis.best.carton.cartonId,nextId=choice.analysis.best.carton.cartonId;virtualState.cartonStock[previousId]=(virtualState.cartonStock[previousId]??0)+1;virtualState.cartonStock[nextId]=(virtualState.cartonStock[nextId]??data.cartons.find(c=>c.cartonId===nextId).stock)-1;packages[choice.index]={items:choice.analysis.lines.reduce((out,line)=>{const found=out.find(x=>x.sku===line.product.sku);if(found)found.quantity=line.quantity;else out.push({sku:line.product.sku,quantity:line.quantity});return out},[]),analysis:choice.analysis}}
   else{const items=[{sku:unit.sku,quantity:1}],analysis=analyzeOrder({items},data,virtualState);if(!analysis.best)return {packages:[],error:`SKU ${unit.sku} không vừa với carton còn tồn kho.`};const cartonId=analysis.best.carton.cartonId;virtualState.cartonStock[cartonId]=(virtualState.cartonStock[cartonId]??data.cartons.find(c=>c.cartonId===cartonId).stock)-1;packages.push({items,analysis})}
 }
 const base=data.materials.carrier.baseFee,extra=data.materials.carrier.additionalParcelFee,shipping=base+Math.max(0,packages.length-1)*extra;
 const totalPackaging=packages.reduce((sum,p)=>sum+p.analysis.best.cost.carton+p.analysis.best.cost.material+p.analysis.best.cost.tape,0);
 return {packages,shipping,totalPackaging,total:totalPackaging+shipping};
}

