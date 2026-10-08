/* =========================================================================
   图提取 ImageGrab · 官网交互脚本
   原生 JS，无依赖：滚动动画 / 导航高亮 / 移动端菜单 / 吸顶阴影
   ========================================================================= */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------
     1. 移动端菜单（汉堡展开 / 遮罩关闭 / Esc 关闭）
     ------------------------------------------------------------------ */
  var header = document.querySelector('.site-header');
  var navToggle = document.querySelector('.nav-toggle');
  var siteNav = document.querySelector('.site-nav');
  var backdrop = document.querySelector('.nav-backdrop');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.site-nav a'));

  function openMenu() {
    siteNav.classList.add('is-open');
    backdrop.hidden = false;
    // 强制重排后加类，保证遮罩淡入过渡生效
    void backdrop.offsetWidth;
    backdrop.classList.add('is-visible');
    navToggle.setAttribute('aria-expanded', 'true');
    navToggle.setAttribute('aria-label', '关闭菜单');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    siteNav.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', '打开菜单');
    document.body.style.overflow = '';
    // 过渡结束后隐藏遮罩
    setTimeout(function () {
      if (!siteNav.classList.contains('is-open')) backdrop.hidden = true;
    }, 250);
  }

  navToggle.addEventListener('click', function () {
    siteNav.classList.contains('is-open') ? closeMenu() : openMenu();
  });
  backdrop.addEventListener('click', closeMenu);
  navLinks.forEach(function (link) { link.addEventListener('click', closeMenu); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && siteNav.classList.contains('is-open')) closeMenu();
  });

  /* ------------------------------------------------------------------
     2. 吸顶阴影（滚动时给导航栏加柔和阴影）
     ------------------------------------------------------------------ */
  function onScrollHeader() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  /* ------------------------------------------------------------------
     3. 导航当前区块高亮（IntersectionObserver 滚动监听）
     ------------------------------------------------------------------ */
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var spyLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-list a'));

  var spyObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var id = entry.target.id;
        spyLinks.forEach(function (link) {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + id);
        });
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  sections.forEach(function (s) { spyObserver.observe(s); });

  /* ------------------------------------------------------------------
     4. 滚动进入视口时元素淡入上移（IntersectionObserver）
     ------------------------------------------------------------------ */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));

  revealEls.forEach(function (el) {
    var delay = parseInt(el.getAttribute('data-reveal-delay'), 10) || 0;
    el.style.transitionDelay = (delay * 80) + 'ms';
  });

  if (prefersReducedMotion) {
    // 尊重系统「减少动态效果」设置：直接显示，不播放动画
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(function (el) { revealObserver.observe(el); });
  }
})();
