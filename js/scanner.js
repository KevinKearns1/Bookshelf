/* ============================================================
   scanner.js — camera plumbing around the decoder.

   Two ways to read a frame:
     1. BarcodeDetector, where the browser has it (Chrome on Android).
     2. ean13.js, everywhere else (Safari on iOS included).
   Both run; whichever answers first wins. The pure-JS path needs the
   same code twice before it is believed.
   ============================================================ */

var Scanner = (function () {

  var video, stream, track, timer, detector;
  var canvas, ctx;
  var busy = false;
  var tick = 0;
  var lastCode = null, lastCount = 0;
  var onCode = null, onStatus = null;
  var running = false;

  function status(msg) { if (onStatus) onStatus(msg); }

  function setupDetector() {
    detector = null;
    if (typeof window.BarcodeDetector === 'undefined') return Promise.resolve();
    return window.BarcodeDetector.getSupportedFormats()
      .then(function (formats) {
        if (formats.indexOf('ean_13') >= 0) {
          detector = new window.BarcodeDetector({ formats: ['ean_13'] });
        }
      })
      .catch(function () { detector = null; });
  }

  function start(opts) {
    video = opts.video;
    onCode = opts.onCode;
    onStatus = opts.onStatus;
    lastCode = null; lastCount = 0; tick = 0;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error(
        window.isSecureContext === false
          ? 'The camera only works over https (or on localhost). Open the app from its https address.'
          : 'This browser will not give the page a camera.'
      ));
    }

    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    })
    .catch(function (err) {
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        throw new Error('Camera access was blocked. Allow it for this site in your browser settings, then try again.');
      }
      if (err && err.name === 'NotFoundError') {
        throw new Error('No camera found on this device.');
      }
      throw new Error('Could not start the camera.');
    })
    .then(function (s) {
      stream = s;
      track = s.getVideoTracks()[0];
      video.srcObject = s;
      return video.play().catch(function () { /* iOS resolves late; harmless */ });
    })
    .then(setupDetector)
    .then(function () {
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      running = true;
      timer = setInterval(read, 90);
      return { torch: hasTorch() };
    });
  }

  /* Carry on with the camera already open — scanning a stack of books
     shouldn't mean waiting for the camera to warm up each time. */
  function resume() {
    if (!stream || !video) return false;
    lastCode = null; lastCount = 0; busy = false;
    running = true;
    if (!timer) timer = setInterval(read, 90);
    return true;
  }

  function stop() {
    running = false;
    clearInterval(timer);
    timer = null;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; track = null;
    if (video) video.srcObject = null;
  }

  function hasTorch() {
    if (!track || !track.getCapabilities) return false;
    try { return !!track.getCapabilities().torch; } catch (e) { return false; }
  }

  function setTorch(on) {
    if (!hasTorch()) return Promise.resolve(false);
    return track.applyConstraints({ advanced: [{ torch: !!on }] })
      .then(function () { return !!on; })
      .catch(function () { return false; });
  }

  /* Every ISBN barcode is "Bookland": 978 or 979. Refusing anything
     else costs nothing here and throws out the rare misread that
     happens to satisfy the check digit. */
  function isBookCode(code) { return /^97[89]\d{10}$/.test(code); }

  function accept(code, trusted) {
    if (!running || !isBookCode(code)) return;
    if (trusted) { finish(code); return; }
    /* Two agreeing reads before we commit — a single scan line can
       misread, and a wrong ISBN is worse than a slow one. */
    if (code === lastCode) {
      lastCount++;
      if (lastCount >= 2) finish(code);
    } else {
      lastCode = code;
      lastCount = 1;
    }
  }

  function finish(code) {
    running = false;
    clearInterval(timer);
    timer = null;
    if (navigator.vibrate) navigator.vibrate(45);
    beep();
    if (onCode) onCode(code);
  }

  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ac = new AC();
      var osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1180;
      gain.gain.setValueAtTime(0.0001, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, ac.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.13);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.14);
      setTimeout(function () { ac.close(); }, 400);
    } catch (e) { /* sound is a nicety */ }
  }

  function read() {
    if (busy || !running || !video || video.readyState < 2) return;
    busy = true;
    tick++;

    var done = function () { busy = false; };

    if (detector) {
      detector.detect(video)
        .then(function (codes) {
          if (codes && codes.length) {
            var v = String(codes[0].rawValue || '').replace(/\D/g, '');
            if (v.length === 13 && EAN13.checksum(v)) { accept(v, true); return; }
          }
          /* Detector saw nothing — give the JS reader a turn now and
             then, in case the native one is fussy about this print. */
          if (tick % 2 === 0) softScan();
        })
        .catch(function () { softScan(); })
        .then(done, done);
    } else {
      softScan();
      busy = false;
    }
  }

  /* Grab the middle band of the frame and hand it to ean13.js.
     Squashing the band vertically averages along the bars, which
     cleans up sensor noise for free. */
  function softScan() {
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;

    var bandH = Math.round(vh * 0.42);
    var sy = Math.round((vh - bandH) / 2);

    var cw = Math.min(vw, 1600);
    var ch = Math.max(80, Math.min(200, Math.round(bandH / 3)));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw; canvas.height = ch;
    }

    ctx.drawImage(video, 0, sy, vw, bandH, 0, 0, cw, ch);

    var img;
    try { img = ctx.getImageData(0, 0, cw, ch); }
    catch (e) { return; }        // tainted canvas shouldn't happen, but

    var d = img.data;
    var gray = new Uint8Array(cw * ch);
    for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = (d[p] * 77 + d[p + 1] * 151 + d[p + 2] * 28) >> 8;
    }

    var code = EAN13.scan(gray, cw, ch, 18);
    if (code) accept(code, false);
  }

  return { start: start, stop: stop, resume: resume, setTorch: setTorch, hasTorch: hasTorch };
})();
