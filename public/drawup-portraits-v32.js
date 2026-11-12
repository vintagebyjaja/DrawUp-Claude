/* DrawUp v32 portraits: face shots of Arch Coach and the Hall of Fame legends, made with the AUREVIA character kit v4
 * avatar maker (bodies: Quaternius, CC0; see /drawup-portraits-v32/THIRD_PARTY_NOTICE.txt) and saved as still images.
 * Legend faces are DrawUp's stylized characters, not likenesses of the real people.
 *   window.DrawUpPortraits = { has(key), url(key), img(key, cls, alt), KEYS }
 * 'arch-coach' is the default Arch Coach face (members who haven't customized their coach). Customized coaches keep
 * their own look from the coach creator.
 */
(function () {
  'use strict';
  if (window.DrawUpPortraits) return;
  const V = '32.0', DIR = '/drawup-portraits-v32/';
  // every face shot planned; READY lists the ones whose image is in /drawup-portraits-v32/ (only those are shown)
  const PLANNED = ['arch-coach', 'paul-r-williams', 'julia-morgan', 'frank-lloyd-wright', 'zaha-hadid', 'norma-merrick-sklarek',
    'ove-arup', 'i-m-pei', 'fazlur-rahman-khan', 'emily-warren-roebling', 'tadao-ando'];
  const READY = PLANNED;
  const KEYS = PLANNED.filter(k => READY.includes(k));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const has = k => KEYS.includes(k);
  const url = k => has(k) ? `${DIR}${k}.webp?v=${V}` : '';
  const img = (k, cls, alt) => has(k) ? `<img class="du-face ${esc(cls || '')}" src="${url(k)}" alt="${esc(alt || '')}" decoding="async" loading="lazy" width="256" height="256">` : '';
  window.DrawUpPortraits = { has, url, img, KEYS, PLANNED, version: V };
})();
