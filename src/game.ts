/* The game: scene, wave, player, obstacles, barrel, HUD and main loop. */
import * as THREE from 'three';
import { SFX } from './audio';
import { clamp, lerp, sstep, rnd, $, fmt } from './util';
import { pickGoals, checkGoals, finishGoals } from './goals';
import { mat, makeSurfer, makeSeal, makeTurtle, makeBuoy, makeFin, makeBoat } from './models';

export function startGame(): void {
/* ---------- renderer / scene ---------- */
const canvas=$('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
const scene=new THREE.Scene();
const FOG=0xf7a27a;
scene.fog=new THREE.Fog(FOG,90,420);
const camera=new THREE.PerspectiveCamera(60,1,0.1,1500);

const V=11;          // how fast the wave peels (world units / s)
const RUN_LEN=(window as any).__RUN_LEN||75;    // seconds per wave
let T=0, waveScale=1;
const B={state:'idle',t:0,amt:0,cx:10,next:9};
const SIZES:[number,string][]=[[0.8,'Head high'],[1,'Overhead'],[1.25,'Double overhead']];
const SUN=new THREE.Vector3(-0.85,0.11,-0.52).normalize();

/* sky dome */
const sky=new THREE.Mesh(new THREE.SphereGeometry(600,32,16),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{sunDir:{value:SUN}},
  vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`uniform vec3 sunDir;varying vec3 vDir;
  void main(){vec3 d=normalize(vDir);float h=d.y;
   vec3 top=vec3(0.20,0.11,0.33),mid=vec3(0.84,0.34,0.44),low=vec3(0.99,0.66,0.47);
   vec3 col=mix(low,mid,smoothstep(0.02,0.24,h));col=mix(col,top,smoothstep(0.2,0.7,h));
   if(h<0.0)col=low;
   col=mix(col,vec3(1.0,0.80,0.63),exp(-abs(h)*15.0)*0.5);
   float s=max(dot(d,normalize(sunDir)),0.0);
   col+=vec3(1.0,0.5,0.22)*pow(s,6.0)*0.5;col+=vec3(1.0,0.82,0.5)*pow(s,70.0)*0.7;
   col=mix(col,vec3(1.0,0.96,0.82),smoothstep(0.9982,0.999,s));
   gl_FragColor=vec4(col,1.0);}`
}));
sky.renderOrder=-1;
scene.add(sky);

/* lights */
scene.add(new THREE.HemisphereLight(0xffc4a4,0x1a6a78,0.72));
const sunL=new THREE.DirectionalLight(0xffa463,0.55);sunL.position.copy(SUN).multiplyScalar(100);scene.add(sunL);
const fill=new THREE.DirectionalLight(0xffe0cf,0.5);fill.position.set(60,45,90);scene.add(fill);

/* ---------- materials ---------- */
const waterMat=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:64,specular:0x8a5a42,side:THREE.DoubleSide});
/* a little of the water's own colour glows through, so the face and the tube stay luminous in shade */
waterMat.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ntotalEmissiveRadiance+=vColor.rgb*0.09;');};

/* ---------- wave shape ---------- */
const mkP=()=>({H:0,c:0,w:0,p:0,broken:0});
const _PL=mkP(),_PO=mkP(),_PP=mkP(),_PS=mkP();
function params(x:number,o?:any){
  const edge=sstep(-112,-82,x)*sstep(152,120,x);
  const broken=sstep(-24,-38,x);
  let c=(1-sstep(-10,6,x))*(1-broken);
  if(B.amt>0){const win=sstep(B.cx-19,B.cx-11,x)*sstep(B.cx+12,B.cx+5,x);c=Math.max(c,B.amt*win);}
  let H=5.4-2.4*sstep(14,95,x);
  H=H*(1-broken)+2.7*broken;
  H*=edge*waveScale*(1+0.035*Math.sin(T*0.9+x*0.06));
  const w=lerp(7.8,4.6,c)*(1+0.5*broken);
  const p=lerp(1.35,2.4,c);
  o=o||mkP();o.H=H;o.c=c;o.w=w;o.p=p;o.broken=broken;return o;
}
function hgt(x,z,P){
  let y;
  if(z<0) y=P.H*Math.exp(-z*z/98);
  else if(z<=P.w){const sf=z/P.w;y=P.H*Math.pow(1-sf,P.p);
    if(P.c>0){const yc=P.H*(1-Math.sqrt(Math.max(0,1-(1-sf)*(1-sf))));y+=(yc-y)*P.c*0.85;}}
  else{const d=z-P.w;y=-0.28*(1-Math.exp(-d*1.5))*Math.exp(-d/5);}
  y+=0.07*Math.sin(x*0.9+T*2.1+z*0.6)+0.05*Math.sin(z*1.3-T*1.7+x*0.3);
  if(P.broken>0){
    y+=P.broken*P.H*0.22*Math.sin(x*1.9+T*6)*Math.cos(z*1.6-T*4.5);
    y+=P.broken*0.5*Math.max(0,1-Math.abs(z-P.w*0.4)/P.w);
  }
  return y;
}
const LO=[[0,0],[0.03,0.11],[0.13,0.21],[0.3,0.27],[0.5,0.25],[0.7,0.15],[0.87,-0.06],[0.99,-0.38],[1.05,-0.74]];
const LK=LO.length;
function lipPoint(x,P,k,out){
  const base=hgt(x,0,P);
  const wob=k>=5?Math.sin(x*0.8+T*3.2)*0.18*P.c*(k-4)/4:0;
  out.set(x,base+P.c*LO[k][1]*P.H+wob,P.c*LO[k][0]*P.w);
  return out;
}
const lace=(x,z)=>Math.sin(x*0.37+Math.sin(z*0.51)*2)*Math.sin(z*0.29-x*0.11+Math.sin(x*0.13)*1.5);

/* main wave mesh: rows along x, columns follow the wave profile (denser on the face) */
const BACK=[-60,-44,-33,-25,-19,-14.5,-11,-8.2,-6,-4.2,-2.8,-1.6,-0.7];
const FACE=[0,0.025,0.06,0.11,0.18,0.27,0.37,0.48,0.6,0.72,0.85,1];
const FRONT=[0.5,1.2,2.1,3.3,4.8,6.8,9.5,13,18,25,34,46,60];
const NZ=BACK.length+FACE.length+FRONT.length;
const X0=-110,X1=150,DX=2,NX=(X1-X0)/DX+1;
const jit=new Float32Array(NX*NZ*2);
for(let i=0;i<jit.length;i++)jit[i]=Math.random()*2-1;
function buildGrid(nx,nz,alt){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nx*nz*3),3));
  g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(nx*nz*3),3));
  const idx=[];
  for(let i=0;i<nx-1;i++)for(let j=0;j<nz-1;j++){
    const a=i*nz+j,b=(i+1)*nz+j,c=(i+1)*nz+j+1,d=i*nz+j+1;
    if(alt&&((i+j)&1)){idx.push(a,d,c,a,c,b);}else{idx.push(a,d,b,b,d,c);}
  }
  g.setIndex(idx);
  return g;
}
const waveGeo=buildGrid(NX,NZ,true);
const wave=new THREE.Mesh(waveGeo,waterMat);wave.frustumCulled=false;scene.add(wave);
const lipGeo=buildGrid(NX,LK,false);
const lip=new THREE.Mesh(lipGeo,waterMat);lip.frustumCulled=false;scene.add(lip);

const C=h=>new THREE.Color(h);
const COL={backDeep:C(0x0c4860),backTop:C(0x1d7f8e),glow:C(0x78f8dc),mid:C(0x15a4a8),deep:C(0x0a5670),warm:C(0xffd2a0),glint:C(0xfff2cf),
  trough:C(0x12798a),flat:C(0x22a59f),reef:C(0x56d8c2),foam:C(0xfff1e6),lipLight:C(0xc8fff1)};
const tmp=new THREE.Color(),tmp2=new THREE.Color();
const rowP=[];for(let i=0;i<NX;i++)rowP.push(mkP());
const _lv=new THREE.Vector3();
function updateWave(){
  const pos=((waveGeo.attributes.position as THREE.BufferAttribute).array as Float32Array),col=((waveGeo.attributes.color as THREE.BufferAttribute).array as Float32Array);
  const scroll=V*T;
  for(let i=0;i<NX;i++){
    const xr=X0+i*DX;const P=params(xr,rowP[i]);
    for(let j=0;j<NZ;j++){
      const n=i*NZ+j;
      let z,s=-1;
      if(j<BACK.length){z=BACK[j];z+=jit[n*2+1]*(j>0?(BACK[j]-BACK[j-1])*0.22:1);}
      else if(j<BACK.length+FACE.length){s=FACE[j-BACK.length];z=s*P.w+(s>0&&s<1?jit[n*2+1]*0.025*P.w:0);}
      else{const k=j-BACK.length-FACE.length;z=P.w+FRONT[k]+jit[n*2+1]*(k>0?(FRONT[k]-FRONT[k-1])*0.22:0.15);}
      const x=xr+jit[n*2]*0.55;
      const y=hgt(x,z,P);
      pos[n*3]=x;pos[n*3+1]=y;pos[n*3+2]=z;
      // colour
      if(z<0){tmp.copy(COL.backDeep).lerp(COL.backTop,clamp(y/Math.max(P.H,0.5),0,1));}
      else if(z<=P.w){
        const sf=z/P.w;
        tmp.copy(COL.glow).lerp(COL.mid,sstep(0.05,0.75,sf)).lerp(COL.deep,sstep(0.7,1,sf)*0.55);
        tmp.lerp(COL.warm,0.17*sstep(0.34,0,sf)*(1-P.c));              // sunset light caught under the crest
        const rib=Math.sin((x+scroll*0.6)*0.5+sf*5);if(rib>0.55)tmp.lerp(COL.glow,(rib-0.55)*0.4*(1-sf)); // light ribs running up the face
        const l=lace(x+scroll*1.1,z*2.2);if(l>0.5)tmp.lerp(COL.foam,(l-0.5)*0.9);
      }else{
        const d=z-P.w;
        tmp.copy(COL.trough).lerp(COL.flat,sstep(0,8,d));
        const r=Math.sin((x+scroll)*0.07+1.7)*Math.sin(z*0.13+Math.sin((x+scroll)*0.031)*2);
        if(r>0.25)tmp.lerp(COL.reef,sstep(0.25,0.7,r)*0.8);
        const l=lace(x+scroll,z);
        if(l>0.42)tmp.lerp(COL.foam,Math.min(1,(l-0.42)*2.2)*(0.55+0.4*sstep(6,0,d)));
        const tw=Math.sin(T*2.4+jit[n*2]*40);if(tw>0.92)tmp.lerp(COL.glint,(tw-0.92)*8*sstep(1.5,10,d)); // sun glints twinkling on the flats
      }
      if(z>-1.3&&z<0.7)tmp.lerp(COL.foam,0.32*(1-P.c)+0.05);
      if(P.broken>0)tmp.lerp(COL.foam,P.broken*(0.72+0.22*lace(x*2+T*8,z*3)));
      col[n*3]=tmp.r;col[n*3+1]=tmp.g;col[n*3+2]=tmp.b;
    }
  }
  waveGeo.attributes.position.needsUpdate=true;waveGeo.attributes.color.needsUpdate=true;
  // lip
  const lp=((lipGeo.attributes.position as THREE.BufferAttribute).array as Float32Array),lc=((lipGeo.attributes.color as THREE.BufferAttribute).array as Float32Array);
  const v=_lv;
  for(let i=0;i<NX;i++){
    const xr=X0+i*DX,P=rowP[i];
    for(let k=0;k<LK;k++){
      const n=i*LK+k;lipPoint(xr,P,k,v);
      lp[n*3]=v.x;lp[n*3+1]=v.y;lp[n*3+2]=v.z;
      const f=k/(LK-1);
      tmp.copy(COL.glow).lerp(COL.mid,Math.sin(f*Math.PI)*0.5).lerp(COL.lipLight,f*f);
      tmp.lerp(COL.warm,0.16*Math.sin(f*Math.PI)*(0.5+0.5*Math.sin(xr*0.5+V*T*0.3)));
      if(f>0.7)tmp.lerp(COL.foam,(f-0.7)*3);
      {const l=lace(xr*1.4+V*T*1.6,k*1.9);if(l>0.45)tmp.lerp(COL.foam,Math.min(0.7,(l-0.45)*1.6));}
      lc[n*3]=tmp.r;lc[n*3+1]=tmp.g;lc[n*3+2]=tmp.b;
    }
  }
  lipGeo.attributes.position.needsUpdate=true;lipGeo.attributes.color.needsUpdate=true;
}

/* far ocean */
{
  const g=new THREE.PlaneGeometry(1400,1400,56,56);g.rotateX(-Math.PI/2);
  const p=((g.attributes.position as THREE.BufferAttribute).array as Float32Array);const cols=new Float32Array(p.length);
  for(let i=0;i<p.length;i+=3){p[i+1]=-0.55+Math.random()*0.2;
    tmp.copy(COL.flat).lerp(COL.backDeep,Math.random()*0.35);cols[i]=tmp.r;cols[i+1]=tmp.g;cols[i+2]=tmp.b;}
  g.setAttribute('color',new THREE.BufferAttribute(cols,3));
  scene.add(new THREE.Mesh(g,new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:60,specular:0x8a5a3a})));
}

/* islands + palms on the horizon, clouds */
{
  const isl=new THREE.MeshBasicMaterial({color:0x6b3f72,fog:false});
  const isl2=new THREE.MeshBasicMaterial({color:0x8a4f7a,fog:false});
  const mk=(x,z,sx,sy,sz,m)=>{const g=new THREE.IcosahedronGeometry(1,1);const me=new THREE.Mesh(g,m);me.scale.set(sx,sy,sz);me.position.set(x,-sy*0.35,z);scene.add(me);return me;};
  mk(-330,-150,70,26,40,isl);mk(-290,-210,40,15,30,isl2);mk(-380,-60,46,12,30,isl2);mk(-250,-300,90,34,50,isl);
  const palm=(x,z,h,lean)=>{
    const grp=new THREE.Group();
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.9,h,5),isl);tr.position.y=h/2;tr.rotation.z=lean;grp.add(tr);
    for(let k=0;k<6;k++){const fr=new THREE.Mesh(new THREE.ConeGeometry(1.4,8,3),isl);
      fr.position.set(Math.sin(lean)*-h*0.5,h,0);fr.rotation.set(Math.cos(k)*0.3,k*1.05,Math.PI/2.4);fr.translateY(3.5);grp.add(fr);}
    grp.position.set(x,4,z);scene.add(grp);
  };
  palm(-318,-144,16,0.25);palm(-332,-150,13,-0.2);palm(-346,-138,18,0.12);palm(-262,-292,15,-0.3);
  const cl=[0xffb58f,0xf39aa0,0xffd0a8];
  for(let k=0;k<9;k++){
    const grp=new THREE.Group();const m=new THREE.MeshBasicMaterial({color:cl[k%3],fog:false});
    for(let q=0;q<4;q++){const b=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),m);b.scale.set(rnd(14,26),rnd(5,9),rnd(9,14));b.position.set(q*16-24,rnd(-3,3),rnd(-6,6));grp.add(b);}
    const a=Math.atan2(SUN.z,SUN.x)+rnd(-0.75,0.6);const r=rnd(360,440);
    grp.position.set(Math.cos(a)*r,rnd(45,150),Math.sin(a)*r);grp.lookAt(0,grp.position.y,0);scene.add(grp);
  }
}

/* coastline: a bay curving round behind the reef, with beach, green hills, palms, huts and a lighthouse */
{
  const pts=[[-150,170],[-195,60],[-205,-30],[-160,-120],[-90,-190],[10,-235],[120,-250]];
  const curve=new THREE.CatmullRomCurve3(pts.map(([x,z])=>new THREE.Vector3(x,0,z)));
  const NU=90;const D=[0,4,9,14,24,40,62,95,150];const HY=[-0.6,0.5,1.1,3.2,9,18,26,30,14];
  const g=buildGrid(NU,D.length,true);
  const pa=((g.attributes.position as THREE.BufferAttribute).array as Float32Array),ca=((g.attributes.color as THREE.BufferAttribute).array as Float32Array);
  const cs=[C(0xf3cf9c),C(0xf3cf9c),C(0xe9bd86),C(0x5f9a5e),C(0x3f7d55),C(0x346a4e),C(0x6a5576),C(0x7b5a7c),C(0x8a5f80)];
  const beach=[];
  for(let i=0;i<NU;i++){
    const u=i/(NU-1);const c=curve.getPoint(u);const t=curve.getTangent(u);
    let out=new THREE.Vector3(t.z,0,-t.x);if(out.dot(c)<0)out.negate();
    const bump=1+0.55*Math.sin(u*19)+0.35*Math.sin(u*47+1);
    for(let j=0;j<D.length;j++){
      const n=i*D.length+j;const d=D[j]+(j>1?Math.sin(i*1.7+j)*2:0);
      pa[n*3]=c.x+out.x*d;pa[n*3+2]=c.z+out.z*d;
      pa[n*3+1]=j<3?HY[j]:HY[j]*bump+Math.sin(i*2.3+j*1.1)*1.5;
      tmp.copy(cs[j]);if(j>=3&&j<6)tmp.lerp(C(0x7fae5f),0.25+0.25*Math.sin(i*0.9+j));
      ca[n*3]=tmp.r;ca[n*3+1]=tmp.g;ca[n*3+2]=tmp.b;
    }
    beach.push({c,out,u});
  }
  scene.add(new THREE.Mesh(g,new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:4})));
  const trunk=mat(0x6b4a3a),frond=mat(0x2f6b45),frond2=mat(0x3f8450);
  const palm=(x,z,h,lean)=>{
    const grp=new THREE.Group();
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.6,h,5),trunk);tr.position.y=h/2;tr.rotation.z=lean;grp.add(tr);
    const top=new THREE.Vector3(-Math.sin(lean)*h,h*Math.cos(lean),0);
    for(let k=0;k<7;k++){const fr=new THREE.Mesh(new THREE.ConeGeometry(0.9,5.5,3),k%2?frond:frond2);
      fr.position.copy(top);fr.rotation.set(0,k*0.9,Math.PI/2.2);fr.translateY(2.4);grp.add(fr);}
    grp.position.set(x,0.6,z);grp.rotation.y=Math.random()*6.28;scene.add(grp);
  };
  beach.forEach((b,i)=>{
    if(i%2===0&&b.u>0.08&&b.u<0.85){const d=rnd(7,13);palm(b.c.x+b.out.x*d,b.c.z+b.out.z*d,rnd(7,12),rnd(-0.35,0.35));}
    if(i%9===4&&b.u<0.8){const hut=new THREE.Group();const base=new THREE.Mesh(new THREE.BoxGeometry(4,2.6,3.4),mat(0xf6e2c4));base.position.y=1.3;hut.add(base);
      const roof=new THREE.Mesh(new THREE.ConeGeometry(3.4,2.6,4),mat(0xc9784a));roof.position.y=3.8;roof.rotation.y=Math.PI/4;hut.add(roof);
      const d=13;hut.position.set(b.c.x+b.out.x*d,1.2,b.c.z+b.out.z*d);hut.rotation.y=rnd(0,3);scene.add(hut);}
  });
  const lb=curve.getPoint(0.36);const lh=new THREE.Group();
  const tw=new THREE.Mesh(new THREE.CylinderGeometry(1.4,2.2,16,8),mat(0xfff3e6));tw.position.y=8;lh.add(tw);
  for(let k=0;k<2;k++){const st=new THREE.Mesh(new THREE.CylinderGeometry(1.75-k*0.4,1.95-k*0.4,2.4,8),mat(0xe8503a));st.position.y=4+k*6;lh.add(st);}
  const lamp=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,2,8),new THREE.MeshBasicMaterial({color:0xfff0a8}));lamp.position.y=17;lh.add(lamp);
  const cap=new THREE.Mesh(new THREE.ConeGeometry(1.7,2,8),mat(0xe8503a));cap.position.y=19;lh.add(cap);
  lh.position.set(lb.x*1.06,2,lb.z*1.06);scene.add(lh);
}

/* ---------- player ---------- */
const player=makeSurfer({board:0xfff0dc,stripe:0x18b3b0,skin:0xb5764f,top:0xff6b4a,bottom:0x24335a,hair:0x2b1a14});
scene.add(player.root);
const pl:any={prone:0,wipe:0,camY:2,landT:0,qAir:new THREE.Quaternion(),f:0.45,vf:0,fT:0.45,xs:10,air:false,airT:0,z0:0,y0:0,lean:0,barrelT:0,lastSign:0,snapCd:0,pos:new THREE.Vector3(),fwd:new THREE.Vector3(1,0,0),side:new THREE.Vector3(0,0,1),up:new THREE.Vector3(0,1,0)};
const AIR_DUR=1.15;

const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_u=new THREE.Vector3(),_m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_q2=new THREE.Quaternion();
function surfaceFrame(x,z,P,vx,vz,obj,outF?,outU?,outS?){
  const e=0.2;
  const dydx=(hgt(x+e,z,params(x+e,_PS))-hgt(x-e,z,params(x-e,_PS)))/(2*e);
  const dydz=(hgt(x,z+e,P)-hgt(x,z-e,P))/(2*e);
  const n=_a.set(-dydx,1,-dydz).normalize();
  const f=_b.set(vx,vx*dydx+vz*dydz,vz).normalize();
  const s=_c.crossVectors(f,n).normalize();
  const u=_u.crossVectors(s,f);
  _m.makeBasis(f,u,s);obj.quaternion.setFromRotationMatrix(_m);
  if(outF){outF.copy(f);outU.copy(u);outS.copy(s);}
}

/* ---------- obstacles ---------- */
const UP=new THREE.Vector3(0,1,0);
const obstacles=[];
const KINDS=['seal','turtle','buoy','fin','rider','seal','buoy'];
const riderColors=[{board:0xffa3b8,stripe:0x3b2a5a,skin:0x8a5a3c,top:0x5ff0d6,bottom:0x3b2a5a,hair:0xf0c060},{board:0xfff27a,stripe:0xff6b4a,skin:0xd9a07a,top:0x6a5cff,bottom:0x1d2b3a,hair:0x5a2a14}];
const OBS_V=7.5,WAVE_V=4.5;
function spawn(adv){
  const z0=rnd(20,28),tt=(z0-4)/WAVE_V;
  let x=11+OBS_V*tt+rnd(-7,7);
  const kind=KINDS[Math.floor(Math.random()*KINDS.length)];
  const o:any={kind,x,phase:Math.random()*6.28,yaw:rnd(-0.8,0.8),hit:false,rel:1,face:true,f:0.3,zo:0,r:1};
  if(kind==='seal'){o.mesh=makeSeal();o.f=rnd(0.12,0.65);o.r=1.1;}
  else if(kind==='turtle'){o.mesh=makeTurtle();o.f=rnd(0.02,0.4);o.r=1.0;}
  else if(kind==='buoy'){o.mesh=makeBuoy();o.face=false;o.zo=rnd(0.1,1.2);o.r=0.9;}
  else if(kind==='fin'){o.mesh=makeFin();o.face=false;o.zo=rnd(0.3,2.2);o.r=0.9;o.rel=0.65;}
  else{const s=makeSurfer(riderColors[Math.floor(Math.random()*2)]);o.mesh=s.root;o.sur=s;o.f=rnd(0.35,0.7);o.r=1.3;o.rel=0.45;}
  if(kind!=='rider'){o.face=false;o.z=z0-WAVE_V*tt*adv;o.x=x-OBS_V*tt*adv;}
  else{o.x=x-OBS_V*tt*adv*0.5+20;}
  o.mesh.scale.multiplyScalar(kind==='rider'?1:1.15);
  scene.add(o.mesh);obstacles.push(o);
}
const boats=[];
function spawnBoat(x){const m=makeBoat();scene.add(m);boats.push({mesh:m,x,zo:rnd(20,30),phase:Math.random()*6});}

/* ---------- particles ---------- */
const dotTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(0.45,'rgba(255,255,255,.8)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);return t;})();
const chipTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  g.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3+0.3,r=k%2?27:30;g.lineTo(32+Math.cos(a)*r,32+Math.sin(a)*r);}g.closePath();g.clip();
  const r=g.createLinearGradient(8,6,56,58);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(0.55,'rgba(255,255,255,.95)');r.addColorStop(1,'rgba(255,236,224,.72)');
  g.fillStyle=r;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
function Particles(N,size,opacity,color,tex?){
  const pos=new Float32Array(N*3).fill(-999),vel=new Float32Array(N*3),life=new Float32Array(N);let head=0;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const pts=new THREE.Points(g,new THREE.PointsMaterial({size,map:tex||dotTex,alphaTest:0.02,transparent:true,opacity,depthWrite:false,color,sizeAttenuation:true}));
  pts.frustumCulled=false;scene.add(pts);
  return{
    emit(x,y,z,vx,vy,vz,l){const i=head;head=(head+1)%N;pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=z;vel[i*3]=vx;vel[i*3+1]=vy;vel[i*3+2]=vz;life[i]=l;},
    update(dt,grav,drift){for(let i=0;i<N;i++){if(life[i]<=0)continue;life[i]-=dt;
      if(life[i]<=0){pos[i*3+1]=-999;continue;}
      vel[i*3+1]-=grav*dt;pos[i*3]+=(vel[i*3]-drift)*dt;pos[i*3+1]+=vel[i*3+1]*dt;pos[i*3+2]+=vel[i*3+2]*dt;}
      g.attributes.position.needsUpdate=true;}
  };
}
const spray=Particles(1400,0.4,0.95,0xfff6ee,chipTex);
const mist=Particles(200,2.2,0.22,0xffe9dc);

/* ---------- wake trail ---------- */
const TN=80;
const trail=[];
const trGeo=new THREE.BufferGeometry();
trGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(TN*2*3),3));
trGeo.setAttribute('alpha',new THREE.BufferAttribute(new Float32Array(TN*2),1));
{const idx=[];for(let i=0;i<TN-1;i++){const a=i*2,b=a+1,c=a+2,d=a+3;idx.push(a,b,c,b,d,c);}trGeo.setIndex(idx);}
const trMesh=new THREE.Mesh(trGeo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  vertexShader:'attribute float alpha;varying float vA;void main(){vA=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  uniforms:{uCol:{value:new THREE.Color(1,0.97,0.93)}},
  fragmentShader:'uniform vec3 uCol;varying float vA;void main(){gl_FragColor=vec4(uCol,vA);}'}));
trMesh.frustumCulled=false;scene.add(trMesh);
function updateTrail(dt,push){
  for(const p of trail){p.x-=V*dt;p.age+=dt;}
  if(push)trail.unshift({x:push.x,z:push.z,sx:push.sx,sz:push.sz,age:0,gap:push.gap});
  while(trail.length>TN)trail.pop();
  const pos=((trGeo.attributes.position as THREE.BufferAttribute).array as Float32Array),al=((trGeo.attributes.alpha as THREE.BufferAttribute).array as Float32Array);
  for(let i=0;i<TN;i++){
    const p=trail[i]||trail[trail.length-1];
    if(!p){al[i*2]=al[i*2+1]=0;continue;}
    const y=hgt(p.x,p.z,params(p.x,_PL))+0.09;const hw=0.16+p.age*0.55;
    pos[i*6]=p.x+p.sx*hw;pos[i*6+1]=y;pos[i*6+2]=p.z+p.sz*hw;
    pos[i*6+3]=p.x-p.sx*hw;pos[i*6+4]=y;pos[i*6+5]=p.z-p.sz*hw;
    const a=(i<trail.length&&!p.gap)?Math.max(0,0.55*(1-p.age/1.35)):0;al[i*2]=al[i*2+1]=a;
  }
  trGeo.attributes.position.needsUpdate=true;trGeo.attributes.alpha.needsUpdate=true;
}

/* ---------- barrel pearls (bonus pickups) ---------- */
const pearls=[];let pearlT=0,pearlPh=0,pearlN=0;
const pearlGeo=new THREE.IcosahedronGeometry(0.3,0);
const pearlMat=new THREE.MeshBasicMaterial({color:0xfff4c8}),goldMat=new THREE.MeshBasicMaterial({color:0xffc24a});
const haloGeo=new THREE.SphereGeometry(0.62,10,8);
const haloMat=new THREE.MeshBasicMaterial({color:0xfff0c0,transparent:true,opacity:0.3,depthWrite:false,blending:THREE.AdditiveBlending});
function updatePearls(dt){
  if(B.state==='barrel'){pearlT-=dt;
    if(pearlT<=0){pearlT=0.32;pearlPh+=0.5;const gold=Math.random()<0.12;
      const m=new THREE.Mesh(pearlGeo,gold?goldMat:pearlMat);m.add(new THREE.Mesh(haloGeo,haloMat));if(gold)m.scale.setScalar(1.45);
      scene.add(m);pearls.push({m,gold,x:pl.pos.x+18,f:clamp(0.44+0.27*Math.sin(pearlPh)+rnd(-0.04,0.04),0.14,0.73)});}}
  for(let i=pearls.length-1;i>=0;i--){
    const q=pearls[i];q.x-=V*0.9*dt;const P=params(q.x,_PL);const z=P.w*(1-q.f);
    q.m.position.set(q.x,hgt(q.x,z,P)+0.75,z);q.m.rotation.y+=dt*3;q.m.rotation.x+=dt*2;
    let gone=q.x<pl.pos.x-0.9||B.state==='idle';
    if(!gone&&B.state==='barrel'&&!(pl.wipe>0)&&Math.abs(q.x-pl.pos.x)<1.2&&Math.abs(z-pl.pos.z)<0.9){
      gone=true;pearlN++;if(!G.demo)G.pearls++;award(q.gold?300:80);SFX.pick(pearlN);if(pearlN%3===0)addCombo(1);
      for(let k=0;k<14;k++)spray.emit(q.m.position.x,q.m.position.y,q.m.position.z,rnd(-3,3),rnd(-1,3),rnd(-2,2),rnd(0.3,0.6));}
    if(gone){scene.remove(q.m);pearls.splice(i,1);}
  }
}

/* ---------- wind streaks ---------- */
const SN=46;const stGeo=new THREE.BufferGeometry();const stPos=new Float32Array(SN*6);const stD=[];
for(let i=0;i<SN;i++)stD.push({x:rnd(-15,30),y:rnd(0.6,8),z:rnd(-4,9),l:rnd(1.5,3.5)});
stGeo.setAttribute('position',new THREE.BufferAttribute(stPos,3));
const stMat=new THREE.LineBasicMaterial({color:0xfff6ec,transparent:true,opacity:0,depthWrite:false});
const streaks=new THREE.LineSegments(stGeo,stMat);streaks.frustumCulled=false;scene.add(streaks);
function updateStreaks(dt,amt,cx,cz){
  stMat.opacity+=(amt-stMat.opacity)*(1-Math.exp(-dt*4));streaks.visible=stMat.opacity>0.02;
  for(let i=0;i<SN;i++){const d=stD[i];d.x-=V*2.4*dt;if(d.x<-15){d.x=rnd(22,32);d.y=rnd(0.6,8);d.z=rnd(-4,9);}
    const L=d.l*(0.6+amt*2.2);
    stPos[i*6]=cx+d.x;stPos[i*6+1]=d.y;stPos[i*6+2]=cz+d.z;stPos[i*6+3]=cx+d.x+L;stPos[i*6+4]=d.y;stPos[i*6+5]=cz+d.z;}
  stGeo.attributes.position.needsUpdate=true;
}

/* ---------- game state + HUD ---------- */
const G={stopT:0,slowT:0,size:1,wave:1,score:0,combo:0,comboT:0,bestMult:1,airs:0,barrelTot:0,barrels:0,pearls:0,near:0,hits:0,wipes:0,endPending:false,goals:[] as any[],phase:'ride',padT:0,shoreT:0,shoreCall:false,shoreAmt:0,runT:0,demo:true,ended:false,shake:0,fovKick:0};
const MAX_WIPES=3;
/* paddle-in: the marker sweeps across the meter as the wave lifts you; tap in the sweet spot to pop up */
const PAD_LEAD=0.7,PAD_SWEEP=2.2,PAD_SWEET=0.72;
const SHORE_LEN=4.2;   // ride-out: wave settles, surfer celebrates, camera eases back, then the card
const mult=()=>Math.min(8,1+Math.floor(G.combo/2));
const floatsEl=document.getElementById('floats'),glowEl=document.getElementById('glow');
const el={score:$('score'),mult:$('mult'),combo:$('combo'),fill:$('fill'),time:$('time'),pops:$('pops'),hint:$('hint'),demo:$('demoTag'),tuck:$('tuck'),waveName:$('waveName'),card:$('card'),flash:$('flash'),goals:$('goals'),paddle:$('paddle'),padMark:$('padMark')};
function popup(text:string,sub?:string,bad?:boolean){
  if(G.ended)return;
  const d=document.createElement('div');d.className='pop'+(bad?' bad':'');d.textContent=text;
  if(sub){const s=document.createElement('small');s.textContent=sub;d.appendChild(s);}
  el.pops.appendChild(d);setTimeout(()=>d.remove(),1300);
  while(el.pops.children.length>2)el.pops.firstChild.remove();
}
function addCombo(n){const before=mult();G.combo+=n;G.comboT=4;G.bestMult=Math.max(G.bestMult,mult());
  const m=mult();
  if(m>before){SFX.chime(m);el.combo.classList.remove('lvl');void el.combo.offsetWidth;el.combo.classList.add('lvl');
    glowEl.style.opacity=m>=5?'1':'0.55';setTimeout(()=>glowEl.style.opacity='0',380);
    if(m>=5&&before<5){popup('ON FIRE','×'+m+' multiplier');SFX.cheer();}}
  else{el.combo.classList.add('bump');setTimeout(()=>el.combo.classList.remove('bump'),150);}}
const _sp=new THREE.Vector3();
function floater(txt){
  if(G.ended)return;_sp.copy(pl.pos);_sp.y+=1.8;_sp.project(camera);if(_sp.z>1)return;
  const x=(_sp.x*0.5+0.5)*window.innerWidth,y=(-_sp.y*0.5+0.5)*window.innerHeight;
  const d=document.createElement('div');d.className='floater';d.textContent=txt;
  d.style.setProperty('--at',`translate(${(x-30).toFixed(0)}px,${(y-20).toFixed(0)}px)`);
  floatsEl.appendChild(d);setTimeout(()=>d.remove(),1000);while(floatsEl.children.length>5)floatsEl.firstChild.remove();
}
function award(base){const pts=Math.round(base*mult());G.score+=pts;floater('+'+fmt(pts));return pts;}
function resetRun(next?:boolean){const sz=SIZES[Math.floor(Math.random()*3)];G.size=sz[0];if(next)G.wave++;el.waveName.textContent='Wave '+G.wave+' · '+sz[1];
  Object.assign(B,{state:'idle',t:0,amt:0,next:rnd(6,10)});el.tuck.classList.remove('call');pl.wipe=0;
  Object.assign(G,{score:0,combo:0,comboT:0,bestMult:1,airs:0,barrelTot:0,barrels:0,pearls:0,near:0,hits:0,wipes:0,endPending:false,runT:0,ended:false,phase:G.demo?'ride':'paddle',padT:-PAD_LEAD,shoreT:0,shoreCall:false});trail.length=0;
  G.goals=pickGoals(G.size);renderGoals();}

/* ---------- goals HUD + end of run ---------- */
function renderGoals(){
  el.goals.replaceChildren(...G.goals.map(g=>{const li=document.createElement('li');li.textContent=g.text;
    li.className=g.done?'done':g.failed?'failed':'';return li;}));
}
function popUp(){
  if(G.phase!=='paddle')return;
  const m=clamp(G.padT/PAD_SWEEP,0,1),off=Math.abs(m-PAD_SWEET);
  G.phase='ride';pl.fT=0.45;pl.vf=1.2;
  if(off<0.07){addCombo(2);const p=award(500);popup('PERFECT TAKEOFF','+'+fmt(p));SFX.cheer();G.stopT=0.06;}
  else if(off<0.17){addCombo(1);const p=award(200);popup('NICE TAKEOFF','+'+fmt(p));SFX.whoosh();}
  else{popup(m<PAD_SWEET?'EARLY TAKEOFF':'LATE TAKEOFF','No bonus');SFX.whoosh();}
}
function countUp(node:HTMLElement,to:number){
  const t0=performance.now(),dur=900;node.textContent='0';
  const tick=(now:number)=>{const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);node.textContent=fmt(Math.round(to*e));if(k<1)requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
}
function endRun(wipedOut:boolean){
  document.body.classList.remove('outro');
  G.ended=true;G.phase='ride';G.demo=true;el.card.hidden=false;
  const stars=finishGoals(G.goals);
  $('cLabel').textContent=wipedOut?'Three wipeouts':'Wave reached shore';
  countUp($('cScore'),Math.round(G.score));
  $('cTitle').textContent=stars===3?'Epic ride':stars===2?'Great ride':stars===1?'Good ride':wipedOut?'Rough wave':'Keep paddling';
  $('cStars').replaceChildren(...[0,1,2].map(i=>{const st=document.createElement('span');st.textContent='★';if(i<stars){st.className='on';st.style.animationDelay=(1.1+i*0.25)+'s';}return st;}));
  $('cStars').setAttribute('aria-label',stars+' of 3 stars');
  $('cGoals').replaceChildren(...G.goals.map(g=>{const li=document.createElement('li');li.textContent=g.text;li.className=g.done?'done':'';return li;}));
  $('cCombo').textContent='×'+G.bestMult;$('cAirs').textContent=String(G.airs);$('cBarrel').textContent=G.barrelTot.toFixed(1)+'s';
  if(stars>0)setTimeout(()=>SFX.cheer(),1100+stars*250);
  G.runT=0;
}

/* ---------- input ---------- */
let tuckBtn=false,dragId=null,lastY=0;const keys:any={};
function takeOver(){if(G.demo){G.demo=false;const keep=B.state;resetRun();if(keep!=='idle')Object.assign(B,{state:'idle',next:4});el.demo.hidden=true;setTimeout(()=>el.hint.style.opacity='0',5000);}}
canvas.addEventListener('pointerdown',e=>{if(G.ended)return;const wasDemo=G.demo;takeOver();if(!wasDemo)popUp();dragId=e.pointerId;lastY=e.clientY;canvas.setPointerCapture&&canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==dragId)return;const dy=e.clientY-lastY;lastY=e.clientY;pl.fT=clamp(pl.fT-dy/window.innerHeight*2.4,-0.05,1.2);});
const endDrag=e=>{if(e.pointerId===dragId)dragId=null;};
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
el.tuck.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();try{el.tuck.setPointerCapture(e.pointerId);}catch(_){}if(G.ended)return;const wasDemo=G.demo;takeOver();if(!wasDemo&&G.phase==='paddle'){popUp();return;}tuckBtn=true;el.tuck.classList.add('on');});
const tuckUp=()=>{tuckBtn=false;el.tuck.classList.remove('on');};
el.tuck.addEventListener('pointerup',tuckUp);el.tuck.addEventListener('lostpointercapture',tuckUp);el.tuck.addEventListener('pointercancel',tuckUp);
el.tuck.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('pointerdown',()=>SFX.init(),true);
addEventListener('keydown',()=>SFX.init(),true);
document.addEventListener('visibilitychange',()=>SFX.pause(document.hidden));
$('snd').addEventListener('pointerdown',e=>e.stopPropagation());
$('snd').addEventListener('click',e=>{SFX.init();const on=SFX.toggle();$('sndWaves').style.display=on?'':'none';$('sndX').style.display=on?'none':'';(e.currentTarget as HTMLElement).setAttribute('aria-label',on?'Mute sound':'Turn sound on');});
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','KeyW','KeyS','Space'].includes(e.code)){e.preventDefault();if(!G.ended){const wasDemo=G.demo;takeOver();if(!wasDemo&&e.code==='Space'&&G.phase==='paddle'&&!e.repeat){popUp();return;}}keys[e.code]=true;if(e.code==='Space'){tuckBtn=true;el.tuck.classList.add('on');}}});
addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='Space')tuckUp();});
$('again').addEventListener('click',()=>{el.card.hidden=true;G.demo=false;resetRun(true);});

/* ---------- resize ---------- */
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.userData.baseFov=w/h<1?74:54;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();

/* ---------- initial world ---------- */
[0.15,0.4,0.65,0.9].forEach(a=>spawn(a));
spawnBoat(70);

/* ---------- main loop ---------- */
const camPos=new THREE.Vector3(24,8,15),camTgt=new THREE.Vector3(4,2,2);
const nPos=new THREE.Vector3(),nTgt=new THREE.Vector3(),bPos=new THREE.Vector3(),bTgt=new THREE.Vector3();
let RDT=0.016,barrelBlend=0,last=performance.now(),inBarrelPrev=false;
const lipV=new THREE.Vector3();
const hud:any={m:-1,s:-1,p:-1,f:-1,t:-1,g:'',gh:null};

function step(dt){
  T+=dt;if(G.phase==='ride')G.runT+=dt;
  const prog=clamp(G.runT/RUN_LEN,0,1);
  /* shoreAmt eases in during the ride-out and back out slowly afterwards, so nothing pops */
  const shoreK=G.phase==='shore'?sstep(0,3,G.shoreT):0;
  G.shoreAmt+=(shoreK-G.shoreAmt)*(1-Math.exp(-dt*(shoreK>G.shoreAmt?6:0.8)));
  waveScale=G.size*(1+0.08*Math.sin(T*0.35))*(1-0.22*sstep(0.6,1,prog*(1-G.shoreAmt)))*(1-0.5*G.shoreAmt);
  if(G.demo){if(G.runT>=RUN_LEN){const e=G.ended;resetRun();G.ended=e;}}
  else if(!G.ended){
    if(G.phase==='paddle'){G.padT+=dt;if(G.padT>=PAD_SWEEP)popUp();}
    else if(G.phase==='ride'){
      if(!G.shoreCall&&G.runT>=RUN_LEN-4){G.shoreCall=true;popup('RIDE IT IN','Finish clean for a bonus');}
      if(G.runT>=RUN_LEN){G.runT=RUN_LEN;G.phase='shore';G.shoreT=0;
        if(B.state==='forming'){B.state='idle';B.amt=0;el.tuck.classList.remove('call');}
        document.body.classList.add('outro');
        if(!(pl.wipe>0)&&!pl.air){const p=award(400);popup('SHORE BREAK','Finish bonus +'+fmt(p));SFX.cheer();G.slowT=0.9;}}
    }else if(G.phase==='shore'){G.shoreT+=dt;if(G.shoreT>=SHORE_LEN&&!(pl.wipe>0))endRun(false);}
  }

  /* demo pilot */
  let tuck=tuckBtn;
  if(G.demo){
    const m=T%24;
    pl.fT=0.5+0.38*Math.sin(T*1.25);
    if(B.state==='barrel'){const nx=pearls.find(q=>q.x>pl.pos.x+0.5);if(nx)pl.fT=nx.f;}
    if(m>7.6&&m<8.4)pl.fT=1.18;
    tuck=(B.state==='forming'&&B.amt>0.3)||B.state==='barrel';
  }
  if(keys.ArrowUp||keys.KeyW)pl.fT=clamp(pl.fT+dt*1.7,-0.05,1.2);
  if(keys.ArrowDown||keys.KeyS)pl.fT=clamp(pl.fT-dt*1.7,-0.05,1.2);
  if(G.phase==='paddle'){pl.fT=0.12;tuck=false;}
  if(G.phase==='shore'){pl.fT=lerp(pl.fT,0.32,1-Math.exp(-dt*2));tuck=false;}

  const inPocket=false;
  if(G.phase==='ride')B.next-=dt;
  if(B.state==='idle'&&B.next<=0&&G.phase==='ride'&&!pl.air&&!(pl.wipe>0)){B.state='forming';B.t=0;B.cx=pl.xs;popup('BARREL FORMING','Hold TUCK');el.tuck.classList.add('call');}
  else if(B.state==='forming'){B.t+=dt;B.amt=sstep(0,2.8,B.t);
    if(tuck&&B.t>0.15&&!pl.air&&!(pl.wipe>0)){B.state='barrel';B.t=0;el.tuck.classList.remove('call');
      G.slowT=1.3;G.fovKick=-8;pearlN=0;pearlT=0.4;popup('TUCKED IN','Grab the pearls');SFX.tube();for(let q=0;q<40;q++){const lx=pl.xs+rnd(-8,6);const LP=params(lx,_PL);lipPoint(lx,LP,LK-1,lipV);spray.emit(lipV.x,lipV.y,lipV.z,rnd(-1,1),rnd(1,4),rnd(0.5,3),rnd(0.8,1.5));}}
    else if(B.t>=2.8){wipeout('CAUGHT INSIDE');B.state='closing';B.t=0;}}
  else if(B.state==='barrel'){B.t+=dt;B.amt=Math.min(1,B.amt+dt*3);
    if(!tuck){wipeout('THE LIP GOT YOU');B.state='closing';B.t=0;}
    else if(B.t>=5.2){B.state='closing';B.t=0;}}
  else if(B.state==='closing'){B.t+=dt;B.amt=1-sstep(0,1.4,B.t);
    if(B.t<0.4)for(let q=0;q<6;q++){const lx=B.cx+rnd(-12,10);const LP=params(lx,_PL);lipPoint(lx,LP,LK-1,lipV);spray.emit(lipV.x,lipV.y,lipV.z,rnd(-2,2),rnd(2,6),rnd(0,4),rnd(0.6,1.2));}
    if(B.t>=1.4){B.state='idle';B.amt=0;B.next=rnd(12,18);el.tuck.classList.remove('call');}}
  if(B.state!=='idle')B.cx+=(pl.xs-B.cx)*(1-Math.exp(-dt*3));
  if(tuck)pl.fT=B.state==='barrel'?clamp(pl.fT,0.13,0.74):clamp(pl.fT,0.3,0.55);

  /* steering spring */
  if(!pl.air&&!(pl.wipe>0)){
    pl.vf+=((pl.fT-pl.f)*18-pl.vf*7)*dt;
    pl.f+=pl.vf*dt;
    if(pl.f>=0.97){
      if(pl.vf>0.75&&!tuck&&!inPocket){pl.air=true;pl.airT=0;}
      pl.f=0.97;if(!pl.air)pl.vf=Math.min(pl.vf,0);
    }
    if(pl.f<0.02){pl.f=0.02;pl.vf=Math.max(pl.vf,0);}
  }
  const xT=8+7*pl.f;
  pl.xs+=(xT-pl.xs)*(1-Math.exp(-dt*1.1));

  const P=params(pl.xs,_PP);
  let x=pl.xs,z,y;
  if(pl.air){
    if(pl.airT===0){pl.z0=P.w*(1-pl.f);pl.y0=hgt(x,pl.z0,P);
      for(let k=0;k<40;k++)spray.emit(x+rnd(-1,1),pl.y0,pl.z0+rnd(-0.4,0.4),rnd(-3,1),rnd(2,6),rnd(-3,-0.5),rnd(0.5,1.1));
      G.fovKick=6;SFX.air();}
    pl.airT+=dt;const k=clamp(pl.airT/AIR_DUR,0,1);
    z=lerp(pl.z0,P.w*0.22,k*k);y=lerp(pl.y0,hgt(x,P.w*0.22,P),k*k)+3.4*Math.sin(Math.PI*k);
    pl.fwd.set(1,k<0.5?1.0*(1-2*k):-0.3*Math.sin(Math.PI*(k-0.5)*2),-0.25).normalize();
    pl.side.crossVectors(pl.fwd,UP).normalize();pl.up.crossVectors(pl.side,pl.fwd);
    _m.makeBasis(pl.fwd,pl.up,pl.side);player.root.quaternion.setFromRotationMatrix(_m);
    const e=k<0.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    player.spin.rotation.y=e*Math.PI*2;
    player.spin.rotation.x=Math.sin(Math.PI*k)*0.25;
    player.armF.rotation.z=-1.3*Math.sin(Math.PI*k);player.armB.rotation.z=1.1*Math.sin(Math.PI*k);player.upper.rotation.y=Math.sin(Math.PI*k)*0.9;
    if(k>=1){pl.air=false;pl.landT=0.3;pl.qAir.copy(player.root.quaternion);pl.f=0.78;pl.vf=-0.6;pl.fT=Math.min(pl.fT,0.72);player.spin.rotation.set(0,0,0);
      G.airs++;addCombo(2);award(650);popup('AIR 360');SFX.land();G.stopT=0.04;G.shake=0.1;
      for(let q=0;q<30;q++)spray.emit(x+rnd(-1,1),hgt(x,P.w*0.22,P),P.w*0.22+rnd(-0.5,0.5),rnd(-4,0),rnd(1,4),rnd(-1,2),rnd(0.4,0.9));}
  }else{
    if(pl.wipe>0){pl.wipe-=dt;pl.f=lerp(pl.f,0.1,1-Math.exp(-dt*2));pl.vf=0;
      player.spin.rotation.set(T*7,0,Math.sin(T*5)*1.2);
      if(pl.wipe<=0){player.spin.rotation.set(0,0,0);pl.f=pl.fT=0.4;if(G.endPending&&!G.ended)endRun(true);}}
    z=P.w*(1-pl.f);y=hgt(x,z,P);
    surfaceFrame(x,z,P,V,-P.w*pl.vf*0.9,player.root,pl.fwd,pl.up,pl.side);
    pl.lean+=(clamp(-pl.vf*0.45,-0.55,0.55)-pl.lean)*(1-Math.exp(-dt*6));
    _q.setFromAxisAngle(pl.fwd,pl.lean);player.root.quaternion.premultiply(_q);
    if(pl.landT>0){pl.landT-=dt;const tq=_q2.copy(player.root.quaternion);player.root.quaternion.copy(pl.qAir).slerp(tq,1-Math.max(0,pl.landT)/0.3);}
    player.rider.scale.y=1-0.14*Math.min(1,Math.abs(pl.vf))-(tuck?0.2:0);
    animateBody(dt,tuck);
  }
  /* prone paddling pose while waiting to pop up */
  pl.prone+=((G.phase==='paddle'?1:0)-pl.prone)*(1-Math.exp(-dt*(G.phase==='paddle'?6:12)));
  {const pr=pl.prone;player.rider.rotation.z=-1.42*pr;player.rider.position.set(-0.62*pr,0.02*pr,0);
   if(pr>0.05){const sw=T*5.5;player.armF.rotation.z=lerp(player.armF.rotation.z,Math.sin(sw)*1.3-0.4,pr);player.armB.rotation.z=lerp(player.armB.rotation.z,Math.sin(sw+Math.PI)*1.3+0.4,pr);
     player.upper.rotation.z=lerp(player.upper.rotation.z,0.25,pr);player.head.rotation.z=0.9*pr;}else player.head.rotation.z=0;}
  /* ride-out celebration: stand tall, arms up */
  if(G.phase==='shore'&&!(pl.wipe>0)&&!pl.air){const c=sstep(0.3,1.2,G.shoreT),k=1-Math.exp(-dt*5);
    player.armF.rotation.z+=(lerp(player.armF.rotation.z,2.3+Math.sin(T*4)*0.15,c)-player.armF.rotation.z)*k;
    player.armB.rotation.z+=(lerp(player.armB.rotation.z,-2.3-Math.sin(T*4+1)*0.15,c)-player.armB.rotation.z)*k;
    player.upper.rotation.z+=(lerp(player.upper.rotation.z,0.05,c)-player.upper.rotation.z)*k;
    player.rider.scale.y=lerp(player.rider.scale.y,1.04,c);}
  pl.pos.set(x,y,z);
  player.root.position.copy(pl.pos);

  function animateBody(dt,tk){
    const k=1-Math.exp(-dt*7),u=player.upper,aF=player.armF,aB=player.armB;
    const twist=clamp(-pl.vf*0.85,-0.95,0.95)+Math.sin(T*2.1)*0.1;
    const bend=tk?-0.75:-0.22-0.25*Math.min(1,Math.abs(pl.vf));
    u.rotation.y+=(twist-u.rotation.y)*k;
    u.rotation.z+=(bend-u.rotation.z)*k;
    u.rotation.x+=(pl.lean*0.6-u.rotation.x)*k;
    aF.rotation.z+=((tk?-0.9:0.5*pl.vf+Math.sin(T*3.1)*0.15)-aF.rotation.z)*k;
    aF.rotation.x+=((tk?0.6:-0.3*pl.vf)-aF.rotation.x)*k;
    aB.rotation.z+=((tk?0.9:-0.7*pl.vf+Math.sin(T*2.7+1)*0.18)-aB.rotation.z)*k;
    aB.rotation.x+=((tk?-0.5:0.4*pl.vf)-aB.rotation.x)*k;
    player.head.rotation.y+=(-u.rotation.y*0.7-player.head.rotation.y)*k;
  }
  function wipeout(msg){
    if(pl.wipe>0)return;pl.wipe=1.6;pl.barrelT=0;pl.air=false;G.combo=0;G.comboT=0;G.shake=0.7;
    el.flash.style.opacity='0.5';setTimeout(()=>el.flash.style.opacity='0',120);
    if(!G.demo&&!G.ended){G.wipes++;if(G.wipes>=MAX_WIPES)G.endPending=true;}
    popup(msg,G.demo?'Wiped out':'Wipeout '+G.wipes+' of '+MAX_WIPES,true);SFX.crash();el.tuck.classList.remove('call');
    for(let q=0;q<60;q++)spray.emit(pl.pos.x+rnd(-1,1),pl.pos.y+0.5,pl.pos.z,rnd(-5,3),rnd(2,7),rnd(-2,4),rnd(0.5,1.2));
  }

  /* carving tricks */
  pl.snapCd-=dt;
  if(!pl.air&&!(pl.wipe>0)&&Math.abs(pl.vf)>0.7){
    const sg=Math.sign(pl.vf);
    if(pl.lastSign&&sg!==pl.lastSign&&pl.snapCd<=0){
      if(sg<0&&pl.f>0.6){addCombo(1);const p=award(120);popup('SNAP');burst(28);SFX.whoosh();G.stopT=0.07;}
      else if(sg>0&&pl.f<0.4){addCombo(1);const p=award(90);popup('BOTTOM TURN');burst(18);SFX.whoosh();G.stopT=0.05;}
      pl.snapCd=0.6;
    }
    pl.lastSign=sg;
    for(let q=0;q<3;q++){const t=pl.pos;spray.emit(t.x-0.6+rnd(-0.3,0.3),t.y+0.1,t.z+pl.side.z*0.3,rnd(-5,-2),rnd(1.5,3.5)*Math.abs(pl.vf),pl.side.z*rnd(1,3)*Math.sign(pl.lean||1),rnd(0.3,0.6));}
  }
  function burst(n){const t=pl.pos;for(let q=0;q<n;q++)spray.emit(t.x-0.4+rnd(-0.4,0.4),t.y+0.1,t.z,rnd(-6,-1),rnd(2.5,6),rnd(-2.5,2.5),rnd(0.4,0.9));}

  /* barrel */
  const inBarrel=B.state==='barrel'&&!(pl.wipe>0);
  if(inBarrel){pl.barrelT+=dt;G.score+=dt*120*mult();}
  if(!inBarrel&&inBarrelPrev&&pl.barrelT>0.5){
    G.barrelTot+=pl.barrelT;if(!G.demo)G.barrels++;addCombo(2);const p=award(pl.barrelT*380);popup('BARREL '+pl.barrelT.toFixed(1)+'s',pearlN?pearlN+(pearlN>1?' pearls':' pearl'):'Spat out!');SFX.cheer();G.stopT=0.08;pl.barrelT=0;
  }
  if(!inBarrel&&!inBarrelPrev)pl.barrelT=0;
  inBarrelPrev=inBarrel;

  /* points for riding */
  if(G.phase!=='paddle'&&!pl.air&&!(pl.wipe>0))G.score+=dt*28*(0.5+1.5*pl.f)*mult();
  if(G.comboT>0){G.comboT-=dt;if(G.comboT<=0){G.combo=0;}}

  updatePearls(dt);
  if(B.state==='barrel')for(let q=0;q<5;q++){const lx=pl.pos.x+rnd(7,20);const LP=params(lx,_PL);lipPoint(lx,LP,2+Math.floor(Math.random()*6),lipV);
    spray.emit(lipV.x,lipV.y-0.2,lipV.z,-V*0.9,rnd(-2,0),rnd(-0.5,0.5),rnd(0.3,0.7));}

  /* obstacles */
  for(let i=obstacles.length-1;i>=0;i--){
    const o=obstacles[i];const px=o.x;
    if(o.kind==='rider')o.x-=V*o.rel*dt;else{o.x-=OBS_V*dt;o.z-=WAVE_V*dt;}
    const OP=params(o.x,_PO);
    let oz,of=o.f;
    if(o.kind==='rider'){of=o.f+0.12*Math.sin(T*1.6+o.phase);}
    if(o.kind==='rider'){oz=OP.w*(1-of);}else{oz=o.z+(o.kind==='fin'?Math.sin(T*1.3+o.phase)*1.2:0);}
    const oy=hgt(o.x,oz,OP);
    o.mesh.position.set(o.x,oy,oz);
    if(o.kind==='rider'){
      surfaceFrame(o.x,oz,OP,V,-OP.w*0.12*1.6*Math.cos(T*1.6+o.phase),o.mesh);
    }else if(o.kind==='fin'){
      o.mesh.rotation.set(0,Math.PI-Math.cos(T*1.3+o.phase)*0.6,0);o.mesh.position.y=Math.max(oy,-0.1)-0.15;
    }else{
      const e=0.25,dz=(hgt(o.x,oz+e,OP)-hgt(o.x,oz-e,OP))/(2*e);
      _a.set(0,1,-dz).normalize();o.mesh.quaternion.setFromUnitVectors(UP,_a);o.mesh.rotateY(o.yaw+Math.sin(T*0.8+o.phase)*0.2);
      o.mesh.position.y+=(o.kind==='buoy'?Math.sin(T*2+o.phase)*0.12-0.25:0.05);
      if(o.kind==='turtle')o.mesh.userData.flip.forEach((f,k)=>f.rotation.x=Math.sin(T*4+k)*0.5);
      if(o.kind==='buoy')o.mesh.userData.light.visible=Math.sin(T*5+o.phase)>0;
    }
    o.mesh.visible=!(B.state!=='idle'&&barrelBlend>0.2&&Math.abs(o.x-pl.pos.x)<22)&&!(G.phase==='shore'&&Math.abs(o.x-pl.pos.x)<9);
    // collisions + close calls
    const dx=o.x-pl.pos.x,dz=oz-pl.pos.z;
    if(!G.demo&&G.phase==='ride'&&B.state!=='barrel'&&!pl.air&&!(pl.wipe>0)&&!o.hit&&Math.abs(dx)<o.r+0.8&&Math.abs(dz)<o.r){
      o.hit=true;G.hits++;G.combo=0;G.comboT=0;G.shake=0.5;
      el.flash.style.opacity='0.35';setTimeout(()=>el.flash.style.opacity='0',90);
      popup('BONK!','Combo lost',true);SFX.bonk();
      for(let q=0;q<30;q++)spray.emit(pl.pos.x,pl.pos.y+0.3,pl.pos.z,rnd(-4,3),rnd(2,5),rnd(-3,3),rnd(0.4,0.9));
      pl.vf+=(pl.f>0.5?-1.2:1.2);
    }else if(!G.demo&&G.phase==='ride'&&B.state!=='barrel'&&!o.hit&&px>pl.pos.x&&o.x<=pl.pos.x&&Math.abs(dz)<3.2&&!pl.air){
      G.near++;addCombo(1);award(150);popup('CLOSE CALL');
    }
    if(o.x<-34||(o.z!==undefined&&o.z<-9)){scene.remove(o.mesh);obstacles.splice(i,1);spawn(0);}
  }
  for(const b of boats){
    b.x-=V*0.8*dt;const BP=params(b.x,_PL);const bz=BP.w+b.zo;
    b.mesh.position.set(b.x,hgt(b.x,bz,BP)+Math.sin(T*1.4+b.phase)*0.12-0.1,bz);
    b.mesh.rotation.set(Math.sin(T*1.1+b.phase)*0.06,2.6,Math.sin(T*1.3)*0.05);
    if(b.x<-90){b.x=rnd(160,220);b.zo=rnd(20,32);}
  }

  /* spray from the lip, crest feathering, whitewater */
  for(let q=0;q<5;q++){
    const lx=rnd(-26,4);const LP=params(lx,_PL);if(LP.c<0.35)continue;
    lipPoint(lx,LP,LK-1,lipV);
    spray.emit(lipV.x,lipV.y,lipV.z,rnd(-1,1),rnd(0.5,3),rnd(0.8,3.2),rnd(0.5,1.1));
  }
  for(let q=0;q<3;q++){
    const lx=rnd(-6,50);const LP=params(lx,_PL);
    spray.emit(lx,hgt(lx,0,LP)+0.1,rnd(-0.3,0.3),rnd(-1,1),rnd(2.4,4.6),rnd(-4.5,-2),rnd(0.6,1.2));
  }
  for(let q=0;q<4;q++){
    const lx=rnd(-70,-22);const LP=params(lx,_PL);const lz=rnd(-0.5,LP.w*1.1);
    spray.emit(lx,hgt(lx,lz,LP)+0.2,lz,rnd(-1,1),rnd(2,5),rnd(-0.5,2.5),rnd(0.5,1.0));
  }
  if(Math.random()<dt*14){const lx=rnd(-75,-30);const LP=params(lx,_PL);const lz=rnd(0,LP.w);mist.emit(lx,hgt(lx,lz,LP)+0.8,lz,rnd(-1,1),rnd(0.5,1.5),rnd(0,1.5),rnd(1.4,2.4));}
  spray.update(dt,9,V*0.15);
  mist.update(dt,-0.2,V*0.3);

  /* wake */
  updateTrail(dt,{x:pl.pos.x-pl.fwd.x*0.9,z:pl.pos.z-pl.fwd.z*0.9,sx:pl.side.x,sz:pl.side.z,gap:pl.air||pl.wipe>0});

  /* camera: 3/4 front view, swinging into the tube */
  const bT=inBarrel?1:0;
  barrelBlend+=(bT-barrelBlend)*(1-Math.exp(-RDT*(bT?4.5:2.5)));
  pl.camY+=((pl.air?lerp(pl.pos.y,P.H,0.6):pl.pos.y)-pl.camY)*(1-Math.exp(-RDT*3.5));const py=pl.camY;
  nPos.set(pl.pos.x+6.5,6.8+0.3*py+(G.size-1)*5,pl.pos.z+15+(G.size-1)*4);
  nTgt.set(pl.pos.x+2.4,1.3+0.45*py,pl.pos.z-2.5);
  bPos.set(pl.pos.x-7.5,pl.pos.y+1.0,pl.pos.z+1.1);
  bTgt.set(pl.pos.x+12,pl.pos.y+1.2,pl.pos.z+0.4);
  nPos.lerp(bPos,barrelBlend);nTgt.lerp(bTgt,barrelBlend);
  if(G.shoreAmt>0.001){const a=G.shoreAmt;nPos.x+=1.5*a;nPos.y+=4.5*a;nPos.z+=6*a;nTgt.x-=2.6*a;nTgt.y+=0.4*a;nTgt.z-=3*a;}
  const kk=1-Math.exp(-RDT*(barrelBlend>0.05&&barrelBlend<0.95?7:4));camPos.lerp(nPos,kk);camTgt.lerp(nTgt,kk);
  camera.position.copy(camPos);
  if(G.shake>0){G.shake-=dt;const s=G.shake*0.6;camera.position.x+=rnd(-s,s);camera.position.y+=rnd(-s,s);}
  camera.lookAt(camTgt);
  camera.rotateZ(-0.04-barrelBlend*0.06);
  G.fovKick*=Math.exp(-RDT*2.5);
  const hiSpeed=pl.air||pl.wipe>0?0:sstep(0.45,0.95,pl.f);
  camera.fov=(camera.userData.baseFov||60)+G.fovKick+barrelBlend*6+hiSpeed*7*(1-barrelBlend);camera.updateProjectionMatrix();
  updateStreaks(RDT,Math.max(hiSpeed*0.45,barrelBlend*0.6),pl.pos.x,pl.pos.z);
  SFX.update(pl.air?0.7:pl.f,barrelBlend>0.5,G.size);
  sky.position.copy(camera.position);

  /* HUD: frozen once the run is over, while the demo keeps riding behind the end card */
  if(!G.ended){const m=mult();
   if(!G.demo&&G.goals.length){const fresh=checkGoals(G.goals,G);
     const key=G.goals.map(g=>g.done?1:g.failed?2:0).join('');
     if(key!==hud.g){hud.g=key;renderGoals();}
     for(const g of fresh){popup('GOAL!',g.text);SFX.cheer();}}
   const gh=G.demo;if(gh!==hud.gh){hud.gh=gh;el.goals.hidden=gh;}
   const pv=!G.demo&&G.phase==='paddle';if(pv!==hud.pv){hud.pv=pv;el.paddle.hidden=!pv;}
   if(pv)el.padMark.style.left=(clamp(G.padT/PAD_SWEEP,0,1)*100).toFixed(1)+'%';
   if(m!==hud.m){hud.m=m;el.combo.classList.toggle('heat2',m>=3&&m<5);el.combo.classList.toggle('heat3',m>=5);el.mult.textContent='×'+m;
     const hot=sstep(2,5,m);trMesh.material.uniforms.uCol.value.setRGB(1,0.97-0.2*hot,0.93-0.6*hot);}
   const sc=Math.round(G.score);if(sc!==hud.s){hud.s=sc;el.score.textContent=fmt(sc);}
   const cp=Math.round(G.comboT*25);if(cp!==hud.p){hud.p=cp;el.combo.style.setProperty('--p',(cp/100).toFixed(2));}
   const fw=Math.round(prog*1000);if(fw!==hud.f){hud.f=fw;el.fill.style.width=(fw/10)+'%';}
   const left=Math.max(0,Math.ceil(RUN_LEN-G.runT));if(left!==hud.t){hud.t=left;el.time.textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');}}
}

function frame(now){
  const rdt=Math.min(0.05,(now-last)/1000);last=now;RDT=rdt;
  let ts=1;if(G.stopT>0){G.stopT-=rdt;ts=0.04;}else if(G.slowT>0){G.slowT-=rdt;ts=0.28+0.72*sstep(0.35,0,G.slowT);}
  step(rdt*ts);updateWave();
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
updateWave();
requestAnimationFrame(t=>{last=t;frame(t);});
}
