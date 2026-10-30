// Constraint Optimization prototype: filter infeasible cartons, then minimize total estimated cost.
function fitsWithRotation(item,space){
 const d=item.dimensions;
 return [[d.L,d.W,d.H],[d.L,d.H,d.W],[d.W,d.L,d.H],[d.W,d.H,d.L],[d.H,d.L,d.W],[d.H,d.W,d.L]].some(([L,W,H])=>L<=space.L&&W<=space.W&&H<=space.H);
}

function makePackingUnits(lines){
 const units=lines.flatMap(({product,quantity})=>Array.from({length:quantity},()=>({product,nested:null})));
 const hosts=units.filter(unit=>unit.product.isHollow&&unit.product.allowNesting&&unit.product.internalDimensions);
 const children=units.filter(unit=>!unit.product.isHollow||!unit.product.allowNesting);
 const nestedItems=[];
 for(const host of hosts){
   const child=children.find(unit=>!unit.nested&&fitsWithRotation(unit.product,host.product.internalDimensions));
   if(child){child.nested=host;nestedItems.push({containerSku:host.product.sku,itemSku:child.product.sku});}
 }
 return {units:units.filter(unit=>!unit.nested),nestedItems};
}

export function analyzeOrder(order,data,state){
 const productMap=new Map(data.products.map(p=>[p.sku,p]));
 const lines=order.items.map(line=>({product:productMap.get(line.sku),quantity:line.quantity})).filter(line=>line.product&&line.quantity>0);
 if(!lines.length)return {feasible:[],rejected:[],error:'Đơn hàng không có SKU hợp lệ.'};
 const fragile=lines.some(line=>line.product.isFragile),buffer=fragile?data.materials.clearance.fragilePercent:data.materials.clearance.standardPercent;
 // Dimensional check uses the largest item's footprint; order volume and load account for quantity.
 // This is a packing estimate, not a 3D placement solver.
 const packing=makePackingUnits(lines),nestedItems=packing.nestedItems;
 const baseDimensions=packing.units.reduce((acc,unit)=>({L:Math.max(acc.L,unit.product.dimensions.L),W:Math.max(acc.W,unit.product.dimensions.W),H:Math.max(acc.H,unit.product.dimensions.H)}),{L:0,W:0,H:0});
 const productVolume=packing.units.reduce((sum,unit)=>sum+unit.product.dimensions.L*unit.product.dimensions.W*unit.product.dimensions.H,0);
 const requiredVolume=productVolume*(1+buffer/100),requiredWeight=lines.reduce((sum,line)=>sum+line.product.weight*line.quantity,0);
 const stock=state.cartonStock||{};
 const evaluated=data.cartons.map(carton=>{
   const d=carton.dimensions,clearance=fragile?3:1;
   const fitsDimensions=d.L>=baseDimensions.L+clearance&&d.W>=baseDimensions.W+clearance&&d.H>=baseDimensions.H+clearance;
   const fitsVolume=d.L*d.W*d.H>=requiredVolume, fitsLoad=carton.maxLoad>=requiredWeight, inStock=(stock[carton.cartonId]??carton.stock)>0;
   const reasons=[];if(!inStock)reasons.push('Hết tồn kho');if(!fitsDimensions)reasons.push('Không đủ kích thước');if(!fitsVolume)reasons.push('Không đủ thể tích');if(!fitsLoad)reasons.push('Vượt tải trọng');
   const area=(d.L*d.W+d.L*d.H+d.W*d.H)*2/10000,mat=data.materials.cushioning;
   const materialCost=Math.ceil(area*mat.estimatedMetersPerM2*(fragile?mat.fragileLayers:mat.standardLayers))*mat.pricePerMeter;
   const shippingCost=data.materials.carrier.baseFee;
   const cost={carton:carton.cost,material:materialCost,tape:data.materials.tape.pricePerOrder,shipping:shippingCost,total:carton.cost+materialCost+data.materials.tape.pricePerOrder+shippingCost};
   return {carton,cost,feasible:inStock&&fitsDimensions&&fitsVolume&&fitsLoad,reasons,fragile,buffer,requiredVolume,productVolume,requiredWeight,baseDimensions,fillRatio:Math.min(100,productVolume/(d.L*d.W*d.H)*100)}
 });
 const feasible=evaluated.filter(x=>x.feasible).sort((a,b)=>a.cost.total-b.cost.total);
 return {feasible,rejected:evaluated.filter(x=>!x.feasible),best:feasible[0]||null,fragile,buffer,requiredVolume,productVolume,requiredWeight,baseDimensions,nestedItems,lines};
}

// Keep one customer order and split its contents into physical parcels, choosing the cheapest feasible carton for each.
export function planParcels(order,data,state){
 const units=[];
 const virtualState={...state,cartonStock:{...(state.cartonStock||{})}};
 for(const line of order.items){const p=data.products.find(x=>x.sku===line.sku);if(!p)return {packages:[],error:`Không tìm thấy SKU ${line.sku}.`};for(let n=0;n<line.quantity;n++)units.push({sku:line.sku,volume:p.dimensions.L*p.dimensions.W*p.dimensions.H,weight:p.weight})}
 units.sort((a,b)=>b.volume-a.volume||b.weight-a.weight);
 const packages=[];
 for(const unit of units){let choice=null;
   for(let i=0;i<packages.length;i++){
     const previousId=packages[i].analysis.best.carton.cartonId;
     virtualState.cartonStock[previousId]=(virtualState.cartonStock[previousId]??data.cartons.find(c=>c.cartonId===previousId).stock)+1;
     const trialItems=[...packages[i].items,{sku:unit.sku,quantity:1}],trial=analyzeOrder({items:trialItems},data,virtualState);
     virtualState.cartonStock[previousId]--;
     if(trial.best&&(!choice||trial.best.cost.total<choice.analysis.best.cost.total))choice={index:i,analysis:trial};
   }
   if(choice){const current=packages[choice.index],previousId=current.analysis.best.carton.cartonId,nextId=choice.analysis.best.carton.cartonId;virtualState.cartonStock[previousId]=(virtualState.cartonStock[previousId]??0)+1;virtualState.cartonStock[nextId]=(virtualState.cartonStock[nextId]??data.cartons.find(c=>c.cartonId===nextId).stock)-1;packages[choice.index]={items:choice.analysis.lines.reduce((out,line)=>{const found=out.find(x=>x.sku===line.product.sku);if(found)found.quantity=line.quantity;else out.push({sku:line.product.sku,quantity:line.quantity});return out},[]),analysis:choice.analysis};}
   else {const items=[{sku:unit.sku,quantity:1}],analysis=analyzeOrder({items},data,virtualState);if(!analysis.best)return {packages:[],error:`SKU ${unit.sku} không vừa với carton còn tồn kho.`};const cartonId=analysis.best.carton.cartonId;virtualState.cartonStock[cartonId]=(virtualState.cartonStock[cartonId]??data.cartons.find(c=>c.cartonId===cartonId).stock)-1;packages.push({items,analysis})}
 }
 // Each physical parcel may receive its own carrier label/rate. Keep one parent
 // order and show the summed parcel charges as one shipping line.
 const base=data.materials.carrier.baseFee,extra=data.materials.carrier.additionalParcelFee;
 const shipping=base+Math.max(0,packages.length-1)*extra;
 const totalPackaging=packages.reduce((sum,p)=>sum+p.analysis.best.cost.carton+p.analysis.best.cost.material+p.analysis.best.cost.tape,0);
 return {packages,shipping,totalPackaging,total:totalPackaging+shipping};
}
