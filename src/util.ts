/* Small math and DOM helpers. */
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export function sstep(a,b,x){let t=(x-a)/(b-a);t=t<0?0:t>1?1:t;return t*t*(3-2*t);}
export const rnd=(a,b)=>a+Math.random()*(b-a);
export const $=id=>document.getElementById(id);
export const fmt=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');
