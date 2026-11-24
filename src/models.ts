/* Low-poly models: surfer, board, sea life, buoy, fin, boat. */
import * as THREE from 'three';

/* warm sunset rim light on every model (cheap fresnel term added to the stock shader) */
export const rimHook=s=>{s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n{float rim=1.0-saturate(abs(dot(normal,normalize(vViewPosition))));totalEmissiveRadiance+=vec3(1.0,0.55,0.3)*rim*rim*rim*0.5;}');};
export const mat=(c,o={})=>{const m=new THREE.MeshPhongMaterial(Object.assign({color:c,flatShading:true,shininess:12},o));m.onBeforeCompile=rimHook;return m;};
export function limb(a,b,r,m){
  const d=new THREE.Vector3().subVectors(b,a);const len=d.length();
  const me=new THREE.Mesh(new THREE.CylinderGeometry(r*0.85,r,len,6),m);
  me.position.copy(a).addScaledVector(d,0.5);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return me;
}
export const v3=(x,y,z)=>new THREE.Vector3(x,y,z);
export function makeSurfer(o){
  const root=new THREE.Group(),spin=new THREE.Group(),rider=new THREE.Group();
  root.add(spin);spin.add(rider);
  /* board: pointed nose with a little rocker, fuller tail, twin pinlines, tail pad, three fins */
  const bg=new THREE.SphereGeometry(1,14,4);bg.scale(1.18,0.075,0.31);
  {const p=bg.attributes.position as THREE.BufferAttribute;for(let i=0;i<p.count;i++){const u=p.getX(i)/1.18;
    if(u>0){p.setZ(i,p.getZ(i)*(1-0.4*u*u));p.setY(i,p.getY(i)+0.11*u*u*u);}
    else{p.setZ(i,p.getZ(i)*(1+2.4*u*u*(1-u*u)));p.setY(i,p.getY(i)+0.03*u*u);}}
   bg.computeVertexNormals();}
  const board=new THREE.Mesh(bg,mat(o.board,{shininess:70}));spin.add(board);
  const sm=mat(o.stripe);
  for(let k=-1;k<=1;k+=2){const stripe=new THREE.Mesh(new THREE.BoxGeometry(1.55,0.02,0.04),sm);stripe.position.set(0.05,0.066,k*0.075);spin.add(stripe);}
  const pad=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.022,0.3),mat(0x2a2233));pad.position.set(-0.74,0.06,0);spin.add(pad);
  [[-0.98,0,0.3],[-0.8,0.17,0.22],[-0.8,-0.17,0.22]].forEach(([fx,fz,fh])=>{
    const fin=new THREE.Mesh(new THREE.ConeGeometry(0.11,fh,3),sm);fin.position.set(fx,-0.04-fh/2,fz);fin.rotation.set(Math.PI,0,-0.3);fin.scale.z=0.45;spin.add(fin);});
  spin.add(limb(v3(-0.46,0.1,-0.04),v3(-1.02,0.05,-0.06),0.016,mat(0x2a2233)));
  const skin=mat(o.skin),top=mat(o.top),bot=mat(o.bottom);
  const fB=v3(-0.46,0.07,0),fF=v3(0.44,0.07,0),kB=v3(-0.36,0.46,0.14),kF=v3(0.4,0.46,0.1),hB=v3(-0.12,0.84,0),hF=v3(0.1,0.84,0);
  rider.add(limb(fB,kB,0.08,skin),limb(fF,kF,0.08,skin),limb(kB,hB,0.1,bot),limb(kF,hF,0.1,bot));
  [fB,fF].forEach(f=>{const ft=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.06,0.11),skin);ft.position.set(f.x+0.03,0.09,f.z+0.02);rider.add(ft);});
  const hip=v3(0,0.82,0);
  const upper=new THREE.Group();upper.position.copy(hip);rider.add(upper);
  upper.add(limb(v3(0,0,0),v3(0.1,0.54,0.03),0.21,top));
  const mkArm=(sh,el,ha)=>{const g=new THREE.Group();g.position.copy(sh);
    g.add(limb(v3(0,0,0),el.clone().sub(sh),0.065,top),limb(el.clone().sub(sh),ha.clone().sub(sh),0.055,skin));
    const hand=new THREE.Mesh(new THREE.IcosahedronGeometry(0.068,0),skin);hand.position.copy(ha).sub(sh);g.add(hand);upper.add(g);return g;};
  const armF=mkArm(v3(0.18,0.48,0.12),v3(0.48,0.33,0.24),v3(0.8,0.2,0.3));
  const armB=mkArm(v3(0.02,0.48,-0.1),v3(-0.34,0.36,-0.2),v3(-0.68,0.3,-0.18));
  const head=new THREE.Group();head.position.set(0.14,0.78,0.04);upper.add(head);
  head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16,0),skin));
  const hair=new THREE.Mesh(new THREE.IcosahedronGeometry(0.17,0),mat(o.hair));hair.scale.set(1,0.62,1);hair.position.set(-0.04,0.08,-0.02);head.add(hair);
  const tuft=new THREE.Mesh(new THREE.IcosahedronGeometry(0.085,0),hair.material);tuft.position.set(-0.19,0.07,-0.02);head.add(tuft);
  return {root,spin,rider,upper,armF,armB,head};
}
export function makeSeal(){
  const g=new THREE.Group();const m=mat(0x3a3f4c),m2=mat(0x52586a);
  const b=new THREE.Mesh(new THREE.IcosahedronGeometry(0.5,0),m);b.scale.set(1.7,0.55,0.7);g.add(b);
  const h=new THREE.Mesh(new THREE.IcosahedronGeometry(0.26,0),m2);h.position.set(0.85,0.28,0);g.add(h);
  const n=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.18,4),m2);n.rotation.z=-Math.PI/2;n.position.set(1.1,0.26,0);g.add(n);
  const t=new THREE.Mesh(new THREE.ConeGeometry(0.22,0.5,3),m);t.rotation.z=Math.PI/2;t.position.set(-0.95,0.05,0);t.scale.z=0.4;g.add(t);
  const eye=new THREE.MeshBasicMaterial({color:0x14151c});
  for(let k=-1;k<=1;k+=2){const e=new THREE.Mesh(new THREE.IcosahedronGeometry(0.045,0),eye);e.position.set(1.0,0.36,k*0.14);g.add(e);
    const fl=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.05,0.2),m);fl.position.set(0.3,-0.08,k*0.38);fl.rotation.y=k*-0.6;g.add(fl);}
  return g;
}
export function makeTurtle(){
  const g=new THREE.Group();const sh=mat(0x3f7d4c),pat=mat(0x8bb35a),sk=mat(0x9a8f5c);
  const s=new THREE.Mesh(new THREE.IcosahedronGeometry(0.6,0),sh);s.scale.set(1.15,0.42,0.95);g.add(s);
  const s2=new THREE.Mesh(new THREE.IcosahedronGeometry(0.34,0),pat);s2.scale.set(1.2,0.5,1);s2.position.y=0.14;g.add(s2);
  const h=new THREE.Mesh(new THREE.IcosahedronGeometry(0.2,0),sk);h.position.set(0.78,0.02,0);g.add(h);
  g.userData.flip=[];
  [[0.35,0.62],[0.35,-0.62],[-0.4,0.5],[-0.4,-0.5]].forEach(([x,z],k)=>{
    const f=new THREE.Mesh(new THREE.BoxGeometry(k<2?0.55:0.35,0.06,0.2),sk);f.position.set(x,-0.04,z);f.rotation.y=z>0?-0.5:0.5;g.add(f);g.userData.flip.push(f);});
  return g;
}
export function makeBuoy(){
  const g=new THREE.Group();
  const a=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.6,0.7,8),mat(0xf0523f));a.position.y=0.2;g.add(a);
  const b=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.5,0.45,8),mat(0xfff1e2));b.position.y=0.77;g.add(b);
  const c=new THREE.Mesh(new THREE.ConeGeometry(0.35,0.6,8),mat(0xf0523f));c.position.y=1.3;g.add(c);
  const l=new THREE.Mesh(new THREE.IcosahedronGeometry(0.12,0),new THREE.MeshBasicMaterial({color:0xfff2a0}));l.position.y=1.68;g.add(l);
  g.userData.light=l;return g;
}
export function makeFin(){
  const g=new THREE.Group();
  const f=new THREE.Mesh(new THREE.ConeGeometry(0.5,1.25,3),mat(0x2a3140));f.scale.set(1,1,0.28);f.position.y=0.45;f.rotation.z=0.28;g.add(f);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(0.55,0.08,3,10),mat(0xfff1e6));ring.rotation.x=Math.PI/2;ring.scale.set(1.4,1,1);g.add(ring);
  return g;
}
export function makeBoat(){
  const g=new THREE.Group();
  const hull=new THREE.BoxGeometry(4.2,0.9,1.6,3,1,1);const p=hull.attributes.position as THREE.BufferAttribute;
  for(let i=0;i<p.count;i++){const x=p.getX(i);if(x>1){p.setZ(i,p.getZ(i)*0.25);p.setY(i,p.getY(i)+0.15);}if(p.getY(i)<0)p.setZ(i,p.getZ(i)*0.6);}
  hull.computeVertexNormals();
  const h=new THREE.Mesh(hull,mat(0xf6ece0));h.position.y=0.35;g.add(h);
  const band=new THREE.Mesh(new THREE.BoxGeometry(3.4,0.14,1.62),mat(0x2f7f9a));band.position.set(-0.3,0.55,0);g.add(band);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.3,0.8,1.05),mat(0xffe6c8));cab.position.set(-0.6,1.15,0);g.add(cab);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.12,1.2),mat(0xff6b4a));roof.position.set(-0.6,1.6,0);g.add(roof);
  const glass=mat(0x2c5873,{shininess:80});
  const w1=new THREE.Mesh(new THREE.BoxGeometry(1.32,0.3,0.8),glass);w1.position.set(-0.6,1.25,0);g.add(w1);
  const w2=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.3,1.07),glass);w2.position.set(-0.6,1.25,0);g.add(w2);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.9,4),mat(0x6b4a3a));mast.position.set(-1.7,1.1,0);g.add(mast);
  const flag=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.42,3),mat(0xff6b4a));flag.scale.z=0.2;flag.rotation.z=Math.PI/2;flag.position.set(-1.93,1.4,0);g.add(flag);
  return g;
}
