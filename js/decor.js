/* ============================================================
   decor.js — things to put on the shelf besides books.

   Drawn as inline SVG rather than shipped as images: they stay sharp
   at any size, cost nothing to load, and work offline. Each one
   declares the footprint it occupies on the shelf so the books flow
   around it.
   ============================================================ */

var Decor = (function () {

  var KINDS = [
    {
      id: 'plant', label: 'Plant', w: 46, h: 88,
      svg:
        '<svg viewBox="0 0 46 88" aria-hidden="true">' +
          '<g fill="#4F7A47">' +
            '<ellipse cx="23" cy="26" rx="6" ry="17"/>' +
            '<ellipse cx="13" cy="34" rx="5.5" ry="14" transform="rotate(-38 13 34)"/>' +
            '<ellipse cx="33" cy="34" rx="5.5" ry="14" transform="rotate(38 33 34)"/>' +
            '<ellipse cx="17" cy="46" rx="5" ry="11" transform="rotate(-20 17 46)"/>' +
            '<ellipse cx="29" cy="46" rx="5" ry="11" transform="rotate(20 29 46)"/>' +
          '</g>' +
          '<g fill="#6E9A5E" opacity=".55">' +
            '<ellipse cx="23" cy="30" rx="3" ry="10"/>' +
          '</g>' +
          '<path d="M12 58h22l-3 28H15z" fill="#A85A38"/>' +
          '<rect x="10" y="54" width="26" height="8" rx="2.5" fill="#C4744A"/>' +
          '<rect x="12" y="56" width="22" height="2" rx="1" fill="#D68C5E" opacity=".7"/>' +
        '</svg>'
    },
    {
      id: 'globe', label: 'Globe', w: 54, h: 92,
      svg:
        '<svg viewBox="0 0 54 92" aria-hidden="true">' +
          '<circle cx="27" cy="38" r="23" fill="#E3C0A0"/>' +
          '<g fill="#93A96B">' +
            '<path d="M14 28c4-5 9-6 13-3s2 8-2 10-9 3-12 0-2-5 1-7z"/>' +
            '<path d="M30 42c5-2 9 1 10 6s-3 10-7 9-6-6-5-10z"/>' +
            '<path d="M36 22c3-1 6 1 6 4s-3 5-6 4-3-7 0-8z"/>' +
          '</g>' +
          '<g stroke="#B98A63" stroke-width="1" fill="none" opacity=".55">' +
            '<ellipse cx="27" cy="38" rx="23" ry="9"/>' +
            '<ellipse cx="27" cy="38" rx="11" ry="23"/>' +
          '</g>' +
          '<path d="M27 12a26 26 0 1 1 0 52" stroke="#C98A5B" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
          '<rect x="24" y="63" width="6" height="13" rx="2" fill="#C98A5B"/>' +
          '<ellipse cx="27" cy="82" rx="17" ry="6" fill="#C98A5B"/>' +
          '<ellipse cx="27" cy="80" rx="17" ry="5" fill="#DDA173"/>' +
        '</svg>'
    },
    {
      id: 'cat', label: 'Cat', w: 62, h: 44,
      svg:
        '<svg viewBox="0 0 62 44" aria-hidden="true">' +
          '<path d="M8 44c-4-12 2-24 15-27s25 3 29 13c3 8 1 14 1 14z" fill="#6B5847"/>' +
          '<path d="M46 44c2-8-1-14-6-17 7 0 12 5 13 11 1 3 1 6 1 6z" fill="#7E6A56"/>' +
          '<circle cx="47" cy="21" r="9" fill="#6B5847"/>' +
          '<path d="M40 14l1-6 5 4zM54 14l-1-6-5 4z" fill="#6B5847"/>' +
          '<circle cx="44" cy="21" r="1.4" fill="#F0E2CE"/>' +
          '<circle cx="50" cy="21" r="1.4" fill="#F0E2CE"/>' +
          '<path d="M8 44c-5-3-6-9-2-12" stroke="#6B5847" stroke-width="5" fill="none" stroke-linecap="round"/>' +
        '</svg>'
    },
    {
      id: 'stack', label: 'Book stack', w: 58, h: 42,
      svg:
        '<svg viewBox="0 0 58 42" aria-hidden="true">' +
          '<rect x="4" y="30" width="50" height="11" rx="2" fill="#8C2F39"/>' +
          '<rect x="4" y="34" width="50" height="2" fill="#B0842F" opacity=".7"/>' +
          '<rect x="8" y="19" width="43" height="11" rx="2" fill="#35507A"/>' +
          '<rect x="8" y="23" width="43" height="2" fill="#B0842F" opacity=".7"/>' +
          '<rect x="12" y="8" width="36" height="11" rx="2" fill="#6F7F4F"/>' +
          '<rect x="12" y="12" width="36" height="2" fill="#B0842F" opacity=".7"/>' +
        '</svg>'
    },
    {
      id: 'candle', label: 'Candle', w: 30, h: 74,
      svg:
        '<svg viewBox="0 0 30 74" aria-hidden="true">' +
          '<path d="M15 6c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="#E8A33D"/>' +
          '<path d="M15 12c2 3 3 5 3 7a3 3 0 0 1-6 0c0-2 1-4 3-7z" fill="#FBE0A0"/>' +
          '<rect x="10" y="26" width="10" height="34" rx="2" fill="#F0E2CE"/>' +
          '<rect x="10" y="26" width="4" height="34" fill="#FFF8EC" opacity=".6"/>' +
          '<path d="M6 60h18l2 12H4z" fill="#B98A63"/>' +
          '<rect x="3" y="70" width="24" height="4" rx="2" fill="#C98A5B"/>' +
        '</svg>'
    },
    {
      id: 'clock', label: 'Clock', w: 44, h: 58,
      svg:
        '<svg viewBox="0 0 44 58" aria-hidden="true">' +
          '<circle cx="22" cy="26" r="20" fill="#B98A63"/>' +
          '<circle cx="22" cy="26" r="16" fill="#F4EADA"/>' +
          '<g stroke="#4A3B2C" stroke-width="2" stroke-linecap="round">' +
            '<path d="M22 26V15"/><path d="M22 26l8 5"/>' +
          '</g>' +
          '<circle cx="22" cy="26" r="1.6" fill="#4A3B2C"/>' +
          '<path d="M10 46l-3 10h10zM34 46l3 10H27z" fill="#B98A63"/>' +
        '</svg>'
    },
    {
      id: 'mug', label: 'Mug', w: 38, h: 38,
      svg:
        '<svg viewBox="0 0 38 38" aria-hidden="true">' +
          '<path d="M27 16h4a5 5 0 0 1 0 10h-4" stroke="#9C6B4A" stroke-width="3" fill="none"/>' +
          '<path d="M5 12h24v16a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8z" fill="#C4744A"/>' +
          '<rect x="5" y="12" width="24" height="4" rx="1.5" fill="#DD9269"/>' +
          '<path d="M12 8c0-2 3-2 3-4M20 8c0-2 3-2 3-4" stroke="#C9B39A" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>' +
        '</svg>'
    },
    {
      id: 'frame', label: 'Photo', w: 46, h: 56,
      svg:
        '<svg viewBox="0 0 46 56" aria-hidden="true">' +
          '<rect x="4" y="4" width="38" height="46" rx="3" fill="#8A6A4A"/>' +
          '<rect x="9" y="9" width="28" height="36" rx="2" fill="#E9DCC6"/>' +
          '<path d="M9 37l9-11 7 8 5-5 7 9v7H9z" fill="#7E9A6B"/>' +
          '<circle cx="30" cy="18" r="4" fill="#E8B75B"/>' +
          '<path d="M14 50l4 6M32 50l-4 6" stroke="#8A6A4A" stroke-width="3" stroke-linecap="round"/>' +
        '</svg>'
    },
    {
      id: 'bookend', label: 'Bookend', w: 26, h: 76,
      svg:
        '<svg viewBox="0 0 26 76" aria-hidden="true">' +
          '<path d="M6 4h9v68H6z" fill="#7E6A56"/>' +
          '<path d="M6 62h18v10H6z" fill="#8E7A64"/>' +
          '<rect x="6" y="4" width="3" height="68" fill="#9A8670" opacity=".7"/>' +
        '</svg>'
    },
    {
      id: 'lamp', label: 'Lamp', w: 48, h: 86,
      svg:
        '<svg viewBox="0 0 48 86" aria-hidden="true">' +
          '<path d="M12 10h24l7 24H5z" fill="#C98A5B"/>' +
          '<path d="M12 10h9l-4 24H5z" fill="#DDA173" opacity=".8"/>' +
          '<rect x="22" y="34" width="4" height="38" fill="#8A6A4A"/>' +
          '<ellipse cx="24" cy="76" rx="15" ry="6" fill="#8A6A4A"/>' +
          '<ellipse cx="24" cy="74" rx="15" ry="5" fill="#A07E58"/>' +
          '<ellipse cx="24" cy="36" rx="18" ry="5" fill="#F3D9A6" opacity=".22"/>' +
        '</svg>'
    }
  ];

  function get(id) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].id === id) return KINDS[i];
    return null;
  }

  return { KINDS: KINDS, get: get };
})();
