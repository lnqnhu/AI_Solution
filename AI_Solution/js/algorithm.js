// Constraint Optimization prototype: filters infeasible cartons, then minimizes estimated total cost.
export function analyzeOrder(order,data,state){
 const productMap=new Map(data.products.map(p=>[p.sku,p]));
 const lines=order.items.map(line=>({product:productMap.get(line.sku),quantity:line.quantity})).filter(line=>line.product&&line.quantity>0);
 if(!lines.length)return {feasible:[],rejected:[],error:'Đơn hàng không có SKU hợp lệ.'};
 const fragile=lines.some(line=>line.product.isFragile),buffer=fragile?data.materials.clearance.fragilePercent:data.materials.clearance.standardPercent;
 // A deterministic shelf-style estimate: sum product height layers; conservative footprint from largest item.
 const baseDimensions=lines.reduce((acc,line)=>({L:Math.max(acc.L,line.product.dimensions.L),W:Math.max(acc.W,line.product.dimensions.W),H:acc.H+line.product.dimensions.H*line.quantity}),{L:0,W:0,H:0});
 const productVolume=lines.reduce((sum,line)=>sum+line.product.dimensions.L*line.product.dimensions.W*line.product.dimensions.H*line.quantity,0);
 const requiredVolume=productVolume*(1+buffer/100),requiredWeight=lines.reduce((sum,line)=>sum+line.product.weight*line.quantity,0);
 const stock=state.cartonStock||{};
 const evaluated=data.cartons.map(carton=>{
   const d=carton.dimensions,clearance=fragile?3:1;
   const fitsDimensions=d.L>=baseDimensions.L+clearance&&d.W>=baseDimensions.W+clearance&&d.H>=baseDimensions.H+clearance;
   const fitsVolume=d.L*d.W*d.H>=requiredVolume, fitsLoad=carton.maxLoad>=requiredWeight, inStock=(stock[carton.cartonId]??carton.stock)>0;
   const reasons=[];if(!inStock)reasons.push('Hết tồn kho');if(!fitsDimensions)reasons.push('Không đủ kích thước');if(!fitsVolume)reasons.push('Không đủ thể tích');if(!fitsLoad)reasons.push('Vượt tải trọng');
   const area=(d.L*d.W+d.L*d.H+d.W*d.H)*2/10000,mat=data.materials.cushioning;
   const materialCost=Math.ceil(area*mat.estimatedMetersPerM2*(fragile?mat.fragileLayers:mat.standardLayers))*mat.pricePerMeter;
   const dimensionalWeight=d.L*d.W*d.H/data.materials.carrier.divisor;
   const chargeableWeight=Math.max(requiredWeight,dimensionalWeight);
   const shippingCost=Math.ceil(chargeableWeight)*data.materials.carrier.ratePerKg;
   const cost={carton:carton.cost,material:materialCost,tape:data.materials.tape.pricePerOrder,shipping:shippingCost,total:carton.cost+materialCost+data.materials.tape.pricePerOrder+shippingCost};
   return {carton,cost,feasible:inStock&&fitsDimensions&&fitsVolume&&fitsLoad,reasons,fragile,buffer,requiredVolume,productVolume,requiredWeight,chargeableWeight,baseDimensions,fillRatio:Math.min(100,productVolume/(d.L*d.W*d.H)*100)}
 });
 const feasible=evaluated.filter(x=>x.feasible).sort((a,b)=>a.cost.total-b.cost.total);
 return {feasible,rejected:evaluated.filter(x=>!x.feasible),best:feasible[0]||null,fragile,buffer,requiredVolume,productVolume,requiredWeight,lines};
}
