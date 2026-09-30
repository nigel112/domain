import {z} from 'zod';

const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const routeSchema = z.object({
 distance: z.number().positive().max(2000000),
 duration: z.number().nonnegative().max(604800),
 geometry: z.object({type: z.literal('LineString'), coordinates: z.array(point).min(2).max(100000)})
});
const unavailable = () => Object.assign(Error('External service unavailable. Please try again later.'), {status:502});
export async function jsonFetch(url, options={}) {
 try {
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(12000)});
  if(!r.ok) throw unavailable();
  return await r.json();
 } catch { throw unavailable(); }
}
export function providers(c) {
 const verify=async(path,form)=>jsonFetch(`https://verify.twilio.com/v2/Services/${c.TWILIO_VERIFY_SERVICE_SID}/${path}`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)});
 async function routeDetails(a,b) {
  const q=new URLSearchParams({access_token:c.MAPBOX_TOKEN,overview:'full',geometries:'geojson',alternatives:'false',steps:'false'});
  const data=await jsonFetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${a.lng},${a.lat};${b.lng},${b.lat}?${q}`);
  if(data.code==='NoRoute'||data.code==='NoSegment')throw Object.assign(Error('No drivable route found. Move the pins closer to a road.'),{status:422});
  const parsed=routeSchema.safeParse(data.routes?.[0]);
  if(data.code!=='Ok'||!parsed.success)throw unavailable();
  return {distanceMeters:Math.ceil(parsed.data.distance),durationSeconds:Math.ceil(parsed.data.duration),geometry:parsed.data.geometry};
 }
 return {
  send:phone=>verify('Verifications',{To:phone,Channel:'sms'}),
  check:async(phone,code)=>(await verify('VerificationCheck',{To:phone,Code:code})).status==='approved',
  route:async(a,b)=>(await routeDetails(a,b)).distanceMeters,
  routeDetails,
  geocode:async query=>{
   const b=c.bounds;
   const params=new URLSearchParams({q:query,access_token:c.MAPBOX_TOKEN,autocomplete:'false',limit:'5',bbox:[b.west,b.south,b.east,b.north].join(','),types:'address,street,place,locality,neighborhood',permanent:'false'});
   const data=await jsonFetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`);
   if(!Array.isArray(data.features))throw unavailable();
   return data.features.slice(0,5).flatMap((feature,index)=>{
    const coords=point.safeParse(feature.geometry?.coordinates);
    const label=feature.properties?.full_address||feature.properties?.name;
    if(!coords.success||typeof label!=='string')return [];
    return [{id:String(index),label:label.slice(0,500),point:{lng:coords.data[0],lat:coords.data[1]}}];
   });
  }
 };
}
