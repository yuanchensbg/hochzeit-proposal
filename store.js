/* Storage: IndexedDB (local, offline) + GitHub client (site repo publish, private data repo = "Cloud"). */
(function () {
  'use strict';

  /* ---------------- IndexedDB ---------------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('hochzeit-proposal', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('proposals')) d.createObjectStore('proposals', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out;
        var r = fn(s);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  var IDB = {
    get: function (store, key) { return tx(store, 'readonly', function (s) { return s.get(key); }); },
    all: function (store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); },
    put: function (store, val, key) { return tx(store, 'readwrite', function (s) { return key === undefined ? s.put(val) : s.put(val, key); }); },
    del: function (store, key) { return tx(store, 'readwrite', function (s) { return s.delete(key); }); }
  };

  /* ---------------- helpers ---------------- */
  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1]); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  /* ---------------- GitHub settings ---------------- */
  var GH_KEY = 'pp_github';
  function ghSettings() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(GH_KEY) || '{}'); } catch (e) { s = {}; }
    var cfg = (window.APP_CONFIG && window.APP_CONFIG.github) || {};
    return {
      token: s.token || '', branch: s.branch || cfg.branch || 'main',
      siteRepo: s.siteRepo || ((cfg.owner || '') + '/' + (cfg.repo || '')),
      dataRepo: s.dataRepo || cfg.dataRepo || ((cfg.owner || '') + '/' + (cfg.repo || '') + '-data')
    };
  }
  function saveGhSettings(s) {
    try { localStorage.setItem(GH_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
  }

  /* ---------------- GitHub API ---------------- */
  function api(method, path, body, opt) {
    opt = opt || {};
    var s = ghSettings();
    var h = { 'Accept': opt.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (s.token) h.Authorization = 'Bearer ' + s.token;
    if (body) h['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 404 && opt.allow404) return null;
        if (!r.ok) {
          return r.text().then(function (t) {
            var msg = t; try { msg = JSON.parse(t).message; } catch (e) { /* keep text */ }
            var err = new Error('GitHub ' + r.status + ': ' + msg); err.status = r.status; throw err;
          });
        }
        if (opt.raw) return r.blob();
        return r.status === 204 ? null : r.json();
      });
  }
  function enc(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  var GH = {
    api: api,
    user: function () { return api('GET', '/user'); },
    repo: function (repo) { return api('GET', '/repos/' + repo, null, { allow404: true }); },
    list: function (repo, dir) {
      return api('GET', '/repos/' + repo + '/contents/' + enc(dir) + '?ref=' + ghSettings().branch, null, { allow404: true })
        .then(function (r) { return Array.isArray(r) ? r : []; })
        .catch(function (e) { if (e.status === 409) return []; throw e; }); // 409 = empty repo
    },
    getText: function (repo, path) {
      return api('GET', '/repos/' + repo + '/contents/' + enc(path) + '?ref=' + ghSettings().branch, null, { allow404: true })
        .then(function (r) {
          if (!r) return null;
          if (r.content) return { sha: r.sha, text: b64ToUtf8(r.content) };
          // > 1 MB: fetch raw
          return api('GET', '/repos/' + repo + '/contents/' + enc(path) + '?ref=' + ghSettings().branch, null, { raw: true })
            .then(function (b) { return b.text(); }).then(function (t) { return { sha: r.sha, text: t }; });
        }).catch(function (e) { if (e.status === 409) return null; throw e; });
    },
    getBlob: function (repo, path) {
      return api('GET', '/repos/' + repo + '/contents/' + enc(path) + '?ref=' + ghSettings().branch, null, { raw: true });
    },
    put: function (repo, path, b64, message, sha) {
      var body = { message: message, content: b64, branch: ghSettings().branch };
      if (sha) body.sha = sha;
      return api('PUT', '/repos/' + repo + '/contents/' + enc(path), body).catch(function (e) {
        // empty repo: branch does not exist yet -> retry without branch (creates default branch)
        if (e.status === 404 || e.status === 409 || e.status === 422) {
          if (!sha && body.branch) { delete body.branch; return api('PUT', '/repos/' + repo + '/contents/' + enc(path), body); }
        }
        throw e;
      });
    },
    remove: function (repo, path, sha, message) {
      return api('DELETE', '/repos/' + repo + '/contents/' + enc(path), { message: message, sha: sha, branch: ghSettings().branch });
    },
    // One commit with many files (Git Data API). files: [{path, text} | {path, b64}]
    commitFiles: function (repo, files, message) {
      var br = ghSettings().branch, base = '/repos/' + repo;
      var head, baseTree;
      return api('GET', base + '/git/ref/heads/' + br).then(function (ref) {
        head = ref.object.sha;
        return api('GET', base + '/git/commits/' + head);
      }).then(function (c) {
        baseTree = c.tree.sha;
        return Promise.all(files.map(function (f) {
          if (f.remove) return Promise.resolve({ path: f.path, mode: '100644', type: 'blob', sha: null });
          return api('POST', base + '/git/blobs', f.b64 != null ? { content: f.b64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' })
            .then(function (b) { return { path: f.path, mode: '100644', type: 'blob', sha: b.sha }; });
        }));
      }).then(function (tree) {
        return api('POST', base + '/git/trees', { base_tree: baseTree, tree: tree });
      }).then(function (t) {
        return api('POST', base + '/git/commits', { message: message, tree: t.sha, parents: [head] });
      }).then(function (c) {
        return api('PATCH', base + '/git/refs/heads/' + br, { sha: c.sha }).then(function () { return c; });
      });
    }
  };

  /* ---------------- Cloud (private data repo) ---------------- */
  var Cloud = {
    enabled: function () { var s = ghSettings(); return !!(s.token && s.dataRepo && s.dataRepo.indexOf('/') > 0); },
    repo: function () { return ghSettings().dataRepo; },
    // photos/<id>.jpg + photos/<id>.json (meta)
    pushPhoto: function (p) {
      var repo = Cloud.repo();
      return blobToB64(p.blob).then(function (b64) {
        return GH.put(repo, 'photos/' + p.id + '.jpg', b64, 'Foto ' + (p.name || p.id), p.cloudSha || undefined);
      }).then(function (r) {
        var meta = { id: p.id, name: p.name, added: p.added, w: p.w, h: p.h, fav: !!p.fav, tags: p.tags || [] };
        return GH.getText(repo, 'photos/' + p.id + '.json').then(function (old) {
          return GH.put(repo, 'photos/' + p.id + '.json', utf8ToB64(JSON.stringify(meta, null, 1)), 'Foto-Info ' + p.id, old && old.sha);
        }).then(function () { return r.content.sha; });
      });
    },
    updatePhotoMeta: function (p) {
      var repo = Cloud.repo();
      var meta = { id: p.id, name: p.name, added: p.added, w: p.w, h: p.h, fav: !!p.fav, tags: p.tags || [] };
      return GH.getText(repo, 'photos/' + p.id + '.json').then(function (old) {
        return GH.put(repo, 'photos/' + p.id + '.json', utf8ToB64(JSON.stringify(meta, null, 1)), 'Foto-Info ' + p.id, old && old.sha);
      });
    },
    listPhotos: function () {
      return GH.list(Cloud.repo(), 'photos').then(function (items) {
        var metas = items.filter(function (i) { return /\.json$/.test(i.name); });
        var jpgs = {};
        items.forEach(function (i) { if (/\.jpg$/.test(i.name)) jpgs[i.name.replace(/\.jpg$/, '')] = i.sha; });
        return Promise.all(metas.map(function (m) {
          return GH.getText(Cloud.repo(), m.path).then(function (r) {
            try { var o = JSON.parse(r.text); o.cloudSha = jpgs[o.id]; return o; } catch (e) { return null; }
          });
        })).then(function (l) { return l.filter(function (x) { return x && x.cloudSha; }); });
      });
    },
    fetchPhotoBlob: function (id) { return GH.getBlob(Cloud.repo(), 'photos/' + id + '.jpg'); },
    deletePhoto: function (p) {
      var repo = Cloud.repo();
      return GH.list(repo, 'photos').then(function (items) {
        return items.filter(function (i) { return i.name === p.id + '.jpg' || i.name === p.id + '.json'; })
          .reduce(function (pr, i) { return pr.then(function () { return GH.remove(repo, i.path, i.sha, 'Foto löschen ' + p.id); }); }, Promise.resolve());
      });
    },
    // proposals/<id>.json
    pushProposal: function (pr) {
      var repo = Cloud.repo(), path = 'proposals/' + pr.id + '.json';
      var data = JSON.parse(JSON.stringify(pr)); delete data.cloudSha; delete data.dirty;
      var body = utf8ToB64(JSON.stringify(data, null, 1));
      var label = (pr.name1 || '?') + ' & ' + (pr.name2 || '?');
      return GH.put(repo, path, body, 'Angebot ' + label, pr.cloudSha || undefined).catch(function (e) {
        if (e.status !== 409 && e.status !== 422) throw e;
        // sha mismatch: someone else saved in between -> refetch sha, keep newest
        return GH.getText(repo, path).then(function (cur) {
          var remote = cur ? JSON.parse(cur.text) : null;
          if (remote && remote.updated > pr.updated) { var err = new Error('remote-newer'); err.remote = remote; err.sha = cur.sha; throw err; }
          return GH.put(repo, path, body, 'Angebot ' + label, cur && cur.sha);
        });
      }).then(function (r) { return r.content.sha; });
    },
    listProposals: function () {
      return GH.list(Cloud.repo(), 'proposals').then(function (items) {
        return items.filter(function (i) { return /\.json$/.test(i.name); });
      });
    },
    getProposal: function (path) {
      return GH.getText(Cloud.repo(), path).then(function (r) {
        if (!r) return null;
        var o = JSON.parse(r.text); o.cloudSha = r.sha; return o;
      });
    },
    deleteProposal: function (pr) {
      if (!pr.cloudSha) return Promise.resolve();
      return GH.remove(Cloud.repo(), 'proposals/' + pr.id + '.json', pr.cloudSha, 'Angebot löschen');
    }
  };

  /* ---------------- Vault: token encrypted with a password (PBKDF2 + AES-GCM) ---------------- */
  function b64(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(str) { var s = atob(str), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  function vaultKey(pw, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  var Vault = {
    seal: function (data, pw) {
      var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      return vaultKey(pw, salt).then(function (key) {
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(data)));
      }).then(function (ct) { return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) }; });
    },
    open: function (vault, pw) {
      return vaultKey(pw, unb64(vault.salt)).then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.ct));
      }).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
    }
  };

  window.Store = { Vault: Vault,  IDB: IDB, GH: GH, Cloud: Cloud, uid: uid, utf8ToB64: utf8ToB64, b64ToUtf8: b64ToUtf8, blobToB64: blobToB64, ghSettings: ghSettings, saveGhSettings: saveGhSettings };
})();
