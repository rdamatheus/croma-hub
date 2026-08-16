const slider=document.querySelector('[data-hero-slider]');
if(slider){
  const slides=[...slider.querySelectorAll('.hero-slide')];
  const dotsWrap=slider.querySelector('[data-hero-dots]');
  const prev=slider.querySelector('[data-hero-prev]');
  const next=slider.querySelector('[data-hero-next]');
  const progress=slider.querySelector('[data-hero-progress]');
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current=0;
  let timer=null;
  const interval=6000;

  slides.forEach((slide,index)=>{
    const dot=document.createElement('button');
    dot.type='button';
    dot.className='hero-slider-dot';
    dot.setAttribute('aria-label',`Ir para o banner ${index+1}`);
    dot.addEventListener('click',()=>{show(index);restart();});
    dotsWrap?.appendChild(dot);
  });

  const dots=[...slider.querySelectorAll('.hero-slider-dot')];

  function animateProgress(){
    if(!progress||reduceMotion)return;
    progress.classList.remove('running');
    void progress.offsetWidth;
    progress.classList.add('running');
  }

  function show(index){
    current=(index+slides.length)%slides.length;
    slides.forEach((slide,i)=>{
      const active=i===current;
      slide.classList.toggle('active',active);
      slide.setAttribute('aria-hidden',active?'false':'true');
      slide.querySelectorAll('a,button').forEach(el=>{el.tabIndex=active?0:-1;});
    });
    dots.forEach((dot,i)=>{
      dot.classList.toggle('active',i===current);
      dot.setAttribute('aria-current',i===current?'true':'false');
    });
    animateProgress();
  }

  function goNext(){show(current+1)}
  function goPrev(){show(current-1)}
  function start(){if(!reduceMotion&&slides.length>1)timer=window.setInterval(goNext,interval)}
  function stop(){if(timer){window.clearInterval(timer);timer=null}}
  function restart(){stop();start()}

  next?.addEventListener('click',()=>{goNext();restart()});
  prev?.addEventListener('click',()=>{goPrev();restart()});
  slider.addEventListener('mouseenter',stop);
  slider.addEventListener('mouseleave',start);
  slider.addEventListener('focusin',stop);
  slider.addEventListener('focusout',event=>{if(!slider.contains(event.relatedTarget))start()});
  slider.addEventListener('keydown',event=>{
    if(event.key==='ArrowRight'){goNext();restart()}
    if(event.key==='ArrowLeft'){goPrev();restart()}
  });

  let touchStartX=null;
  slider.addEventListener('touchstart',event=>{touchStartX=event.changedTouches[0]?.clientX??null},{passive:true});
  slider.addEventListener('touchend',event=>{
    if(touchStartX===null)return;
    const delta=(event.changedTouches[0]?.clientX??touchStartX)-touchStartX;
    if(Math.abs(delta)>45){delta<0?goNext():goPrev();restart()}
    touchStartX=null;
  },{passive:true});

  show(0);
  start();
}
