/* Sound: generated with Web Audio, starts on first touch. */
export const SFX=(()=>{
  let ctx:AudioContext|null=null,master,roarG,roarF,brown,white,on=true;
  function init(){
    if(ctx){if(ctx.state==='suspended')ctx.resume();return;}
    const AC=window.AudioContext||(window as any).webkitAudioContext;if(!AC)return;
    try{ctx=new AC();}catch(e){return;}
    master=ctx.createGain();master.gain.value=on?0.8:0;master.connect(ctx.destination);
    const len=ctx.sampleRate*2;brown=ctx.createBuffer(1,len,ctx.sampleRate);white=ctx.createBuffer(1,len,ctx.sampleRate);
    const b=brown.getChannelData(0),w=white.getChannelData(0);let last=0;
    for(let i=0;i<len;i++){const r=Math.random()*2-1;w[i]=r;last=(last+0.02*r)/1.02;b[i]=last*3.5;}
    const src=ctx.createBufferSource();src.buffer=brown;src.loop=true;
    roarF=ctx.createBiquadFilter();roarF.type='lowpass';roarF.frequency.value=500;
    roarG=ctx.createGain();roarG.gain.value=0;
    src.connect(roarF);roarF.connect(roarG);roarG.connect(master);src.start();
  }
  function env(g,t,peak,att,dur){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+att);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);}
  function noise(dur:number,f0:number,f1:number,q:number,peak:number,type?:BiquadFilterType,useBrown?:boolean){
    if(!ctx)return;const t=ctx.currentTime;const s=ctx.createBufferSource();s.buffer=useBrown?brown:white;
    const f=ctx.createBiquadFilter();f.type=type||'bandpass';f.Q.value=q;f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(f1,t+dur);
    const g=ctx.createGain();env(g,t,peak,dur*0.25,dur);s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+dur+0.05);
  }
  function tone(fr:number,dur:number,peak:number,type?:OscillatorType,when?:number,fr1?:number){
    if(!ctx)return;const t=ctx.currentTime+(when||0);const o=ctx.createOscillator();o.type=type||'sine';
    o.frequency.setValueAtTime(fr,t);if(fr1)o.frequency.exponentialRampToValueAtTime(fr1,t+dur);
    const g=ctx.createGain();env(g,t,peak,0.012,dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+0.05);
  }
  const chime=lv=>[0,4,7,12].forEach((st,i)=>tone(523.25*Math.pow(2,(st+Math.min(lv,7)*2)/12),0.32,0.12,'triangle',i*0.07));
  return{
    init,
    pause(h){if(!ctx)return;try{h?ctx.suspend():ctx.resume();}catch(e){}},
    toggle(){on=!on;if(master)master.gain.value=on?0.8:0;return on;},
    update(h,barrel,size){if(!ctx)return;const t=ctx.currentTime;
      roarF.frequency.setTargetAtTime(barrel?230:320+h*650*size,t,0.25);
      roarG.gain.setTargetAtTime(barrel?0.85:0.22+0.3*h*size,t,0.3);},
    whoosh(){noise(0.32,700,2800,1.4,0.32);},
    air(){noise(0.6,400,3200,0.9,0.3);},
    land(){tone(150,0.25,0.45,'sine',0,55);noise(0.45,2200,400,0.7,0.35);},
    bonk(){tone(240,0.16,0.25,'square',0,90);},
    crash(){noise(1.3,2600,180,0.5,0.7,'lowpass',true);tone(95,0.7,0.45,'sine',0,38);},
    tube(){noise(1.1,250,1400,0.7,0.35);tone(110,0.9,0.18,'sine',0,70);},
    chime,
    pick(n){tone(700*Math.pow(1.06,n%12),0.16,0.16,'triangle',0,1400*Math.pow(1.06,n%12));},
    cheer(){noise(1.7,800,1500,0.35,0.22);chime(5);}
  };
})();
