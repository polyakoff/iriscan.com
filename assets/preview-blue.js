/* layered parallax: each [data-speed] moves at its own rate, the logo also turns slowly */
(function(){
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var els=[].slice.call(document.querySelectorAll('[data-speed]')), t=false;
  function f(){t=false;var y=window.scrollY||0;
    for(var i=0;i<els.length;i++){var e=els[i],s=+e.dataset.speed,r=+(e.dataset.rot||0);
      e.style.transform='translate3d(0,'+(y*s).toFixed(1)+'px,0)'+(r?' rotate('+(y*r).toFixed(2)+'deg)':'');}}
  addEventListener('scroll',function(){if(!t){t=true;requestAnimationFrame(f);}},{passive:true}); f();
})();
