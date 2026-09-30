import {randomBytes} from 'node:crypto';
import {z} from 'zod';
const id=z.string().uuid();
const coordinate=z.object({lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180),accuracy:z.number().finite().min(0).max(150)}).strict();
const notFound=()=>Object.assign(Error('Tracking session not available'),{status:404});
export function installTracking(app,{db,c,hash,wrap,limit}){
 const ready=()=>{if(c.TRACKING_STAGING_ENABLED!=='true')throw Object.assign(Error('Location sharing is not activated'),{status:503});};
 const clean=async()=>{
  // Remove old locations even if an unfinished browser session never sends Stop.
  await db.query("DELETE FROM launch.tracking_shares WHERE expires_at < now()-interval '1 hour' OR (status='revoked' AND created_at < now()-interval '1 hour')");
  await db.query("DELETE FROM launch.tracking_positions p USING launch.tracking_shares s WHERE p.share_id=s.id AND (s.status<>'active' OR s.expires_at<=now())");
 };
 const driverSQL="s.id=$1 AND s.driver_id=$2 AND s.driver_session_hash=$3 AND s.status IN ('pending','active') AND s.expires_at>now() AND d.disabled_at IS NULL AND sess.expires_at>now()";
 // Driver access is tied to the session that created the share, not merely the phone account.
 app.get('/api/tracking/eligibility',wrap(async(req,res)=>{ready();const r=await db.query('SELECT 1 FROM launch.tracking_drivers WHERE user_id=$1 AND disabled_at IS NULL',[req.userId]);res.json({canShare:!!r.rowCount,stagingOnly:true});}));
 app.post('/api/tracking/start',wrap(async(req,res)=>{
  ready();if(Object.keys(req.body||{}).length)throw Object.assign(Error('Invalid input'),{status:400});
  await limit(`tracking-start:${req.userId}`,4);
  await db.query("UPDATE launch.tracking_shares SET status='revoked' WHERE driver_id=$1 AND status IN ('pending','active') AND expires_at<=now()",[req.userId]);
  const raw=randomBytes(24).toString('base64url');
  const r=await db.query(`INSERT INTO launch.tracking_shares(driver_id,driver_session_hash,code_hash)
   SELECT $1,$2,$3 FROM launch.tracking_drivers WHERE user_id=$1 AND disabled_at IS NULL RETURNING id,expires_at`,[req.userId,req.tokenHash,hash('tracking:'+raw)]).catch(e=>{if(e.code==='23505')throw Object.assign(Error('Stop your current sharing session first'),{status:409});throw e;});
  if(!r.rowCount)throw Object.assign(Error('Operator-approved driver test access required'),{status:403});
  res.status(201).json({id:r.rows[0].id,inviteCode:raw,expiresAt:r.rows[0].expires_at,notice:'Private staging test. Give this code only to your intended viewer. No ride is booked.'});
 }));
 app.post('/api/tracking/claim',wrap(async(req,res)=>{
  ready();const code=z.object({inviteCode:z.string().regex(/^[A-Za-z0-9_-]{32}$/)}).strict().parse(req.body).inviteCode;
  await limit(`tracking-claim:${req.userId}`,6);
  const r=await db.query(`UPDATE launch.tracking_shares s SET rider_id=$1,status='active',claimed_at=now()
   FROM launch.tracking_drivers d, launch.sessions sess
   WHERE s.code_hash=$2 AND s.status='pending' AND s.expires_at>now() AND s.driver_id<>$1
   AND d.user_id=s.driver_id AND d.disabled_at IS NULL AND sess.token_hash=s.driver_session_hash AND sess.expires_at>now()
   RETURNING s.id,s.expires_at`,[req.userId,hash('tracking:'+code)]);
  if(!r.rowCount)throw Object.assign(Error('Invalid, used or expired invitation'),{status:404});
  res.json({id:r.rows[0].id,expiresAt:r.rows[0].expires_at});
 }));
 app.post('/api/tracking/:id/position',wrap(async(req,res)=>{
  ready();const shareId=id.parse(req.params.id),p=coordinate.parse(req.body);
  await limit(`tracking-publish:${req.userId}`,300);
  const r=await db.query(`INSERT INTO launch.tracking_positions(share_id,latitude,longitude,accuracy_m,recorded_at)
    SELECT s.id,$4,$5,$6,now() FROM launch.tracking_shares s
    JOIN launch.tracking_drivers d ON d.user_id=s.driver_id
    JOIN launch.sessions sess ON sess.token_hash=s.driver_session_hash
    WHERE ${driverSQL} AND NOT EXISTS(SELECT 1 FROM launch.tracking_positions old WHERE old.share_id=s.id AND old.recorded_at>now()-interval '2 seconds')
    ON CONFLICT(share_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy_m=EXCLUDED.accuracy_m,recorded_at=EXCLUDED.recorded_at
    RETURNING recorded_at`,[shareId,req.userId,req.tokenHash,p.lat,p.lng,p.accuracy]);
  if(!r.rowCount)throw Object.assign(Error('Sharing stopped or position was sent too recently'),{status:409});
  res.json({receivedAt:r.rows[0].recorded_at});
 }));
 app.get('/api/tracking/:id/position',wrap(async(req,res)=>{
  ready();await limit(`tracking-read:${req.userId}`,300);
  const shareId=id.parse(req.params.id);
  const r=await db.query(`SELECT s.expires_at,p.latitude AS lat,p.longitude AS lng,p.accuracy_m AS accuracy,p.recorded_at
    FROM launch.tracking_shares s
    JOIN launch.tracking_drivers d ON d.user_id=s.driver_id AND d.disabled_at IS NULL
    JOIN launch.sessions sess ON sess.token_hash=s.driver_session_hash AND sess.expires_at>now()
    LEFT JOIN launch.tracking_positions p ON p.share_id=s.id AND p.recorded_at>now()-interval '15 seconds'
    WHERE s.id=$1 AND s.rider_id=$2 AND s.status='active' AND s.expires_at>now()`,[shareId,req.userId]);
  if(!r.rowCount)throw notFound();
  const row=r.rows[0];res.json({live:row.recorded_at!==null,position:row.recorded_at?{lat:Number(row.lat),lng:Number(row.lng),accuracy:Number(row.accuracy),recordedAt:row.recorded_at}:null,expiresAt:row.expires_at,stagingOnly:true});
 }));
 app.post('/api/tracking/:id/stop',wrap(async(req,res)=>{
  ready();const shareId=id.parse(req.params.id);
  const r=await db.query(`UPDATE launch.tracking_shares SET status='revoked',code_hash=$4
    WHERE id=$1 AND ((driver_id=$2 AND driver_session_hash=$3) OR rider_id=$2) AND status IN ('pending','active')
    RETURNING id`,[shareId,req.userId,req.tokenHash,hash('closed:'+randomBytes(24).toString('hex'))]);
  if(!r.rowCount)throw notFound();
  await db.query('DELETE FROM launch.tracking_positions WHERE share_id=$1',[shareId]);res.sendStatus(204);
 }));
 // A memory timer only does housekeeping; authorization and expiry are enforced at every read/write.
 let timer;
 return {
  start(){timer=setInterval(()=>clean().catch(()=>{}),60000);timer.unref?.();},
  stop(){if(timer)clearInterval(timer);},
  clean
 };
}
