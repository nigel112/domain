import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import {createHmac,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {inside} from './config.js';
import {calculateFare} from '../../packages/pricing/index.js';
import {installTracking} from './services/tracking.js';
const phone=z.string().regex(/^\+[1-9]\d{7,14}$/);
const point=z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).strict();
const journey=z.object({pickup:point,dropoff:point,vehicleClass:z.enum(['Light','Medium'])}).strict();
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
export function createApp({db,c,provider}){
 const app=express(),hash=value=>createHmac('sha256',c.SESSION_PEPPER).update(value).digest('hex');
 app.disable('x-powered-by');app.set('trust proxy',1);app.use(helmet(),cors({origin:c.APP_ORIGIN}),express.json({limit:'8kb'}));
 app.get('/api/driver-plan',(req,res)=>res.json({mode:'trial',feeMinor:0,currency:'USD',commissionBps:0,endsAt:null,autoCharge:false,verificationRequired:true,bookingsEnabled:false}));
 app.get('/health',wrap(async(req,res)=>{await db.query('SELECT 1 FROM launch.users LIMIT 0');res.json({status:'ok',mode:'restricted-staging',bookingsEnabled:false,paymentsEnabled:false});}));
 const limit=async(key,max)=>{
 const r=await db.query(`INSERT INTO launch.rate_limits VALUES($1,1,now()+interval '10 minutes') ON CONFLICT(key_hash) DO UPDATE SET hits=CASE WHEN launch.rate_limits.expires_at<now() THEN 1 ELSE launch.rate_limits.hits+1 END,expires_at=CASE WHEN launch.rate_limits.expires_at<now() THEN now()+interval '10 minutes' ELSE launch.rate_limits.expires_at END RETURNING hits`,[hash(key)]);
 if(r.rows[0].hits>max)throw Object.assign(Error('Try again later'),{status:429});
 };
 app.use('/api',wrap(async(req,res,next)=>{res.set('Cache-Control','no-store');await limit(`${req.path.startsWith('/tracking/')?'ip-tracking':'ip'}:${req.ip}`,req.path.startsWith('/tracking/')?500:60);next();}));
 app.get('/api/maps/status',(req,res)=>res.json({routingEnabled:c.MAPBOX_USAGE_APPROVED==='true',bounds:c.bounds,bookingsEnabled:false,trackingEnabled:c.TRACKING_STAGING_ENABLED==='true'}));
 app.post('/api/auth/send',wrap(async(req,res)=>{const p=phone.parse(req.body.phone);await limit(`send:${p}`,3);await limit('global:sms',100);await provider.send(p);res.json({sent:true});}));
 app.post('/api/auth/verify',wrap(async(req,res)=>{
 const p=phone.parse(req.body.phone),code=z.string().regex(/^\d{4,10}$/).parse(req.body.code);await limit(`verify:${p}`,5);
 if(!await provider.check(p,code))return res.status(401).json({error:'Invalid or expired code'});
 const u=await db.query('INSERT INTO launch.users(phone) VALUES($1) ON CONFLICT(phone) DO UPDATE SET phone=EXCLUDED.phone RETURNING id',[p]);
 const token=randomBytes(32).toString('base64url');await db.query("INSERT INTO launch.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[hash(token),u.rows[0].id]);
 res.json({token,expiresIn:1800});
 }));
 app.use('/api',wrap(async(req,res,next)=>{
 const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
 if(!token)return res.status(401).json({error:'Sign in required'});
 const r=await db.query('SELECT user_id FROM launch.sessions WHERE token_hash=$1 AND expires_at>now()',[hash(token)]);
 if(!r.rowCount)return res.status(401).json({error:'Session expired'});req.userId=r.rows[0].user_id;req.tokenHash=hash(token);next();
 }));
 app.post('/api/auth/logout',wrap(async(req,res)=>{
  await db.query("UPDATE launch.tracking_shares SET status='revoked' WHERE driver_session_hash=$1 AND status IN ('active','pending')",[req.tokenHash]);
  await db.query('DELETE FROM launch.tracking_positions WHERE share_id IN (SELECT id FROM launch.tracking_shares WHERE driver_session_hash=$1 OR rider_id=$2)',[req.tokenHash,req.userId]);
  await db.query("UPDATE launch.tracking_shares SET status='revoked' WHERE rider_id=$1 AND status='active'",[req.userId]);
  await db.query('DELETE FROM launch.sessions WHERE token_hash=$1',[req.tokenHash]);res.sendStatus(204);
 }));
 const tracking=installTracking(app,{db,c,hash,wrap,limit});app.locals.tracking=tracking;
 const mapsReady=()=>{if(c.MAPBOX_USAGE_APPROVED!=='true')throw Object.assign(Error('Address search and routes are not activated. You can still select pins on the map.'),{status:503});};
 const supported=b=>{if(!inside(b.pickup,c.bounds)||!inside(b.dropoff,c.bounds))throw Object.assign(Error('Outside configured service area'),{status:422});};
 app.post('/api/maps/search',wrap(async(req,res)=>{
  const {query}=z.object({query:z.string().trim().min(3).max(200).refine(q=>!q.includes(';')&&q.split(/\s+/).length<=20)}).strict().parse(req.body);
  mapsReady();await limit(`search:${req.userId}`,20);
  const results=(await provider.geocode(query)).filter(r=>inside(r.point,c.bounds));
  res.json({results});
 }));
 app.post('/api/maps/route',wrap(async(req,res)=>{
  const b=journey.parse(req.body);supported(b);mapsReady();await limit(`map-route:${req.userId}`,20);
  const passenger=await provider.routeDetails(b.pickup,b.dropoff);
  const returnRoute=c.zones.some(zone=>inside(b.dropoff,zone))?await provider.routeDetails(b.dropoff,b.pickup):null;
  const fare=calculateFare(b.vehicleClass,passenger.distanceMeters,undefined,0,returnRoute?.distanceMeters||0);
  // Transient preview only: no geometry, geocodes or route results go to storage/logs.
  res.json({passenger,returnRoute,fare,expiresAt:new Date(Date.now()+120000).toISOString(),bookable:false});
 }));
 app.post('/api/quotes',wrap(async(req,res)=>{
  mapsReady();
  if(c.MAPBOX_QUOTE_STORAGE_APPROVED!=='true')return res.status(503).json({error:'Persistent route quotes require provider storage rights approval. Use the transient map preview instead.'});
 const b=journey.parse(req.body);
 if(!inside(b.pickup,c.bounds)||!inside(b.dropoff,c.bounds))return res.status(422).json({error:'Outside configured service area'});
 await limit(`quote:${req.userId}`,20);
 const distance=await provider.route(b.pickup,b.dropoff);
 const needsReturn=c.zones.some(zone=>inside(b.dropoff,zone));
 const back=needsReturn?await provider.route(b.dropoff,b.pickup):0;
 const fare=calculateFare(b.vehicleClass,distance,undefined,0,back);
 const r=await db.query("INSERT INTO launch.quotes(user_id,passenger_meters,return_meters,rate_mills,total_minor,snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '120 seconds') RETURNING id,expires_at",[req.userId,distance,back,fare.rateMillsPerKm,fare.totalMinor,JSON.stringify({...fare,distanceSource:'mapbox/driving',returnPolicy:needsReturn?'routed-to-pickup':'none'})]);
 res.json({...r.rows[0],fare,bookable:false});
 }));
 app.post(['/api/rides','/api/payments','/api/driver-pass/checkout'],(req,res)=>res.status(503).json({error:'Public launch is blocked. Bookings and payments are not enabled.'}));
 app.use((req,res)=>res.status(404).json({error:'Not found'}));
 app.use((error,req,res,next)=>res.status(error instanceof z.ZodError?400:error.status||500).json({error:error instanceof z.ZodError?'Invalid input':error.status?error.message:'Service unavailable'}));
 return app;
}
