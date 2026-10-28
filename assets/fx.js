/* Wix scroll-driven background effects — exact formulas extracted from the live
   site's WAAPI animations (ViewTimeline, range: cover):
   HERO media (.fx-hero): translateY(10svh -> -0.08*H)  ease cubic-bezier(.39,.575,.565,1)
                          scaleY(1.3 -> 1)              linear
                          perspective(100px) translateZ(0 -> 16.67px)  ease cubic-bezier(.47,0,.745,.715)
   PAN media (.fx-band):  translateX(8% -> -8%)         linear */
(function(){
  var items=[].slice.call(document.querySelectorAll('.px-media')).map(function(m){
    return {m:m, w:m.parentElement,
            hero:m.classList.contains('fx-hero'),
            band:m.classList.contains('fx-band')};
  }).filter(function(it){return it.hero||it.band;});
  if(!items.length) return;
  var vh=window.innerHeight, ticking=false;
  function easeOutSine(p){return Math.sin(p*Math.PI/2);}
  function easeInSine(p){return 1-Math.cos(p*Math.PI/2);}
  function apply(){
    ticking=false;
    for(var i=0;i<items.length;i++){
      var it=items[i], r=it.w.getBoundingClientRect();
      if(r.bottom<-80||r.top>vh+80) continue;
      /* ViewTimeline "cover" progress: 0 when section enters, 1 when it has left */
      var p=Math.min(1,Math.max(0,(vh-r.top)/(vh+r.height)));
      if(it.hero){
        var ty=(0.10*vh)*(1-easeOutSine(p)) + (-0.08*r.height)*easeOutSine(p);
        var sy=1.3-0.3*p;
        var tz=16.67*easeInSine(p);
        it.m.style.transform='translateY('+ty.toFixed(1)+'px) scaleY('+sy.toFixed(4)+') perspective(100px) translateZ('+tz.toFixed(2)+'px)';
      } else {
        it.m.style.transform='translateX('+(8-16*p).toFixed(2)+'%)';
      }
    }
  }
  function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(apply); } }
  window.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('resize', function(){ vh=window.innerHeight; onScroll(); });
  apply();
})();
/* Wix-style entry animations: add .in when element enters viewport */
(function(){
  var els=[].slice.call(document.querySelectorAll('.anim'));
  if(!els.length) return;
  if(!('IntersectionObserver' in window)){ els.forEach(function(e){e.classList.add('in');}); return; }
  var io=new IntersectionObserver(function(ents){
    ents.forEach(function(en){
      if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
    });
  },{threshold:0.15});
  els.forEach(function(e){ io.observe(e); });
})();
